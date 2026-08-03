import {
	Plugin,
	MarkdownView,
	type WorkspaceLeaf,
	Notice,
	type Editor,
} from "obsidian";
import type { EditorView } from "@codemirror/view";

import { createMarkingExtensions } from "./src/cm6";
import { annotationRepository } from "./src/repository/annotation-repository";
import { setEditorValuePreservingViewport } from "./src/editor-viewport";
import { renderReadingModeAnnotations } from "./src/renderers/reading-mode-renderer";
import { AnnotationService } from "./src/services/annotation-service";
import { MarkingNoteSettingTab } from "./src/settings/setting-tab";
import { createDefaultSettings } from "./src/settings/default-settings";
import { StorageEngine } from "./src/storage";
import { MarkingSidebarView, MARKING_SIDEBAR_VIEW_TYPE } from "./src/sidebar";
import {
	normalizeInlineCommands,
	normalizeStewardCommands,
} from "./src/settings/command-presets";
import { type PopoverContext, PopoverEditor, PopoverViewer } from "./src/ui";
import {
	DEFAULT_ANNOTATION_SYSTEM_PROMPT_TEMPLATE,
	DEFAULT_INLINE_REWRITE_SYSTEM_PROMPT_TEMPLATE,
	DEFAULT_SUMMARY_SYSTEM_PROMPT_TEMPLATE,
	DEFAULT_TAGS,
} from "./src/domain/constants";
import {
	migrateLegacyDocument,
	reconcileDocument,
} from "./src/domain/annotation-format";
import type {
	LightningCommand,
	MarkingNoteSettings,
	ModelProvider,
	StewardConfig,
} from "./src/domain/types";
import { type MarkingNode, parseMarkingNodes } from "./src/state";

// --- Plugin Class ---

export default class MarkingNotePlugin extends Plugin {
	settings: MarkingNoteSettings;
	popoverCtx: PopoverContext;
	popoverEditor: PopoverEditor | null = null;
	popoverViewer: PopoverViewer | null = null;
	annotationService!: AnnotationService;
	chatHistory = new Map<string, string[]>(); // Temporary cache for chat history per node

	pushChatHistory(nodeId: string, oldRichText: string) {
		let history = this.chatHistory.get(nodeId);
		if (!history) {
			history = [];
			this.chatHistory.set(nodeId, history);
		}
		history.push(oldRichText);
		if (history.length > 7) history.shift();
	}

	popChatHistory(nodeId: string): string | null {
		const history = this.chatHistory.get(nodeId);
		if (history && history.length > 0) return history.pop() || null;
		return null;
	}

	canUndoChat(nodeId: string): boolean {
		const history = this.chatHistory.get(nodeId);
		return !!history && history.length > 0;
	}

	async onload() {
		console.log("Loading Marking Note plugin");
		await this.loadSettings();
		this.annotationService = new AnnotationService(this.app);

		// Build popover context globally
		this.popoverCtx = {
			app: this.app,
			onFollowUp: async (nodeId, instruction, currentContent, options) => {
				this.pushChatHistory(nodeId, currentContent || "");
				return this.handleFollowUp(
					nodeId,
					instruction,
					currentContent,
					undefined,
					options,
				);
			},
			canUndo: (nodeId) => this.canUndoChat(nodeId),
			popUndo: (nodeId) => this.popChatHistory(nodeId),
		};

		// 1. Add Setting Tab
		this.addSettingTab(new MarkingNoteSettingTab(this.app, this));

		// 2. Register Sidebar View
		this.registerView(
			MARKING_SIDEBAR_VIEW_TYPE,
			(leaf) => new MarkingSidebarView(leaf, this),
		);

		this.addRibbonIcon("highlighter", "Open Marking Note Sidebar", () => {
			this.activateView();
		});

		// Popover context was initialized globally above

		// 4. Register CodeMirror 6 extensions
		this.registerEditorExtension(
			createMarkingExtensions(
				(view: EditorView, selection: string, command: LightningCommand) => {
					this.handleAIAnnotation(view, selection, command);
				},
				(view: EditorView, selection: string, command: LightningCommand) => {
					this.handleAIAugment(view, selection, command);
				},
				() => {
					const executed = (this.app as any).commands?.executeCommandById(
						"editor:insert-link",
					);
					if (!executed) {
						new Notice("无法打开 Obsidian 原生链接选择器");
					}
				},
				this.popoverCtx,
				this,
			),
		);

		// 4. Register Markdown Post Processor for Reading/Preview mode
		this.registerMarkdownPostProcessor((el, ctx) => {
			const render = (sourceText = "") => {
				renderReadingModeAnnotations({
					container: el,
					tags: this.settings.tags,
					nodes: sourceText ? parseMarkingNodes(sourceText) : undefined,
					onOpenPopover: ({
						nodeId,
						summary,
						state,
						tagId,
						anchorX,
						anchorY,
					}) => {
						this.showReadingPopover(
							nodeId,
							summary,
							state,
							tagId,
							anchorX,
							anchorY,
						);
					},
				});
			};
			const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
			if (!file) {
				render();
				return;
			}
			return this.app.vault.cachedRead(file as any).then(render).catch(() => render());
		});

		// 5. Listen for lightning command requests from the UI
		const lightningHandler = ((e: CustomEvent) => {
			const steward =
				this.settings.stewards.find(
					(s) => s.id === this.settings.activeStewardId,
				) || this.settings.stewards[0];
			if (e.detail?.callback) {
				const operation = e.detail.operation === "augment" ? "augment" : "conversation";
				const source = operation === "augment"
					? steward?.augmentCommands || []
					: steward?.commands || [];
				const commands = source.filter(
					(c) => c.enabled !== false && (operation === "augment" ? c.type === "augment" : c.type === "conversation" || c.type === "annotated"),
				);
				e.detail.callback(commands);
			}
		}) as EventListener;
		window.addEventListener("marking-note-get-commands", lightningHandler);
		this.register(() =>
			window.removeEventListener("marking-note-get-commands", lightningHandler),
		);

		const openSettingsHandler = (() => {
			const setting = (this.app as any).setting;
			if (typeof setting?.open === "function") {
				setting.open();
				return;
			}
			(this.app as any).commands?.executeCommandById("app:open-settings");
		}) as EventListener;
		window.addEventListener("marking-note-open-settings", openSettingsHandler);
		this.register(() =>
			window.removeEventListener(
				"marking-note-open-settings",
				openSettingsHandler,
			),
		);

		const getStewardsHandler = ((e: CustomEvent) => {
			e.detail?.callback?.(this.settings.stewards, this.settings.activeStewardId);
		}) as EventListener;
		window.addEventListener("marking-note-get-stewards", getStewardsHandler);
		this.register(() =>
			window.removeEventListener("marking-note-get-stewards", getStewardsHandler),
		);

		const selectStewardHandler = (async (e: CustomEvent) => {
			const id = e.detail?.id;
			if (!id || !this.settings.stewards.some((steward) => steward.id === id)) return;
			this.settings.activeStewardId = id;
			await this.saveSettings();
			new Notice(`已切换到管家：${this.settings.stewards.find((steward) => steward.id === id)?.name || id}`);
		}) as EventListener;
		window.addEventListener("marking-note-select-steward", selectStewardHandler);
		this.register(() =>
			window.removeEventListener("marking-note-select-steward", selectStewardHandler),
		);

		// 6. Listen for inline modify command requests
		const inlineHandler = ((e: CustomEvent) => {
			if (e.detail?.callback) {
				const inlineCmds = (this.settings.inlineSteward?.commands || []).filter(
					(c) => c.type === "inline-modify" && c.enabled !== false,
				);
				e.detail.callback(inlineCmds);
			}
		}) as EventListener;
		window.addEventListener("marking-note-get-inline-commands", inlineHandler);
		this.register(() =>
			window.removeEventListener(
				"marking-note-get-inline-commands",
				inlineHandler,
			),
		);

		// 7. Listen for inline modification trigger
		const inlineModifyHandler = ((e: CustomEvent) => {
			if (e.detail?.view && e.detail?.selection && e.detail?.instruction) {
				this.handleInlineModification(
					e.detail.view,
					e.detail.selection,
					e.detail.instruction,
				);
			}
		}) as EventListener;
		window.addEventListener("marking-note-inline-modify", inlineModifyHandler);
		this.register(() =>
			window.removeEventListener(
				"marking-note-inline-modify",
				inlineModifyHandler,
			),
		);

		// 6. Register commands
		this.addCommand({
			id: "trigger-ai-annotation",
			name: "Trigger AI Annotation on Selection",
			editorCallback: async (editor, view) => {
				const selection = editor.getSelection();
				if (selection) {
					const cmView = (view as any).editor?.cm as EditorView;
					if (cmView) {
						this.handleAIAnnotation(cmView, selection);
					}
				}
			},
		});

		this.addCommand({
			id: "open-marking-sidebar",
			name: "打开 Marking 侧边栏",
			callback: () => {
				this.activateView();
			},
		});

		this.addCommand({
			id: "toggle-floating-menu",
			name: "打开/关闭标注悬浮窗",
			callback: async () => {
				this.settings.enableFloatingMenu = !this.settings.enableFloatingMenu;
				await this.saveSettings();
				new Notice(
					this.settings.enableFloatingMenu
						? "🪄 标注悬浮窗已开启"
						: "🪄 标注悬浮窗已关闭",
				);
			},
		});

		this.addCommand({
			id: "clear-all-markings",
			name: "清空当前笔记的所有标注",
			editorCallback: (editor: Editor, _view: MarkdownView) => {
				const text = editor.getValue();
				let newText = text;
				const nodes = annotationRepository.parseMarkingNodes(text);
				const mergedNodes = annotationRepository.parseMergedNoteNodes(text);

				for (const node of nodes) {
					if (!node.isPlain) {
						newText = annotationRepository.deleteAnnotation(
							newText,
							node.id,
						).text;
					}
				}

				for (const mergedNode of mergedNodes) {
					newText = annotationRepository.deleteMergedNote(
						newText,
						mergedNode.id,
					).text;
				}

				// Remove remaining plain highlights.
				for (const node of nodes) {
					if (node.isPlain) {
						newText = newText.replace(`==${node.text}==`, node.text);
					}
				}

				setEditorValuePreservingViewport(editor, newText);
				new Notice("已清空当前笔记的所有标注和说明");
			},
		});

		this.addCommand({
			id: "migrate-current-document",
			name: "迁移当前文档到新版标注格式",
			editorCallback: (editor: Editor) => {
				const preview = migrateLegacyDocument(editor.getValue());
				if (preview.skipped.length > 0) {
					new Notice(`迁移已取消：无法关联标注 ${preview.skipped.join(", ")}`);
					return;
				}
				if (preview.migrated === 0) {
					new Notice("当前文档没有可迁移的旧版标注");
					return;
				}

				const confirmed = confirm(
					`将迁移 ${preview.migrated} 个标注到新版格式。此操作原地修改当前文档，可用一次 Ctrl+Z 撤回。继续吗？`,
				);
				if (!confirmed) {
					new Notice("已取消文档迁移");
					return;
				}

				setEditorValuePreservingViewport(editor, preview.text);
				new Notice(`已迁移 ${preview.migrated} 个标注`);
			},
		});

		this.addCommand({
			id: "reconcile-current-document",
			name: "同步当前文档的标注结果块",
			editorCallback: (editor: Editor) => {
				const result = reconcileDocument(editor.getValue());
				if (
					result.addedResultIds.length === 0 &&
					result.removedOrphanResultIds.length === 0
				) {
					new Notice("当前文档的标注结果已同步");
					return;
				}

				const confirmed = confirm(
					`将新增 ${result.addedResultIds.length} 个结果块，并清理 ${result.removedOrphanResultIds.length} 个孤立结果。继续吗？`,
				);
				if (!confirmed) {
					new Notice("已取消结果块同步");
					return;
				}

				setEditorValuePreservingViewport(editor, result.text);
				new Notice("当前文档的标注结果已同步");
			},
		});

		this.addCommand({
			id: "consolidate-markings",
			name: "整合标注与解释到新文档",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				if (!view.file) return;
				const text = editor.getValue();
				const nodes = parseMarkingNodes(text).filter((n) => !n.isPlain);
				if (nodes.length === 0) {
					new Notice("当前文档没有含有解释的高亮标注");
					return;
				}

				let outContent = `# ${view.file.basename} - 标注整合\n\n`;
				for (const node of nodes) {
					const explanation =
						StorageEngine.getCalloutContent(text, node.id) || "无详细解释";
					outContent += `### 原文高亮选段\n> ${node.text.split("\n").join("\n> ")}\n\n`;
					if (node.summary)
						outContent += `**AI一句话总结**：${node.summary}\n\n`;
					outContent += `**详细分析**：\n${explanation}\n\n---\n\n`;
				}

				const newFileName = `${view.file.basename}-标注整合.md`;
				let folder = view.file.parent?.path || "";
				if (folder === "/") folder = "";
				const newFilePath = folder ? `${folder}/${newFileName}` : newFileName;

				const newFile = await this.app.vault.create(newFilePath, outContent);
				const newLeaf = this.app.workspace.getLeaf(true);
				await newLeaf.openFile(newFile);
			},
		});
	}

	/**
	 * Show a read-only viewer for an annotated mark in Reading Mode.
	 * Reads vault content directly — no editorView needed.
	 */
	async showReadingPopover(
		nodeId: string,
		nodeSummary: string,
		nodeState: string,
		nodeTagId: string,
		anchorX: number,
		anchorY: number,
	) {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;

		// Try to get content from editor first (more up-to-date), then vault
		let fileContent = "";
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const mdView = leaf.view as MarkdownView;
			if (mdView.file && mdView.file.path === activeFile.path) {
				fileContent = mdView.editor?.getValue() || "";
				break;
			}
		}
		if (!fileContent) {
			fileContent = await this.app.vault.read(activeFile);
		}

		const richText = annotationRepository.getCalloutContent(fileContent, nodeId) || "";

		if (!this.popoverViewer) {
			this.popoverViewer = new PopoverViewer(this.popoverCtx);
		}
		await this.popoverViewer.show(
			nodeId,
			nodeSummary,
			nodeState,
			nodeTagId,
			richText,
			anchorX,
			anchorY,
		);
	}

	showPopover(node: MarkingNode, editorView: EditorView) {
		if (!this.popoverEditor) {
			this.popoverEditor = new PopoverEditor(node, editorView, this.popoverCtx);
		} else {
			this.popoverEditor.node = node;
			this.popoverEditor.editorView = editorView;
		}
		// Keep node.summary in sync so the title can display it
		this.popoverEditor.node = node;

		const editorDOM = editorView.dom;
		const rect = editorDOM.getBoundingClientRect();
		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;

		this.popoverEditor.show(centerX, centerY);
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(MARKING_SIDEBAR_VIEW_TYPE);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				leaf = rightLeaf;
				await leaf.setViewState({
					type: MARKING_SIDEBAR_VIEW_TYPE,
					active: true,
				});
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	getProviderForSteward(steward: StewardConfig): ModelProvider | null {
		// Try bound provider first
		let provider = this.settings.modelProviders.find(
			(p) => p.id === steward.boundModelProviderId,
		);
		if (provider) return provider;

		// Fallback to default provider
		provider = this.settings.modelProviders.find(
			(p) => p.id === this.settings.defaultProviderId,
		);
		if (provider) return provider;

		// Last fallback: first available provider
		if (this.settings.modelProviders.length > 0)
			return this.settings.modelProviders[0];

		return null;
	}

	async handleInlineModification(
		view: EditorView,
		selection: string,
		instruction: string,
	) {
		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdownView) return;

		const inlineSteward = this.settings.inlineSteward;
		// Cast inlineSteward to any since getProvider expects normal steward, but duck typing works for boundModelProviderId
		const provider = this.getProviderForSteward(inlineSteward as any);

		if (!provider) {
			new Notice("❌ 未配置改写大模型提供商");
			return;
		}

		await this.annotationService.rewriteSelection({
			view,
			selection,
			instruction,
			inlineSteward,
			provider,
			inlineRewritePrompt: this.settings.inlineRewriteSystemPromptTemplate,
		});
	}

	async handleAIAnnotation(
		view: EditorView,
		selection: string,
		command?: LightningCommand,
	) {
		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdownView) return;
		const editor = markdownView.editor;

		const steward =
			this.settings.stewards.find(
				(s) => s.id === this.settings.activeStewardId,
			) || this.settings.stewards[0];
		const provider = this.getProviderForSteward(steward);

		if (!provider) {
			new Notice("❌ 未配置 AI 模型提供商，请前往设置页面添加");
			return;
		}

		const result = await this.annotationService.annotateSelection({
			view,
			editor,
			selection,
			steward,
			provider,
			command,
			settings: this.settings,
		});

		if (result) {
			new Notice(`✅ AI 标注完成: ${result.summary.slice(0, 20)}...`);
		} else {
			new Notice("⚠️ AI 标注失败，请检查模型配置与 API 连通性");
		}
	}

	async handleAIAugment(
		view: EditorView,
		selection: string,
		command: LightningCommand,
	) {
		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdownView) return;
		const steward =
			this.settings.stewards.find(
				(s) => s.id === this.settings.activeStewardId,
			) || this.settings.stewards[0];
		const provider = this.getProviderForSteward(steward);
		if (!provider) {
			new Notice("❌ 未配置 AI 模型提供商，请前往设置页面添加");
			return;
		}

		try {
			const richText = await this.annotationService.augmentSelection({
				view,
				editor: markdownView.editor,
				selection,
				steward,
				provider,
				command,
				settings: this.settings,
			});
			if (!richText) {
				new Notice("⚠️ 增补生成失败，请检查模型配置与 API 连通性");
				return;
			}
			await navigator.clipboard.writeText(richText);
			new Notice("✅ 增补内容已复制到剪贴板");
		} catch (error) {
			console.error(error);
			new Notice("⚠️ 增补内容复制失败");
		}
	}

	async handleFollowUp(
		nodeId: string,
		instruction: string,
		currentContent: string,
		filePath?: string,
		options?: { enableWebSearch?: boolean },
	): Promise<{ summary: string; richText: string } | null> {
		const steward =
			this.settings.stewards.find(
				(s) => s.id === this.settings.activeStewardId,
			) || this.settings.stewards[0];
		const provider = this.getProviderForSteward(steward);
		if (!provider) {
			new Notice("❌ 未配置 AI 模型");
			return null;
		}

		const result = await this.annotationService.followUp({
			nodeId,
			instruction,
			currentContent,
			filePath,
			steward,
			provider,
			settings: this.settings,
			options,
		});

		if (result) {
			new Notice("✅ AI 已更新内容");
			return result;
		}

		new Notice("⚠️ AI 追问失败");
		return null;
	}

	async onunload() {
		console.log("Unloading Marking Note plugin");
	}

	async loadSettings() {
		const loadedData = await this.loadData();
		const defaults = createDefaultSettings();
		this.settings = Object.assign({}, defaults, loadedData);

		// Ensure arrays exist for backward compatibility
		if (!this.settings.modelProviders)
			this.settings.modelProviders = defaults.modelProviders;
		if (!this.settings.stewards) this.settings.stewards = defaults.stewards;
		if (!this.settings.inlineSteward)
			this.settings.inlineSteward = defaults.inlineSteward;
		if (!this.settings.tags) this.settings.tags = [...DEFAULT_TAGS];
		if (!this.settings.defaultSummarySystemPromptTemplate)
			this.settings.defaultSummarySystemPromptTemplate =
				DEFAULT_SUMMARY_SYSTEM_PROMPT_TEMPLATE;
		if (!this.settings.annotationSystemPromptTemplate)
			this.settings.annotationSystemPromptTemplate =
				DEFAULT_ANNOTATION_SYSTEM_PROMPT_TEMPLATE;
		if (!this.settings.inlineRewriteSystemPromptTemplate)
			this.settings.inlineRewriteSystemPromptTemplate =
				DEFAULT_INLINE_REWRITE_SYSTEM_PROMPT_TEMPLATE;

		for (const steward of this.settings.stewards) {
			if (!steward.boundModelProviderId)
				steward.boundModelProviderId = this.settings.defaultProviderId || "";
			normalizeStewardCommands(steward);
		}
		normalizeInlineCommands(this.settings.inlineSteward);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
