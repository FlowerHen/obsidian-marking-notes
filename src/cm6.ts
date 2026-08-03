import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	EditorView,
	WidgetType,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import { parseMarkingNodes, type MarkingNode } from "./state";
import { getTagHighlightInlineStyle } from "./tag-styles";
import { FloatingMenu, type PopoverContext } from "./ui";
import type MarkingNotePlugin from "../main";
import type { LightningCommand, MarkingTag } from "./domain/types";

// --- Capsule Widget (minimal: just icon) ---

class CapsuleWidget extends WidgetType {
	constructor(
		public node: MarkingNode,
		public tags: MarkingTag[],
	) {
		super();
	}

	eq(other: CapsuleWidget): boolean {
		return (
			this.node.id === other.node.id &&
			this.node.state === other.node.state &&
			this.node.summary === other.node.summary &&
			this.node.tagId === other.node.tagId
		);
	}

	toDOM(): HTMLElement {
		const span = document.createElement("span");
		span.className = `marking-capsule marking-capsule-${this.node.state}`;

		// Always show state icon — tag is sidebar-only
		let icon = "🤖";
		if (this.node.state === "0") icon = "⏳";
		else if (this.node.state === "1") icon = "✏️";
		else if (this.node.state === "2") icon = "👁️";
		else if (this.node.state === "3") icon = "✅";

		span.innerText = icon;

		if (this.node.summary) {
			span.title = `${this.node.id}: ${this.node.summary}`;
		} else {
			span.title = this.node.id;
		}

		span.setAttribute("data-marking-id", this.node.id);

		return span;
	}

	ignoreEvent(_event: Event): boolean {
		return false;
	}
}

// --- Build decorations ---

function buildDecorations(
	text: string,
	tags: MarkingTag[],
): { decos: DecorationSet; nodes: MarkingNode[] } {
	const builder = new RangeSetBuilder<Decoration>();
	const nodes = parseMarkingNodes(text);

	for (const node of nodes) {
		const tag = node.tagId ? tags.find((t) => t.id === node.tagId) : null;

		let cssClass = `mark-state-${node.state} marking-highlight-region`;
		const attrs: Record<string, string> = { "data-marking-id": node.id };

		if (tag) {
			attrs["style"] = getTagHighlightInlineStyle(tag);
			cssClass = "marking-highlight-region marking-tagged";
		}

		const highlightDeco = Decoration.mark({
			class: cssClass,
			attributes: attrs,
		});

		const hlStart = node.from;
		const hlEnd = node.highlightEnd;

		if (hlStart < hlEnd && hlEnd <= text.length) {
			builder.add(hlStart, hlEnd, highlightDeco);
		}

		if (!node.isPlain && node.highlightEnd < node.to) {
			const widgetDeco = Decoration.replace({
				widget: new CapsuleWidget(node, tags),
				inclusive: false,
			});
			builder.add(node.highlightEnd, node.to, widgetDeco);
		}
	}

	return { decos: builder.finish(), nodes };
}

// --- Main Extension Factory ---

export function createMarkingExtensions(
	onCommand: (
		view: EditorView,
		selection: string,
		command: LightningCommand,
	) => void,
	onAugment: (
		view: EditorView,
		selection: string,
		command: LightningCommand,
	) => void,
	onLink: () => void,
	popoverCtx: PopoverContext,
	plugin: MarkingNotePlugin,
): Extension[] {
	const mainPlugin = ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			currentNodes: MarkingNode[] = [];
			menu: FloatingMenu | null = null;
			menuTimer: number | null = null;

			constructor(public view: EditorView) {
				const result = buildDecorations(
					view.state.doc.toString(),
					plugin.settings.tags || [],
				);
				this.decorations = result.decos;
				this.currentNodes = result.nodes;
			}

			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged) {
					const result = buildDecorations(
						update.state.doc.toString(),
						plugin.settings.tags || [],
					);
					this.decorations = result.decos;
					this.currentNodes = result.nodes;
				}

				// Handle selection changes for floating menu
				if (update.selectionSet || update.docChanged) {
					const sel = update.state.selection.main;

					// Auto-close menu when selection is empty
					if (sel.empty) {
						if (this.menu) {
							this.menu.close();
							this.menu = null;
						}
						if (this.menuTimer) {
							window.clearTimeout(this.menuTimer);
							this.menuTimer = null;
						}
						return;
					}

					if (this.menuTimer) window.clearTimeout(this.menuTimer);

					this.menuTimer = window.setTimeout(() => {
						if (!plugin.settings.enableFloatingMenu) return;

						const selection = update.state.sliceDoc(sel.from, sel.to);
						if (!selection.trim()) return;

						const coords = update.view.coordsAtPos(sel.from);
						if (coords) {
							if (!this.menu) {
								this.menu = new FloatingMenu(
									(s: string, cmd: LightningCommand) =>
										onCommand(update.view, s, cmd),
									(s: string, cmd: LightningCommand) =>
										onAugment(update.view, s, cmd),
									(s: string, instruction: string) => {
										window.dispatchEvent(
											new CustomEvent("marking-note-inline-modify", {
												detail: {
													view: update.view,
													selection: s,
													instruction,
												},
											}),
										);
									},
									onLink,
								);
							}
							this.menu.show(coords.left, coords.top, selection);
						}
					}, 300);
				}
			}

			destroy() {
				if (this.menu) this.menu.close();
			}
		},
		{
			decorations: (v) => v.decorations,
		},
	);

	// Click handler for capsules → show popover
	const clickHandler = EditorView.domEventHandlers({
		mousedown(event: MouseEvent, _view: EditorView) {
			const target = event.target as HTMLElement;
			if (
				target.closest('.callout[data-callout="ai-footnote"]') ||
				target.closest(".marking-capsule")
			) {
				event.preventDefault();
			}
		},
		touchstart(event: TouchEvent, view: EditorView) {
			const target = event.target as HTMLElement;
			if (
				target.closest('.callout[data-callout="ai-footnote"]') ||
				target.closest(".marking-capsule")
			) {
				if (document.activeElement === view.contentDOM) {
					view.contentDOM.blur();
				}
			}
		},
		click(event: MouseEvent, view: EditorView) {
			const target = event.target as HTMLElement;

			// Prevent keyboard pop-up on mobile when clicking footnote callouts
			if (target.closest('.callout[data-callout="ai-footnote"]')) {
				setTimeout(() => {
					if (document.activeElement === view.contentDOM) {
						view.contentDOM.blur();
					}
				}, 10);
				return true; // We handled it
			}

			const capsule = target.closest(".marking-capsule");
			if (!capsule) return false;

			// Defocus editor completely when clicking capsule
			view.contentDOM.blur();
			event.preventDefault();
			event.stopPropagation();

			const markId = capsule.getAttribute("data-marking-id");
			if (!markId) return false;

			const text = view.state.doc.toString();
			const nodes = parseMarkingNodes(text);
			const node = nodes.find((n) => n.id === markId);
			if (!node) return false;

			// Import and use PopoverEditor
			const { PopoverEditor } = require("./ui");
			const popover = new PopoverEditor(node, view, popoverCtx);
			const rect = (capsule as HTMLElement).getBoundingClientRect();
			popover.show(rect.left, rect.bottom + 4);

			return true;
		},
	});

	return [mainPlugin, clickHandler];
}
