import type {
	InlineStewardConfig,
	LightningCommand,
	StewardConfig,
} from "../domain/types";

export const MAX_STEWARD_COMMANDS = 8;
export const DEFAULT_STEWARD_COMMANDS = 6;

const CONVERSATION_PRESETS = [
	["核心解释", "🔍", "解释选中文本的核心含义、关键概念和成立条件。"],
	["逻辑梳理", "🗺️", "梳理选中文本的论证结构、因果关系和关键步骤。"],
	["举例说明", "💡", "为选中文本提供由浅入深的具体例子，帮助理解其实际含义。"],
	[
		"联系上下文",
		"🔗",
		"说明选中文本与上下文的关系，以及它在整体内容中的作用。",
	],
	["批判性阅读", "⚖️", "指出选中文本的前提、证据、局限和可能的反例。"],
	["生成练习", "✏️", "围绕选中文本生成一道理解性练习，并提供答案和解析。"],
] as const;

const INLINE_PRESETS = [
	["提取要点", "🎯", "提取原文最重要的 3-5 个要点，保持原意并使用简洁条目。"],
	["精炼总结", "📝", "将原文精炼为核心结论，删除重复和无关表达。"],
	["逻辑整理", "🔄", "优化原文的逻辑顺序和衔接，不改变原始含义。"],
	["通俗转换", "🗣️", "将原文改写为非专业读者也能理解的自然表达。"],
	["Markdown结构化", "Ⓜ️", "将原文整理为清晰的 Markdown 标题、列表和重点结构。"],
	["思维导图", "📊", "将原文提炼为 Mermaid mindmap 代码，只输出可执行代码。"],
] as const;

const AUGMENT_PRESETS = [
	["补充背景", "🌐", "补充理解这段内容所需的历史、领域或上下文背景。"],
	["补充定义", "📖", "补充文中关键术语、人物、机构或概念的准确释义。"],
	["补充例子", "💡", "补充与原文观点相关的具体案例、类比或应用场景。"],
	["补充步骤", "🧭", "将原文隐含的方法、流程或行动步骤补充完整。"],
	["补充反例", "⚖️", "补充可能不成立的边界条件、反例和需要注意的例外。"],
	["补充延伸", "📚", "补充值得继续阅读、练习或探索的相关方向。"],
] as const;

function createPresetCommands(
	stewardId: string,
	type: "conversation" | "augment",
): LightningCommand[] {
	const presets =
		type === "conversation" ? CONVERSATION_PRESETS : AUGMENT_PRESETS;
	return presets.map(([name, icon, detailPrompt], index) => ({
		id: `${stewardId}-${type}-${index + 1}`,
		name,
		icon,
		detailPrompt,
		type,
		enabled: true,
		contextMode: "full",
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
	};
}

function fillCommands(
	stewardId: string,
	commands: LightningCommand[],
	type: "conversation" | "augment",
): LightningCommand[] {
	const byId = new Map<string, LightningCommand>();
	for (const command of commands) {
		if (!byId.has(command.id))
			byId.set(command.id, normalizeCommand(command, type));
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

export function createDefaultAugmentCommands(
	stewardId: string,
): LightningCommand[] {
	return createPresetCommands(stewardId, "augment");
}

export function normalizeInlineCommands(steward: InlineStewardConfig): void {
	const commands = Array.isArray(steward.commands) ? steward.commands : [];
	const byId = new Map<string, LightningCommand>();
	for (const command of commands) {
		if (!byId.has(command.id)) {
			byId.set(command.id, {
				...command,
				type: "inline-modify",
				enabled: command.enabled !== false,
			});
		}
	}
	for (const [index, [name, icon, detailPrompt]] of INLINE_PRESETS.entries()) {
		if (byId.size >= DEFAULT_STEWARD_COMMANDS) break;
		const id = `inline-default-${index + 1}`;
		if (!byId.has(id)) {
			byId.set(id, {
				id,
				name,
				icon,
				detailPrompt,
				type: "inline-modify",
				enabled: true,
				contextMode: "writingOnly",
			});
		}
	}
	steward.commands = Array.from(byId.values()).slice(0, MAX_STEWARD_COMMANDS);
}
