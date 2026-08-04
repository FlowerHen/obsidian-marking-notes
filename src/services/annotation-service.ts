import type { EditorView } from "@codemirror/view";
import {
	type App,
	type Editor,
	type MarkdownView,
	Notice,
	TFile,
} from "obsidian";

import { AIClient } from "../ai";
import { generateAnnotationId } from "../domain/ids";
import type {
	InlineStewardConfig,
	LightningCommand,
	MarkingNoteSettings,
	ModelProvider,
	StewardConfig,
} from "../domain/types";
import { TavilyClient } from "../tavily";
import { MarkState } from "../state";
import { annotationRepository } from "../repository/annotation-repository";
import { formatAugmentOutput } from "./augment-format";
import {
	dispatchEditorChangePreservingViewport,
	setEditorValuePreservingViewport,
} from "../editor-viewport";

interface PromptTemplates {
	defaultSummary: string;
	annotation: string;
	augment?: string;
}

interface AnnotateSelectionInput {
	view: EditorView;
	editor: Editor;
	selection: string;
	steward: StewardConfig;
	provider: ModelProvider;
	settings: Pick<
		MarkingNoteSettings,
		"defaultSummarySystemPromptTemplate" | "annotationSystemPromptTemplate"
	>;
	command?: LightningCommand;
}

interface FollowUpInput {
	nodeId: string;
	instruction: string;
	currentContent: string;
	filePath?: string;
	steward: StewardConfig;
	provider: ModelProvider;
	settings: Pick<
		MarkingNoteSettings,
		| "defaultSummarySystemPromptTemplate"
		| "annotationSystemPromptTemplate"
		| "tavilyApiKey"
	>;
	options?: {
		enableWebSearch?: boolean;
	};
}

interface InlineRewriteInput {
	view: EditorView;
	selection: string;
	instruction: string;
	inlineSteward: InlineStewardConfig;
	provider: ModelProvider;
	steward?: StewardConfig;
	contextMode?: "full" | "writingOnly" | "none";
	inlineRewritePrompt: string;
}

export class AnnotationService {
	constructor(private readonly app: App) {}

	async rewriteSelection(input: InlineRewriteInput): Promise<boolean> {
		const notice = new Notice("⏳ AI 正在急速改写原文中...", 0);
		const { from, to } = input.view.state.selection.main;
		const effectiveContextLen = input.inlineSteward.contextLength || 0;
		const fullText = input.view.state.doc.toString();

		let contextBefore = "";
		let contextAfter = "";
		if (effectiveContextLen > 0) {
			const halfLen = Math.floor(effectiveContextLen / 2);
			contextBefore = fullText.slice(Math.max(0, from - halfLen), from);
			contextAfter = fullText.slice(
				to,
				Math.min(fullText.length, to + halfLen),
			);
		}

		let userPrompt = `【处理要求】：\n${input.instruction}\n\n【需处理的原文片段】：\n${input.selection}`;
		if (contextBefore || contextAfter) {
			userPrompt = `【文章上下文参考】:\n...${contextBefore}【高亮强调：${input.selection}】${contextAfter}...\n\n请将注意力集中在【高亮强调】的部分执行以下操作：\n【处理要求】：\n${input.instruction}`;
		}

		try {
			const contextPrompt =
				input.contextMode === "full"
					? `\n\n【当前管家主提示词】\n${input.steward?.systemPrompt || ""}\n\n【当前管家写作风格】\n${input.steward?.writingStyle || ""}`
					: input.contextMode === "writingOnly"
						? `\n\n【当前管家写作风格】\n${input.steward?.writingStyle || ""}`
						: "";
			const body = {
				model: input.provider.modelId,
				messages: [
					{ role: "system", content: `${input.inlineRewritePrompt}${contextPrompt}` },
					{ role: "user", content: userPrompt },
				],
				temperature: input.inlineSteward.temperature ?? 0.3,
			};

			const response = await fetch(
				`${input.provider.baseURL}/chat/completions`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${input.provider.apiKey}`,
					},
					body: JSON.stringify(body),
				},
			);

			if (!response.ok) {
				throw new Error("API Request Failed");
			}

			const data = (await response.json()) as {
				choices?: Array<{ message?: { content?: string } }>;
			};

			let newText =
				data.choices?.[0]?.message?.content?.trim() || input.selection;
			const isMermaidBlock = /^```mermaid\s/i.test(newText) && newText.endsWith("```");
			if (!isMermaidBlock && newText.startsWith("```markdown") && newText.endsWith("```")) {
				newText = newText.slice(11, -3).trim();
			} else if (!isMermaidBlock && newText.startsWith("```") && newText.endsWith("```")) {
				newText = newText.slice(3, -3).trim();
			}

			dispatchEditorChangePreservingViewport(input.view, {
				changes: { from, to, insert: newText },
			});

			notice.hide();
			new Notice("✨ 原文改写完成！可以通过 Ctrl+Z 撤回");
			return true;
		} catch (error) {
			console.error(error);
			notice.hide();
			new Notice("⚠️ AI 改写失败");
			return false;
		}
	}

	async annotateSelection(
		input: AnnotateSelectionInput,
	): Promise<{ id: string; summary: string } | null> {
		const { from, to } = input.view.state.selection.main;
		const newId = generateAnnotationId();
		const tagId = input.command?.tagId || "";
		const pending = annotationRepository.createPendingAnnotation({
			text: input.editor.getValue(),
			selection: input.selection,
			selectionFrom: from,
			selectionTo: to,
			id: newId,
			tagId,
			state: MarkState.Unprocessed,
		});

		setEditorValuePreservingViewport(input.editor, pending.text);

		const effectiveContextLen =
			input.command?.contextLength ?? input.steward.contextLength;
		const halfLen = Math.floor(effectiveContextLen / 2);
		const fullText = input.view.state.doc.toString();
		const contextBefore =
			effectiveContextLen > 0
				? fullText.slice(Math.max(0, from - halfLen), from)
				: "";
		const contextAfter =
			effectiveContextLen > 0
				? fullText.slice(to, Math.min(fullText.length, to + halfLen))
				: "";
		const defaultSummaryPrompt = "用一句话高度概括结论";

		const result = await AIClient.generateAnnotation({
			text: input.selection,
			contextBefore,
			contextAfter,
			steward: input.steward,
			provider: input.provider,
			footnoteId: newId,
			defaultSummaryPrompt,
			command: input.command,
			promptTemplates: this.promptTemplates(input.settings),
		});

		if (!result) {
			return null;
		}

		const applied = annotationRepository.applyAnnotationResult({
			text: input.editor.getValue(),
			id: newId,
			state: result.state as MarkState,
			summary: result.summary,
			richText: result.richText,
		});
		setEditorValuePreservingViewport(input.editor, applied.text);

		return { id: newId, summary: result.summary };
	}

	async augmentSelection(
		input: AnnotateSelectionInput,
	): Promise<string | null> {
		const { from, to } = input.view.state.selection.main;
		const effectiveContextLen =
			input.command?.contextLength ?? input.steward.contextLength;
		const halfLen = Math.floor(effectiveContextLen / 2);
		const fullText = input.view.state.doc.toString();
		const contextBefore =
			effectiveContextLen > 0
				? fullText.slice(Math.max(0, from - halfLen), from)
				: "";
		const contextAfter =
			effectiveContextLen > 0
				? fullText.slice(to, Math.min(fullText.length, to + halfLen))
				: "";
		const result = await AIClient.generateAnnotation({
			text: input.selection,
			contextBefore,
			contextAfter,
			steward: input.steward,
			provider: input.provider,
			footnoteId: generateAnnotationId(),
			defaultSummaryPrompt: "用一句话高度概括结论",
			command: input.command,
			promptTemplates: this.promptTemplates(input.settings),
			purpose: "augment",
		});
		return result ? formatAugmentOutput(result.richText, input.command?.detailPrompt || "") : null;
	}

	async followUp(
		input: FollowUpInput,
	): Promise<{ summary: string; richText: string } | null> {
		const fullText = await this.loadDocumentText(input.filePath);
		if (!fullText) {
			new Notice("❌ 未找到关联文档，请确保相关文档在标签页中已打开");
			return null;
		}

		const node = annotationRepository
			.parseMarkingNodes(fullText)
			.find((candidate) => candidate.id === input.nodeId);
		if (!node) {
			new Notice("❌ 未能在文档中找到该高亮原文");
			return null;
		}

		const effectiveContextLen = input.steward.contextLength;
		const halfLen = Math.floor(effectiveContextLen / 2);
		const contextBefore =
			effectiveContextLen > 0
				? fullText.slice(Math.max(0, node.from - halfLen), node.from)
				: "";
		const contextAfter =
			effectiveContextLen > 0 ? fullText.slice(node.to, node.to + halfLen) : "";
		const defaultSummaryPrompt = "用一句话高度概括结论";
		const searchContext = await this.buildSearchContext(input, node.text);

		try {
			const result = await AIClient.generateAnnotation({
				text: node.text,
				contextBefore,
				contextAfter,
				steward: input.steward,
				provider: input.provider,
				footnoteId: input.nodeId,
				defaultSummaryPrompt,
				isFollowUp: true,
				previousOutput: input.currentContent,
				followUpText: input.instruction,
				searchContext,
				promptTemplates: this.promptTemplates(input.settings),
			});

			if (result) {
				return { summary: result.summary, richText: result.richText };
			}
		} catch (error) {
			console.error("Follow-up failed:", error);
		}

		return null;
	}

	private async loadDocumentText(filePath?: string): Promise<string> {
		const allLeaves = this.app.workspace.getLeavesOfType("markdown");
		for (const leaf of allLeaves) {
			const markdownView = leaf.view as MarkdownView;
			if (
				!filePath ||
				(markdownView.file && markdownView.file.path === filePath)
			) {
				return markdownView.editor.getValue();
			}
		}

		const targetFile = filePath
			? this.app.vault.getAbstractFileByPath(filePath)
			: this.app.workspace.getActiveFile();
		if (!(targetFile instanceof TFile)) {
			return "";
		}

		return this.app.vault.read(targetFile);
	}

	private promptTemplates(
		settings: Pick<
			MarkingNoteSettings,
			"defaultSummarySystemPromptTemplate" | "annotationSystemPromptTemplate"
		> &
			Partial<Pick<MarkingNoteSettings, "augmentSystemPromptTemplate">>,
	): PromptTemplates {
		return {
			defaultSummary: settings.defaultSummarySystemPromptTemplate,
			annotation: settings.annotationSystemPromptTemplate,
			augment: settings.augmentSystemPromptTemplate,
		};
	}

	private async buildSearchContext(
		input: FollowUpInput,
		nodeText: string,
	): Promise<string | undefined> {
		if (!input.options?.enableWebSearch || !input.settings.tavilyApiKey) {
			return undefined;
		}

		const query = `${nodeText}\n\n追问需求：${input.instruction}`.trim();
		const results = await TavilyClient.search(
			input.settings.tavilyApiKey,
			query,
		);
		const formatted = TavilyClient.formatSearchResults(results);
		return formatted || undefined;
	}
}
