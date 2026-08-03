import type { EditorView } from "@codemirror/view";
import type { MarkingNode } from "./state";
import type { LightningCommand } from "./domain/types";
import { type App, Component, MarkdownRenderer } from "obsidian";
import { annotationRepository } from "./repository/annotation-repository";
import {
	getDesktopActionPosition,
	getMobileActionBottom,
} from "./ui/action-surface";

// --- Context passed to PopoverEditor ---

export interface PopoverContext {
	app: App;
	onFollowUp: (
		nodeId: string,
		instruction: string,
		currentContent: string,
		options?: { enableWebSearch?: boolean },
	) => Promise<{ summary: string; richText: string } | null>;
	canUndo: (nodeId: string) => boolean;
	popUndo: (nodeId: string) => string | null;
	webSearchEnabled?: boolean;
}

// --- Floating Action Menu ---

export class FloatingMenu {
	private container: HTMLElement | null = null;
	private currentSelection: string = "";
	private viewportCleanup: (() => void) | null = null;

	constructor(
		private onCommand: (selection: string, command: LightningCommand) => void,
		private onInlineModify: (selection: string, instruction: string) => void,
		private onLink: () => void,
	) {}

	show(x: number, y: number, selection: string) {
		this.close();
		this.currentSelection = selection;

		this.container = document.createElement("div");
		this.container.addClass("ai-floating-menu");
		const isMobile =
			window.innerWidth <= 600 ||
			window.matchMedia("(pointer: coarse)").matches;
		if (isMobile) this.container.addClass("ai-floating-menu-mobile");

		// Keep the editor selection active while the action bar receives the click.
		this.container.addEventListener("mousedown", (event) =>
			event.preventDefault(),
		);

		const actions = [
			{
				icon: "💬",
				label: "对话",
				title: "使用当前管家的对话指令",
				onClick: (button: HTMLElement) =>
					this.showCommandDropdown(button, "conversation"),
			},
			{
				icon: "✏️",
				label: "改写",
				title: "使用当前管家的改写指令",
				onClick: (button: HTMLElement) => this.showInlineModifyDropdown(button),
			},
			{
				icon: "➕",
				label: "增补",
				title: "使用当前管家的增补指令",
				onClick: (button: HTMLElement) =>
					this.showCommandDropdown(button, "augment"),
			},
			{
				icon: "🔗",
				label: "链接",
				title: "使用 Obsidian 原生链接选择",
				onClick: () => {
					this.onLink();
					this.close();
				},
			},
		];

		for (const [index, action] of actions.entries()) {
			const button = document.createElement("button");
			button.addClass("ai-floating-btn");
			if (index === 0) button.addClass("ai-floating-btn-primary");
			button.innerText = `${action.icon} ${action.label}`;
			button.title = action.title;
			button.onclick = (event) => {
				event.stopPropagation();
				action.onClick(button);
			};
			this.container.appendChild(button);
		}

		document.body.appendChild(this.container);
		this.position(x, y, isMobile);

		const viewport = window.visualViewport;
		if (viewport) {
			const reposition = () => this.position(x, y, isMobile);
			viewport.addEventListener("resize", reposition);
			viewport.addEventListener("scroll", reposition);
			this.viewportCleanup = () => {
				viewport.removeEventListener("resize", reposition);
				viewport.removeEventListener("scroll", reposition);
			};
		}
	}

	private position(anchorX: number, anchorY: number, isMobile: boolean) {
		if (!this.container) return;
		const viewport = window.visualViewport;
		const vw = viewport?.width || window.innerWidth;
		const vh = viewport?.height || window.innerHeight;

		if (isMobile) {
			this.container.style.left = "8px";
			this.container.style.right = "8px";
			this.container.style.top = "";
			this.container.style.bottom = `${getMobileActionBottom(
				window.innerHeight,
				viewport?.offsetTop || 0,
				vh,
			)}px`;
			return;
		}

		const menuRect = this.container.getBoundingClientRect();
		const position = getDesktopActionPosition(
			anchorX,
			anchorY,
			menuRect.width,
			menuRect.height,
			vw,
			vh,
		);
		this.container.style.left = `${position.left}px`;
		this.container.style.top = `${position.top}px`;
		this.container.style.right = "";
		this.container.style.bottom = "";
	}

	private appendEmptyCommandState(dropdown: HTMLElement, message: string) {
		const emptyItem = document.createElement("div");
		emptyItem.addClass("ai-lightning-item");
		emptyItem.innerText = message;
		emptyItem.style.color = "var(--text-muted)";
		dropdown.appendChild(emptyItem);

		const settingsButton = document.createElement("button");
		settingsButton.addClass("ai-lightning-item", "ai-lightning-settings-item");
		settingsButton.innerText = "打开管家设置";
		settingsButton.onclick = () => {
			window.dispatchEvent(new CustomEvent("marking-note-open-settings"));
			dropdown.remove();
			this.close();
		};
		dropdown.appendChild(settingsButton);
	}

	private showCommandDropdown(anchor: HTMLElement, operation = "conversation") {
		const existing = document.querySelector(".ai-lightning-dropdown");
		if (existing) existing.remove();

		const dropdown = document.createElement("div");
		dropdown.addClass("ai-lightning-dropdown");

		const rect = anchor.getBoundingClientRect();
		dropdown.style.left = `${rect.left}px`;
		dropdown.style.top = `${rect.bottom + 4}px`;

		const event = new CustomEvent("marking-note-get-commands", {
			detail: {
				operation,
				callback: (commands: LightningCommand[]) => {
					if (commands.length === 0) {
						this.appendEmptyCommandState(dropdown, "无快捷指令");
					} else {
						for (const cmd of commands) {
							const item = document.createElement("div");
							item.addClass("ai-lightning-item");
							item.style.display = "flex";
							item.style.alignItems = "center";
							item.style.justifyContent = "space-between";

							const leftPart = document.createElement("span");
							leftPart.innerText = `${cmd.icon} ${cmd.name}`;

							const rightPart = document.createElement("span");
							rightPart.style.display = "flex";
							rightPart.style.alignItems = "center";
							rightPart.style.gap = "4px";

							if (cmd.enableWebSearch) {
								const searchBadge = document.createElement("span");
								searchBadge.innerText = "🔍";
								searchBadge.title = "网络搜索已开启";
								searchBadge.style.fontSize = "0.85em";
								searchBadge.style.opacity = "0.7";
								rightPart.appendChild(searchBadge);
							}

							item.appendChild(leftPart);
							item.appendChild(rightPart);
							item.onclick = () => {
								this.onCommand(this.currentSelection, cmd);
								dropdown.remove();
								this.close();
							};
							dropdown.appendChild(item);
						}
					}
				},
			},
		});
		window.dispatchEvent(event);

		document.body.appendChild(dropdown);

		const closeHandler = (e: MouseEvent) => {
			if (!dropdown.contains(e.target as Node)) {
				dropdown.remove();
				document.removeEventListener("click", closeHandler);
			}
		};
		setTimeout(() => document.addEventListener("click", closeHandler), 10);
	}

	private showInlineModifyDropdown(anchor: HTMLElement) {
		const existing = document.querySelector(".ai-lightning-dropdown");
		if (existing) existing.remove();

		const dropdown = document.createElement("div");
		dropdown.addClass("ai-lightning-dropdown");

		const rect = anchor.getBoundingClientRect();
		dropdown.style.left = `${rect.left}px`;
		dropdown.style.top = `${rect.bottom + 4}px`;

		const event = new CustomEvent("marking-note-get-inline-commands", {
			detail: {
				callback: (commands: any[]) => {
					if (commands.length === 0) {
						this.appendEmptyCommandState(dropdown, "无改写指令");
					} else {
						for (const cmd of commands) {
							const item = document.createElement("div");
							item.addClass("ai-lightning-item");
							item.innerText = `${cmd.icon} ${cmd.name}`;
							item.onclick = () => {
								this.onInlineModify(this.currentSelection, cmd.detailPrompt);
								dropdown.remove();
								this.close();
							};
							dropdown.appendChild(item);
						}
					}
				},
			},
		});
		window.dispatchEvent(event);

		document.body.appendChild(dropdown);

		const closeHandler = (e: MouseEvent) => {
			if (!dropdown.contains(e.target as Node)) {
				dropdown.remove();
				document.removeEventListener("click", closeHandler);
			}
		};
		setTimeout(() => document.addEventListener("click", closeHandler), 10);
	}

	close() {
		this.viewportCleanup?.();
		this.viewportCleanup = null;
		if (this.container) {
			this.container.remove();
			this.container = null;
		}
		const dropdown = document.querySelector(".ai-lightning-dropdown");
		if (dropdown) dropdown.remove();
	}
}

// --- Popover Editor Window ---

export class PopoverEditor {
	private container: HTMLElement | null = null;
	private renderComponent: Component;
	private viewContainer: HTMLElement | null = null;
	private editTextarea: HTMLTextAreaElement | null = null;
	private isEditMode = false;
	private isFullscreen = false;
	private currentContent = "";
	private isPinned = false;
	private outsideClickHandler: ((e: MouseEvent) => void) | null = null;
	private webSearchEnabled = false;
	// Saved non-fullscreen position/size for restoration
	private savedLeft = "";
	private savedTop = "";
	private savedWidth = "";
	private savedHeight = "";
	private cleanupFns: Array<() => void> = [];

	constructor(
		public node: MarkingNode,
		public editorView: EditorView,
		public ctx: PopoverContext,
	) {
		this.renderComponent = new Component();
		this.renderComponent.load();
	}

	async show(anchorX: number, anchorY: number) {
		// Fetch content from bottom Callout
		const fullDoc = this.editorView.state.doc.toString();
		this.currentContent =
			annotationRepository.getCalloutContent(fullDoc, this.node.id) || "";

		if (this.isPinned && this.container) {
			// Just update content in place without recreating window
			this.updateTitleDisplay();
			if (this.editTextarea) this.editTextarea.value = this.currentContent;
			await this.renderMarkdownView();
			return;
		}

		this.close();

		this.container = document.createElement("div");
		this.container.addClass("ai-footnote-popover-window");

		// Position near anchor with viewport bounds — pure JS, no CSS transform
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const isMobile = vw <= 600;

		let popW: number;
		let posX: number;
		let posY: number;

		if (isMobile) {
			popW = Math.floor(vw * 0.94);
			posX = Math.floor((vw - popW) / 2);
			// Center it slightly towards the bottom on mobile to accommodate keyboards naturally
			posY = Math.max(70, Math.floor(vh / 2 - 180));
		} else {
			popW = 460;
			posX = Math.min(anchorX, vw - popW - 10);
			posX = Math.max(10, posX);
			posY = Math.min(anchorY, vh - 380);
			posY = Math.max(10, posY);
		}

		this.container.style.width = `${popW}px`;
		this.container.style.left = `${posX}px`;
		this.container.style.top = `${posY}px`;

		// === HEADER ===
		const header = document.createElement("div");
		header.addClass("ai-footnote-popover-header");

		// Left: pin toggle (frameless icon)
		const pinBtn = document.createElement("span");
		pinBtn.addClass("ai-popover-pin-toggle");
		pinBtn.innerText = this.isPinned ? "📍" : "📌";
		pinBtn.onclick = () => {
			this.isPinned = !this.isPinned;
			pinBtn.innerText = this.isPinned ? "📍" : "📌";
			pinBtn.style.opacity = this.isPinned ? "1" : "0.4";
			pinBtn.title = this.isPinned ? "取消固定" : "固定窗口";
			// Sync outside-click listener with pin state
			if (this.isPinned) {
				this.removeOutsideClickHandler();
			} else {
				this.addOutsideClickHandler();
			}
		};
		header.appendChild(pinBtn);

		// Center: truncated summary as title (no ID, no click-to-jump)
		const titleArea = document.createElement("div");
		titleArea.addClass("ai-popover-title-area");
		titleArea.id = "ai-popover-title-display";
		header.appendChild(titleArea);

		// Right: compact controls
		const ctrl = document.createElement("div");
		ctrl.addClass("ai-popover-ctrl-group");

		const toggleBtn = this.createCtrlBtn("📝", "编辑模式", () =>
			this.toggleMode(),
		);
		ctrl.appendChild(toggleBtn);

		// ⛶ Fullscreen button (before copy)
		const fullscreenBtn = this.createCtrlBtn("⛶", "铺满全屏 / 还原", () =>
			this.toggleFullscreen(fullscreenBtn),
		);
		ctrl.appendChild(fullscreenBtn);

		const copyBtn = this.createCtrlBtn("📋", "复制内容", () => {
			navigator.clipboard.writeText(this.currentContent);
			copyBtn.innerText = "✅";
			setTimeout(() => {
				copyBtn.innerText = "📋";
			}, 1500);
		});
		ctrl.appendChild(copyBtn);

		// 🗑️ Delete annotation entirely
		const deleteBtn = this.createCtrlBtn("🗑️", "删除此标注", () => {
			this.deleteNodeFromEditor();
			this.close();
		});
		deleteBtn.style.color = "var(--text-error, #e05c5c)";
		ctrl.appendChild(deleteBtn);

		const closeBtn = this.createCtrlBtn("✖", "关闭", () => this.close());
		ctrl.appendChild(closeBtn);

		header.appendChild(ctrl);
		this.container.appendChild(header);

		// === BODY ===
		const body = document.createElement("div");
		body.addClass("ai-footnote-popover-body");

		// View container (rendered markdown)
		this.viewContainer = document.createElement("div");
		this.viewContainer.addClass("ai-popover-view");
		body.appendChild(this.viewContainer);

		// Edit container (textarea, hidden initially)
		this.editTextarea = document.createElement("textarea");
		this.editTextarea.addClass("ai-popover-edit");
		this.editTextarea.value = this.currentContent;
		this.editTextarea.style.display = "none";
		this.editTextarea.spellcheck = false;
		this.editTextarea.addEventListener("input", () => {
			this.currentContent = this.editTextarea!.value;
			this.syncToBottom(this.currentContent);
		});
		body.appendChild(this.editTextarea);

		this.container.appendChild(body);

		// === FOOTER (follow-up chat) ===
		const footer = document.createElement("div");
		footer.addClass("ai-footnote-popover-footer");

		const inputRow = document.createElement("div");
		inputRow.addClass("ai-popover-input-row");

		const input = document.createElement("input");
		input.type = "text";
		input.placeholder = "对结果不满意？继续指挥 AI...";

		const sendBtn = document.createElement("button");
		sendBtn.addClass("ai-floating-btn", "ai-floating-btn-primary");
		sendBtn.innerText = "发送";
		sendBtn.style.padding = "4px 12px";
		sendBtn.style.marginLeft = "6px";
		sendBtn.style.fontSize = "0.85em";

		const webSearchBtn = document.createElement("button");
		webSearchBtn.addClass("ai-floating-btn");
		webSearchBtn.innerText = "🔍";
		webSearchBtn.title = "开启网络搜索";
		webSearchBtn.style.padding = "4px 8px";
		webSearchBtn.style.marginLeft = "4px";
		webSearchBtn.style.fontSize = "0.85em";
		webSearchBtn.style.opacity = "0.5";
		webSearchBtn.onclick = () => {
			this.webSearchEnabled = !this.webSearchEnabled;
			webSearchBtn.style.opacity = this.webSearchEnabled ? "1" : "0.5";
			webSearchBtn.style.background = this.webSearchEnabled
				? "var(--interactive-accent)"
				: "";
			webSearchBtn.title = this.webSearchEnabled
				? "关闭网络搜索"
				: "开启网络搜索";
		};

		const undoBtn = document.createElement("button");
		undoBtn.addClass("ai-floating-btn");
		undoBtn.innerText = "↩️ 回退";
		undoBtn.title = "回退到上一次的回答";
		undoBtn.style.padding = "4px 12px";
		undoBtn.style.marginLeft = "6px";
		undoBtn.style.fontSize = "0.85em";

		const updateUndoState = () => {
			if (this.ctx.canUndo(this.node.id)) {
				undoBtn.style.opacity = "1";
				undoBtn.style.cursor = "pointer";
			} else {
				undoBtn.style.opacity = "0.5";
				undoBtn.style.cursor = "not-allowed";
			}
		};

		const doSend = async () => {
			const instruction = input.value.trim();
			if (!instruction) return;

			input.value = "";
			input.placeholder = "⏳ AI 思考中...";
			input.disabled = true;
			sendBtn.disabled = true;

			const result = await this.ctx.onFollowUp(
				this.node.id,
				instruction,
				this.currentContent,
				{ enableWebSearch: this.webSearchEnabled },
			);

			input.disabled = false;
			sendBtn.disabled = false;
			input.placeholder = "对结果不满意？继续指挥 AI...";

			if (result) {
				this.currentContent = result.richText;
				this.syncToBottom(result.richText);
				this.syncToInline(result.summary);
				if (this.editTextarea) this.editTextarea.value = result.richText;
				await this.renderMarkdownView();
			}
			updateUndoState();
		};

		undoBtn.onclick = async () => {
			if (!this.ctx.canUndo(this.node.id)) return;
			const previousText = this.ctx.popUndo(this.node.id);
			if (previousText !== null) {
				this.currentContent = previousText;
				this.syncToBottom(previousText);
				if (this.editTextarea) this.editTextarea.value = previousText;
				await this.renderMarkdownView();
				updateUndoState();
			}
		};

		updateUndoState();

		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				doSend();
			}
		});
		sendBtn.onclick = doSend;

		inputRow.appendChild(input);
		inputRow.appendChild(undoBtn);
		inputRow.appendChild(webSearchBtn);
		inputRow.appendChild(sendBtn);
		footer.appendChild(inputRow);
		this.container.appendChild(footer);

		document.body.appendChild(this.container);

		// Render title and markdown
		this.updateTitleDisplay();
		await this.renderMarkdownView();

		// Make draggable by header
		this.makeDraggable(header);

		// Close on Esc
		const escHandler = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				this.close();
			}
		};
		document.addEventListener("keydown", escHandler);
		this.registerCleanup(() =>
			document.removeEventListener("keydown", escHandler),
		);

		// Outside-click to close when NOT pinned
		if (!this.isPinned) {
			this.addOutsideClickHandler();
		}
	}

	/** Update the title area to show truncated summary (or node id as fallback) */
	private updateTitleDisplay() {
		if (!this.container) return;
		const titleArea = this.container.querySelector(
			"#ai-popover-title-display",
		) as HTMLElement;
		if (!titleArea) return;
		titleArea.empty();

		const displayText = this.node.summary
			? this.node.summary.length > 24
				? this.node.summary.slice(0, 24) + "…"
				: this.node.summary
			: this.node.id || "无标题";

		const titleSpan = document.createElement("span");
		titleSpan.innerText = displayText;
		titleSpan.title = (this.node.summary || this.node.id) + " (双击跳转原文)";
		titleArea.ondblclick = () => this.jumpToSource();
		titleArea.style.cursor = "pointer";
		titleArea.appendChild(titleSpan);
	}

	private addOutsideClickHandler() {
		this.removeOutsideClickHandler(); // Ensure no duplicates
		this.outsideClickHandler = (e: MouseEvent) => {
			if (!this.container) return;
			if (!this.container.contains(e.target as Node)) {
				this.close();
			}
		};
		// Defer so the current click event that opened the popover doesn't immediately close it
		setTimeout(() => {
			if (this.outsideClickHandler) {
				document.addEventListener("click", this.outsideClickHandler);
			}
		}, 150);
	}

	private removeOutsideClickHandler() {
		if (this.outsideClickHandler) {
			document.removeEventListener("click", this.outsideClickHandler);
			this.outsideClickHandler = null;
		}
	}

	private registerCleanup(dispose: () => void) {
		this.cleanupFns.push(dispose);
	}

	private cleanupTransientListeners() {
		for (const dispose of this.cleanupFns.splice(0)) {
			dispose();
		}
	}

	private resetRenderComponent() {
		this.renderComponent.unload();
		this.renderComponent = new Component();
		this.renderComponent.load();
	}

	private createCtrlBtn(
		text: string,
		tooltip: string,
		onclick: () => void,
	): HTMLButtonElement {
		const btn = document.createElement("button");
		btn.addClass("ai-popover-ctrl-btn");
		btn.innerText = text;
		btn.title = tooltip;
		// Stop mousedown from reaching the drag handler so preventDefault is never called on buttons
		btn.addEventListener("mousedown", (e) => {
			e.stopPropagation();
		});
		btn.addEventListener("click", (e) => {
			e.stopPropagation();
			onclick();
		});
		return btn;
	}

	private async renderMarkdownView() {
		if (!this.viewContainer) return;
		this.viewContainer.empty();

		if (!this.currentContent) {
			this.viewContainer.createEl("p", {
				text: "暂无 AI 生成内容",
				attr: { style: "color: var(--text-muted); font-style: italic;" },
			});
			return;
		}

		try {
			// Obsidian MarkdownRenderer API
			await (MarkdownRenderer as any).render(
				this.ctx.app,
				this.currentContent,
				this.viewContainer,
				"",
				this.renderComponent,
			);
		} catch {
			try {
				await (MarkdownRenderer as any).renderMarkdown(
					this.currentContent,
					this.viewContainer,
					"",
					this.renderComponent,
				);
			} catch {
				// Last fallback: show as preformatted text
				const pre = document.createElement("pre");
				pre.style.whiteSpace = "pre-wrap";
				pre.textContent = this.currentContent;
				this.viewContainer.appendChild(pre);
			}
		}
	}

	private async toggleMode() {
		this.isEditMode = !this.isEditMode;
		if (this.viewContainer && this.editTextarea) {
			if (this.isEditMode) {
				this.viewContainer.style.display = "none";
				this.editTextarea.style.display = "block";
				this.editTextarea.value = this.currentContent;
				this.editTextarea.focus();
			} else {
				this.editTextarea.style.display = "none";
				this.viewContainer.style.display = "block";
				// Re-render markdown with potentially edited content
				await this.renderMarkdownView();
			}
		}
	}

	private toggleFullscreen(btn: HTMLButtonElement) {
		if (!this.container) return;
		this.isFullscreen = !this.isFullscreen;

		if (this.isFullscreen) {
			// Save current position & size
			this.savedLeft = this.container.style.left;
			this.savedTop = this.container.style.top;
			this.savedWidth = this.container.style.width;
			this.savedHeight = this.container.style.height;
			// Apply fullscreen via inline styles (more reliable than CSS class)
			const isMobile = window.innerWidth <= 600;
			const topOffset = isMobile ? 65 : 40;
			this.container.style.left = "0px";
			this.container.style.top = `${topOffset}px`;
			this.container.style.width = "100vw";
			this.container.style.height = `calc(100vh - ${topOffset}px)`;
			this.container.style.maxWidth = "100vw";
			this.container.style.maxHeight = "100vh";
			this.container.style.borderRadius = "0";
			btn.title = "还原窗口大小";
			btn.innerText = "⊡";
		} else {
			// Restore
			this.container.style.left = this.savedLeft;
			this.container.style.top = this.savedTop;
			this.container.style.width = this.savedWidth;
			this.container.style.height = this.savedHeight;
			this.container.style.maxWidth = "";
			this.container.style.maxHeight = "";
			this.container.style.borderRadius = "";
			btn.title = "铺满全屏 / 还原";
			btn.innerText = "⛶";
		}
	}

	private syncToBottom(newText: string) {
		const text = this.editorView.state.doc.toString();
		const mutation = annotationRepository.updateCalloutContent({
			text,
			id: this.node.id,
			richText: newText,
		});

		if (mutation.text !== text) {
			this.editorView.dispatch({
				changes: {
					from: 0,
					to: text.length,
					insert: mutation.text,
				},
			});
		}
	}

	private syncToInline(newSummary: string) {
		if (!newSummary) return;
		const text = this.editorView.state.doc.toString();
		const mutation = annotationRepository.updateAnnotationSummary({
			text,
			id: this.node.id,
			summary: newSummary,
		});

		if (mutation.text !== text) {
			this.editorView.dispatch({
				changes: {
					from: 0,
					to: text.length,
					insert: mutation.text,
				},
			});
		}
	}

	private jumpToSource() {
		const text = this.editorView.state.doc.toString();
		const range = annotationRepository.findCalloutRange(text, this.node.id);
		if (range) {
			this.editorView.dispatch({
				selection: { anchor: range.from },
				scrollIntoView: true,
			});
			this.editorView.focus();
		}
	}

	private makeDraggable(handle: HTMLElement) {
		let isDragging = false;
		let offsetX = 0;
		let offsetY = 0;

		handle.style.cursor = "grab";

		const startDrag = (clientX: number, clientY: number) => {
			// Don't drag when fullscreen
			if (this.isFullscreen) return;
			isDragging = true;
			handle.style.cursor = "grabbing";
			offsetX = clientX - (this.container?.offsetLeft || 0);
			offsetY = clientY - (this.container?.offsetTop || 0);
		};

		const moveDrag = (clientX: number, clientY: number) => {
			if (!isDragging || !this.container) return;
			this.container.style.left = `${clientX - offsetX}px`;
			this.container.style.top = `${clientY - offsetY}px`;
		};

		const endDrag = () => {
			isDragging = false;
			handle.style.cursor = "grab";
		};

		// Mouse events (all platforms)
		const onMouseDown = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (target.tagName === "BUTTON") return;
			if (target.tagName === "INPUT") return;
			if (target.closest(".ai-popover-ctrl-group")) return;
			if (target.closest(".ai-footnote-popover-footer")) return;
			startDrag(e.clientX, e.clientY);
			e.preventDefault();
		};
		const onMouseMove = (e: MouseEvent) => moveDrag(e.clientX, e.clientY);
		const onMouseUp = () => endDrag();

		handle.addEventListener("mousedown", onMouseDown);
		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);
		this.registerCleanup(() => {
			handle.removeEventListener("mousedown", onMouseDown);
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
		});
		this.registerCleanup(() => {
			handle.removeEventListener("mousedown", onMouseDown);
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
		});

		// Touch events (mobile)
		const onTouchStart = (e: TouchEvent) => {
			const target = e.target as HTMLElement;
			if (target.tagName === "BUTTON") return;
			if (target.tagName === "INPUT") return;
			if (target.closest(".ai-popover-ctrl-group")) return;
			if (target.closest(".ai-footnote-popover-footer")) return;
			if (e.touches.length > 0)
				startDrag(e.touches[0].clientX, e.touches[0].clientY);
		};
		const onTouchMove = (e: TouchEvent) => {
			if (!isDragging || e.touches.length === 0) return;
			moveDrag(e.touches[0].clientX, e.touches[0].clientY);
		};
		const onTouchEnd = () => endDrag();

		handle.addEventListener("touchstart", onTouchStart, { passive: true });
		document.addEventListener("touchmove", onTouchMove, { passive: false });
		document.addEventListener("touchend", onTouchEnd);
		this.registerCleanup(() => {
			handle.removeEventListener("touchstart", onTouchStart);
			document.removeEventListener("touchmove", onTouchMove);
			document.removeEventListener("touchend", onTouchEnd);
		});
	}

	private deleteNodeFromEditor() {
		const text = this.editorView.state.doc.toString();
		const mutation = annotationRepository.deleteAnnotation(text, this.node.id);
		if (mutation.text === text) return;

		this.editorView.dispatch({
			changes: {
				from: 0,
				to: text.length,
				insert: mutation.text,
			},
			selection: { anchor: mutation.range?.from ?? 0 },
		});
	}

	close() {
		this.removeOutsideClickHandler();
		this.cleanupTransientListeners();
		this.resetRenderComponent();
		if (this.container) {
			this.container.remove();
			this.container = null;
		}
		this.viewContainer = null;
		this.editTextarea = null;
		this.isFullscreen = false;
	}
}

// --- Read-only Popover Viewer (for Reading Mode) ---

export class PopoverViewer {
	private container: HTMLElement | null = null;
	private renderComponent: Component;
	private outsideClickHandler: ((e: MouseEvent) => void) | null = null;
	private cleanupFns: Array<() => void> = [];

	// Extracted so title refresh has context
	private currentParams: {
		nodeId: string;
		nodeSummary: string;
		nodeState: string;
		nodeTagId: string;
	} | null = null;

	constructor(private ctx: PopoverContext) {
		this.renderComponent = new Component();
		this.renderComponent.load();
	}

	async show(
		nodeId: string,
		nodeSummary: string,
		nodeState: string,
		nodeTagId: string,
		richText: string,
		anchorX: number,
		anchorY: number,
	) {
		this.close();
		this.currentParams = { nodeId, nodeSummary, nodeState, nodeTagId };

		this.container = document.createElement("div");
		this.container.addClass("ai-footnote-popover-window");

		// Position — pure JS
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const isMobile = vw <= 600;

		let popW: number;
		let posX: number;
		let posY: number;

		if (isMobile) {
			popW = Math.floor(vw * 0.94);
			posX = Math.floor((vw - popW) / 2);
			posY = Math.max(70, Math.floor(vh / 2 - 180));
		} else {
			popW = 460;
			posX = Math.min(anchorX, vw - popW - 10);
			posX = Math.max(10, posX);
			posY = Math.min(anchorY, vh - 380);
			posY = Math.max(10, posY);
		}

		this.container.style.width = `${popW}px`;
		this.container.style.left = `${posX}px`;
		this.container.style.top = `${posY}px`;

		// === HEADER ===
		const header = document.createElement("div");
		header.addClass("ai-footnote-popover-header");

		// Title
		const titleArea = document.createElement("div");
		titleArea.addClass("ai-popover-title-area");
		titleArea.id = "ai-viewer-title-display";
		titleArea.ondblclick = () => this.jumpToSource(nodeId);
		titleArea.style.cursor = "pointer";
		header.appendChild(titleArea);

		this.updateTitleDisplay();

		// Right: copy + close
		const ctrl = document.createElement("div");
		ctrl.addClass("ai-popover-ctrl-group");

		const copyBtn = this.createCtrlBtn("📋", "复制内容", () => {
			navigator.clipboard.writeText(richText);
			copyBtn.innerText = "✅";
			setTimeout(() => {
				copyBtn.innerText = "📋";
			}, 1500);
		});
		ctrl.appendChild(copyBtn);

		const closeBtn = this.createCtrlBtn("✖", "关闭", () => this.close());
		ctrl.appendChild(closeBtn);

		header.appendChild(ctrl);
		this.container.appendChild(header);

		// === BODY ===
		const body = document.createElement("div");
		body.addClass("ai-footnote-popover-body");

		const viewContainer = document.createElement("div");
		viewContainer.addClass("ai-popover-view");

		if (richText) {
			try {
				await (MarkdownRenderer as any).render(
					this.ctx.app,
					richText,
					viewContainer,
					"",
					this.renderComponent,
				);
			} catch {
				const pre = document.createElement("pre");
				pre.style.whiteSpace = "pre-wrap";
				pre.textContent = richText;
				viewContainer.appendChild(pre);
			}
		} else {
			viewContainer.createEl("p", {
				text: "暂无 AI 生成内容",
				attr: { style: "color: var(--text-muted); font-style: italic;" },
			});
		}

		body.appendChild(viewContainer);
		this.container.appendChild(body);

		document.body.appendChild(this.container);

		// Draggable
		this.makeDraggable(header);

		// Close on Esc
		const escHandler = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				this.close();
			}
		};
		document.addEventListener("keydown", escHandler);
		this.registerCleanup(() =>
			document.removeEventListener("keydown", escHandler),
		);

		// Outside click to close
		this.outsideClickHandler = (e: MouseEvent) => {
			if (!this.container) return;
			if (!this.container.contains(e.target as Node)) {
				this.close();
			}
		};
		setTimeout(() => {
			if (this.outsideClickHandler) {
				document.addEventListener("click", this.outsideClickHandler);
			}
		}, 150);
	}

	private updateTitleDisplay() {
		if (!this.container || !this.currentParams) return;
		const titleArea = this.container.querySelector(
			"#ai-viewer-title-display",
		) as HTMLElement;
		if (!titleArea) return;
		titleArea.empty();

		const p = this.currentParams;
		const displayText = p.nodeSummary
			? p.nodeSummary.length > 24
				? p.nodeSummary.slice(0, 24) + "…"
				: p.nodeSummary
			: p.nodeId || "阅读视图";

		const titleSpan = document.createElement("span");
		titleSpan.innerText = displayText;
		titleSpan.title = (p.nodeSummary || p.nodeId) + " (双击跳转原文)";
		titleArea.appendChild(titleSpan);

		// Read-only badge
		const readBadge = document.createElement("span");
		readBadge.innerText = "👁️ 阅读";
		readBadge.style.cssText = "font-size:0.7em; opacity:0.6; margin-left:6px;";
		titleArea.appendChild(readBadge);
	}

	private registerCleanup(dispose: () => void) {
		this.cleanupFns.push(dispose);
	}

	private cleanupTransientListeners() {
		for (const dispose of this.cleanupFns.splice(0)) {
			dispose();
		}
	}

	private resetRenderComponent() {
		this.renderComponent.unload();
		this.renderComponent = new Component();
		this.renderComponent.load();
	}

	private createCtrlBtn(
		text: string,
		tooltip: string,
		onclick: () => void,
	): HTMLButtonElement {
		const btn = document.createElement("button");
		btn.addClass("ai-popover-ctrl-btn");
		btn.innerText = text;
		btn.title = tooltip;
		// Stop mousedown from reaching the drag handler so preventDefault is never called on buttons
		btn.addEventListener("mousedown", (e) => {
			e.stopPropagation();
		});
		btn.addEventListener("click", (e) => {
			e.stopPropagation();
			onclick();
		});
		return btn;
	}

	private jumpToSource(nodeId: string) {
		// Find matching mark/capsule and scroll into view
		const els = document.querySelectorAll(
			`[data-marking-id="${nodeId}"], .mark-state-0, .mark-state-1, .mark-state-2, .mark-state-3`,
		);
		for (const el of Array.from(els)) {
			// Usually the capsule handles data-marking-id well in reading mode
			if (
				(el as HTMLElement).dataset.tagId ||
				(el as HTMLElement).innerText.includes(nodeId) ||
				(el as HTMLElement).dataset.markingId === nodeId
			) {
				el.scrollIntoView({ behavior: "smooth", block: "center" });
				return;
			}
		}
	}

	private makeDraggable(handle: HTMLElement) {
		let isDragging = false;
		let offsetX = 0;
		let offsetY = 0;

		handle.style.cursor = "grab";

		const onMouseDown = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (target.tagName === "BUTTON") return;
			if (target.tagName === "INPUT") return;
			if (target.closest(".ai-popover-ctrl-group")) return;
			if (target.closest(".ai-footnote-popover-footer")) return;
			isDragging = true;
			handle.style.cursor = "grabbing";
			offsetX = e.clientX - (this.container?.offsetLeft || 0);
			offsetY = e.clientY - (this.container?.offsetTop || 0);
			e.preventDefault();
		};
		const onMouseMove = (e: MouseEvent) => {
			if (!isDragging || !this.container) return;
			this.container.style.left = `${e.clientX - offsetX}px`;
			this.container.style.top = `${e.clientY - offsetY}px`;
		};
		const onMouseUp = () => {
			isDragging = false;
			handle.style.cursor = "grab";
		};

		handle.addEventListener("mousedown", onMouseDown);
		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);

		const onTouchStart = (e: TouchEvent) => {
			if ((e.target as HTMLElement).tagName === "BUTTON") return;
			if (e.touches.length > 0) {
				isDragging = true;
				offsetX = e.touches[0].clientX - (this.container?.offsetLeft || 0);
				offsetY = e.touches[0].clientY - (this.container?.offsetTop || 0);
			}
		};
		const onTouchMove = (e: TouchEvent) => {
			if (!isDragging || !this.container || e.touches.length === 0) return;
			this.container.style.left = `${e.touches[0].clientX - offsetX}px`;
			this.container.style.top = `${e.touches[0].clientY - offsetY}px`;
			if (e.cancelable) e.preventDefault();
		};
		const onTouchEnd = () => {
			isDragging = false;
		};

		handle.addEventListener("touchstart", onTouchStart, { passive: true });
		document.addEventListener("touchmove", onTouchMove, { passive: false });
		document.addEventListener("touchend", onTouchEnd);
		this.registerCleanup(() => {
			handle.removeEventListener("touchstart", onTouchStart);
			document.removeEventListener("touchmove", onTouchMove);
			document.removeEventListener("touchend", onTouchEnd);
		});
	}

	close() {
		if (this.outsideClickHandler) {
			document.removeEventListener("click", this.outsideClickHandler);
			this.outsideClickHandler = null;
		}
		this.cleanupTransientListeners();
		this.resetRenderComponent();
		if (this.container) {
			this.container.remove();
			this.container = null;
		}
	}
}

// --- Butler Floating Panel ---

export class ButlerFloatingPanel {
	private container: HTMLElement | null = null;
	private isDragging = false;
	private dragOffsetX = 0;
	private dragOffsetY = 0;
	private plugin: any;
	private readonly viewportMargin = 8;
	private readonly resizeHandler = () => this.constrainToScreen();

	constructor(plugin: any) {
		this.plugin = plugin;
	}

	show() {
		if (this.container) {
			this.container.style.display = "";
			this.refresh();
			this.constrainToScreen();
			return;
		}

		this.container = document.createElement("div");
		this.container.addClass("mn-butler-panel");
		this.container.style.display = "flex";

		const header = this.container.createEl("div", { cls: "mn-butler-header" });
		header.createEl("span", { text: "🏠 管家面板", cls: "mn-butler-title" });
		const closeBtn = header.createEl("button", {
			text: "✖",
			cls: "mn-butler-close",
		});
		closeBtn.onclick = () => this.hide();

		this.refresh();
		document.body.appendChild(this.container);
		if (this.plugin.settings.enableDebugMode) {
			console.log(
				"[Marking Note] Butler panel shown, stewards:",
				this.plugin.settings.stewards?.length,
			);
		}

		const savedPos = localStorage.getItem("mn-butler-pos");
		if (savedPos) {
			try {
				const pos = JSON.parse(savedPos);
				this.container.style.left = pos.left;
				this.container.style.top = pos.top;
			} catch {
				this.setDefaultPosition();
			}
		} else {
			this.setDefaultPosition();
		}

		// Ensure panel is on-screen and within 2/3 viewport bounds
		this.constrainToScreen();
		window.addEventListener("resize", this.resizeHandler);

		this.setupDrag(header);
	}

	hide() {
		if (this.container) {
			this.container.style.display = "none";
		}
	}

	toggle() {
		if (this.container && this.container.style.display !== "none") {
			this.hide();
		} else {
			this.show();
		}
	}

	close() {
		if (this.container) {
			this.container.remove();
			this.container = null;
		}
		window.removeEventListener("resize", this.resizeHandler);
	}

	private setDefaultPosition() {
		if (!this.container) return;
		const vw = window.innerWidth;
		const maxWidth = Math.floor(vw * 0.67);
		const preferredWidth = Math.min(260, maxWidth);
		const left = Math.max(this.viewportMargin, vw - preferredWidth - 16);
		this.container.style.left = `${left}px`;
		this.container.style.top = `${Math.max(this.viewportMargin, 80)}px`;
		this.container.style.right = "auto";
		this.container.style.bottom = "auto";
	}

	/** Constrain panel size to 2/3 viewport and clamp position to stay on-screen */
	private constrainToScreen() {
		if (!this.container) return;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const margin = this.viewportMargin;
		const maxW = Math.floor(vw * 0.67);
		const maxH = Math.floor(vh * 0.67);

		// Cap dimensions at 2/3 viewport
		this.container.style.maxWidth = `${maxW}px`;
		this.container.style.maxHeight = `${maxH}px`;

		// Clamp position: read current pixel position and ensure it stays in bounds
		// When using right-edge alignment (setDefaultPosition), offsetLeft may be 0 until
		// the browser resolves the layout. Use getBoundingClientRect for accurate reading.
		const rect = this.container.getBoundingClientRect();
		const parsedLeft = Number.parseFloat(this.container.style.left || "");
		const parsedTop = Number.parseFloat(this.container.style.top || "");
		let left = Number.isFinite(parsedLeft) ? parsedLeft : rect.left;
		let top = Number.isFinite(parsedTop) ? parsedTop : rect.top;

		left = Math.max(
			margin,
			Math.min(left, Math.max(margin, vw - rect.width - margin)),
		);
		top = Math.max(
			margin,
			Math.min(top, Math.max(margin, vh - rect.height - margin)),
		);

		this.container.style.left = `${left}px`;
		this.container.style.top = `${top}px`;
		this.container.style.right = "auto";
		this.container.style.bottom = "auto";
	}

	private refresh() {
		if (!this.container) return;
		const body = this.container.querySelector(".mn-butler-body") as HTMLElement;
		if (body) body.remove();

		const settings = this.plugin.settings;
		const stewards = settings.stewards || [];
		const steward =
			stewards.find((s: any) => s.id === settings.activeStewardId) ||
			stewards[0];

		const contentDiv = this.container.createEl("div", {
			cls: "mn-butler-body",
		});
		contentDiv.style.minHeight = "150px";
		contentDiv.style.background = "var(--background-secondary)";

		// Current steward display
		if (steward) {
			const currentDiv = contentDiv.createEl("div", {
				cls: "mn-butler-section",
			});
			currentDiv.createEl("div", { text: "当前管家", cls: "mn-butler-label" });
			const activeDiv = currentDiv.createEl("div", { cls: "mn-butler-active" });
			activeDiv.createEl("span", {
				text: `${steward.icon} ${steward.name}`,
				cls: "mn-butler-active-name",
			});
		}

		// Steward switcher
		if (stewards.length > 0) {
			const switcherDiv = contentDiv.createEl("div", {
				cls: "mn-butler-section",
			});
			switcherDiv.createEl("div", { text: "切换管家", cls: "mn-butler-label" });
			const stewardList = switcherDiv.createEl("div", {
				cls: "mn-butler-steward-list",
			});
			for (const s of stewards) {
				const btn = stewardList.createEl("button", {
					text: `${s.icon} ${s.name}`,
					cls:
						s.id === settings.activeStewardId
							? "mn-butler-steward-btn mn-butler-steward-active"
							: "mn-butler-steward-btn",
				});
				btn.style.display = "flex";
				btn.style.width = "100%";
				btn.onclick = async () => {
					settings.activeStewardId = s.id;
					await this.plugin.saveSettings();
					this.refresh();
					this.constrainToScreen();
					window.dispatchEvent(new CustomEvent("marking-note-steward-changed"));
				};
			}
		} else {
			contentDiv.createEl("div", {
				text: "⚠️ 未配置管家",
				attr: { style: "color: var(--text-error); padding: 10px;" },
			});
		}

		if (this.container.isConnected) {
			this.constrainToScreen();
		}
	}

	private setupDrag(handle: HTMLElement) {
		if (!this.container) return;

		const startDrag = (clientX: number, clientY: number) => {
			this.isDragging = true;
			this.dragOffsetX = clientX - (this.container?.offsetLeft || 0);
			this.dragOffsetY = clientY - (this.container?.offsetTop || 0);
		};

		const moveDrag = (clientX: number, clientY: number) => {
			if (!this.isDragging || !this.container) return;
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			const margin = this.viewportMargin;
			const rect = this.container.getBoundingClientRect();
			let left = clientX - this.dragOffsetX;
			let top = clientY - this.dragOffsetY;
			// Clamp to keep panel fully on-screen during drag
			left = Math.max(
				margin,
				Math.min(left, Math.max(margin, vw - rect.width - margin)),
			);
			top = Math.max(
				margin,
				Math.min(top, Math.max(margin, vh - rect.height - margin)),
			);
			this.container.style.left = `${left}px`;
			this.container.style.top = `${top}px`;
			this.container.style.right = "auto";
		};

		const endDrag = () => {
			this.isDragging = false;
			if (this.container) {
				// Final clamp before saving to handle viewport resize during drag
				this.constrainToScreen();
				localStorage.setItem(
					"mn-butler-pos",
					JSON.stringify({
						left: this.container.style.left,
						top: this.container.style.top,
					}),
				);
			}
		};

		handle.addEventListener("mousedown", (e: MouseEvent) => {
			if ((e.target as HTMLElement).tagName === "BUTTON") return;
			startDrag(e.clientX, e.clientY);
			e.preventDefault();
		});
		document.addEventListener("mousemove", (e: MouseEvent) =>
			moveDrag(e.clientX, e.clientY),
		);
		document.addEventListener("mouseup", () => endDrag());

		handle.addEventListener(
			"touchstart",
			(e: TouchEvent) => {
				if ((e.target as HTMLElement).tagName === "BUTTON") return;
				if (e.touches.length > 0)
					startDrag(e.touches[0].clientX, e.touches[0].clientY);
			},
			{ passive: true },
		);
		document.addEventListener(
			"touchmove",
			(e: TouchEvent) => {
				if (!this.isDragging || !this.container || e.touches.length === 0)
					return;
				moveDrag(e.touches[0].clientX, e.touches[0].clientY);
				if (e.cancelable) e.preventDefault();
			},
			{ passive: false },
		);
		document.addEventListener("touchend", () => endDrag());
	}
}
