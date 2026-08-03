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

export function renderReadingModeAnnotations(
	input: RenderReadingModeAnnotationsInput,
): void {
	const marks = Array.from(input.container.querySelectorAll("mark"));
	const sourceNodes = input.nodes || [];

	marks.forEach((mark, index) => {
		const node = sourceNodes[index];
		mark.classList.add("marking-highlight-region");
		mark.style.cursor = node && !node.isPlain ? "pointer" : "default";

		if (!node || node.isPlain) {
			mark.classList.add("mark-state-0");
			return;
		}

		const state = node.state;
		const tagId = node.tagId || "";
		const summary = node.summary || "";
		mark.dataset.markingId = node.id;
		mark.classList.add(`mark-state-${state}`);

		const tag = tagId
			? input.tags.find((candidate) => candidate.id === tagId)
			: undefined;
		if (tag) {
			mark.classList.add("marking-tagged");
			applyTagHighlightStyle(mark, tag);
		}

		const badge = document.createElement("span");
		badge.addClass("marking-capsule", `marking-capsule-${state}`);
		badge.dataset.markingId = node.id;
		if (tagId) badge.dataset.tagId = tagId;

		const emoji =
			tag?.emoji ||
			(state === "0"
				? "🪄"
				: state === "1"
					? "⚡"
					: state === "2"
						? "👤"
						: "📦");
		const iconSpan = document.createElement("span");
		iconSpan.innerText = emoji;
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
