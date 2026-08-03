import {
	ItemView,
	type WorkspaceLeaf,
	type MarkdownView,
	Notice,
	MarkdownRenderer,
	Modal,
	type App,
	TFile,
} from "obsidian";
import type { MarkState, MarkingNode, MergedNoteNode } from "./state";
import type MarkingNotePlugin from "../main";
import { annotationRepository } from "./repository/annotation-repository";
import { setEditorValuePreservingViewport } from "./editor-viewport";
import { MergeService } from "./services/merge-service";
import { applyTagButtonStyle, getTagBorderAccent } from "./tag-styles";
import { UI_ICONS } from "./ui/icons";

export const MARKING_SIDEBAR_VIEW_TYPE = "marking-sidebar-view";

export class MarkingSidebarView extends ItemView {
	plugin: MarkingNotePlugin;
	private refreshTimer: number | null = null;
	private stateFilter: string | null = null; // single-select state filter
	private tagFilter: string | null = null; // single-select tag filter
	private expandedNodeId: string | null = null;
	private selectedNodes: Set<string> = new Set();
	private bulkBar: HTMLElement | null = null;
	private suppressRefresh = false;
	private webSearchEnabled = false;
	private mergeService = new MergeService();

	constructor(leaf: WorkspaceLeaf, plugin: MarkingNotePlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return MARKING_SIDEBAR_VIEW_TYPE;
	}
	getDisplayText() {
		return "Marking Note";
	}
	getIcon() {
		return "highlighter";
	}

	async onOpen() {
		this.renderContent();

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				if (!this.suppressRefresh) this.debouncedRefresh();
			}),
		);

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (this.suppressRefresh) return;
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && file.path === activeFile.path) {
					this.debouncedRefresh();
				}
			}),
		);

		this.registerEvent(
			this.app.workspace.on("editor-change", () => {
				if (!this.suppressRefresh) this.debouncedRefresh();
			}),
		);
	}

	private debouncedRefresh() {
		if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
		this.refreshTimer = window.setTimeout(() => {
			this.renderContent();
		}, 1200);
	}

	private findEditor(filePath: string): any {
		const leaves = this.app.workspace.getLeavesOfType("markdown");
		for (const leaf of leaves) {
			const mdView = leaf.view as MarkdownView;
			if (mdView.file && mdView.file.path === filePath) return mdView.editor;
		}
		return null;
	}

	private async updateFileContent(
		filePath: string,
		updater: (text: string) => string,
	): Promise<string | null> {
		const editor = this.findEditor(filePath);
		if (editor) {
			const current = editor.getValue();
			const updated = updater(current);
			if (updated !== current) {
				setEditorValuePreservingViewport(editor, updated);
			}
			return updated;
		}

		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			return null;
		}

		const current = await this.app.vault.read(file);
		const updated = updater(current);
		if (updated !== current) {
			await this.app.vault.modify(file, updated);
		}
		return updated;
	}

	private async renderContent() {
		const container = this.containerEl.children[1] as HTMLElement;
		const previousScroll = container.scrollTop;
		container.empty();

		// Header
		const headerDiv = container.createEl("div", { cls: "mn-sidebar-header" });
		headerDiv.createEl("h4", { text: `${UI_ICONS.actionRewrite} Marking Note` });
		const refreshBtn = headerDiv.createEl("button", {
			text: UI_ICONS.refresh,
			cls: "mn-sidebar-refresh",
		});
		refreshBtn.title = "手动刷新";
		refreshBtn.onclick = () => this.renderContent();

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			container.createEl("p", {
				text: "没有打开的文件",
				cls: "mn-sidebar-empty",
			});
			return;
		}

		container.createEl("p", {
			text: `▤ ${activeFile.basename}`,
			cls: "mn-sidebar-filename",
		});

		// Read file content
		let fileContent: string;
		const editor = this.findEditor(activeFile.path);
		if (editor) {
			fileContent = editor.getDoc().getValue();
		} else {
			fileContent = await this.app.vault.read(activeFile);
		}

		const nodes = annotationRepository.parseMarkingNodes(fileContent);
		const annotatedNodes = nodes.filter((n) => !n.isPlain);
		const mergedNotes = annotationRepository.parseMergedNoteNodes(fileContent);

		if (annotatedNodes.length === 0 && mergedNotes.length === 0) {
			container.createEl("p", {
				text: "暂无高亮标注或合并笔记",
				cls: "mn-sidebar-empty",
			});
			return;
		}

		// === Filter Bar (Stage & Tag) ===
		const filterBar = container.createEl("div", { cls: "mn-filter-bar" });

		// Stage Dropdown Button
		const stateLabels: Record<string, string> = {
			"0": "○ 待处理",
			"1": "✎ AI标注",
			"2": `${UI_ICONS.view} 审阅`,
			"3": "✓ 已归档",
		};
		const stageBtnText =
			this.stateFilter !== null ? stateLabels[this.stateFilter] : `${UI_ICONS.filter} 全部阶段`;
		const stageBtn = filterBar.createEl("div", {
			cls: `mn-filter-dropdown-btn ${this.stateFilter !== null ? "mn-filter-active" : ""}`,
		});
		stageBtn.createEl("span", { text: stageBtnText });
		stageBtn.createEl("span", { text: "▼", cls: "mn-btn-chevron" });
		stageBtn.onclick = (e) => {
			e.stopPropagation();
			this.showStageDropdown(stageBtn, annotatedNodes);
		};

		// Tag Dropdown Button
		const tags = this.plugin.settings.tags || [];
		let tagBtnText = `${UI_ICONS.tags} 全部标签`;
		if (this.tagFilter === "__none__") tagBtnText = `${UI_ICONS.tags} 无标签`;
		else if (this.tagFilter !== null) {
			const activeTag = tags.find((t) => t.id === this.tagFilter);
			if (activeTag) tagBtnText = `${activeTag.emoji} ${activeTag.name}`;
		}

		const tagBtn = filterBar.createEl("div", {
			cls: `mn-filter-dropdown-btn ${this.tagFilter !== null ? "mn-filter-active" : ""}`,
		});
		tagBtn.createEl("span", { text: tagBtnText });
		tagBtn.createEl("span", { text: "▼", cls: "mn-btn-chevron" });
		tagBtn.onclick = (e) => {
			e.stopPropagation();
			this.showTagDropdown(tagBtn, annotatedNodes);
		};

		// Bulk action bar (hidden by default)
		this.bulkBar = container.createEl("div", {
			cls: "mn-bulk-bar",
			attr: {
				style:
					"display: none; padding: 8px 10px; background: var(--background-modifier-hover); border-radius: 6px; margin-bottom: 8px; gap: 8px; flex-wrap: wrap; align-items: center;",
			},
		});

		// Node list is one document-order stream, including merged notes.
		const list = container.createEl("div", { cls: "mn-sidebar-list" });
		const visibleAnnotations = annotatedNodes.filter((node) => {
			if (this.stateFilter !== null && node.state !== this.stateFilter) return false;
			if (this.tagFilter === "__none__" && node.tagId) return false;
			if (this.tagFilter !== null && this.tagFilter !== "__none__" && node.tagId !== this.tagFilter) return false;
			return true;
		});
		const orderedItems = [
			...visibleAnnotations.map((node) => ({ kind: "annotation" as const, node })),
			...mergedNotes.map((node) => ({ kind: "merged" as const, node })),
		].sort((left, right) => left.node.from - right.node.from);

		for (const item of orderedItems) {
			if (item.kind === "annotation") {
				this.renderNodeItem(list, item.node, fileContent, activeFile.path);
			} else {
				this.renderMergedNodeItem(list, item.node, activeFile.path);
			}
		}

		container.scrollTop = previousScroll;
	}

	private renderMergedNodeItem(
		parent: HTMLElement,
		mergedNote: MergedNoteNode,
		filePath: string,
	) {
		const cardContainer = parent.createEl("div", {
			attr: { style: "margin-bottom: 8px;" },
		});
		const card = cardContainer.createEl("div", {
			cls: "mn-sidebar-card mn-merged-card",
		});

		const topRow = card.createEl("div", {
			cls: "mn-card-top",
			attr: { style: "display: flex; align-items: center;" },
		});
		topRow.createEl("span", { text: UI_ICONS.merge, cls: "mn-card-icon" });
		topRow.createEl("span", { text: mergedNote.title, cls: "mn-card-text" });

		card.createEl("p", { text: mergedNote.preview, cls: "mn-card-summary" });

		const actions = card.createEl("div", { cls: "mn-card-actions" });
		const openBtn = actions.createEl("button", {
			text: `${UI_ICONS.view} 查看`,
			cls: "mn-action-btn",
		});
		openBtn.onclick = (e) => {
			e.stopPropagation();
			card.click();
		};

		const delBtn = actions.createEl("button", {
			text: "🗑️",
			cls: "mn-action-btn mn-action-danger",
		});
		delBtn.onclick = async (e) => {
			e.stopPropagation();
			await this.deleteMergedNote(mergedNote.id, filePath);
		};

		const accordionDiv = cardContainer.createEl("div", {
			cls: "mn-card-accordion",
			attr: {
				style:
					"display: none; padding: 10px; background: var(--background-primary); border-radius: 0 0 6px 6px; border: 1px solid var(--background-modifier-border); border-top: none;",
			},
		});
		const accordionKey = `merged:${mergedNote.id}`;
		if (this.expandedNodeId === accordionKey) {
			accordionDiv.style.display = "block";
			this.renderMergedAccordionContent(accordionDiv, mergedNote.id, filePath);
		}

		card.onclick = () => {
			const isExpanded = accordionDiv.style.display !== "none";
			parent
				.querySelectorAll(".mn-card-accordion")
				.forEach((el: HTMLElement) => (el.style.display = "none"));
			if (!isExpanded) {
				this.expandedNodeId = accordionKey;
				accordionDiv.style.display = "block";
				if (!accordionDiv.hasChildNodes()) {
					this.renderMergedAccordionContent(
						accordionDiv,
						mergedNote.id,
						filePath,
					);
				}
			} else {
				this.expandedNodeId = null;
			}
		};
	}

	private async renderMergedAccordionContent(
		container: HTMLElement,
		nodeId: string,
		filePath: string,
	) {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!file) return;
		const fullContent = await this.app.vault.read(file as any);
		const richText =
			annotationRepository.getCalloutContent(fullContent, nodeId) || "";

		const textDisplay = container.createEl("div", {
			cls: "mn-accordion-text",
			attr: {
				style:
					"max-height: 40vh; overflow-y: auto; font-size: 0.9em; line-height: 1.5;",
			},
		});
		if (richText) {
			await (MarkdownRenderer as any).render(
				this.app,
				richText,
				textDisplay,
				"",
				this,
			);
		}
		container.createEl("div", {
			text: `${UI_ICONS.view} 合并笔记当前为只读内容，用于集中查看与回顾。`,
			attr: {
				style: "margin-top: 8px; font-size: 0.8em; color: var(--text-muted);",
			},
		});
	}

	private renderNodeItem(
		parent: HTMLElement,
		node: MarkingNode,
		_fileContent: string,
		filePath: string,
	) {
		const stateLabels: Record<string, string> = {
			"0": "○",
			"1": "✎",
			"2": UI_ICONS.view,
			"3": "✓",
		};
		const tags = this.plugin.settings.tags || [];
		const tag = node.tagId ? tags.find((t) => t.id === node.tagId) : null;

		const cardContainer = parent.createEl("div", {
			attr: { style: "margin-bottom: 8px;" },
		});
		const card = cardContainer.createEl("div", {
			cls: `mn-sidebar-card mn-card-state-${node.state}`,
		});

		if (tag) {
			card.style.borderLeftColor = getTagBorderAccent(tag);
		}

		// Multi-select checkbox
		const checkbox = card.createEl("input", {
			type: "checkbox",
			cls: "mn-card-checkbox",
			attr: { style: "margin-right: 6px; flex-shrink: 0; cursor: pointer;" },
		}) as HTMLInputElement;
		checkbox.checked = this.selectedNodes.has(node.id);
		checkbox.onclick = (e) => {
			e.stopPropagation();
			if (checkbox.checked) {
				this.selectedNodes.add(node.id);
			} else {
				this.selectedNodes.delete(node.id);
			}
			this.updateBulkBar();
		};

		// Top row: state icon + text preview
		const topRow = card.createEl("div", {
			cls: "mn-card-top",
			attr: { style: "display: flex; align-items: center;" },
		});
		topRow.createEl("span", {
			text: stateLabels[node.state] || "🤖",
			cls: "mn-card-icon",
		});

		topRow.createEl("span", {
			text: node.text.length > 50 ? node.text.slice(0, 50) + "..." : node.text,
			cls: "mn-card-text",
		});

		if (node.summary) {
			card.createEl("p", { text: node.summary, cls: "mn-card-summary" });
		}

		// Action buttons
		const actions = card.createEl("div", { cls: "mn-card-actions" });

		// Jump
		const jumpBtn = actions.createEl("button", {
			text: `${UI_ICONS.locate} 定位`,
			cls: "mn-action-btn",
		});
		jumpBtn.onclick = (e) => {
			e.stopPropagation();
			this.jumpToNode(node, filePath);
		};

		// Advance state
		if (node.state !== "3") {
			const nextState = String(parseInt(node.state) + 1);
			const nextLabels: Record<string, string> = {
				"1": "→ 审阅",
				"2": "→ 归档",
				"3": "→ 完成",
			};
			const advBtn = actions.createEl("button", {
				text: nextLabels[nextState] || "⏭️",
				cls: "mn-action-btn",
			});
			advBtn.onclick = async (e) => {
				e.stopPropagation();
				await this.changeNodeState(node, nextState, filePath);
			};
		}

		// Tag button — shows tag name+emoji with fill when assigned, otherwise plain icon
		const tagBtnText = tag ? `${tag.emoji} ${tag.name}` : UI_ICONS.tags;
		const tagBtn = actions.createEl("button", {
			text: tagBtnText,
			cls: "mn-action-btn",
		});
		if (tag) {
			applyTagButtonStyle(tagBtn, tag);
		}
		tagBtn.title = "选择标签";
		tagBtn.onclick = (e) => {
			e.stopPropagation();
			this.showTagSelector(tagBtn, node, filePath);
		};

		// Delete
		const delBtn = actions.createEl("button", {
			text: "🗑️",
			cls: "mn-action-btn mn-action-danger",
		});
		delBtn.onclick = async (e) => {
			e.stopPropagation();
			await this.deleteNode(node, filePath);
		};

		// Accordion
		const accordionDiv = cardContainer.createEl("div", {
			cls: "mn-card-accordion",
			attr: {
				style:
					"display: none; padding: 10px; background: var(--background-primary); border-radius: 0 0 6px 6px; border: 1px solid var(--background-modifier-border); border-top: none;",
			},
		});

		if (this.expandedNodeId === node.id) {
			accordionDiv.style.display = "block";
			this.renderAccordionContent(accordionDiv, node, filePath);
		}

		card.onclick = (e) => {
			if ((e.target as HTMLElement).closest(".mn-card-actions")) return;
			const isExpanded = accordionDiv.style.display !== "none";
			parent
				.querySelectorAll(".mn-card-accordion")
				.forEach((el: HTMLElement) => (el.style.display = "none"));

			if (!isExpanded) {
				this.suppressRefresh = true;
				this.expandedNodeId = node.id;
				accordionDiv.style.display = "block";
				this.jumpToNode(node, filePath);
				if (!accordionDiv.hasChildNodes()) {
					this.renderAccordionContent(accordionDiv, node, filePath);
				}
				setTimeout(() => {
					this.suppressRefresh = false;
				}, 2000);
			} else {
				this.expandedNodeId = null;
			}
		};
	}

	private async renderAccordionContent(
		container: HTMLElement,
		node: MarkingNode,
		filePath: string,
	) {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!file) return;
		const fullContent = await this.app.vault.read(file as any);
		const richText = annotationRepository.getCalloutContent(
			fullContent,
			node.id,
		);

		const textDisplay = container.createEl("div", {
			cls: "mn-accordion-text",
			attr: {
				style:
					"max-height: 40vh; overflow-y: auto; font-size: 0.9em; line-height: 1.5;",
			},
		});

		if (richText) {
			await (MarkdownRenderer as any).render(
				this.app,
				richText,
				textDisplay,
				"",
				this,
			);
		} else {
			textDisplay.createEl("div", {
				text: node.text,
				attr: { style: "color: var(--text-muted); font-style: italic;" },
			});
		}

		if (node.state !== "3") {
			const chatContainer = container.createEl("div", {
				cls: "mn-accordion-chat-row",
			});
			chatContainer.addEventListener("mousedown", (event) => event.stopPropagation());
			chatContainer.addEventListener("click", (event) => event.stopPropagation());
			const input = chatContainer.createEl("input", {
				type: "text",
				placeholder: "继续追问...",
				cls: "mn-accordion-input mn-accordion-chat-input",
			});
			const undoBtn = chatContainer.createEl("button", {
				text: "↩️",
				cls: "mod-cta mn-accordion-chat-btn mn-accordion-chat-btn-icon",
			});
			undoBtn.title = "撤回到上一次的 AI 回复";

			const webSearchBtn = chatContainer.createEl("button", {
				text: "🔍",
				cls: "mod-cta mn-accordion-chat-btn mn-accordion-chat-btn-icon",
			});
			webSearchBtn.title = "开启网络搜索";
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

			const sendBtn = chatContainer.createEl("button", {
				text: "发送",
				cls: "mod-cta mn-accordion-chat-btn mn-accordion-chat-btn-send",
			});

			const updateUndoBtnState = () => {
				undoBtn.disabled = !this.plugin.canUndoChat(node.id);
				if (undoBtn.disabled) {
					undoBtn.style.opacity = "0.5";
					undoBtn.style.cursor = "not-allowed";
				} else {
					undoBtn.style.opacity = "1";
					undoBtn.style.cursor = "pointer";
				}
			};

			const doSend = async () => {
				const msg = input.value.trim();
				if (!msg) return;

				const lastValue = msg;
				sendBtn.disabled = true;
				input.disabled = true;
				input.value = "";
				input.placeholder = "AI 思考中...";
				this.suppressRefresh = true;

				try {
					this.plugin.pushChatHistory(node.id, richText || "");
					updateUndoBtnState();

					const updatedContent = await this.plugin.handleFollowUp(
						node.id,
						msg,
						richText || node.text,
						filePath,
						{ enableWebSearch: this.webSearchEnabled },
					);

					if (updatedContent) {
						await this.updateFileContent(
							filePath,
							(currentText) =>
								annotationRepository.updateCalloutContent({
									text: currentText,
									id: node.id,
									richText: updatedContent.richText,
								}).text,
						);
						textDisplay.empty();
						await (MarkdownRenderer as any).render(
							this.app,
							updatedContent.richText,
							textDisplay,
							"",
							this,
						);
					}
				} catch (err) {
					console.error(err);
					input.value = lastValue;
				} finally {
					sendBtn.disabled = false;
					input.disabled = false;
					input.placeholder = "继续追问...";
					setTimeout(() => {
						this.suppressRefresh = false;
					}, 1000);
				}
			};

			input.onkeydown = (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					doSend();
				}
			};
			sendBtn.onclick = (e) => {
				e.stopPropagation();
				doSend();
			};

			updateUndoBtnState();

			undoBtn.onclick = async (e) => {
				e.stopPropagation();
				if (!this.plugin.canUndoChat(node.id)) return;

				const previousRichText = this.plugin.popChatHistory(node.id);
				if (previousRichText === null) return;

				await this.updateFileContent(filePath, (currentText) => {
					if (previousRichText) {
						return annotationRepository.updateCalloutContent({
							text: currentText,
							id: node.id,
							richText: previousRichText,
						}).text;
					}

					return annotationRepository.deleteCallout(currentText, node.id).text;
				});

				textDisplay.empty();
				if (previousRichText) {
					await (MarkdownRenderer as any).render(
						this.app,
						previousRichText,
						textDisplay,
						"",
						this,
					);
				} else {
					textDisplay.createEl("div", {
						text: node.text,
						attr: { style: "color: var(--text-muted); font-style: italic;" },
					});
				}
				updateUndoBtnState();
			};
		} else {
			container.createEl("div", {
				text: "✅ 已归档 — 内容已锁定",
				attr: {
					style:
						"margin-top: 8px; font-size: 0.8em; color: var(--text-muted); text-align: center; font-style: italic;",
				},
			});
		}
	}

	private showTagSelector(
		anchor: HTMLElement,
		node: MarkingNode,
		filePath: string,
	) {
		const existing = document.querySelector(".mn-tag-dropdown");
		if (existing) existing.remove();

		const dropdown = document.createElement("div");
		dropdown.addClass("mn-tag-dropdown");
		const rect = anchor.getBoundingClientRect();
		dropdown.style.position = "fixed";
		dropdown.style.left = `${rect.left}px`;
		dropdown.style.top = `${rect.bottom + 4}px`;
		dropdown.style.zIndex = "10000";

		const noneItem = dropdown.createEl("div", {
			text: "— 无标签 —",
			cls: "ai-lightning-item",
		});
		noneItem.onclick = async () => {
			dropdown.remove();
			await this.changeNodeTag(node, "", filePath);
		};

		for (const tag of this.plugin.settings.tags) {
			const item = dropdown.createEl("div", { cls: "ai-lightning-item" });
			item.createEl("span", { text: `${tag.emoji} ${tag.name}` });
			if (node.tagId === tag.id) item.style.fontWeight = "bold";
			item.onclick = async () => {
				dropdown.remove();
				await this.changeNodeTag(node, tag.id, filePath);
			};
		}

		document.body.appendChild(dropdown);
		const closeHandler = (e: MouseEvent) => {
			if (!dropdown.contains(e.target as Node)) {
				dropdown.remove();
				document.removeEventListener("click", closeHandler);
			}
		};
		setTimeout(() => document.addEventListener("click", closeHandler), 10);
	}

	private showStageDropdown(anchor: HTMLElement, allNodes: MarkingNode[]) {
		const existing = document.querySelector(".mn-filter-dropdown");
		if (existing) existing.remove();

		const dropdown = document.createElement("div");
		dropdown.addClass("mn-filter-dropdown", "ai-lightning-dropdown");
		const rect = anchor.getBoundingClientRect();
		dropdown.style.left = `${rect.left}px`;
		dropdown.style.top = `${rect.bottom + 4}px`;
		dropdown.style.width = `${rect.width}px`;

		const stateLabels: Record<string, string> = {
			"0": "⏳ 待处理",
			"1": "✎ AI标注",
			"2": `${UI_ICONS.view} 审阅`,
			"3": "✓ 已归档",
		};
		const stateCounts: Record<string, number> = {
			"0": 0,
			"1": 0,
			"2": 0,
			"3": 0,
		};
		for (const n of allNodes) stateCounts[n.state]++;

		// All Stages option
		const allItem = dropdown.createEl("div", {
			cls: `mn-filter-dropdown-item ${this.stateFilter === null ? "mn-item-active" : ""}`,
		});
		allItem.createEl("span", { text: `${UI_ICONS.filter} 全部阶段` });
		allItem.onclick = () => {
			this.stateFilter = null;
			this.renderContent();
			dropdown.remove();
		};

		for (const [state, label] of Object.entries(stateLabels)) {
			const count = stateCounts[state] || 0;
			if (count === 0 && this.stateFilter !== state) continue;

			const item = dropdown.createEl("div", {
				cls: `mn-filter-dropdown-item ${this.stateFilter === state ? "mn-item-active" : ""}`,
			});
			item.createEl("span", { text: label });
			item.createEl("span", { text: String(count), cls: "mn-filter-count" });
			item.onclick = () => {
				this.stateFilter = this.stateFilter === state ? null : state;
				this.renderContent();
				dropdown.remove();
			};
		}

		document.body.appendChild(dropdown);
		const closeHandler = (e: MouseEvent) => {
			if (!dropdown.contains(e.target as Node)) {
				dropdown.remove();
				document.removeEventListener("click", closeHandler);
			}
		};
		setTimeout(() => document.addEventListener("click", closeHandler), 10);
	}

	private showTagDropdown(anchor: HTMLElement, allNodes: MarkingNode[]) {
		const existing = document.querySelector(".mn-filter-dropdown");
		if (existing) existing.remove();

		const dropdown = document.createElement("div");
		dropdown.addClass("mn-filter-dropdown", "ai-lightning-dropdown");
		const rect = anchor.getBoundingClientRect();
		dropdown.style.left = `${rect.left}px`;
		dropdown.style.top = `${rect.bottom + 4}px`;
		dropdown.style.width = `${rect.width}px`;

		const tags = this.plugin.settings.tags || [];
		const tagCounts: Record<string, number> = {};
		for (const n of allNodes)
			if (n.tagId) tagCounts[n.tagId] = (tagCounts[n.tagId] || 0) + 1;
		const noTagCount = allNodes.filter((n) => !n.tagId).length;

		// All Tags option
		const allItem = dropdown.createEl("div", {
			cls: `mn-filter-dropdown-item ${this.tagFilter === null ? "mn-item-active" : ""}`,
		});
		allItem.createEl("span", { text: `${UI_ICONS.tags} 全部标签` });
		allItem.onclick = () => {
			this.tagFilter = null;
			this.renderContent();
			dropdown.remove();
		};

		for (const tag of tags) {
			const count = tagCounts[tag.id] || 0;
			if (count === 0 && this.tagFilter !== tag.id) continue;

			const item = dropdown.createEl("div", {
				cls: `mn-filter-dropdown-item ${this.tagFilter === tag.id ? "mn-item-active" : ""}`,
			});
			const left = item.createEl("div", {
				attr: { style: "display: flex; align-items: center; gap: 6px;" },
			});
			left.createEl("span", { text: tag.emoji });
			left.createEl("span", { text: tag.name });
			item.createEl("span", { text: String(count), cls: "mn-filter-count" });
			item.onclick = () => {
				this.tagFilter = this.tagFilter === tag.id ? null : tag.id;
				this.renderContent();
				dropdown.remove();
			};
		}

		if (noTagCount > 0 || this.tagFilter === "__none__") {
			const noneItem = dropdown.createEl("div", {
				cls: `mn-filter-dropdown-item ${this.tagFilter === "__none__" ? "mn-item-active" : ""}`,
			});
			noneItem.createEl("span", { text: `${UI_ICONS.tags} 无标签` });
			noneItem.createEl("span", {
				text: String(noTagCount),
				cls: "mn-filter-count",
			});
			noneItem.onclick = () => {
				this.tagFilter = this.tagFilter === "__none__" ? null : "__none__";
				this.renderContent();
				dropdown.remove();
			};
		}

		document.body.appendChild(dropdown);
		const closeHandler = (e: MouseEvent) => {
			if (!dropdown.contains(e.target as Node)) {
				dropdown.remove();
				document.removeEventListener("click", closeHandler);
			}
		};
		setTimeout(() => document.addEventListener("click", closeHandler), 10);
	}

	private async changeNodeTag(
		node: MarkingNode,
		tagId: string,
		filePath: string,
	) {
		await this.updateFileContent(
			filePath,
			(currentText) =>
				annotationRepository.updateAnnotationTag({
					text: currentText,
					id: node.id,
					tagId,
				}).text,
		);
		this.renderContent();
	}

	private jumpToNode(node: MarkingNode, filePath: string) {
		const escapedId = node.id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
		const readingTarget = document.querySelector(
			`.markdown-preview-view [data-marking-id="${escapedId}"], [data-marking-id="${escapedId}"]`,
		) as HTMLElement | null;
		if (readingTarget) {
			readingTarget.scrollIntoView({ behavior: "smooth", block: "center" });
			return;
		}

		const targetEditor = this.findEditor(filePath);
		if (!targetEditor) return;
		try {
			const editorText = targetEditor.getValue();
			const idx = editorText.indexOf(`marking-note:id=${node.id}`);
			const pos = targetEditor.offsetToPos(idx >= 0 ? idx : node.from);
			targetEditor.setCursor(pos);
			targetEditor.scrollIntoView(
				{
					from: { line: Math.max(0, pos.line - 5), ch: 0 },
					to: { line: pos.line + 5, ch: 0 },
				},
				true,
			);
		} catch (e) {
			console.error("Failed to jump to node", e);
		}
	}

	private async changeNodeState(
		node: MarkingNode,
		newState: string,
		filePath: string,
	) {
		await this.updateFileContent(
			filePath,
			(currentText) =>
				annotationRepository.updateAnnotationState({
					text: currentText,
					id: node.id,
					state: newState as MarkState,
				}).text,
		);
		new Notice(`状态已更新: ${node.id} → State ${newState}`);
		this.renderContent();
	}

	private async deleteNode(node: MarkingNode, filePath: string) {
		await this.updateFileContent(
			filePath,
			(currentText) =>
				annotationRepository.deleteAnnotation(currentText, node.id).text,
		);
		new Notice(`已删除标注: ${node.id}`);
		this.renderContent();
	}

	private async deleteMergedNote(nodeId: string, filePath: string) {
		await this.updateFileContent(
			filePath,
			(currentText) =>
				annotationRepository.deleteMergedNote(currentText, nodeId).text,
		);
		new Notice(`已删除合并笔记: ${nodeId}`);
		this.renderContent();
	}

	private onMergeSelected() {
		const selectedIds = Array.from(this.selectedNodes);
		new MergeModeModal(this.app, selectedIds.length, (mode) => {
			if (mode === "concat") {
				this.mergeSelectedConcat();
			} else if (mode === "ai") {
				this.mergeSelectedAI();
			} else if (mode === "guided") {
				// Collect annotations first
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) return;
				const editor = this.findEditor(activeFile.path);
				if (!editor) return;
				const fileContent = editor.getDoc().getValue();
				const nodes = annotationRepository.parseMarkingNodes(fileContent);

				const annotations: string[] = [];
				for (const id of selectedIds) {
					const node = nodes.find((n: MarkingNode) => n.id === id);
					if (!node) continue;
					const content =
						annotationRepository.getCalloutContent(fileContent, id) ||
						node.summary ||
						"";
					if (content) {
						annotations.push(
							`【标注 ${annotations.length + 1}】\n原文: ${node.text}\nAI分析: ${content}`,
						);
					}
				}

				new GuidedMergeModal(
					this.app,
					selectedIds.length,
					annotations,
					(_mode, topic, style, structure) => {
						this.mergeSelectedGuided(topic, style, structure);
					},
				).open();
			}
		}).open();
	}

	private async mergeSelectedConcat() {
		const selectedIds = Array.from(this.selectedNodes);
		if (selectedIds.length < 2) {
			new Notice("请选择至少 2 个标注");
			return;
		}

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;

		const editor = this.findEditor(activeFile.path);
		if (!editor) {
			new Notice("无法获取编辑器");
			return;
		}

		const fileContent = editor.getDoc().getValue();
		const nodes = annotationRepository.parseMarkingNodes(fileContent);

		const nodeDataList: Array<{
			node: { text: string; tagId?: string; summary: string };
			content: string;
		}> = [];

		for (const id of selectedIds) {
			const node = nodes.find((n: MarkingNode) => n.id === id);
			if (!node) continue;
			const content =
				annotationRepository.getCalloutContent(fileContent, id) || "";
			nodeDataList.push({
				node: {
					text: node.text,
					tagId: node.tagId,
					summary: node.summary || "",
				},
				content,
			});
		}

		if (nodeDataList.length < 2) {
			new Notice("有效标注少于 2 个");
			return;
		}

		const merged = this.mergeService.appendConcatenatedMerge({
			text: editor.getDoc().getValue(),
			nodes: nodeDataList,
		});
		setEditorValuePreservingViewport(editor, merged.text);

		// Clear selection and refresh
		this.selectedNodes.clear();
		this.renderContent();

		new Notice(`已合并 ${nodeDataList.length} 个标注`);
	}

	private async mergeSelectedAI() {
		const selectedIds = Array.from(this.selectedNodes);
		if (selectedIds.length < 2) {
			new Notice("请选择至少 2 个标注");
			return;
		}

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;

		const editor = this.findEditor(activeFile.path);
		if (!editor) {
			new Notice("无法获取编辑器");
			return;
		}

		const fileContent = editor.getDoc().getValue();
		const nodes = annotationRepository.parseMarkingNodes(fileContent);

		const annotations: string[] = [];
		for (const id of selectedIds) {
			const node = nodes.find((n: MarkingNode) => n.id === id);
			if (!node) continue;
			const content =
				annotationRepository.getCalloutContent(fileContent, id) ||
				node.summary ||
				"";
			if (content) {
				annotations.push(
					`【标注 ${annotations.length + 1}】\n原文: ${node.text}\nAI分析: ${content}`,
				);
			}
		}

		if (annotations.length < 2) {
			new Notice("有效标注少于 2 个");
			return;
		}

		new Notice(`正在使用 AI 重组 ${annotations.length} 个标注...`);

		try {
			const steward =
				this.plugin.settings.stewards.find(
					(s: any) => s.id === this.plugin.settings.activeStewardId,
				) || this.plugin.settings.stewards[0];
			const provider = this.plugin.getProviderForSteward(steward);

			if (!provider) {
				new Notice("未配置 AI 模型");
				return;
			}

			const merged = await this.mergeService.generateAiMerge({
				text: editor.getDoc().getValue(),
				annotations,
				steward,
				provider,
				settings: this.plugin.settings,
			});

			if (merged) {
				setEditorValuePreservingViewport(editor, merged.text);

				this.selectedNodes.clear();
				this.renderContent();
				new Notice(`AI 重组完成，已合并 ${annotations.length} 个标注`);
			} else {
				new Notice("AI 重组失败");
			}
		} catch (error) {
			new Notice(`AI 重组出错: ${error}`);
		}
	}

	private async mergeSelectedGuided(
		topic: string,
		style: string,
		structure: string,
	) {
		const selectedIds = Array.from(this.selectedNodes);
		if (selectedIds.length < 2) {
			new Notice("请选择至少 2 个标注");
			return;
		}

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;

		const editor = this.findEditor(activeFile.path);
		if (!editor) {
			new Notice("无法获取编辑器");
			return;
		}

		const fileContent = editor.getDoc().getValue();
		const nodes = annotationRepository.parseMarkingNodes(fileContent);

		const annotations: string[] = [];
		for (const id of selectedIds) {
			const node = nodes.find((n: MarkingNode) => n.id === id);
			if (!node) continue;
			const content =
				annotationRepository.getCalloutContent(fileContent, id) ||
				node.summary ||
				"";
			if (content) {
				annotations.push(
					`【标注 ${annotations.length + 1}】\n原文: ${node.text}\nAI分析: ${content}`,
				);
			}
		}

		if (annotations.length < 2) {
			new Notice("有效标注少于 2 个");
			return;
		}

		new Notice(`正在使用引导模式整理 ${annotations.length} 个标注...`);

		try {
			const steward =
				this.plugin.settings.stewards.find(
					(s: any) => s.id === this.plugin.settings.activeStewardId,
				) || this.plugin.settings.stewards[0];
			const provider = this.plugin.getProviderForSteward(steward);

			if (!provider) {
				new Notice("未配置 AI 模型");
				return;
			}

			const merged = await this.mergeService.generateGuidedMerge({
				text: editor.getDoc().getValue(),
				annotations,
				topic,
				style,
				structure,
				steward,
				provider,
				settings: this.plugin.settings,
			});

			if (merged) {
				setEditorValuePreservingViewport(editor, merged.text);

				this.selectedNodes.clear();
				this.renderContent();
				new Notice(`引导合并完成，已合并 ${annotations.length} 个标注`);
			} else {
				new Notice("引导合并失败");
			}
		} catch (error) {
			new Notice(`引导合并出错: ${error}`);
		}
	}

	private updateBulkBar() {
		if (!this.bulkBar) return;

		if (this.selectedNodes.size >= 2) {
			this.bulkBar.style.display = "flex";
			// Clear previous content
			this.bulkBar.empty();

			// Selection count
			this.bulkBar.createEl("span", {
				text: `已选 ${this.selectedNodes.size} 个标注`,
				attr: {
					style:
						"font-size: 0.85em; color: var(--text-muted); margin-right: 8px;",
				},
			});

			// Merge button
			const mergeBtn = this.bulkBar.createEl("button", {
				text: `${UI_ICONS.merge} 合并`,
				cls: "mod-cta mn-bulk-btn",
			});
			mergeBtn.title = "合并选中标注";
			mergeBtn.onclick = () => this.onMergeSelected();

			// Clear selection button
			const clearBtn = this.bulkBar.createEl("button", {
				text: "✖ 取消选择",
				cls: "mn-bulk-btn",
			});
			clearBtn.onclick = () => {
				this.selectedNodes.clear();
				this.renderContent();
			};
		} else {
			this.bulkBar.style.display = "none";
		}
	}

	async onClose() {
		if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
	}
}

export class MergeModeModal extends Modal {
	private onConfirm: (mode: "concat" | "ai" | "guided") => void;
	private selectedCount: number;

	constructor(
		app: App,
		selectedCount: number,
		onConfirm: (mode: "concat" | "ai" | "guided") => void,
	) {
		super(app);
		this.selectedCount = selectedCount;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h3", { text: `${UI_ICONS.merge} 合并标注` });
		contentEl.createEl("p", {
			text: `已选择 ${this.selectedCount} 个标注，请选择合并模式：`,
			attr: { style: "margin-bottom: 16px; color: var(--text-muted);" },
		});

		const modes = [
			{
				id: "concat" as const,
				icon: "📋",
				title: "仅拼接",
				desc: "按选择顺序组合所有标注，保留每个标注的原文和 AI 内容",
			},
			{
				id: "ai" as const,
				icon: "🤖",
				title: "AI 重组",
				desc: "让 AI 自动去重、排序、生成连贯的笔记",
			},
			{
				id: "guided" as const,
				icon: "🎯",
				title: "引导模式",
				desc: "通过向导自定义输出话题、风格和结构",
			},
		];

		for (const mode of modes) {
			const btn = contentEl.createEl("div", {
				attr: {
					style:
						"padding: 12px; border: 1px solid var(--background-modifier-border); border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: background 0.15s;",
				},
			});
			btn.createEl("div", {
				text: `${mode.icon} ${mode.title}`,
				attr: { style: "font-weight: 600; margin-bottom: 4px;" },
			});
			btn.createEl("div", {
				text: mode.desc,
				attr: { style: "font-size: 0.85em; color: var(--text-muted);" },
			});

			btn.onmouseenter = () => {
				btn.style.backgroundColor = "var(--background-modifier-hover)";
			};
			btn.onmouseleave = () => {
				btn.style.backgroundColor = "";
			};
			btn.onclick = () => {
				this.onConfirm(mode.id);
				this.close();
			};
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}

export class GuidedMergeModal extends Modal {
	private step: 1 | 2 | 3 | 4 = 1;
	private selections = {
		topic: null as string | null,
		style: null as string | null,
		structure: null as string | null,
	};
	private onComplete: (
		mode: "guided",
		topic: string,
		style: string,
		structure: string,
	) => void;
	private selectedCount: number;

	constructor(
		app: App,
		selectedCount: number,
		_annotations: string[],
		onComplete: (
			mode: "guided",
			topic: string,
			style: string,
			structure: string,
		) => void,
	) {
		super(app);
		this.selectedCount = selectedCount;
		this.onComplete = onComplete;
	}

	onOpen() {
		this.modalEl.addClass("mn-guided-merge-modal");
		this.renderStep();
	}

	renderStep() {
		const { contentEl } = this;
		contentEl.empty();

		this.modalEl.style.width = "min(92vw, 720px)";
		this.modalEl.style.maxWidth = "92vw";
		this.modalEl.style.maxHeight = "84vh";
		contentEl.addClass("mn-guided-merge-content");

		// Progress indicator
		const progress = contentEl.createEl("div", {
			attr: { style: "display: flex; gap: 8px; margin-bottom: 20px;" },
		});
		for (let i = 1; i <= 4; i++) {
			progress.createEl("span", {
				text: String(i),
				attr: {
					style: `width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; background: ${i === this.step ? "var(--interactive-accent)" : "var(--background-modifier-border)"}; color: ${i === this.step ? "var(--text-on-accent)" : "var(--text-muted)"};`,
				},
			});
		}

		// Step content
		if (this.step === 1) this.renderTopicStep(contentEl);
		else if (this.step === 2) this.renderStyleStep(contentEl);
		else if (this.step === 3) this.renderStructureStep(contentEl);
		else if (this.step === 4) this.renderConfirmStep(contentEl);
	}

	renderTopicStep(contentEl: HTMLElement) {
		contentEl.createEl("h3", {
			text: "⌘ 话题聚类",
			attr: { style: "margin: 0 0 8px 0;" },
		});
		contentEl.createEl("p", {
			text: "这些标注主要涉及哪个领域？",
			attr: {
				style:
					"margin: 0 0 16px 0; color: var(--text-muted); font-size: 0.9em;",
			},
		});

		const options = [
			{
				id: "academic",
				icon: "📚",
				title: "学术研究",
				desc: "提取核心论点和证据",
			},
			{
				id: "concept",
				icon: "💡",
				title: "概念解析",
				desc: "解释关键术语和原理",
			},
			{
				id: "practical",
				icon: "⚡",
				title: "实践应用",
				desc: "提炼可操作的方法步骤",
			},
			{
				id: "critical",
				icon: "🔄",
				title: "批判分析",
				desc: "对比观点、找出逻辑漏洞",
			},
		];

		this.renderOptions(contentEl, options, "topic");

		this.renderNavigation(contentEl);
	}

	renderStyleStep(contentEl: HTMLElement) {
		contentEl.createEl("h3", {
			text: "✍️ 笔记风格",
			attr: { style: "margin: 0 0 8px 0;" },
		});
		contentEl.createEl("p", {
			text: "你想要什么风格的输出？",
			attr: {
				style:
					"margin: 0 0 16px 0; color: var(--text-muted); font-size: 0.9em;",
			},
		});

		const options = [
			{
				id: "concise",
				icon: "📝",
				title: "简洁摘要",
				desc: "3-5个要点，每点1-2句",
			},
			{
				id: "detailed",
				icon: "📖",
				title: "详细解释",
				desc: "每个要点展开说明",
			},
			{
				id: "qa",
				icon: "🤔",
				title: "问答形式",
				desc: '整理成"问题→答案"格式',
			},
			{
				id: "socratic",
				icon: "💬",
				title: "苏格拉底式",
				desc: "提出问题引发思考",
			},
		];

		this.renderOptions(contentEl, options, "style");

		this.renderNavigation(contentEl);
	}

	renderStructureStep(contentEl: HTMLElement) {
		contentEl.createEl("h3", {
			text: "≡ 输出结构",
			attr: { style: "margin: 0 0 8px 0;" },
		});
		contentEl.createEl("p", {
			text: "用什么结构组织内容？",
			attr: {
				style:
					"margin: 0 0 16px 0; color: var(--text-muted); font-size: 0.9em;",
			},
		});

		const options = [
			{
				id: "list",
				icon: "📋",
				title: "清单式",
				desc: "按优先级排序的要点列表",
			},
			{
				id: "mindmap",
				icon: "🧠",
				title: "思维导图",
				desc: "分层结构，核心在中心",
			},
			{
				id: "graph",
				icon: "🔗",
				title: "知识图谱",
				desc: "节点+连接，标注关系",
			},
			{
				id: "paper",
				icon: "📄",
				title: "标准论文",
				desc: "摘要→引言→论点→结论",
			},
		];

		this.renderOptions(contentEl, options, "structure");

		this.renderNavigation(contentEl);
	}

	renderConfirmStep(contentEl: HTMLElement) {
		contentEl.createEl("h3", {
			text: "✅ 确认预览",
			attr: { style: "margin: 0 0 8px 0;" },
		});
		contentEl.createEl("p", {
			text: `即将用以下设置合并 ${this.selectedCount} 个标注：`,
			attr: {
				style:
					"margin: 0 0 16px 0; color: var(--text-muted); font-size: 0.9em;",
			},
		});

		const summary = contentEl.createEl("div", {
			attr: {
				style:
					"background: var(--background-primary); border-radius: 8px; padding: 16px; margin-bottom: 16px; font-size: 0.9em;",
			},
		});
		summary.createEl("div", {
			text: `📚 话题: ${this.selections.topic}`,
			attr: { style: "margin-bottom: 8px;" },
		});
		summary.createEl("div", {
			text: `✍️ 风格: ${this.selections.style}`,
			attr: { style: "margin-bottom: 8px;" },
		});
		summary.createEl("div", {
			text: `🏗️ 结构: ${this.selections.structure}`,
			attr: {},
		});

		// Execute button
		const executeBtn = contentEl.createEl("button", {
			text: "▶ 开始 AI 合并",
			attr: {
				style:
					"width: 100%; padding: 12px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 8px; cursor: pointer; font-size: 1em; font-weight: 600;",
			},
		});
		executeBtn.onclick = () => {
			this.close();
			this.onComplete(
				"guided",
				this.selections.topic!,
				this.selections.style!,
				this.selections.structure!,
			);
		};

		// Back button
		const backBtn = contentEl.createEl("button", {
			text: "← 上一步",
			attr: {
				style:
					"width: 100%; padding: 10px; margin-top: 12px; background: transparent; border: 1px solid var(--background-modifier-border); border-radius: 8px; cursor: pointer;",
			},
		});
		backBtn.onclick = () => {
			this.step = 3;
			this.renderStep();
		};
	}

	renderOptions(
		container: HTMLElement,
		options: Array<{ id: string; icon: string; title: string; desc: string }>,
		type: "topic" | "style" | "structure",
	) {
		for (const opt of options) {
			const btn = container.createEl("div", {
				attr: {
					style:
						"padding: 14px; border: 1px solid var(--background-modifier-border); border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: all 0.15s;",
				},
			});
			btn.createEl("div", {
				text: `${opt.icon} ${opt.title}`,
				attr: { style: "font-weight: 600; margin-bottom: 4px;" },
			});
			btn.createEl("div", {
				text: opt.desc,
				attr: { style: "font-size: 0.85em; color: var(--text-muted);" },
			});

			btn.onmouseenter = () => {
				btn.style.backgroundColor = "var(--background-modifier-hover)";
				btn.style.borderColor = "var(--interactive-accent)";
			};
			btn.onmouseleave = () => {
				btn.style.backgroundColor = "";
				btn.style.borderColor = "";
			};
			btn.onclick = () => {
				this.selections[type] = opt.title;
				if (this.step < 4) {
					this.step++;
					this.renderStep();
				}
			};
		}
	}

	renderNavigation(contentEl: HTMLElement) {
		const nav = contentEl.createEl("div", {
			attr: { style: "display: flex; gap: 8px; margin-top: 16px;" },
		});

		if (this.step > 1) {
			const backBtn = nav.createEl("button", {
				text: "← 上一步",
				attr: {
					style:
						"flex: 1; padding: 10px; background: transparent; border: 1px solid var(--background-modifier-border); border-radius: 8px; cursor: pointer;",
				},
			});
			backBtn.onclick = () => {
				this.step--;
				this.renderStep();
			};
		}

		if (this.step < 4) {
			const nextBtn = nav.createEl("button", {
				text: "下一步 →",
				attr: {
					style:
						"flex: 1; padding: 10px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 8px; cursor: pointer;",
				},
			});
			nextBtn.onclick = () => {
				this.step++;
				this.renderStep();
			};
		}
	}

	onClose() {
		this.modalEl.removeClass("mn-guided-merge-modal");
		this.modalEl.removeAttribute("style");
		this.contentEl.empty();
	}
}
