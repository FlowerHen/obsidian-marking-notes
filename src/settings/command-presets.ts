import type {
	InlineStewardConfig,
	LightningCommand,
	LightningCommandVariable,
	StewardConfig,
} from "../domain/types";

export const MAX_STEWARD_COMMANDS = 8;
export const DEFAULT_STEWARD_COMMANDS = 6;

function normalizeCommandVariables(
	variables: LightningCommandVariable[] | undefined,
): LightningCommandVariable[] {
	return Array.isArray(variables)
		? variables.flatMap((variable) => {
				if (!variable || typeof variable.id !== "string" || !variable.id.trim()) return [];
				return [{
					...variable,
					id: variable.id.trim(),
					label: variable.label?.trim() || variable.id.trim(),
				}];
			})
		: [];
}

interface CommandPreset {
	name: string;
	icon: string;
	detailPrompt: string;
	variables?: LightningCommandVariable[];
	contextMode?: "full" | "writingOnly" | "none";
}

const CONVERSATION_PRESETS: CommandPreset[] = [
	{
		name: "论点与证据",
		icon: "⌕",
		detailPrompt:
			"识别选中文本的核心论点、支持证据和隐含前提。区分事实、推断与价值判断；如果证据不足，明确指出缺口。输出“核心论点 / 依据 / 未决问题”三段，避免复述原文。",
	},
	{
		name: "概念边界",
		icon: "◇",
		detailPrompt:
			"定义选中文本中的关键概念，说明其必要特征、容易混淆的近邻概念和适用边界。若原文使用了含混或偷换概念的表达，给出具体判断。",
	},
	{
		name: "机制链条",
		icon: "→",
		detailPrompt:
			"把选中文本还原为可检验的机制链条：起点条件、作用机制、中间环节、结果和反馈。标出哪些环节是文本明确说明的，哪些是你根据语境推断的。",
	},
	{
		name: "证据审计",
		icon: "▣",
		detailPrompt:
			"审查选中文本的证据质量：证据类型、样本或来源、推理是否越过证据边界、可能的混淆因素与替代解释。只基于文本可支持的内容作判断，不编造来源。",
	},
	{
		name: "应用迁移",
		icon: "↗",
		detailPrompt:
			"将选中文本中的方法或原则迁移到一个现实使用场景。先说明适用条件，再给出具体步骤、一个正例和一个不适用的情形，保持与原文概念严格对应。",
		variables: [
			{
				id: "scenario",
				label: "应用场景",
				type: "text",
				required: true,
				placeholder: "例如：整理研究计划",
			},
		],
	},
	{
		name: "反事实检验",
		icon: "⚖",
		detailPrompt:
			"构造一个能够检验选中文本核心主张的反事实或边界案例。说明它改变了哪个前提、预期会出现什么结果，以及这个案例对原结论的支持、限制或反驳。",
	},
];

const INLINE_PRESETS: CommandPreset[] = [
	{
		name: "压缩论旨",
		icon: "≡",
		detailPrompt:
			"将原文压缩为最小但完整的论旨。保留主语、谓语、因果关系、限定条件、数字和专有名词；删除修辞、重复和背景铺垫。只输出改写后的文本，长度控制在原文的 25%-40%。",
	},
	{
		name: "论证重写",
		icon: "✎",
		detailPrompt:
			"重写原文以增强论证清晰度。按“主张—依据—限定条件”的顺序组织句子，修复指代不明、逻辑跳跃和过长嵌套句，但不得改变事实、立场或结论强度。只输出改写结果。",
	},
	{
		name: "面向读者改写",
		icon: "Aa",
		detailPrompt:
			"面向指定读者改写原文。保留不可替代的专业术语，并在首次出现时用短语解释；把抽象表达换成可理解的具体表达。不得添加原文没有的事实，只输出改写结果。",
		variables: [
			{
				id: "audience",
				label: "目标读者",
				type: "select",
				required: true,
				options: [
					{ value: "初学者", label: "初学者" },
					{ value: "专业同行", label: "专业同行" },
					{ value: "管理者", label: "管理者" },
				],
			},
		],
	},
	{
		name: "逻辑分层",
		icon: "↕",
		detailPrompt:
			"在不改变原意的前提下重排原文。让每一段只承担一个功能，补足必要的连接词，明确因果、转折、条件和结论。保留原文信息，不输出标题或解释。",
	},
	{
		name: "Markdown结构化",
		icon: "▤",
		detailPrompt:
			"将原文整理为可直接阅读的 Markdown。根据内容使用合适的标题、列表、表格和加粗；不要为了形式拆散完整论证，不要删掉关键限定条件。直接输出 Markdown，不要包裹代码块。",
	},
	{
		name: "Mermaid思维导图",
		icon: "⌘",
		detailPrompt:
			"将原文转换为 Mermaid mindmap。必须输出完整且可直接预览的 fenced code block，第一行必须是 ```mermaid，代码主体以 mindmap 开始，最后一行是 ```。根节点概括主题，最多使用指定层级；节点文字简短，不使用会破坏 Mermaid 语法的括号、引号或冒号。",
		variables: [
			{
				id: "maxDepth",
				label: "最多层级",
				type: "select",
				required: true,
				defaultValue: "3",
				options: [
					{ value: "2", label: "2 层" },
					{ value: "3", label: "3 层" },
					{ value: "4", label: "4 层" },
				],
			},
		],
	},
];

const AUGMENT_PRESETS: CommandPreset[] = [
	{
		name: "补足背景",
		icon: "↺",
		detailPrompt:
			"补充理解原文所必需的背景，优先解释时间、制度、理论或上下文缺口。只写能帮助读者正确理解原文的内容，不把背景扩展成无关百科介绍。",
	},
	{
		name: "定义术语",
		icon: "⌗",
		detailPrompt:
			"补充原文中最关键的术语、人物、机构或概念定义。每个定义都要说明它在本段语境中的具体含义；遇到存在争议的定义，标出争议点。",
	},
	{
		name: "补充例子",
		icon: "◇",
		detailPrompt:
			"为原文中的核心概念补充指定数量的具体例子，例子必须覆盖真实使用情境，并明确指出它如何对应原文概念，避免只换词重复原文。",
		variables: [
			{
				id: "exampleCount",
				label: "例子数量",
				type: "select",
				required: true,
				defaultValue: "2",
				options: [
					{ value: "1", label: "1 个" },
					{ value: "2", label: "2 个" },
					{ value: "3", label: "3 个" },
				],
			},
		],
	},
	{
		name: "补全方法",
		icon: "⇢",
		detailPrompt:
			"把原文隐含的方法、流程或行动步骤补充成可执行说明。仅补足原文已经暗示的步骤，不擅自引入未经说明的工具或前提。",
	},
	{
		name: "边界与反例",
		icon: "⚠",
		detailPrompt:
			"补充原文结论成立所需的边界条件、失败情形和一个有代表性的反例。说明反例改变了哪个前提，以及读者应如何避免误用原结论。",
	},
	{
		name: "延伸路径",
		icon: "↗",
		detailPrompt:
			"围绕原文给出下一步可探索的方向：一个相关概念、一个可验证的问题和一个适合的实践或阅读路径。每项都说明它与原文的关系。",
	},
];

function createPresetCommands(
	stewardId: string,
	type: "conversation" | "augment",
): LightningCommand[] {
	const presets = type === "conversation" ? CONVERSATION_PRESETS : AUGMENT_PRESETS;
	return presets.map((preset, index) => ({
		id: `${stewardId}-${type}-${index + 1}`,
		name: preset.name,
		icon: preset.icon,
		detailPrompt: preset.detailPrompt,
		type,
		enabled: true,
		contextMode: preset.contextMode || "full",
		variables: normalizeCommandVariables(preset.variables),
	}));
}

function normalizeCommand(
	command: LightningCommand,
	type: "conversation" | "augment",
): LightningCommand {
	return {
		...command,
		type,
		enabled: command.enabled !== false,
		variables: normalizeCommandVariables(command.variables),
	};
}

function getBuiltInPreset(
	commandId: string,
	stewardId: string,
	type: "conversation" | "augment",
): CommandPreset | undefined {
	const shortId =
		stewardId === "academic"
			? "acad"
			: stewardId === "learning"
				? "learn"
				: stewardId;
	const prefixes = [`${stewardId}-${type}-`, `${shortId}-`];
	const prefix = prefixes.find((candidate) => commandId.startsWith(candidate));
	if (!prefix) return undefined;
	const index = Number(commandId.slice(prefix.length)) - 1;
	const presets = type === "conversation" ? CONVERSATION_PRESETS : AUGMENT_PRESETS;
	return Number.isInteger(index) && index >= 0 ? presets[index] : undefined;
}

function applyBuiltInPreset(
	command: LightningCommand,
	stewardId: string,
	type: "conversation" | "augment",
): LightningCommand {
	if (command.variables && command.variables.length > 0) return command;
	const preset = getBuiltInPreset(command.id, stewardId, type);
	if (!preset) return command;
	return {
		...command,
		name: preset.name,
		icon: preset.icon,
		detailPrompt: preset.detailPrompt,
		contextMode: preset.contextMode || command.contextMode || "full",
		variables: normalizeCommandVariables(preset.variables),
	};
}

function applyExperimentalDefaults(command: LightningCommand): LightningCommand {
	if (command.variables && command.variables.length > 0) return command;
	if (command.id === "learning-augment-3") {
		return {
			...command,
			detailPrompt:
				"为原文中的核心概念补充 {{exampleCount}} 个具体例子，例子必须覆盖真实使用情境，并明确指出它如何对应原文概念，避免只换词重复原文。",
			variables: normalizeCommandVariables(AUGMENT_PRESETS[2].variables),
		};
	}
	return command;
}

function fillCommands(
	stewardId: string,
	commands: LightningCommand[],
	type: "conversation" | "augment",
): LightningCommand[] {
	const byId = new Map<string, LightningCommand>();
	for (const command of commands) {
		if (!byId.has(command.id)) {
			const normalized = normalizeCommand(command, type);
			byId.set(
				command.id,
				applyExperimentalDefaults(applyBuiltInPreset(normalized, stewardId, type)),
			);
		}
	}

	for (const preset of createPresetCommands(stewardId, type)) {
		if (byId.size >= DEFAULT_STEWARD_COMMANDS) break;
		if (!byId.has(preset.id)) byId.set(preset.id, preset);
	}

	return Array.from(byId.values()).slice(0, MAX_STEWARD_COMMANDS);
}

export function normalizeStewardCommands(steward: StewardConfig): void {
	const legacyChat = Array.isArray(steward.commands) ? steward.commands : [];
	const conversation = legacyChat.filter(
		(command) =>
			command.type !== "default-summary" &&
			command.type !== "inline-modify" &&
			command.type !== "augment",
	);
	const augment = [
		...(Array.isArray(steward.augmentCommands) ? steward.augmentCommands : []),
		...legacyChat.filter((command) => command.type === "augment"),
	];
	const overflow = legacyChat
		.filter(
			(command) =>
				command.type !== "default-summary" && command.type !== "inline-modify",
		)
		.slice(MAX_STEWARD_COMMANDS);

	steward.commands = fillCommands(steward.id, conversation, "conversation");
	steward.augmentCommands = fillCommands(steward.id, augment, "augment");
	if (overflow.length > 0) {
		steward.legacyCommands = [...(steward.legacyCommands || []), ...overflow];
	}
}

export function createDefaultAugmentCommands(stewardId: string): LightningCommand[] {
	return createPresetCommands(stewardId, "augment");
}

export function normalizeInlineCommands(steward: InlineStewardConfig): void {
	const commands = Array.isArray(steward.commands) ? steward.commands : [];
	const byId = new Map<string, LightningCommand>();
	for (const command of commands) {
		if (!byId.has(command.id)) {
			let normalized: LightningCommand = {
				...command,
				type: "inline-modify",
				enabled: command.enabled !== false,
				variables: normalizeCommandVariables(command.variables),
			};
			const presetIndexMatch = /^(?:inline|inline-default)-(\d+)$/.exec(normalized.id);
			const presetIndex = presetIndexMatch ? Number(presetIndexMatch[1]) - 1 : -1;
		const preset = INLINE_PRESETS[presetIndex];
		if (preset && normalized.variables?.length === 0) {
				normalized = {
					...normalized,
					name: preset.name,
					icon: preset.icon,
					detailPrompt: preset.detailPrompt,
					contextMode: normalized.contextMode || preset.contextMode || "writingOnly",
					variables: normalizeCommandVariables(preset.variables),
				};
			}
			byId.set(command.id, normalized);
		}
	}
	for (const [index, preset] of INLINE_PRESETS.entries()) {
		if (byId.size >= DEFAULT_STEWARD_COMMANDS) break;
		const id = `inline-default-${index + 1}`;
		if (!byId.has(id)) {
			byId.set(id, {
				id,
				name: preset.name,
				icon: preset.icon,
				detailPrompt: preset.detailPrompt,
				type: "inline-modify",
				enabled: true,
				contextMode: "writingOnly",
				variables: normalizeCommandVariables(preset.variables),
			});
		}
	}
	steward.commands = Array.from(byId.values()).slice(0, MAX_STEWARD_COMMANDS);
}
