import { parseInlineMarkers } from "./domain/annotation-format";

export const MarkState = {
	Unprocessed: "0",
	AIAnnotated: "1",
	HumanReview: "2",
	Archived: "3",
} as const;

export type MarkState = (typeof MarkState)[keyof typeof MarkState];

export interface MarkingNode {
	id: string; // e.g. #AX01 or 'plain-{offset}'
	state: MarkState;
	text: string; // The highlighted text
	from: number; // Start of `==`
	to: number; // End of the entire pattern (including footnote tag if present)
	summary: string; // The text inside the footnote anchor
	isPlain: boolean; // Whether this is a plain ==text== without our annotation
	highlightEnd: number; // End of the ==text== part (before any footnote)
	tagId?: string; // Optional tag ID for categorization & styling
}

export interface MergedNoteNode {
	id: string;
	title: string;
	preview: string;
	from: number;
	to: number;
}

// Matches ==text==[^[State][#ID] Summary]           (legacy, no tag)
// Matches ==text==[^[State][#ID][tagId] Summary]    (new, with tag)
const ANNOTATED_REGEX =
	/==([\s\S]*?)==\[\^\[([0-3])\]\[(#[a-zA-Z0-9_-]+)\](?:\[([a-zA-Z0-9_-]*)\])?([^\]]*)\]/g;

// Matches any ==text== (plain highlights)
const PLAIN_HIGHLIGHT_REGEX = /==([\s\S]*?)==/g;

const STATE_BY_NAME: Record<string, MarkState> = {
	unprocessed: MarkState.Unprocessed,
	annotated: MarkState.AIAnnotated,
	reviewed: MarkState.HumanReview,
	mastered: MarkState.Archived,
};

/**
 * Parse all highlights from text - both plain ==text== and annotated ==text==[^[S][#ID]...]
 */
export function parseMarkingNodes(text: string): MarkingNode[] {
	const nodes: MarkingNode[] = [];
	const coveredRanges: Array<[number, number]> = [];

	// 1. Find new-format markers first (they take priority)
	for (const marker of parseInlineMarkers(text)) {
		nodes.push({
			id: marker.id,
			state: STATE_BY_NAME[marker.state] || MarkState.Unprocessed,
			text: marker.text,
			summary: marker.summary,
			from: marker.from,
			to: marker.to,
			isPlain: false,
			highlightEnd: marker.highlightEnd,
			tagId: marker.tagId || undefined,
		});
		coveredRanges.push([marker.from, marker.to]);
	}

	// 2. Find legacy annotated highlights first (they take priority)
	const annotatedRegex = new RegExp(ANNOTATED_REGEX.source, "g");
	let annotatedMatch = annotatedRegex.exec(text);
	while (annotatedMatch !== null) {
		const match = annotatedMatch;
		const highlightText = match[1];
		const highlightEnd = match.index + 2 + highlightText.length + 2; // ==text==
		nodes.push({
			id: match[3],
			state: match[2] as MarkState,
			text: highlightText,
			summary: (match[5] || "").trim(),
			from: match.index,
			to: match.index + match[0].length,
			isPlain: false,
			highlightEnd,
			tagId: match[4] || undefined,
		});
		coveredRanges.push([match.index, match.index + match[0].length]);
		annotatedMatch = annotatedRegex.exec(text);
	}

	// 3. Find plain highlights that don't overlap with annotated ones
	const plainRegex = new RegExp(PLAIN_HIGHLIGHT_REGEX.source, "g");
	let plainMatch = plainRegex.exec(text);
	while (plainMatch !== null) {
		const match = plainMatch;
		const start = match.index;
		const end = match.index + match[0].length;

		// Check if this range overlaps with any annotated highlight
		const overlaps = coveredRanges.some(
			([cs, ce]) => start >= cs && start < ce,
		);
		if (!overlaps) {
			nodes.push({
				id: `plain-${start}`,
				state: MarkState.Unprocessed,
				text: match[1],
				summary: "",
				from: start,
				to: end,
				isPlain: true,
				highlightEnd: end,
			});
		}
		plainMatch = plainRegex.exec(text);
	}

	// Sort by position
	nodes.sort((a, b) => a.from - b.from);
	return nodes;
}

export function parseMergedNoteNodes(text: string): MergedNoteNode[] {
	const lines = text.split("\n");
	const nodes: MergedNoteNode[] = [];
	let currentOffset = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line.startsWith("> [!ai-merged]- ")) {
			currentOffset += line.length + 1;
			continue;
		}

		const startOffset = currentOffset;
		const id = line.slice("> [!ai-merged]- ".length).trim();
		const bodyLines: string[] = [];
		let j = i + 1;
		let endOffset = currentOffset + line.length + 1;

		while (j < lines.length && lines[j].startsWith(">")) {
			bodyLines.push(
				lines[j].startsWith("> ") ? lines[j].slice(2) : lines[j].slice(1),
			);
			endOffset += lines[j].length + 1;
			j++;
		}

		const meaningfulLine =
			bodyLines.find((candidate) => {
				const trimmed = candidate.trim();
				return trimmed.length > 0 && trimmed !== "---";
			}) || "";

		const preview = meaningfulLine
			.replace(/^#+\s*/, "")
			.replace(/^📌\s*/, "")
			.trim();

		nodes.push({
			id,
			title: `🔗 合并笔记 · ${id}`,
			preview: preview || "已生成合并笔记",
			from: startOffset,
			to: Math.max(startOffset, endOffset - 1),
		});

		i = j - 1;
		currentOffset = endOffset;
	}

	return nodes;
}
