import { type App, Modal, Notice, Setting } from "obsidian";

import {
	COLOR_PALETTE,
	DEFAULT_TAGS,
	TEXT_COLOR_PALETTE,
} from "../domain/constants";
import type {
	LightningCommand,
	LightningVariableType,
	LightningVariableValue,
	MarkingTag,
} from "../domain/types";
import { applyTagHighlightStyle } from "../tag-styles";
import { showEmojiGrid } from "../ui/emoji-picker";
import { UI_ICONS } from "../ui/icons";

export class CommandVariableInputModal extends Modal {
	constructor(
		app: App,
		private readonly command: LightningCommand,
		private readonly onSubmit: (
			values: Record<string, LightningVariableValue>,
		) => void,
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: `输入参数: ${this.command.name}` });
		const values: Record<string, LightningVariableValue> = {};
		const variables = this.command.variables || [];

		for (const variable of variables) {
			const defaultValue = variable.defaultValue;
			if (defaultValue !== undefined) values[variable.id] = defaultValue;

			if (variable.type === "text") {
				new Setting(contentEl)
					.setName(`${variable.label}${variable.required ? " *" : ""}`)
					.addText((text) => {
						text.setPlaceholder(variable.placeholder || "请输入");
						text.setValue(typeof defaultValue === "string" ? defaultValue : "");
						text.onChange((value) => {
							values[variable.id] = value;
						});
					});
				continue;
			}

			if (variable.type === "select") {
				new Setting(contentEl)
					.setName(`${variable.label}${variable.required ? " *" : ""}`)
					.addDropdown((dropdown) => {
						for (const option of variable.options || []) {
							dropdown.addOption(option.value, option.label);
						}
						const initial = typeof defaultValue === "string" ? defaultValue : "";
						if (initial) dropdown.setValue(initial);
						dropdown.onChange((value) => {
							values[variable.id] = value;
						});
					});
				continue;
			}

			const group = contentEl.createDiv({ cls: "mn-variable-multiselect" });
			group.createEl("div", {
				text: `${variable.label}${variable.required ? " *" : ""}`,
				cls: "setting-item-name",
			});
			const selected = new Set(
				Array.isArray(defaultValue) ? defaultValue : [],
			);
			for (const option of variable.options || []) {
				const row = group.createEl("label", { cls: "mn-variable-option" });
				const checkbox = row.createEl("input", { type: "checkbox" });
				checkbox.checked = selected.has(option.value);
				row.createEl("span", { text: option.label });
				checkbox.onchange = () => {
					if (checkbox.checked) selected.add(option.value);
					else selected.delete(option.value);
					values[variable.id] = Array.from(selected);
				};
			}
			values[variable.id] = Array.from(selected);
		}

		const actions = contentEl.createDiv({ cls: "modal-button-container" });
		const cancel = actions.createEl("button", { text: `${UI_ICONS.cancel} 取消` });
		cancel.onclick = () => this.close();
		const submit = actions.createEl("button", {
			text: `${UI_ICONS.save} 执行`,
			cls: "mod-cta",
		});
		submit.onclick = () => {
			const missing = variables.filter((variable) => {
				if (!variable.required) return false;
				const value = values[variable.id];
				return !value || (Array.isArray(value) ? value.length === 0 : !value.trim());
			});
			if (missing.length > 0) {
				new Notice(`请填写必填参数：${missing.map((item) => item.label).join("、")}`);
				return;
			}
			this.onSubmit(values);
			this.close();
		};
	}

	onClose() {
		this.contentEl.empty();
	}
}

export class LightningCommandEditModal extends Modal {
	cmd: LightningCommand;
	onSave: (cmd: LightningCommand) => void;
	tags: MarkingTag[];

	constructor(
		app: App,
		cmd: LightningCommand,
		tags: MarkingTag[],
		onSave: (cmd: LightningCommand) => void,
	) {
		super(app);
		this.cmd = { ...cmd };
		this.tags = tags;
		this.onSave = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", {
			text: `${UI_ICONS.actionRewrite} 编辑指令: ${this.cmd.icon} ${this.cmd.name}`,
		});

		new Setting(contentEl).setName("名称").addText((text) =>
			text.setValue(this.cmd.name).onChange((value) => {
				this.cmd.name = value;
			}),
		);

		const iconSetting = new Setting(contentEl).setName("图标");
		const iconBtn = iconSetting.controlEl.createEl("button", {
			text: this.cmd.icon,
			attr: {
				style:
					"font-size: 1.5em; padding: 4px 12px; background: transparent; border: 1px dashed var(--background-modifier-border); border-radius: 6px; cursor: pointer;",
			},
		});
		iconBtn.onclick = () => {
			showEmojiGrid(iconBtn, (emoji: string) => {
				this.cmd.icon = emoji;
				iconBtn.innerText = emoji;
			});
		};

		if (this.cmd.type === "default-summary") {
			new Setting(contentEl)
				.setName("一句话总结约束")
				.setDesc("默认处理高亮时的一句话约束")
				.addTextArea((text) =>
					text.setValue(this.cmd.detailPrompt).onChange((value) => {
						this.cmd.detailPrompt = value;
					}),
				);
		} else if (this.cmd.type === "inline-modify") {
			new Setting(contentEl)
				.setName("处理命令")
				.setDesc(
					"告诉大模型你想如何处理或改写这段原文（不要有任何返回结果外的标题内容）",
				)
				.addTextArea((text) =>
					text.setValue(this.cmd.detailPrompt).onChange((value) => {
						this.cmd.detailPrompt = value;
					}),
				);
		} else {
			new Setting(contentEl)
				.setName("详细内容指令")
				.setDesc("定义 AI 第二部分（向下追问角注深层内容）的输出内容")
				.addTextArea((text) =>
					text.setValue(this.cmd.detailPrompt).onChange((value) => {
						this.cmd.detailPrompt = value;
					}),
				);

			new Setting(contentEl)
				.setName("管家提示词应用范围")
				.setDesc("决定该命令执行时，是否沿用阅读管家的设定。")
				.addDropdown((dropdown) => {
					dropdown.addOption("full", "应用阅读理解 + 写作风格 (推荐)");
					dropdown.addOption("writingOnly", "仅应用写作风格");
					dropdown.addOption("none", "纯净执行 (均不应用)");
					dropdown.setValue(this.cmd.contextMode || "full");
					dropdown.onChange((value) => {
						this.cmd.contextMode = value as "full" | "writingOnly" | "none";
					});
				});
		}

		if (this.cmd.type === "inline-modify") {
			new Setting(contentEl)
				.setName("管家提示词应用范围")
				.setDesc("决定改写时是否附加当前阅读管家的主提示词和写作风格。")
				.addDropdown((dropdown) => {
					dropdown.addOption("full", "主提示词 + 写作风格");
					dropdown.addOption("writingOnly", "仅写作风格");
					dropdown.addOption("none", "均不附加");
					dropdown.setValue(this.cmd.contextMode || "writingOnly");
					dropdown.onChange((value) => {
					this.cmd.contextMode = value as "full" | "writingOnly" | "none";
				});
				});
		}

		const variableSection = contentEl.createDiv({ cls: "mn-command-variable-editor" });
		variableSection.createEl("h5", { text: "实验性变量" });
		variableSection.createEl("p", {
			text: "在提示词中使用 {{变量ID}}。执行指令时会先收集输入。",
			cls: "setting-item-description",
		});
		const variableList = variableSection.createDiv({ cls: "mn-variable-list" });
		this.renderVariableEditor(variableList);
		const addVariable = variableSection.createEl("button", { text: `${UI_ICONS.add} 添加变量` });
		addVariable.onclick = () => {
			const index = (this.cmd.variables || []).length + 1;
			this.cmd.variables = [
				...(this.cmd.variables || []),
				{ id: `variable${index}`, label: `变量 ${index}`, type: "text", required: false },
			];
			variableList.empty();
			this.renderVariableEditor(variableList);
		};

		if (this.cmd.type !== "inline-modify") {
			new Setting(contentEl)
				.setName("关联标签 (Tag)")
				.setDesc("执行此指令时自动附加的标签分类")
				.addDropdown((dropdown) => {
					dropdown.addOption("", "不关联 (无标签)");
					const tags = this.tags.length > 0 ? this.tags : DEFAULT_TAGS;
					for (const tag of tags) {
						dropdown.addOption(tag.id, `${tag.emoji} ${tag.name}`);
					}
					dropdown.setValue(this.cmd.tagId || "");
					dropdown.onChange((value) => {
						this.cmd.tagId = value || undefined;
					});
				});
		}

		contentEl.createEl("h5", {
			text: `${UI_ICONS.advanced} 高级覆盖 (Overrides)`,
		});
		new Setting(contentEl)
			.setName("Temperature 覆写")
			.setDesc("留空使用默认值。推荐极低温 0-0.3 确保严谨。")
			.addText((text) =>
				text
					.setPlaceholder("留空")
					.setValue(this.cmd.temperature?.toString() ?? "")
					.onChange((value) => {
						this.cmd.temperature = value ? parseFloat(value) : undefined;
					}),
			);
		new Setting(contentEl)
			.setName("上下文长度")
			.setDesc("留空使用默认值。最大 8192。")
			.addText((text) =>
				text
					.setPlaceholder("留空")
					.setValue(this.cmd.contextLength?.toString() ?? "")
					.onChange((value) => {
						this.cmd.contextLength = value ? parseInt(value) : undefined;
					}),
			);

		const btnDiv = contentEl.createEl("div", {
			attr: {
				style:
					"display:flex; justify-content:flex-end; gap: 8px; margin-top: 20px;",
			},
		});
		const cancelBtn = btnDiv.createEl("button", {
			text: `${UI_ICONS.cancel} 取消`,
		});
		cancelBtn.onclick = () => this.close();
		const saveBtn = btnDiv.createEl("button", {
			text: `${UI_ICONS.save} 保存`,
			cls: "mod-cta",
		});
		saveBtn.onclick = () => {
			this.onSave(this.cmd);
			this.close();
		};
	}

	private renderVariableEditor(container: HTMLElement) {
		for (const [index, variable] of (this.cmd.variables || []).entries()) {
			const row = container.createDiv({ cls: "mn-variable-editor-row" });
			const id = row.createEl("input", { type: "text", value: variable.id, placeholder: "变量ID" });
			id.oninput = () => {
				variable.id = id.value.trim().replace(/[^A-Za-z0-9_-]/g, "_");
			};
			const label = row.createEl("input", { type: "text", value: variable.label, placeholder: "显示名称" });
			label.oninput = () => {
				variable.label = label.value;
			};
			const type = row.createEl("select");
			for (const option of [
				["text", "文本"],
				["select", "单选"],
				["multiselect", "多选"],
			] as const) type.createEl("option", { value: option[0], text: option[1] });
			type.value = variable.type;
			type.onchange = () => {
				variable.type = type.value as LightningVariableType;
				container.empty();
				this.renderVariableEditor(container);
			};
			const required = row.createEl("label", { cls: "mn-variable-required" });
			const checkbox = required.createEl("input", { type: "checkbox" });
			checkbox.checked = variable.required === true;
			checkbox.onchange = () => {
				variable.required = checkbox.checked;
			};
			required.createEl("span", { text: "必填" });
			if (variable.type !== "text") {
				const options = row.createEl("input", {
					type: "text",
					value: (variable.options || []).map((option) => `${option.value}=${option.label}`).join(", "),
					placeholder: "选项: value=label, value=label",
				});
				options.oninput = () => {
					variable.options = options.value
						.split(",")
						.map((item) => item.trim())
						.filter(Boolean)
						.map((item) => {
							const [value, ...label] = item.split("=");
							return { value: value.trim(), label: label.join("=").trim() || value.trim() };
						});
				};
			}
			const remove = row.createEl("button", { text: UI_ICONS.remove, attr: { "aria-label": "删除变量" } });
			remove.onclick = () => {
				this.cmd.variables?.splice(index, 1);
				container.empty();
				this.renderVariableEditor(container);
			};
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}

export class TagEditModal extends Modal {
	tag: MarkingTag;
	onSave: (tag: MarkingTag) => void;

	constructor(app: App, tag: MarkingTag, onSave: (tag: MarkingTag) => void) {
		super(app);
		this.tag = { ...tag };
		this.onSave = onSave;
	}

	onOpen() {
		this.renderContent();
	}

	private renderContent() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", {
			text: `${UI_ICONS.tags} 编辑标签: ${this.tag.emoji} ${this.tag.name}`,
		});

		const previewRow = contentEl.createEl("div", {
			attr: {
				style:
					"margin-bottom: 16px; padding: 12px; background: var(--background-primary); border-radius: 8px; text-align: center;",
			},
		});
		const previewEl = previewRow.createEl("span", {
			text: `${this.tag.emoji} 这是一段示例文本预览`,
			attr: {
				style: "font-size: 1.1em; padding: 4px 16px; border-radius: 4px;",
			},
		});
		this.applyPreviewStyle(previewEl);

		new Setting(contentEl).setName("标签名称").addText((text) =>
			text.setValue(this.tag.name).onChange((value) => {
				this.tag.name = value;
			}),
		);

		const emojiSetting = new Setting(contentEl).setName("图标");
		const emojiBtn = emojiSetting.controlEl.createEl("button", {
			text: this.tag.emoji,
			attr: {
				style:
					"font-size: 1.5em; padding: 4px 12px; background: transparent; border: 1px dashed var(--background-modifier-border); border-radius: 6px; cursor: pointer;",
			},
		});
		emojiBtn.onclick = () => {
			showEmojiGrid(emojiBtn, (emoji: string) => {
				this.tag.emoji = emoji;
				emojiBtn.innerText = emoji;
				this.applyPreviewStyle(previewEl);
				previewEl.innerText = `${this.tag.emoji} 这是一段示例文本预览`;
			});
		};

		contentEl.createEl("h5", {
			text: "底色",
			attr: { style: "margin-bottom: 4px;" },
		});
		const bgGrid = contentEl.createEl("div", {
			cls: "mn-palette-grid",
			attr: { style: "margin-bottom: 12px;" },
		});
		for (const color of COLOR_PALETTE) {
			const swatch = bgGrid.createEl("div", {
				cls: `mn-palette-swatch ${color.value === this.tag.color ? "mn-swatch-active" : ""}`,
				attr: { style: `background: ${color.value};`, title: color.name },
			});
			swatch.onclick = () => {
				this.tag.color = color.value;
				this.applyPreviewStyle(previewEl);
				this.renderContent();
			};
		}

		contentEl.createEl("h5", {
			text: "文字颜色",
			attr: { style: "margin-bottom: 4px;" },
		});
		const txtGrid = contentEl.createEl("div", {
			cls: "mn-palette-grid",
			attr: { style: "margin-bottom: 12px;" },
		});
		for (const color of TEXT_COLOR_PALETTE) {
			const swatch = txtGrid.createEl("div", {
				cls: `mn-palette-swatch ${color.value === this.tag.textColor ? "mn-swatch-active" : ""}`,
				attr: {
					style: `background: ${color.value === "inherit" ? "var(--text-normal)" : color.value};`,
					title: color.name,
				},
			});
			swatch.onclick = () => {
				this.tag.textColor = color.value;
				this.applyPreviewStyle(previewEl);
				this.renderContent();
			};
		}

		new Setting(contentEl).setName("标注样式").addDropdown((dropdown) => {
			dropdown.addOption("highlight", "高亮 (Highlight)");
			dropdown.addOption("underline", "下划线 (Underline)");
			dropdown.addOption("dashed", "虚线 (Dashed)");
			dropdown.addOption("semi-transparent", "半透明 (Semi-transparent)");
			dropdown.setValue(this.tag.style);
			dropdown.onChange((value) => {
				this.tag.style = value as MarkingTag["style"];
				this.applyPreviewStyle(previewEl);
			});
		});

		const btnDiv = contentEl.createEl("div", {
			attr: {
				style:
					"display:flex; justify-content:flex-end; gap: 8px; margin-top: 20px;",
			},
		});
		const cancelBtn = btnDiv.createEl("button", {
			text: `${UI_ICONS.cancel} 取消`,
		});
		cancelBtn.onclick = () => this.close();
		const saveBtn = btnDiv.createEl("button", {
			text: `${UI_ICONS.save} 保存`,
			cls: "mod-cta",
		});
		saveBtn.onclick = () => {
			this.onSave(this.tag);
			this.close();
		};
	}

	private applyPreviewStyle(el: HTMLElement) {
		el.style.cssText =
			"font-size: 1.1em; padding: 4px 16px; border-radius: 4px;";
		applyTagHighlightStyle(el, this.tag);
	}

	onClose() {
		this.contentEl.empty();
	}
}
