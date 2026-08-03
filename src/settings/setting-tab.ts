import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';

import { AIClient } from '../ai';
import { COLOR_PALETTE } from '../domain/constants';
import type { LightningCommand, MarkingNoteSettings, MarkingTag, ModelProvider, StewardConfig } from '../domain/types';
import { applyTagHighlightStyle } from '../tag-styles';
import { showEmojiGrid } from '../ui/emoji-picker';
import { LightningCommandEditModal, TagEditModal } from './modals';

export interface MarkingNoteSettingsHost extends Plugin {
    settings: MarkingNoteSettings;
    saveSettings(): Promise<void>;
}

type SettingsTabKey = 'general' | 'tags' | 'models' | 'stewards' | 'advanced';

export class MarkingNoteSettingTab extends PluginSettingTab {
    plugin: MarkingNoteSettingsHost;
    editingStewardId: string | null = null;
    activeTab: SettingsTabKey = 'general';

    constructor(app: App, plugin: MarkingNoteSettingsHost) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Marking Note 设置' });

        const tabsEl = containerEl.createDiv({ cls: 'mn-settings-tabs' });
        const settingsContentEl = containerEl.createDiv({ cls: 'mn-settings-content' });

        const sectionEls = {
            general: settingsContentEl.createDiv(),
            tags: settingsContentEl.createDiv(),
            models: settingsContentEl.createDiv(),
            stewards: settingsContentEl.createDiv(),
            advanced: settingsContentEl.createDiv(),
        } as const;

        const tabButtons: Partial<Record<SettingsTabKey, HTMLButtonElement>> = {};
        const switchTab = (tab: SettingsTabKey) => {
            this.activeTab = tab;
            for (const [key, el] of Object.entries(sectionEls) as Array<[SettingsTabKey, HTMLDivElement]>) {
                el.style.display = key === tab ? '' : 'none';
            }
            for (const [key, btn] of Object.entries(tabButtons) as Array<[SettingsTabKey, HTMLButtonElement | undefined]>) {
                btn?.toggleClass('mn-settings-tab-active', key === tab);
            }
        };

        const createTab = (tab: SettingsTabKey, label: string) => {
            const btn = tabsEl.createEl('button', { text: label, cls: 'mn-settings-tab' });
            btn.onclick = () => switchTab(tab);
            tabButtons[tab] = btn;
        };

        createTab('general', '⚙️ 通用');
        createTab('tags', '🏷️ 标签');
        createTab('models', '🔌 模型');
        createTab('stewards', '🤖 管家');
        createTab('advanced', '🔧 高级');

        const generalEl = sectionEls.general;
        const tagsEl = sectionEls.tags;
        const modelsEl = sectionEls.models;
        const stewardsEl = sectionEls.stewards;
        const advancedEl = sectionEls.advanced;

        this.renderGeneralSettings(generalEl);
        this.renderAdvancedSettings(advancedEl);
        this.renderTagSettings(tagsEl);
        this.renderModelSettings(modelsEl);
        this.renderStewardSettings(stewardsEl, switchTab);

        switchTab(this.activeTab);
    }

    private renderGeneralSettings(container: HTMLElement) {
        container.createEl('h3', { text: '⚙️ 通用设置', cls: 'mn-settings-section-title' });
        new Setting(container)
            .setName('启用 AI 原文改写面板')
            .setDesc('在悬浮菜单中增加一个按钮，用于就地修改原文（无需生成高亮和脚标）。')
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.enableInlineModification)
                .onChange(async (value) => {
                    this.plugin.settings.enableInlineModification = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(container)
            .setName('当前激活的阅读管家')
            .setDesc('快速切换悬浮面板、标注和合并时默认使用的管家。')
            .addDropdown((dropdown) => {
                for (const steward of this.plugin.settings.stewards) {
                    dropdown.addOption(steward.id, `${steward.icon} ${steward.name}`);
                }
                dropdown.setValue(this.plugin.settings.activeStewardId);
                dropdown.onChange(async (value) => {
                    this.plugin.settings.activeStewardId = value;
                    await this.plugin.saveSettings();
                });
            });

        const generalHint = container.createEl('div', { cls: 'mn-settings-card' });
        generalHint.createEl('div', { text: '🪄 悬浮菜单说明', attr: { style: 'font-weight: 600; margin-bottom: 6px;' } });
        generalHint.createEl('div', { text: '标注悬浮菜单开关已从设置页移除，可通过命令面板中的“打开/关闭标注悬浮窗”进行控制。', cls: 'setting-item-description' });
    }

    private renderAdvancedSettings(container: HTMLElement) {
        container.createEl('h3', { text: '🔧 开发', cls: 'mn-settings-section-title' });

        new Setting(container)
            .setName('调试模式')
            .setDesc('开启后将在控制台输出详细的调试日志信息。')
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.enableDebugMode)
                .onChange(async (value) => {
                    this.plugin.settings.enableDebugMode = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(container)
            .setName('Tavily API Key')
            .setDesc('用于追问时的可选网络搜索增强；留空则禁用网络搜索。')
            .addText((text) => {
                text.setPlaceholder('tvly-...').setValue(this.plugin.settings.tavilyApiKey || '').onChange(async (value) => {
                    this.plugin.settings.tavilyApiKey = value.trim();
                    await this.plugin.saveSettings();
                });
                text.inputEl.type = 'password';
            });

        new Setting(container)
            .setName('开发者模式')
            .setDesc('开启后可编辑系统级提示词模板（含摘要、深度分析与原文改写引擎提示词）。')
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.enableDeveloperMode)
                .onChange(async (value) => {
                    this.plugin.settings.enableDeveloperMode = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));

        if (!this.plugin.settings.enableDeveloperMode) return;

        const promptCard = container.createEl('div', { cls: 'mn-settings-card' });
        promptCard.createEl('h4', { text: '🧠 系统级提示词模板', attr: { style: 'margin: 0 0 8px 0;' } });
        promptCard.createEl('p', { text: '这些模板会直接影响引擎级输出格式。请保留占位符，例如 __FOOTNOTE_ID__、__DEFAULT_SUMMARY_PROMPT__、__TARGET_LANGUAGE__。', cls: 'setting-item-description' });

        new Setting(promptCard)
            .setName('默认摘要系统提示词')
            .setDesc('用于生成单行摘要标题。')
            .addTextArea((text) => text
                .setValue(this.plugin.settings.defaultSummarySystemPromptTemplate)
                .onChange(async (value) => {
                    this.plugin.settings.defaultSummarySystemPromptTemplate = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(promptCard)
            .setName('详细分析系统提示词')
            .setDesc('用于标准标注、追问和合并时的双段式输出模板。')
            .addTextArea((text) => text
                .setValue(this.plugin.settings.annotationSystemPromptTemplate)
                .onChange(async (value) => {
                    this.plugin.settings.annotationSystemPromptTemplate = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(promptCard)
            .setName('原文改写系统提示词')
            .setDesc('用于直接覆盖原文的改写引擎。')
            .addTextArea((text) => text
                .setValue(this.plugin.settings.inlineRewriteSystemPromptTemplate)
                .onChange(async (value) => {
                    this.plugin.settings.inlineRewriteSystemPromptTemplate = value;
                    await this.plugin.saveSettings();
                }));
    }

    private renderTagSettings(container: HTMLElement) {
        container.createEl('h3', { text: '🏷️ 标注标签 (Tags)', cls: 'mn-settings-section-title' });
        container.createEl('p', { text: '点击标签卡片进入编辑。标注时可选择或自动关联标签。', cls: 'setting-item-description' });

        const addButton = container.createEl('button', { text: '➕ 新建标签', cls: 'mod-cta' });
        addButton.onclick = async () => {
            const newTag: MarkingTag = {
                id: `tag-${Date.now()}`,
                name: '新标签',
                emoji: '🏷️',
                color: COLOR_PALETTE[0].value,
                textColor: 'inherit',
                style: 'highlight',
            };
            this.plugin.settings.tags.push(newTag);
            await this.plugin.saveSettings();
            new TagEditModal(this.app, newTag, async (updated) => {
                this.plugin.settings.tags[this.plugin.settings.tags.length - 1] = updated;
                await this.plugin.saveSettings();
                this.display();
            }).open();
        };

        const tagListDiv = container.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 8px; margin-top: 12px;' } });

        this.plugin.settings.tags.forEach((tag, index) => {
            const styleLabels: Record<string, string> = { highlight: '高亮', underline: '下划线', dashed: '虚线', 'semi-transparent': '半透明' };
            const tagCard = tagListDiv.createEl('div', { cls: 'marking-tag-card', attr: { style: 'cursor: pointer; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--background-modifier-border); background: var(--background-secondary); transition: all 0.15s;' } });
            const cardRow = tagCard.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 10px;' } });
            cardRow.createEl('span', { text: tag.emoji, attr: { style: 'font-size: 1.3em;' } });
            cardRow.createEl('span', { text: tag.name, attr: { style: 'font-weight: 600; flex: 1;' } });
            const previewEl = cardRow.createEl('span', { text: '示例文本', attr: { style: 'font-size: 0.85em; padding: 2px 10px; border-radius: 4px;' } });
            applyTagHighlightStyle(previewEl, tag);
            cardRow.createEl('span', { text: styleLabels[tag.style] || tag.style, attr: { style: 'font-size: 0.75em; color: var(--text-muted);' } });
            const delBtn = cardRow.createEl('button', { text: '✖', attr: { style: 'font-size: 0.8em; padding: 2px 8px; background: transparent; border: none; cursor: pointer; color: var(--text-muted);' } });
            delBtn.onclick = async (event) => {
                event.stopPropagation();
                this.plugin.settings.tags.splice(index, 1);
                await this.plugin.saveSettings();
                this.display();
            };
            tagCard.onclick = () => {
                new TagEditModal(this.app, tag, async (updated) => {
                    this.plugin.settings.tags[index] = updated;
                    await this.plugin.saveSettings();
                    this.display();
                }).open();
            };
        });
    }

    private renderModelSettings(container: HTMLElement) {
        container.createEl('h3', { text: '🔌 模型提供商 (Model Providers)', cls: 'mn-settings-section-title' });
        container.createEl('p', { text: '支持任何 OpenAI 兼容的 API（OpenAI / DeepSeek / Ollama / LM Studio 等）', cls: 'setting-item-description' });

        const addButton = container.createEl('button', { text: '➕ 添加模型提供商', cls: 'mod-cta' });
        addButton.onclick = async () => {
            const newProvider: ModelProvider = {
                id: `provider-${Date.now()}`,
                name: '新模型',
                baseURL: 'https://api.openai.com/v1',
                apiKey: '',
                modelId: 'gpt-4o',
            };
            this.plugin.settings.modelProviders.push(newProvider);
            await this.plugin.saveSettings();
            this.display();
        };

        for (let index = 0; index < this.plugin.settings.modelProviders.length; index++) {
            const provider = this.plugin.settings.modelProviders[index];
            const isDefault = provider.id === this.plugin.settings.defaultProviderId;

            const providerDiv = container.createEl('div', { cls: 'steward-card', attr: { style: `border: 1px solid ${isDefault ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; padding: 15px; margin: 10px 0; border-radius: 8px;` } });
            const header = providerDiv.createEl('div', { attr: { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;' } });
            const titleArea = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 8px;' } });
            titleArea.createEl('h4', { text: provider.name, attr: { style: 'margin: 0;' } });
            if (isDefault) {
                titleArea.createEl('span', { text: '默认', attr: { style: 'font-size: 0.75em; background: var(--interactive-accent); color: white; padding: 2px 6px; border-radius: 4px;' } });
            }

            const btnGroup = header.createEl('div', { attr: { style: 'display: flex; gap: 4px;' } });

            if (!isDefault) {
                const btnDefault = btnGroup.createEl('button', { text: '设为默认' });
                btnDefault.onclick = async () => {
                    this.plugin.settings.defaultProviderId = provider.id;
                    await this.plugin.saveSettings();
                    this.display();
                };
            }

            const btnTest = btnGroup.createEl('button', { text: '🔗 测试连通' });
            btnTest.onclick = async () => {
                btnTest.innerText = '⏳ 测试中...';
                try {
                    const ok = await AIClient.testConnection(provider);
                    btnTest.innerText = ok ? '✅ 连通' : '❌ 失败';
                } catch {
                    btnTest.innerText = '❌ 失败';
                }
                setTimeout(() => {
                    btnTest.innerText = '🔗 测试连通';
                }, 3000);
            };

            const btnDel = btnGroup.createEl('button', { text: '🗑️', cls: 'mod-warning' });
            btnDel.onclick = async () => {
                this.plugin.settings.modelProviders.splice(index, 1);
                await this.plugin.saveSettings();
                this.display();
            };

            new Setting(providerDiv).setName('名称').addText((text) => text.setValue(provider.name).onChange(async (value) => {
                this.plugin.settings.modelProviders[index].name = value;
                await this.plugin.saveSettings();
            }));
            new Setting(providerDiv).setName('Base URL').addText((text) => text.setPlaceholder('https://api.openai.com/v1').setValue(provider.baseURL).onChange(async (value) => {
                this.plugin.settings.modelProviders[index].baseURL = value;
                await this.plugin.saveSettings();
            }));
            new Setting(providerDiv).setName('API Key').addText((text) => {
                text.setPlaceholder('sk-...').setValue(provider.apiKey).onChange(async (value) => {
                    this.plugin.settings.modelProviders[index].apiKey = value;
                    await this.plugin.saveSettings();
                });
                text.inputEl.type = 'password';
            });
            new Setting(providerDiv).setName('Model ID').addText((text) => text.setPlaceholder('gpt-4o').setValue(provider.modelId).onChange(async (value) => {
                this.plugin.settings.modelProviders[index].modelId = value;
                await this.plugin.saveSettings();
            }));
        }
    }

    private renderStewardSettings(container: HTMLElement, switchTab: (tab: SettingsTabKey) => void) {
        container.createEl('h3', { text: '🏷️ 切换当前管家', cls: 'mn-settings-section-title' });
        container.createEl('p', { text: '选择在 Marking Note 中悬浮窗和快捷指令使用的管家。', cls: 'setting-item-description' });

        new Setting(container)
            .setName('当前激活的阅读管家')
            .addDropdown((dropdown) => {
                for (const steward of this.plugin.settings.stewards) {
                    dropdown.addOption(steward.id, `${steward.icon} ${steward.name}`);
                }
                dropdown.setValue(this.plugin.settings.activeStewardId);
                dropdown.onChange(async (value) => {
                    this.plugin.settings.activeStewardId = value;
                    await this.plugin.saveSettings();
                });
            });

        this.renderInlineStewardSettings(container);
        this.renderEditableStewardSettings(container, switchTab);
    }

    private renderInlineStewardSettings(container: HTMLElement) {
        container.createEl('h3', { text: '✏️ 全局改写管家 (Inline Steward)', cls: 'mn-settings-section-title', attr: { style: 'margin-top: 30px;' } });
        container.createEl('p', { text: '这是专用于在选中文本悬浮菜单处直接擦除旧文本并覆盖原文的管家，无需设置标题和格式，直接起效。', cls: 'setting-item-description' });

        const inlineDiv = container.createEl('div', { cls: 'steward-card', attr: { style: 'border: 1px solid var(--text-muted); padding: 15px; margin-bottom: 20px; border-radius: 8px;' } });

        new Setting(inlineDiv)
            .setName('改写所用的大模型')
            .addDropdown((dropdown) => {
                dropdown.addOption('default-provider', '使用默认');
                for (const provider of this.plugin.settings.modelProviders) {
                    dropdown.addOption(provider.id, provider.name);
                }
                dropdown.setValue(this.plugin.settings.inlineSteward.boundModelProviderId || 'default-provider');
                dropdown.onChange(async (value) => {
                    this.plugin.settings.inlineSteward.boundModelProviderId = value;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(inlineDiv).setName('Temperature (改写温度)')
            .setDesc('改写任务推荐调低温度(如 0.2-0.3)以保持严谨，避免 AI 发散创作。')
            .addSlider((slider) => slider.setLimits(0, 1, 0.1).setValue(this.plugin.settings.inlineSteward.temperature).setDynamicTooltip().onChange(async (value) => {
                this.plugin.settings.inlineSteward.temperature = value;
                await this.plugin.saveSettings();
            }));

        new Setting(inlineDiv).setName('识别上下文长度界限')
            .addSlider((slider) => slider.setLimits(0, 8192, 128).setValue(this.plugin.settings.inlineSteward.contextLength).setDynamicTooltip().onChange(async (value) => {
                this.plugin.settings.inlineSteward.contextLength = value;
                await this.plugin.saveSettings();
            }));

        const inlineCmdSection = inlineDiv.createEl('div', { attr: { style: 'margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--background-modifier-border);' } });
        inlineCmdSection.createEl('h5', { text: '✏️ 改写指令 (Inline Commands)' });

        const btnAddInlineCmd = inlineCmdSection.createEl('button', { text: '➕ 添加改写指令' });
        btnAddInlineCmd.onclick = async () => {
            const newCmd: LightningCommand = {
                id: `inline-cmd-${Date.now()}`,
                name: '新改写',
                icon: '✏️',
                detailPrompt: '',
                type: 'inline-modify',
            };
            this.plugin.settings.inlineSteward.commands.push(newCmd);
            await this.plugin.saveSettings();
            this.display();
        };

        const inlineListDiv = inlineCmdSection.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 8px; margin-top: 8px;' } });

        this.plugin.settings.inlineSteward.commands.forEach((cmd, index) => {
            const cmdCard = inlineListDiv.createEl('div', { cls: 'marking-cmd-card', attr: { style: 'cursor: pointer; padding: 10px; border: 1px solid var(--background-modifier-border); border-radius: 6px; background: var(--background-primary); transition: background 0.2s;' } });
            const cardHeader = cmdCard.createEl('div', { attr: { style: 'display: flex; justify-content: space-between; align-items: center;' } });
            cardHeader.createEl('div', { text: `${cmd.icon} ${cmd.name}`, attr: { style: 'font-weight: 600;' } });

            const cmdDel = cardHeader.createEl('button', { text: '✖', attr: { style: 'font-size: 0.8em; padding: 2px 8px;' } });
            cmdDel.onclick = async (event) => {
                event.stopPropagation();
                this.plugin.settings.inlineSteward.commands.splice(index, 1);
                await this.plugin.saveSettings();
                this.display();
            };

            const descPreview = cmd.detailPrompt.slice(0, 45) + (cmd.detailPrompt.length > 45 ? '...' : '');
            cmdCard.createEl('div', { text: descPreview || '未设置提示词', attr: { style: 'font-size: 0.85em; color: var(--text-muted); margin-top: 6px; line-height: 1.3;' } });

            cmdCard.onclick = () => {
                new LightningCommandEditModal(this.app, cmd, this.plugin.settings.tags, async (updatedCmd) => {
                    this.plugin.settings.inlineSteward.commands[index] = updatedCmd;
                    await this.plugin.saveSettings();
                    this.display();
                }).open();
            };
        });
    }

    private renderEditableStewardSettings(container: HTMLElement, switchTab: (tab: SettingsTabKey) => void) {
        container.createEl('h3', { text: '🤖 管家维护与配置', cls: 'mn-settings-section-title', attr: { style: 'margin-top: 30px;' } });
        container.createEl('p', { text: '选择一个管家进行修改，或创建新管家。', cls: 'setting-item-description' });

        if (!this.editingStewardId && this.plugin.settings.stewards.length > 0) {
            this.editingStewardId = this.plugin.settings.stewards[0].id;
        }

        const editSelectorDiv = container.createEl('div', { attr: { style: 'display: flex; gap: 10px; align-items: center; margin-bottom: 20px;' } });
        switchTab(this.activeTab);

        const stewardDropdown = editSelectorDiv.createEl('select', { cls: 'dropdown' });
        for (const steward of this.plugin.settings.stewards) {
            const option = stewardDropdown.createEl('option', { value: steward.id, text: `${steward.icon} ${steward.name}` });
            if (steward.id === this.editingStewardId) option.selected = true;
        }
        stewardDropdown.onchange = () => {
            this.editingStewardId = stewardDropdown.value;
            this.display();
        };

        const btnAddSteward = editSelectorDiv.createEl('button', { text: '➕ 新建管家' });
        btnAddSteward.onclick = async () => {
            const newId = `steward-${Date.now()}`;
            const newSteward: StewardConfig = {
                id: newId,
                name: '新管家',
                icon: '🤖',
                systemPrompt: '',
                writingStyle: '',
                contextLength: 2000,
                temperature: 0.7,
                topP: 0.95,
                thinkingBudget: 0,
                footnoteLength: 30,
                boundModelProviderId: this.plugin.settings.defaultProviderId,
                commands: [],
            };
            this.plugin.settings.stewards.push(newSteward);
            this.editingStewardId = newId;
            await this.plugin.saveSettings();
            this.display();
        };

        const index = this.plugin.settings.stewards.findIndex((steward) => steward.id === this.editingStewardId);
        if (index === -1) return;

        const steward = this.plugin.settings.stewards[index];
        const stewardDiv = container.createEl('div', { cls: 'steward-card', attr: { style: 'border: 1px solid var(--interactive-accent); padding: 15px; margin-bottom: 20px; border-radius: 8px;' } });

        const header = stewardDiv.createEl('div', { attr: { style: 'display: flex; justify-content: space-between; align-items: center;' } });
        header.createEl('h4', { text: `编辑中: ${steward.icon} ${steward.name}`, attr: { style: 'margin: 0; color: var(--interactive-accent);' } });

        const btnDelete = header.createEl('button', { text: '🗑️ 删除此管家', cls: 'mod-warning' });
        btnDelete.onclick = async () => {
            if (!confirm(`确定要删除配置 "${steward.name}" 吗？`)) return;
            this.plugin.settings.stewards.splice(index, 1);
            this.editingStewardId = null;
            await this.plugin.saveSettings();
            this.display();
        };

        new Setting(stewardDiv).setName('名称').addText((text) => text.setValue(steward.name).onChange(async (value) => {
            this.plugin.settings.stewards[index].name = value;
            await this.plugin.saveSettings();
            stewardDropdown.options[stewardDropdown.selectedIndex].text = `${steward.icon} ${value}`;
        }));

        new Setting(stewardDiv).setName('图标 (Emoji)').addButton((btn) => btn.setButtonText(steward.icon).onClick(() => {
            showEmojiGrid(btn.buttonEl, async (emoji) => {
                this.plugin.settings.stewards[index].icon = emoji;
                await this.plugin.saveSettings();
                stewardDropdown.options[stewardDropdown.selectedIndex].text = `${emoji} ${steward.name}`;
                this.display();
            });
        }));

        new Setting(stewardDiv)
            .setName('绑定模型提供商')
            .addDropdown((dropdown) => {
                dropdown.addOption('', '使用默认');
                for (const provider of this.plugin.settings.modelProviders) {
                    dropdown.addOption(provider.id, provider.name);
                }
                dropdown.setValue(steward.boundModelProviderId || '');
                dropdown.onChange(async (value) => {
                    this.plugin.settings.stewards[index].boundModelProviderId = value;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(stewardDiv).setName('阅读理解提示词').setDesc('定义该管家如何"看"待文本。如：总结核心、分析技术点。')
            .addTextArea((text) => text.setValue(steward.systemPrompt).onChange(async (value) => {
                this.plugin.settings.stewards[index].systemPrompt = value;
                await this.plugin.saveSettings();
            }));

        new Setting(stewardDiv).setName('写作风格提示词').setDesc('定义大模型返回结果（富文本区域）的语气与排版特征。')
            .addTextArea((text) => text.setValue(steward.writingStyle).onChange(async (value) => {
                this.plugin.settings.stewards[index].writingStyle = value;
                await this.plugin.saveSettings();
            }));

        new Setting(stewardDiv).setName('Temperature (温度)')
            .addSlider((slider) => slider.setLimits(0, 1, 0.1).setValue(steward.temperature).setDynamicTooltip().onChange(async (value) => {
                this.plugin.settings.stewards[index].temperature = value;
                await this.plugin.saveSettings();
            }));

        new Setting(stewardDiv).setName('TopP')
            .addSlider((slider) => slider.setLimits(0, 1, 0.05).setValue(steward.topP).setDynamicTooltip().onChange(async (value) => {
                this.plugin.settings.stewards[index].topP = value;
                await this.plugin.saveSettings();
            }));

        new Setting(stewardDiv).setName('上下文截断长度 (字符)')
            .addSlider((slider) => slider.setLimits(0, 8192, 128).setValue(steward.contextLength).setDynamicTooltip().onChange(async (value) => {
                this.plugin.settings.stewards[index].contextLength = value;
                await this.plugin.saveSettings();
            }));

        new Setting(stewardDiv).setName('思考预算 (Thinking Budget)')
            .setDesc('针对思维链模型（如 DeepSeek R1），设定思考深度。')
            .addDropdown((dropdown) => {
                dropdown.addOption('0', '无 (关闭思维链)');
                dropdown.addOption('500', '极低 (500 Tokens)');
                dropdown.addOption('1000', '低 (1000 Tokens)');
                dropdown.addOption('2000', '中 (2000 Tokens)');
                dropdown.addOption('5000', '高 (5000 Tokens)');
                dropdown.setValue(steward.thinkingBudget.toString());
                dropdown.onChange(async (value) => {
                    this.plugin.settings.stewards[index].thinkingBudget = parseInt(value);
                    await this.plugin.saveSettings();
                });
            });

        new Setting(stewardDiv).setName('脚注文本长度限制').setDesc('第一部分（简介）的严苛限制。')
            .addText((text) => text.setValue(steward.footnoteLength.toString()).onChange(async (value) => {
                this.plugin.settings.stewards[index].footnoteLength = parseInt(value) || 30;
                await this.plugin.saveSettings();
            }));

        const cmdSection = stewardDiv.createEl('div', { attr: { style: 'margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--background-modifier-border);' } });
        cmdSection.createEl('h5', { text: '⚡ 管家指令 (Steward Commands)' });

        const btnAddCmd = cmdSection.createEl('button', { text: '➕ 添加快捷指令' });
        btnAddCmd.onclick = async () => {
            const newCmd: LightningCommand = {
                id: `cmd-${Date.now()}`,
                name: '新指令',
                icon: '⚡',
                detailPrompt: '',
                type: 'annotated',
                contextMode: 'full',
            };
            this.plugin.settings.stewards[index].commands.push(newCmd);
            await this.plugin.saveSettings();
            this.display();
        };

        const listDiv = cmdSection.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 8px; margin-top: 8px;' } });

        steward.commands.forEach((cmd, cmdIndex) => {
            const cmdCard = listDiv.createEl('div', { cls: 'marking-cmd-card', attr: { style: 'cursor: pointer; padding: 10px; border: 1px solid var(--background-modifier-border); border-radius: 6px; background: var(--background-primary); transition: background 0.2s;' } });
            const cardHeader = cmdCard.createEl('div', { attr: { style: 'display: flex; justify-content: space-between; align-items: center;' } });
            const typeBadge = cmd.type === 'default-summary' ? '✅ 默认' : '⚡ 挂载';
            cardHeader.createEl('div', { text: `${cmd.icon} ${cmd.name}`, attr: { style: 'font-weight: 600;' } });

            const rightControls = cardHeader.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 8px;' } });
            rightControls.createEl('span', { text: typeBadge, attr: { style: 'font-size: 0.75em; padding: 2px 6px; background: var(--interactive-accent); color: var(--text-on-accent); border-radius: 4px;' } });

            const cmdDel = rightControls.createEl('button', { text: '✖', attr: { style: 'font-size: 0.8em; padding: 2px 8px;' } });
            cmdDel.onclick = async (event) => {
                event.stopPropagation();
                this.plugin.settings.stewards[index].commands.splice(cmdIndex, 1);
                await this.plugin.saveSettings();
                this.display();
            };

            const descPreview = cmd.detailPrompt.slice(0, 45) + (cmd.detailPrompt.length > 45 ? '...' : '');
            cmdCard.createEl('div', { text: descPreview || '未设置提示词', attr: { style: 'font-size: 0.85em; color: var(--text-muted); margin-top: 6px; line-height: 1.3;' } });

            cmdCard.onclick = () => {
                new LightningCommandEditModal(this.app, cmd, this.plugin.settings.tags, async (updatedCmd) => {
                    this.plugin.settings.stewards[index].commands[cmdIndex] = updatedCmd;
                    await this.plugin.saveSettings();
                    this.display();
                }).open();
            };
        });
    }
}
