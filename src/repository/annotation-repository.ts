import {
	appendResultBlock,
	deleteResultBlock,
	parseResultBlocks,
	updateResultBlock,
	updateResultBlockMetadata,
} from "../domain/annotation-format";
import {
	MarkState,
	type MarkingNode,
	type MergedNoteNode,
	parseMarkingNodes,
	parseMergedNoteNodes,
} from "../state";
import { StorageEngine } from "../storage";

export interface TextRange {
	from: number;
	to: number;
}

export interface AnnotationTextMutation {
	text: string;
	range?: TextRange | null;
}

export interface CreatePendingAnnotationInput {
	text: string;
	selection: string;
	selectionFrom: number;
	selectionTo: number;
	id: string;
	tagId?: string;
	state?: MarkState;
	summary?: string;
}

export interface ApplyAnnotationResultInput {
	text: string;
	id: string;
	state: MarkState;
	summary: string;
	richText: string;
}

export interface UpdateAnnotationTagInput {
	text: string;
	id: string;
	tagId?: string;
}

export interface UpdateAnnotationStateInput {
	text: string;
	id: string;
	state: MarkState;
}

export interface UpdateAnnotationSummaryInput {
	text: string;
	id: string;
	summary: string;
}

export interface UpdateCalloutContentInput {
	text: string;
	id: string;
	richText: string;
}

export interface MergeCalloutNode {
	node: Pick<MarkingNode, "text" | "tagId" | "summary">;
	content: string;
}

export interface MergeCalloutInput {
	id: string;
	nodes: MergeCalloutNode[];
}

const STATE_NAME_BY_VALUE: Record<MarkState, string> = {
	[MarkState.Unprocessed]: "unprocessed",
	[MarkState.AIAnnotated]: "annotated",
	[MarkState.HumanReview]: "reviewed",
	[MarkState.Archived]: "mastered",
};

export interface AnnotationRepository {
	parseMarkingNodes(text: string): MarkingNode[];
	parseMergedNoteNodes(text: string): MergedNoteNode[];
	findCalloutRange(text: string, id: string): TextRange | null;
	getCalloutContent(text: string, id: string): string | null;
	ensureVaultSeparator(text: string): string;
	appendCallout(
		text: string,
		id: string,
		richText: string,
	): AnnotationTextMutation;
	appendMergedCallout(
		text: string,
		input: MergeCalloutInput,
	): AnnotationTextMutation;
	createPendingAnnotation(
		input: CreatePendingAnnotationInput,
	): AnnotationTextMutation;
	applyAnnotationResult(
		input: ApplyAnnotationResultInput,
	): AnnotationTextMutation;
	updateAnnotationTag(input: UpdateAnnotationTagInput): AnnotationTextMutation;
	updateAnnotationState(
		input: UpdateAnnotationStateInput,
	): AnnotationTextMutation;
	updateAnnotationSummary(
		input: UpdateAnnotationSummaryInput,
	): AnnotationTextMutation;
	updateCalloutContent(
		input: UpdateCalloutContentInput,
	): AnnotationTextMutation;
	deleteCallout(text: string, id: string): AnnotationTextMutation;
	deleteAnnotation(text: string, id: string): AnnotationTextMutation;
	deleteMergedNote(text: string, id: string): AnnotationTextMutation;
	formatMergedCallout(input: MergeCalloutInput): string;
}

export class MarkdownAnnotationRepository implements AnnotationRepository {
	parseMarkingNodes(text: string): MarkingNode[] {
		return parseMarkingNodes(text);
	}

	parseMergedNoteNodes(text: string): MergedNoteNode[] {
		return parseMergedNoteNodes(text);
	}

	findCalloutRange(text: string, id: string): TextRange | null {
		const resultBlock = parseResultBlocks(text).find(
			(block) => block.id === id,
		);
		if (resultBlock) return { from: resultBlock.from, to: resultBlock.to };
		return StorageEngine.findCalloutRange(text, id);
	}

	getCalloutContent(text: string, id: string): string | null {
		const resultBlock = parseResultBlocks(text).find(
			(block) => block.id === id,
		);
		if (resultBlock) return resultBlock.content;
		return StorageEngine.getCalloutContent(text, id);
	}

	ensureVaultSeparator(text: string): string {
		if (text.includes("AI Data Vault")) return text;
		return `${text}${StorageEngine.VAULT_SEPARATOR}`;
	}

	appendCallout(
		text: string,
		id: string,
		richText: string,
	): AnnotationTextMutation {
		const nextText = appendResultBlock(text, {
			id,
			state: "annotated",
			tagId: "",
			summary: "",
			content: richText,
		});
		return { text: nextText };
	}

	appendMergedCallout(
		text: string,
		input: MergeCalloutInput,
	): AnnotationTextMutation {
		const nextText = `${this.ensureVaultSeparator(text)}${this.formatMergedCallout(input)}`;
		return { text: nextText };
	}

	createPendingAnnotation(
		input: CreatePendingAnnotationInput,
	): AnnotationTextMutation {
		const state = input.state ?? MarkState.Unprocessed;
		const marker = `==${input.selection}==<!-- marking-note:id=${input.id} -->`;
		const markedText = this.replaceRange(
			input.text,
			input.selectionFrom,
			input.selectionTo,
			marker,
		);
		const nextText = appendResultBlock(markedText, {
			id: input.id,
			state: STATE_NAME_BY_VALUE[state],
			tagId: input.tagId || "",
			summary: input.summary || "",
			content: "",
		});

		return {
			text: nextText,
			range: {
				from: input.selectionFrom,
				to: input.selectionFrom + marker.length,
			},
		};
	}

	applyAnnotationResult(
		input: ApplyAnnotationResultInput,
	): AnnotationTextMutation {
		const contentResult = this.updateCalloutContent({
			text: input.text,
			id: input.id,
			richText: input.richText,
		});
		const summaryResult = this.updateAnnotationSummary({
			text: contentResult.text,
			id: input.id,
			summary: input.summary,
		});
		return this.updateAnnotationState({
			text: summaryResult.text,
			id: input.id,
			state: input.state,
		});
	}

	updateAnnotationTag(input: UpdateAnnotationTagInput): AnnotationTextMutation {
		return this.updateMetadata(input.text, input.id, {
			tagId: input.tagId || "",
		});
	}

	updateAnnotationState(
		input: UpdateAnnotationStateInput,
	): AnnotationTextMutation {
		return this.updateMetadata(input.text, input.id, {
			state: STATE_NAME_BY_VALUE[input.state],
		});
	}

	updateAnnotationSummary(
		input: UpdateAnnotationSummaryInput,
	): AnnotationTextMutation {
		return this.updateMetadata(input.text, input.id, {
			summary: input.summary,
		});
	}

	updateCalloutContent(
		input: UpdateCalloutContentInput,
	): AnnotationTextMutation {
		const existing = parseResultBlocks(input.text).find(
			(block) => block.id === input.id,
		);
		if (!existing)
			return this.appendCallout(input.text, input.id, input.richText);

		const nextText = updateResultBlock(input.text, input.id, input.richText);
		return {
			text: nextText,
			range: {
				from: existing.from,
				to:
					existing.from +
					(nextText.length - input.text.length) +
					existing.to -
					existing.from,
			},
		};
	}

	deleteCallout(text: string, id: string): AnnotationTextMutation {
		const resultBlock = parseResultBlocks(text).find(
			(block) => block.id === id,
		);
		if (resultBlock) {
			return {
				text: deleteResultBlock(text, id),
				range: { from: resultBlock.from, to: resultBlock.to },
			};
		}

		const range = StorageEngine.findCalloutRange(text, id);
		if (!range) return { text, range: null };
		return {
			text: this.replaceRange(
				text,
				range.from,
				this.calloutEnd(text, range),
				"",
			),
			range,
		};
	}

	deleteAnnotation(text: string, id: string): AnnotationTextMutation {
		const node = this.findAnnotation(text, id);
		if (!node) return { text, range: null };

		const nextText = this.replaceRange(text, node.from, node.to, node.text);
		const result = this.deleteCallout(nextText, id);
		return {
			text: result.text,
			range: { from: node.from, to: node.from + node.text.length },
		};
	}

	deleteMergedNote(text: string, id: string): AnnotationTextMutation {
		return this.deleteCallout(text, id);
	}

	formatMergedCallout(input: MergeCalloutInput): string {
		return StorageEngine.mergeCallouts(input.id, input.nodes);
	}

	private updateMetadata(
		text: string,
		id: string,
		patch: Partial<{ state: string; tagId: string; summary: string }>,
	): AnnotationTextMutation {
		const node = this.findAnnotation(text, id);
		if (!node) return { text, range: null };

		const nextText = updateResultBlockMetadata(text, id, patch);
		if (nextText === text) return { text, range: null };
		return { text: nextText, range: { from: node.from, to: node.to } };
	}

	private findAnnotation(text: string, id: string): MarkingNode | undefined {
		return this.parseMarkingNodes(text).find(
			(node) => node.id === id && !node.isPlain,
		);
	}

	private replaceRange(
		text: string,
		from: number,
		to: number,
		insert: string,
	): string {
		return `${text.slice(0, from)}${insert}${text.slice(to)}`;
	}

	private calloutEnd(text: string, range: TextRange): number {
		return Math.min(range.to + 1, text.length);
	}
}

export const annotationRepository = new MarkdownAnnotationRepository();
