import { type App, Modal, Setting } from 'obsidian';

import { COLOR_PALETTE, DEFAULT_TAGS, TEXT_COLOR_PALETTE } from '../domain/constants';
import type { LightningCommand, MarkingTag } from '../domain/types';
import { applyTagHighlightStyle } from '../tag-styles';
import { showEmojiGrid } from '../ui/emoji-picker';
import { UI_ICONS } from '../ui/icons';

export class LightningCommandEditModal extends Modal {
    cmd: LightningCommand;
    onSave: (cmd: LightningCommand) => void;
    tags: MarkingTag[];

    constructor(app: App, cmd: LightningCommand, tags: MarkingTag[], onSave: (cmd: LightningCommand) => void) {
        super(app);
        this.cmd = { ...cmd };
        this.tags = tags;
        this.onSave = onSave;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h3', { text: `${UI_ICONS.actionRewrite} 编辑指令: ${this.cmd.icon} ${this.cmd.name}` });

        new Setting(contentEl).setName('名称').addText((text) => text.setValue(this.cmd.name).onChange((value) => {
            this.cmd.name = value;
        }));

        const iconSetting = new Setting(contentEl).setName('图标');
        const iconBtn = iconSetting.controlEl.createEl('button', { text: this.cmd.icon, attr: { style: 'font-size: 1.5em; padding: 4px 12px; background: transparent; border: 1px dashed var(--background-modifier-border); border-radius: 6px; cursor: pointer;' } });
        iconBtn.onclick = () => {
            showEmojiGrid(iconBtn, (emoji: string) => {
                this.cmd.icon = emoji;
                iconBtn.innerText = emoji;
            });
        };

        if (this.cmd.type === 'default-summary') {
            new Setting(contentEl).setName('一句话总结约束').setDesc('默认处理高亮时的一句话约束')
                .addTextArea((text) => text.setValue(this.cmd.detailPrompt).onChange((value) => {
                    this.cmd.detailPrompt = value;
                }));
        } else if (this.cmd.type === 'inline-modify') {
            new Setting(contentEl).setName('处理命令').setDesc('告诉大模型你想如何处理或改写这段原文（不要有任何返回结果外的标题内容）')
                .addTextArea((text) => text.setValue(this.cmd.detailPrompt).onChange((value) => {
                    this.cmd.detailPrompt = value;
                }));
        } else {
            new Setting(contentEl).setName('详细内容指令').setDesc('定义 AI 第二部分（向下追问角注深层内容）的输出内容')
                .addTextArea((text) => text.setValue(this.cmd.detailPrompt).onChange((value) => {
                    this.cmd.detailPrompt = value;
                }));

            new Setting(contentEl).setName('管家提示词应用范围').setDesc('决定该命令执行时，是否沿用阅读管家的设定。')
                .addDropdown((dropdown) => {
                    dropdown.addOption('full', '应用阅读理解 + 写作风格 (推荐)');
                    dropdown.addOption('writingOnly', '仅应用写作风格');
                    dropdown.addOption('none', '纯净执行 (均不应用)');
                    dropdown.setValue(this.cmd.contextMode || 'full');
                    dropdown.onChange((value) => {
                        this.cmd.contextMode = value as 'full' | 'writingOnly' | 'none';
                    });
                });
        }

        if (this.cmd.type !== 'inline-modify') {
            new Setting(contentEl).setName('关联标签 (Tag)').setDesc('执行此指令时自动附加的标签分类')
                .addDropdown((dropdown) => {
                    dropdown.addOption('', '不关联 (无标签)');
                    const tags = this.tags.length > 0 ? this.tags : DEFAULT_TAGS;
                    for (const tag of tags) {
                        dropdown.addOption(tag.id, `${tag.emoji} ${tag.name}`);
                    }
                    dropdown.setValue(this.cmd.tagId || '');
                    dropdown.onChange((value) => {
                        this.cmd.tagId = value || undefined;
                    });
                });
        }

        contentEl.createEl('h5', { text: `${UI_ICONS.advanced} 高级覆盖 (Overrides)` });
        new Setting(contentEl).setName('Temperature 覆写').setDesc('留空使用默认值。推荐极低温 0-0.3 确保严谨。')
            .addText((text) => text.setPlaceholder('留空').setValue(this.cmd.temperature?.toString() ?? '').onChange((value) => {
                this.cmd.temperature = value ? parseFloat(value) : undefined;
            }));
        new Setting(contentEl).setName('上下文长度').setDesc('留空使用默认值。最大 8192。')
            .addText((text) => text.setPlaceholder('留空').setValue(this.cmd.contextLength?.toString() ?? '').onChange((value) => {
                this.cmd.contextLength = value ? parseInt(value) : undefined;
            }));

        const btnDiv = contentEl.createEl('div', { attr: { style: 'display:flex; justify-content:flex-end; gap: 8px; margin-top: 20px;' } });
        const cancelBtn = btnDiv.createEl('button', { text: `${UI_ICONS.cancel} 取消` });
        cancelBtn.onclick = () => this.close();
        const saveBtn = btnDiv.createEl('button', { text: `${UI_ICONS.save} 保存`, cls: 'mod-cta' });
        saveBtn.onclick = () => {
            this.onSave(this.cmd);
            this.close();
        };
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
        contentEl.createEl('h3', { text: `${UI_ICONS.tags} 编辑标签: ${this.tag.emoji} ${this.tag.name}` });

        const previewRow = contentEl.createEl('div', { attr: { style: 'margin-bottom: 16px; padding: 12px; background: var(--background-primary); border-radius: 8px; text-align: center;' } });
        const previewEl = previewRow.createEl('span', { text: `${this.tag.emoji} 这是一段示例文本预览`, attr: { style: 'font-size: 1.1em; padding: 4px 16px; border-radius: 4px;' } });
        this.applyPreviewStyle(previewEl);

        new Setting(contentEl).setName('标签名称').addText((text) => text.setValue(this.tag.name).onChange((value) => {
            this.tag.name = value;
        }));

        const emojiSetting = new Setting(contentEl).setName('图标');
        const emojiBtn = emojiSetting.controlEl.createEl('button', { text: this.tag.emoji, attr: { style: 'font-size: 1.5em; padding: 4px 12px; background: transparent; border: 1px dashed var(--background-modifier-border); border-radius: 6px; cursor: pointer;' } });
        emojiBtn.onclick = () => {
            showEmojiGrid(emojiBtn, (emoji: string) => {
                this.tag.emoji = emoji;
                emojiBtn.innerText = emoji;
                this.applyPreviewStyle(previewEl);
                previewEl.innerText = `${this.tag.emoji} 这是一段示例文本预览`;
            });
        };

        contentEl.createEl('h5', { text: '底色', attr: { style: 'margin-bottom: 4px;' } });
        const bgGrid = contentEl.createEl('div', { cls: 'mn-palette-grid', attr: { style: 'margin-bottom: 12px;' } });
        for (const color of COLOR_PALETTE) {
            const swatch = bgGrid.createEl('div', { cls: `mn-palette-swatch ${color.value === this.tag.color ? 'mn-swatch-active' : ''}`, attr: { style: `background: ${color.value};`, title: color.name } });
            swatch.onclick = () => {
                this.tag.color = color.value;
                this.applyPreviewStyle(previewEl);
                this.renderContent();
            };
        }

        contentEl.createEl('h5', { text: '文字颜色', attr: { style: 'margin-bottom: 4px;' } });
        const txtGrid = contentEl.createEl('div', { cls: 'mn-palette-grid', attr: { style: 'margin-bottom: 12px;' } });
        for (const color of TEXT_COLOR_PALETTE) {
            const swatch = txtGrid.createEl('div', { cls: `mn-palette-swatch ${color.value === this.tag.textColor ? 'mn-swatch-active' : ''}`, attr: { style: `background: ${color.value === 'inherit' ? 'var(--text-normal)' : color.value};`, title: color.name } });
            swatch.onclick = () => {
                this.tag.textColor = color.value;
                this.applyPreviewStyle(previewEl);
                this.renderContent();
            };
        }

        new Setting(contentEl).setName('标注样式').addDropdown((dropdown) => {
            dropdown.addOption('highlight', '高亮 (Highlight)');
            dropdown.addOption('underline', '下划线 (Underline)');
            dropdown.addOption('dashed', '虚线 (Dashed)');
            dropdown.addOption('semi-transparent', '半透明 (Semi-transparent)');
            dropdown.setValue(this.tag.style);
            dropdown.onChange((value) => {
                this.tag.style = value as MarkingTag['style'];
                this.applyPreviewStyle(previewEl);
            });
        });

        const btnDiv = contentEl.createEl('div', { attr: { style: 'display:flex; justify-content:flex-end; gap: 8px; margin-top: 20px;' } });
        const cancelBtn = btnDiv.createEl('button', { text: `${UI_ICONS.cancel} 取消` });
        cancelBtn.onclick = () => this.close();
        const saveBtn = btnDiv.createEl('button', { text: `${UI_ICONS.save} 保存`, cls: 'mod-cta' });
        saveBtn.onclick = () => {
            this.onSave(this.tag);
            this.close();
        };
    }

    private applyPreviewStyle(el: HTMLElement) {
        el.style.cssText = 'font-size: 1.1em; padding: 4px 16px; border-radius: 4px;';
        applyTagHighlightStyle(el, this.tag);
    }

    onClose() {
        this.contentEl.empty();
    }
}
