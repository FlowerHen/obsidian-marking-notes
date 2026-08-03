import type { MarkingTag } from './types';

export const COLOR_PALETTE: { name: string; value: string }[] = [
    { name: '荧光黄', value: 'rgba(255, 255, 100, 0.45)' },
    { name: '荧光粉', value: 'rgba(255, 130, 180, 0.40)' },
    { name: '荧光橙', value: 'rgba(255, 180, 80, 0.45)' },
    { name: '荧光绿', value: 'rgba(130, 255, 130, 0.40)' },
    { name: '荧光蓝', value: 'rgba(100, 200, 255, 0.40)' },
    { name: '荧光紫', value: 'rgba(200, 140, 255, 0.40)' },
    { name: '柔和红', value: 'rgba(220, 80, 80, 0.25)' },
    { name: '柔和蓝', value: 'rgba(80, 120, 220, 0.25)' },
    { name: '柔和绿', value: 'rgba(60, 180, 100, 0.25)' },
    { name: '柔和紫', value: 'rgba(160, 80, 200, 0.25)' },
    { name: '薄荷绿', value: 'rgba(100, 220, 200, 0.30)' },
    { name: '琥珀金', value: 'rgba(220, 180, 60, 0.35)' },
];

export const TEXT_COLOR_PALETTE: { name: string; value: string }[] = [
    { name: '默认', value: 'inherit' },
    { name: '深灰', value: '#333333' },
    { name: '纯黑', value: '#000000' },
    { name: '暗红', value: '#9b2226' },
    { name: '靛蓝', value: '#1d3557' },
    { name: '深绿', value: '#2d6a4f' },
    { name: '暗紫', value: '#5a189a' },
    { name: '棕褐', value: '#6b4226' },
    { name: '白色', value: '#ffffff' },
];

export const EMOJI_CATEGORIES = [
    { name: '常用', emojis: ['🪄', '⚡', '🤖', '💡', '🔥', '❓', '✅', '📌', '🔗', '🏷️', '🎯', '💭'] },
    { name: '学术', emojis: ['📚', '📖', '🔬', '🧪', '📐', '📊', '🔍', '🌐', '🎓', '📋', '📉', '📈'] },
    { name: '工具', emojis: ['✏️', '🔧', '⚙️', '🛡️', '🚀', '💬', '📝', '📦', '🗂️', '🗃️', '💻', '📱', '📡', '🎙️', '✂️', '🔨'] },
    { name: '象征', emojis: ['🧠', '🧩', '🎨', '💎', '🌟', '❤️', '🌍', '⏰', '🌈', '🎭', '⚖️', '🎪', '🌸', '🍀', '🦋', '🎵', '💰', '🔑', '🏆', '🧲', '🚩', '🏁'] },
    { name: '状态', emojis: ['🟢', '🟡', '🔴', '🔵', '🟣', '🟠', '✅', '❌', '⚠️', '⛔', 'ℹ️', '🆗'] }
];

export const EMOJI_SET = EMOJI_CATEGORIES.flatMap(c => c.emojis);

export const DEFAULT_TAGS: MarkingTag[] = [
    { id: 'tag-concept', name: '概念', emoji: '💡', color: 'rgba(255, 255, 100, 0.45)', textColor: 'inherit', style: 'highlight' },
    { id: 'tag-important', name: '重点', emoji: '🔥', color: 'rgba(255, 180, 80, 0.45)', textColor: 'inherit', style: 'highlight' },
    { id: 'tag-question', name: '疑问', emoji: '❓', color: 'rgba(255, 130, 180, 0.40)', textColor: 'inherit', style: 'dashed' },
    { id: 'tag-reference', name: '引用', emoji: '📎', color: 'rgba(80, 120, 220, 0.25)', textColor: 'inherit', style: 'underline' },
    { id: 'tag-todo', name: '待办', emoji: '✅', color: 'rgba(130, 255, 130, 0.40)', textColor: 'inherit', style: 'semi-transparent' },
];

export const DEFAULT_SUMMARY_SYSTEM_PROMPT_TEMPLATE = `你是一个深度绑定的个人知识管理（PKM）分析引擎。你的任务是对用户选中的文本生成一个高度精炼的单行摘要标题。

【绝对输出规则 — 极为严格】
1. 你的整个回复必须是且仅是单行纯文本，严禁换行，严禁 Markdown 格式。
2. 字数限制在 __FOOTNOTE_LENGTH__ 字以内。
3. 不得输出任何寒暄、解释、序号或额外段落。
4. 输出语言必须为：__TARGET_LANGUAGE__。
5. 必须严格遵循以下格式，花括号内填入摘要内容：
[1][__FOOTNOTE_ID__] {__DEFAULT_SUMMARY_PROMPT__}`;

export const DEFAULT_ANNOTATION_SYSTEM_PROMPT_TEMPLATE = `你是一个深度绑定的个人知识管理（PKM）分析引擎。你的任务是处理用户提供的文本片段，并严格按照以下规定的格式输出结果。

【绝对输出规则】
你的回复必须严格包含两部分，且顺序不可颠倒。不要输出任何寒暄或额外的解释。
输出语言必须为：__TARGET_LANGUAGE__。

=== PART1 ===
必须仅为单行纯文本，严禁换行，字数限制在 __FOOTNOTE_LENGTH__ 以内。必须严格遵循以下格式：
[1][__FOOTNOTE_ID__] {__DEFAULT_SUMMARY_PROMPT__}

=== PART2 ===
第二部分的输出可以开始包含 Markdown 语法。表格、Mermaid 图表等多级排版也被允许使用。
但最重要的是：你必须严格遵循用户的具体指示来生成或修改这一部分的文本内容：

__DYNAMIC_PROMPTS____DETAIL_INSTRUCTION__`;

export const DEFAULT_INLINE_REWRITE_SYSTEM_PROMPT_TEMPLATE = `你是一个强大的底层文本处理引擎。用户选中了一段文本并给你了一条处理指令。请严丝合缝地执行用户的指令去改写原文。

⚠️ 【系统最高安全级别规定】
1. 你的输出将完全、直接地覆盖用户的原文。
2. 绝对禁止输出任何寒暄、解释、评论、或者你的“思考过程”。
3. 绝对禁止在不需要时主动添加 Markdown 代码块标记（如 \`\`\` 等）。
4. 尽可能保持原文本身的排版特征。`;
