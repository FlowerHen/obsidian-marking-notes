import type { MarkingTag } from "../domain/types";
import type { MarkingNode } from "../state";
import { applyTagHighlightStyle } from "../tag-styles";

interface RenderReadingModeAnnotationsInput {
	container: HTMLElement;
	tags: MarkingTag[];
	nodes?: MarkingNode[];
	onOpenPopover: (input: {
		nodeId: string;
		summary: string;
		state: string;
		tagId: string;
		anchorX: number;
		anchorY: number;
	}) => void;
}

function normalizeText(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function findMatchingNode(
	mark: HTMLElement,
	nodes: MarkingNode[],
	used: Set<string>,
): MarkingNode | undefined {
	const markText = normalizeText(mark.textContent || "");
	if (!markText) return undefined;

	return nodes.find(
		(node) => !used.has(node.id) && normalizeText(node.text) === markText,
	);
}

export function renderReadingModeAnnotations(
	input: RenderReadingModeAnnotationsInput,
): void {
	const marks = Array.from(input.container.querySelectorAll("mark"));
	const sourceNodes = input.nodes || [];
	const usedNodeIds = new Set<string>();

	marks.forEach((mark) => {
		const node = findMatchingNode(mark, sourceNodes, usedNodeIds);
		mark.classList.add("marking-highlight-region");
		mark.style.cursor = node && !node.isPlain ? "pointer" : "default";

		if (!node || node.isPlain) {
			mark.classList.add("mark-state-0");
			return;
		}

		usedNodeIds.add(node.id);
		const state = node.state;
		const tagId = node.tagId || "";
		const summary = node.summary || "";
		mark.dataset.markingId = node.id;
		mark.dataset.markingState = state;
		mark.classList.add(`mark-state-${state}`);

		const tag = tagId
			? input.tags.find((candidate) => candidate.id === tagId)
			: undefined;
		if (tag) {
			mark.classList.add("marking-tagged");
			applyTagHighlightStyle(mark, tag);
		}

		const existingBadge = mark.nextElementSibling;
		if (
			existingBadge instanceof HTMLElement &&
			existingBadge.classList.contains("marking-capsule") &&
			existingBadge.dataset.markingId === node.id
		) {
			return;
		}

		const badge = document.createElement("span");
		badge.addClass("marking-capsule", `marking-capsule-${state}`);
		badge.dataset.markingId = node.id;
		if (tagId) badge.dataset.tagId = tagId;

		const icon = tag?.emoji || (state === "0" ? "○" : state === "1" ? "✎" : state === "2" ? "◉" : "✓");
		const iconSpan = document.createElement("span");
		iconSpan.innerText = icon;
		badge.appendChild(iconSpan);

		if (summary) {
			const summarySpan = document.createElement("span");
			summarySpan.innerText = summary;
			summarySpan.style.marginLeft = "3px";
			badge.appendChild(summarySpan);
		}

		mark.parentNode?.insertBefore(badge, mark.nextSibling);

		const openPopover = (target: HTMLElement) => {
			const rect = target.getBoundingClientRect();
			input.onOpenPopover({
				nodeId: node.id,
				summary,
				state,
				tagId,
				anchorX: rect.left,
				anchorY: rect.bottom + 6,
			});
		};

		badge.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			openPopover(badge);
		});
		mark.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			openPopover(mark);
		});
	});
}
