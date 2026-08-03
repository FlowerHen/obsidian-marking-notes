import type { MarkingNode } from "../state";

import { AIClient } from "../ai";
import { generateMergeId } from "../domain/ids";
import type {
	MarkingNoteSettings,
	ModelProvider,
	StewardConfig,
} from "../domain/types";
import {
	annotationRepository,
	type MergeCalloutNode,
} from "../repository/annotation-repository";

interface PromptTemplates {
	defaultSummary: string;
	annotation: string;
}

interface AppendConcatMergeInput {
	text: string;
	nodes: MergeCalloutNode[];
}

interface GenerateAiMergeInput {
	text: string;
	annotations: string[];
	steward: StewardConfig;
	provider: ModelProvider;
	settings: Pick<
		MarkingNoteSettings,
		"defaultSummarySystemPromptTemplate" | "annotationSystemPromptTemplate"
	>;
}

interface GenerateGuidedMergeInput extends GenerateAiMergeInput {
	topic: string;
	style: string;
	structure: string;
}

export class MergeService {
	appendConcatenatedMerge(input: AppendConcatMergeInput): {
		text: string;
		mergeId: string;
	} {
		const mergeId = generateMergeId();
		const mutation = annotationRepository.appendMergedCallout(input.text, {
			id: mergeId,
			nodes: input.nodes,
		});

		return { text: mutation.text, mergeId };
	}

	async generateAiMerge(
		input: GenerateAiMergeInput,
	): Promise<{ text: string; mergeId: string } | null> {
		const mergeId = generateMergeId();
		const aiPrompt = `请帮我整理和合并以下多个标注笔记：

${input.annotations.join("\n\n")}

请进行以下处理：
1. 去重：删除重复的内容
2. 排序：按主题或逻辑顺序重新组织
3. 提炼：提取核心观点和要点
4. 生成连贯笔记：用清晰的结构将这些标注整合成一篇连贯的笔记

请直接输出整理后的笔记内容，不需要额外的解释。`;

		const result = await AIClient.generateAnnotation({
			text: aiPrompt,
			contextBefore: "",
			contextAfter: "",
			steward: input.steward,
			provider: input.provider,
			footnoteId: mergeId,
			defaultSummaryPrompt: "AI 重组标注笔记",
			isFollowUp: false,
			previousOutput: undefined,
			followUpText: undefined,
			searchContext: undefined,
			promptTemplates: this.promptTemplates(input.settings),
		});

		if (!result?.richText) {
			return null;
		}

		return {
			mergeId,
			text: annotationRepository.appendMergedCallout(input.text, {
				id: mergeId,
				nodes: [
					{
						node: {
							text: `AI 重组 ${input.annotations.length} 个标注`,
							summary: "",
						},
						content: result.richText,
					},
				],
			}).text,
		};
	}

	async generateGuidedMerge(
		input: GenerateGuidedMergeInput,
	): Promise<{ text: string; mergeId: string } | null> {
		const mergeId = generateMergeId();
		const styleMap: Record<string, string> = {
			简洁摘要: "3-5个要点，每点1-2句",
			详细解释: "每个要点展开说明，附例子",
			问答形式: '整理成"问题→答案"格式',
			苏格拉底式: "提出问题引发思考，不直接给答案",
		};
		const structureMap: Record<string, string> = {
			清单式: "按优先级排序的要点列表",
			思维导图: "分层结构，核心在中心",
			知识图谱: "节点+连接，标注之间的关系",
			标准论文: "摘要→引言→论点→结论",
		};
		const topicMap: Record<string, string> = {
			学术研究: "提取核心论点和证据",
			概念解析: "解释关键术语和原理",
			实践应用: "提炼可操作的方法步骤",
			批判分析: "对比观点、找出逻辑漏洞",
		};

		const aiPrompt = `你是一个深度绑定的个人知识管理分析引擎。请帮我整理以下标注笔记：

【标注内容】
${input.annotations.join("\n---\n")}

【话题方向】
${input.topic} - ${topicMap[input.topic] || ""}

【笔记风格要求】
${input.style} - ${styleMap[input.style] || ""}

【输出结构】
${input.structure} - ${structureMap[input.structure] || ""}

【处理要求】
1. 去重：删除重复或高度相似的内容
2. 提炼：提取每个核心观点，用自己的话重新表述
3. 连接：标注不同观点之间的关系（支持/反对/延伸/举例）
4. 归属：每个观点必须注明来源

请直接输出整理后的笔记内容，使用Markdown格式。`;

		const result = await AIClient.generateAnnotation({
			text: aiPrompt,
			contextBefore: "",
			contextAfter: "",
			steward: input.steward,
			provider: input.provider,
			footnoteId: mergeId,
			defaultSummaryPrompt: `引导模式合并: ${input.topic} + ${input.style} + ${input.structure}`,
			isFollowUp: false,
			previousOutput: undefined,
			followUpText: undefined,
			searchContext: undefined,
			promptTemplates: this.promptTemplates(input.settings),
		});

		if (!result?.richText) {
			return null;
		}

		return {
			mergeId,
			text: annotationRepository.appendMergedCallout(input.text, {
				id: mergeId,
				nodes: [
					{
						node: {
							text: `引导合并 ${input.annotations.length} 个标注 (${input.topic}/${input.style}/${input.structure})`,
							summary: "",
						},
						content: result.richText,
					},
				],
			}).text,
		};
	}

	buildAnnotationSnippet(
		node: MarkingNode,
		content: string,
		index: number,
	): string | null {
		const resolvedContent = content || node.summary || "";
		if (!resolvedContent) {
			return null;
		}

		return `【标注 ${index + 1}】\n原文: ${node.text}\nAI分析: ${resolvedContent}`;
	}

	private promptTemplates(
		settings: Pick<
			MarkingNoteSettings,
			"defaultSummarySystemPromptTemplate" | "annotationSystemPromptTemplate"
		>,
	): PromptTemplates {
		return {
			defaultSummary: settings.defaultSummarySystemPromptTemplate,
			annotation: settings.annotationSystemPromptTemplate,
		};
	}
}
