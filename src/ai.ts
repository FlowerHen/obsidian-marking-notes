import { requestUrl } from "obsidian";
import {
	DEFAULT_ANNOTATION_SYSTEM_PROMPT_TEMPLATE as FALLBACK_ANNOTATION_TEMPLATE,
	DEFAULT_AUGMENT_SYSTEM_PROMPT_TEMPLATE as FALLBACK_AUGMENT_TEMPLATE,
	DEFAULT_SUMMARY_SYSTEM_PROMPT_TEMPLATE as FALLBACK_DEFAULT_SUMMARY_TEMPLATE,
} from "./domain/constants";
import type {
	StewardConfig,
	ModelProvider,
	LightningCommand,
} from "./domain/types";

export interface ImageInfo {
	url: string;
	alt?: string;
}

function applyPromptTemplate(
	template: string,
	replacements: Record<string, string>,
): string {
	let result = template;
	for (const [key, value] of Object.entries(replacements)) {
		result = result.split(`__${key}__`).join(value);
	}
	return result;
}

export class AIClient {
	/**
	 * Test connection to a model provider
	 */
	static async testConnection(provider: ModelProvider): Promise<boolean> {
		try {
			const response = await requestUrl({
				url: `${provider.baseURL}/models`,
				method: "GET",
				headers: {
					Authorization: `Bearer ${provider.apiKey}`,
				},
			});
			return response.status === 200;
		} catch {
			// Some providers don't support /models, try a minimal chat completion
			try {
				const response = await requestUrl({
					url: `${provider.baseURL}/chat/completions`,
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${provider.apiKey}`,
					},
					body: JSON.stringify({
						model: provider.modelId,
						messages: [{ role: "user", content: "Hi" }],
						max_tokens: 1,
					}),
				});
				return response.status === 200;
			} catch {
				return false;
			}
		}
	}

	static async generateAnnotation(options: {
		text: string;
		contextBefore: string;
		contextAfter: string;
		steward: StewardConfig;
		provider: ModelProvider;
		footnoteId: string;
		defaultSummaryPrompt: string;
		command?: LightningCommand;
		isFollowUp?: boolean;
		previousOutput?: string;
		followUpText?: string;
		searchContext?: string;
		images?: ImageInfo[];
		promptTemplates?: {
			defaultSummary?: string;
			annotation?: string;
			augment?: string;
		};
		purpose?: "annotation" | "augment";
	}): Promise<{
		state: string;
		id: string;
		summary: string;
		richText: string;
	} | null> {
		const {
			text,
			contextBefore,
			contextAfter,
			steward,
			provider,
			footnoteId,
			defaultSummaryPrompt,
			command,
			isFollowUp,
			previousOutput,
			followUpText,
			searchContext,
			images,
			promptTemplates,
			purpose = "annotation",
		} = options;

		// Resolve effective parameters (command overrides > steward defaults)
		const effectiveTemp = command?.temperature ?? steward.temperature;
		const effectiveTopP = command?.topP ?? steward.topP;
		const effectiveThinking = command?.thinkingBudget ?? steward.thinkingBudget;
		const effectiveFootnoteLen =
			command?.footnoteLength ?? steward.footnoteLength;

		const ctxMode = command?.contextMode || "full";

		let dynamicPrompts = "";
		if (ctxMode === "full") {
			dynamicPrompts = `\n对文本阅读的提示:\n${steward.systemPrompt}\n\n对写作风格的提示:\n${steward.writingStyle}`;
		} else if (ctxMode === "writingOnly") {
			dynamicPrompts = `\n对写作风格的提示:\n${steward.writingStyle}`;
		}

		const detailInstruction = command?.detailPrompt
			? `\n\n【核心任务指令】\n对于我下面将要给出的文本，在上述提示的指导下，我希望你按照下面的格式或主题要求进行写作：\n${command.detailPrompt}`
			: "";

		const targetLanguage =
			command?.language || steward.language || "文本的原始语言";

		let systemPrompt = "";
		if (purpose === "augment") {
			systemPrompt = applyPromptTemplate(
				promptTemplates?.augment || FALLBACK_AUGMENT_TEMPLATE,
				{
					FOOTNOTE_LENGTH: String(effectiveFootnoteLen),
					TARGET_LANGUAGE: targetLanguage,
					FOOTNOTE_ID: footnoteId,
					DEFAULT_SUMMARY_PROMPT: defaultSummaryPrompt,
					DYNAMIC_PROMPTS: dynamicPrompts,
					DETAIL_INSTRUCTION: detailInstruction,
				},
			);
		} else if (command?.type === "default-summary") {
			systemPrompt = applyPromptTemplate(
				promptTemplates?.defaultSummary || FALLBACK_DEFAULT_SUMMARY_TEMPLATE,
				{
					FOOTNOTE_LENGTH: String(effectiveFootnoteLen),
					TARGET_LANGUAGE: targetLanguage,
					FOOTNOTE_ID: footnoteId,
					DEFAULT_SUMMARY_PROMPT: defaultSummaryPrompt,
					DYNAMIC_PROMPTS: dynamicPrompts,
					DETAIL_INSTRUCTION: detailInstruction,
				},
			);
		} else {
			systemPrompt = applyPromptTemplate(
				promptTemplates?.annotation || FALLBACK_ANNOTATION_TEMPLATE,
				{
					FOOTNOTE_LENGTH: String(effectiveFootnoteLen),
					TARGET_LANGUAGE: targetLanguage,
					FOOTNOTE_ID: footnoteId,
					DEFAULT_SUMMARY_PROMPT: defaultSummaryPrompt,
					DYNAMIC_PROMPTS: dynamicPrompts,
					DETAIL_INSTRUCTION: detailInstruction,
				},
			);
		}

		let userPrompt = "";
		if (isFollowUp && previousOutput) {
			userPrompt = `【原文上下文，仅作参考】\n...${contextBefore}...\n【以下是需要分析的核心内容】\n${text}\n【上文结束】\n...\n${contextAfter}...\n\n【前次生成的草稿】\n${previousOutput}\n\n【最新的修改要求】\n现在你已经给出了上述初稿，但我希望你对其进行改进。请严格分析【需要分析的核心内容】，不要引用或总结上下文中其他无关内容，严格按照我最新的要求进行修改或重写：\n${followUpText}`;
		} else {
			if (contextBefore || contextAfter) {
				userPrompt = `【原文上下文，仅作参考】\n...${contextBefore}...\n【以下是需要分析的核心内容】\n${text}\n【上文结束】\n...\n${contextAfter}...\n\n【重要】请仅分析【需要分析的核心内容】中的文本，不要引用或总结上下文中其他无关内容。`;
			} else {
				userPrompt = `【需要分析的内容】\n${text}\n\n【重要】请仅分析以上内容，不要添加任何背景知识或外部信息。`;
			}
		}

		if (searchContext) {
			userPrompt += searchContext;
		}

		try {
			const hasImages = images && images.length > 0;

			console.log(`[Marking Note] AI 调用开始`, {
				model: provider.modelId,
				textLength: text.length,
				contextBeforeLength: contextBefore.length,
				contextAfterLength: contextAfter.length,
				hasImages: !!hasImages,
				imagesCount: images?.length || 0,
				steward: steward.id,
				command: command?.type || "default",
			});

			console.log(`[Marking Note] 发送的提示词长度:`, {
				systemPromptLength: systemPrompt.length,
				userPromptLength: userPrompt.length,
				totalPromptLength: systemPrompt.length + userPrompt.length,
			});

			const body: any = {
				model: provider.modelId,
				temperature: effectiveTemp,
				top_p: effectiveTopP,
			};

			if (effectiveThinking > 0) {
				body.max_completion_tokens = effectiveThinking;
			}

			if (hasImages) {
				const contentParts: any[] = [{ type: "text", text: userPrompt }];
				for (const img of images!) {
					contentParts.push({
						type: "image_url",
						image_url: { url: img.url },
					});
					if (img.alt) {
						contentParts.push({ type: "text", text: `[图片说明: ${img.alt}]` });
					}
				}
				body.messages = [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: contentParts },
				];
			} else {
				body.messages = [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: userPrompt },
				];
			}

			const response = await requestUrl({
				url: `${provider.baseURL}/chat/completions`,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${provider.apiKey}`,
				},
				body: JSON.stringify(body),
			});

			if (response.status !== 200) {
				console.error("AI API Error:", response.text);
				return null;
			}

			const data = response.json;
			const content = data.choices[0].message.content as string;

			console.log(`[Marking Note] AI 生成完成`, {
				model: provider.modelId,
				inputTokens: data.usage?.prompt_tokens ?? "N/A",
				outputTokens: data.usage?.completion_tokens ?? "N/A",
				totalTokens: data.usage?.total_tokens ?? "N/A",
				imagesCount: images?.length || 0,
			});

			if (purpose === "augment") {
				return {
					state: "1",
					id: footnoteId,
					summary: "增补",
					richText: content.trim(),
				};
			}
			return AIClient.parseResponse(content, footnoteId);
		} catch (e) {
			console.error("Failed to connect to AI Provider", e);
			return null;
		}
	}

	/**
	 * Robust response parser with multiple fallback strategies
	 */
	static parseResponse(
		content: string,
		footnoteId: string,
	): { state: string; id: string; summary: string; richText: string } | null {
		// Strategy 1: Split by our PART2 marker
		let firstPart = "";
		let secondPart = "";

		const part2Markers = [
			"=== PART2 ===",
			"=== 第二部分：详细富文本内容 ===",
			"=== 第二部分 ===",
		];
		let found = false;
		for (const marker of part2Markers) {
			const idx = content.indexOf(marker);
			if (idx >= 0) {
				firstPart = content.slice(0, idx);
				secondPart = content.slice(idx + marker.length).trim();
				found = true;
				break;
			}
		}

		if (!found) {
			// Strategy 2: Split at first double newline after the [1][#ID] line
			const idMatch = new RegExp(
				`\\[1\\]\\[${footnoteId.replace("#", "\\#")}\\](.*)`,
				"m",
			).exec(content);
			if (idMatch) {
				const matchEnd = (idMatch.index || 0) + idMatch[0].length;
				firstPart = content.slice(0, matchEnd);
				secondPart = content.slice(matchEnd).trim();
			} else {
				// Strategy 3: Just take the first line as summary, rest as rich text
				const lines = content.split("\n");
				firstPart = lines[0];
				secondPart = lines.slice(1).join("\n").trim();
			}
		}

		// Clean up PART1 markers
		firstPart = firstPart
			.replace(/=== PART1 ===/g, "")
			.replace(/=== 第一部分：结构化脚注 ===/g, "")
			.trim();

		// Extract state and summary from firstPart
		const match = /\[([0-3])\]\[(#[a-zA-Z0-9_-]+)\]\s*(.*)/.exec(firstPart);
		if (match) {
			return {
				state: match[1],
				id: match[2],
				summary: match[3].trim(),
				richText: secondPart,
			};
		}

		// Last resort: use the raw first part as summary
		if (firstPart.length > 0) {
			return {
				state: "1",
				id: footnoteId,
				summary: firstPart.slice(0, 50),
				richText: secondPart || content,
			};
		}

		console.warn("AI returned unparseable format. Raw content:", content);
		return null;
	}
}
