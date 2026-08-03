export interface MigrationResult {
	text: string;
	migrated: number;
	skipped: string[];
}

export interface ReconciliationResult {
	text: string;
	addedResultIds: string[];
	removedOrphanResultIds: string[];
}

export interface ResultBlock {
	id: string;
	state: string;
	tagId: string;
	summary: string;
	content: string;
	from: number;
	to: number;
}

export interface InlineMarker {
	id: string;
	state: string;
	tagId: string;
	summary: string;
	text: string;
	from: number;
	to: number;
	highlightEnd: number;
}

const INLINE_MARKER = /==([\s\S]*?)==<!--\s*marking-note:id=([^\s]+?)\s*-->/g;

export function parseInlineMarkers(text: string): InlineMarker[] {
	const resultBlocks = new Map(
		parseResultBlocks(text).map((block) => [block.id, block]),
	);
	const markers: InlineMarker[] = [];

	for (const match of text.matchAll(INLINE_MARKER)) {
		const from = match.index ?? 0;
		const block = resultBlocks.get(match[2]);
		markers.push({
			id: match[2],
			state: block?.state || "unprocessed",
			tagId: block?.tagId || "",
			summary: block?.summary || "",
			text: match[1],
			from,
			to: from + match[0].length,
			highlightEnd: from + 2 + match[1].length + 2,
		});
	}

	return markers;
}

const RESULT_BLOCK = /```marking-note-result\n([\s\S]*?)\n```/g;

export function parseResultBlocks(text: string): ResultBlock[] {
	const blocks: ResultBlock[] = [];
	for (const match of text.matchAll(RESULT_BLOCK)) {
		const parsed = parseResultBlockBody(match[1]);
		if (!parsed || !parsed.id) continue;

		const from = match.index ?? 0;
		blocks.push({
			...parsed,
			from,
			to: from + match[0].length,
		});
	}
	return blocks;
}

export function updateResultBlock(
	text: string,
	id: string,
	content: string,
): string {
	const block = parseResultBlocks(text).find(
		(candidate) => candidate.id === id,
	);
	if (!block) return text;

	const replacement = formatResultBlock({ ...block, content });
	return `${text.slice(0, block.from)}${replacement}${text.slice(block.to)}`;
}

export function updateResultBlockMetadata(
	text: string,
	id: string,
	patch: Partial<Pick<ResultBlock, "state" | "tagId" | "summary">>,
): string {
	const block = parseResultBlocks(text).find(
		(candidate) => candidate.id === id,
	);
	if (!block) return text;

	return (
		text.slice(0, block.from) +
		formatResultBlock({ ...block, ...patch }) +
		text.slice(block.to)
	);
}

export function appendResultBlock(
	text: string,
	block: Omit<ResultBlock, "from" | "to">,
): string {
	const trimmed = text.trimEnd();
	const heading = trimmed.includes(RESULTS_HEADING)
		? ""
		: `\n\n${RESULTS_HEADING}`;
	return `${trimmed}${heading}\n\n${formatResultBlock(block)}\n`;
}

export function deleteResultBlock(text: string, id: string): string {
	const block = parseResultBlocks(text).find(
		(candidate) => candidate.id === id,
	);
	if (!block) return text;

	return (
		text.slice(0, block.from) +
		text
			.slice(block.to)
			.replace(/\n{3,}/g, "\n\n")
			.trimEnd()
	);
}

export function reconcileDocument(text: string): ReconciliationResult {
	const markers = parseInlineMarkers(text);
	const markerIds = new Set(markers.map((marker) => marker.id));
	const orphanedBlocks = parseResultBlocks(text).filter(
		(block) => !markerIds.has(block.id),
	);
	let nextText = text;

	for (const block of orphanedBlocks) {
		nextText = deleteResultBlock(nextText, block.id);
	}

	const addedResultIds: string[] = [];
	for (const marker of markers) {
		if (parseResultBlocks(nextText).some((block) => block.id === marker.id)) {
			continue;
		}
		nextText = appendResultBlock(nextText, {
			id: marker.id,
			state: marker.state,
			tagId: marker.tagId,
			summary: marker.summary,
			content: "",
		});
		addedResultIds.push(marker.id);
	}

	return {
		text: nextText,
		addedResultIds,
		removedOrphanResultIds: orphanedBlocks.map((block) => block.id),
	};
}

function parseResultBlockBody(
	body: string,
): Omit<ResultBlock, "from" | "to"> | null {
	const separator = body.indexOf("\n---\n");
	if (separator < 0) return null;

	const metadata = new Map<string, string>();
	for (const line of body.slice(0, separator).split("\n")) {
		const colon = line.indexOf(":");
		if (colon < 0) continue;
		metadata.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
	}

	return {
		id: metadata.get("id") || "",
		state: metadata.get("state") || "unprocessed",
		tagId: metadata.get("tag") || "",
		summary: metadata.get("summary") || "",
		content: body.slice(separator + "\n---\n".length).trim(),
	};
}

export function formatResultBlock(
	block: Pick<ResultBlock, "id" | "state" | "tagId" | "summary" | "content">,
): string {
	return [
		"```marking-note-result",
		`id: ${block.id}`,
		`state: ${block.state}`,
		`tag: ${block.tagId}`,
		`summary: ${block.summary}`,
		"---",
		block.content,
		"```",
	].join("\n");
}

interface LegacyAnnotation {
	id: string;
	state: string;
	text: string;
	summary: string;
	tagId: string;
	from: number;
	to: number;
}

const LEGACY_ANNOTATION =
	/==([\s\S]*?)==\[\^\[([0-3])\]\[#([a-zA-Z0-9_-]+)\](?:\[([a-zA-Z0-9_-]*)\])?([^\]]*)\]/g;
const LEGACY_CALLOUT =
	/^> \[!ai-footnote\]- #([a-zA-Z0-9_-]+)\n((?:^>.*(?:\n|$))*)/gm;
const RESULTS_HEADING = "## Marking Note Results";

const stateNames: Record<string, string> = {
	"0": "unprocessed",
	"1": "annotated",
	"2": "reviewed",
	"3": "mastered",
};

export function migrateLegacyDocument(text: string): MigrationResult {
	const annotations = parseLegacyAnnotations(text);
	if (annotations.length === 0) {
		return { text, migrated: 0, skipped: [] };
	}

	const callouts = parseLegacyCallouts(text);
	const missingCallouts = annotations
		.filter((annotation) => !callouts.has(annotation.id))
		.map((annotation) => annotation.id);

	if (missingCallouts.length > 0) {
		return { text, migrated: 0, skipped: missingCallouts };
	}

	let nextText = text;
	for (const annotation of [...annotations].reverse()) {
		const inline = `==${annotation.text}==<!-- marking-note:id=${annotation.id} -->`;
		nextText = `${nextText.slice(0, annotation.from)}${inline}${nextText.slice(annotation.to)}`;
	}

	nextText = removeLegacyCallouts(nextText, callouts);
	const blocks = annotations.map((annotation) =>
		formatResultBlock({
			id: annotation.id,
			state: annotation.state,
			tagId: annotation.tagId,
			summary: annotation.summary,
			content: callouts.get(annotation.id) || "",
		}),
	);
	nextText = appendResults(nextText, blocks);

	return { text: nextText, migrated: annotations.length, skipped: [] };
}

function parseLegacyAnnotations(text: string): LegacyAnnotation[] {
	const annotations: LegacyAnnotation[] = [];
	for (const match of text.matchAll(LEGACY_ANNOTATION)) {
		annotations.push({
			id: match[3],
			state: stateNames[match[2]],
			text: match[1],
			summary: (match[5] || "").trim(),
			tagId: match[4] || "",
			from: match.index ?? 0,
			to: (match.index ?? 0) + match[0].length,
		});
	}
	return annotations;
}

function parseLegacyCallouts(text: string): Map<string, string> {
	const callouts = new Map<string, string>();
	for (const match of text.matchAll(LEGACY_CALLOUT)) {
		const content = match[2]
			.split("\n")
			.filter(Boolean)
			.map((line) => (line.startsWith("> ") ? line.slice(2) : line.slice(1)))
			.join("\n")
			.trim();
		callouts.set(match[1], content);
	}
	return callouts;
}

function removeLegacyCallouts(
	text: string,
	callouts: Map<string, string>,
): string {
	let nextText = text;
	for (const id of callouts.keys()) {
		const pattern = new RegExp(
			`^> \\[!ai-footnote\\]- #${escapeRegExp(id)}\\n((?:^>.*(?:\\n|$))*)`,
			"gm",
		);
		nextText = nextText.replace(pattern, "");
	}
	return nextText.replace(/\n{3,}/g, "\n\n").trimEnd();
}

function appendResults(text: string, blocks: string[]): string {
	const separator = text.trimEnd();
	const hasHeading = new RegExp(
		`(^|\\n)${escapeRegExp(RESULTS_HEADING)}(?:\\n|$)`,
	).test(separator);
	const heading = hasHeading ? "" : `\n\n${RESULTS_HEADING}`;
	return `${separator}${heading}\n\n${blocks.join("\n\n")}\n`;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
