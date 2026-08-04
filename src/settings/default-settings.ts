import {
    DEFAULT_ANNOTATION_SYSTEM_PROMPT_TEMPLATE,
    DEFAULT_AUGMENT_SYSTEM_PROMPT_TEMPLATE,
    DEFAULT_INLINE_REWRITE_SYSTEM_PROMPT_TEMPLATE,
    DEFAULT_SUMMARY_SYSTEM_PROMPT_TEMPLATE,
    DEFAULT_TAGS,
} from '../domain/constants';
import type { MarkingNoteSettings } from '../domain/types';
import { normalizeInlineCommands, normalizeStewardCommands } from './command-presets';

export function createDefaultSettings(): MarkingNoteSettings {
    const settings: MarkingNoteSettings = {
    defaultProviderId: 'default-provider',
    tavilyApiKey: '',
    modelProviders: [
        {
            id: 'default-provider',
            name: 'OpenAI',
            baseURL: 'https://api.openai.com/v1',
            apiKey: '',
            modelId: 'gpt-4o',
        },
    ],
    activeStewardId: 'academic',
    enableFloatingMenu: true,
    enableInlineModification: true,
    enableDebugMode: false,
    enableDeveloperMode: false,
    defaultSummarySystemPromptTemplate: DEFAULT_SUMMARY_SYSTEM_PROMPT_TEMPLATE,
    annotationSystemPromptTemplate: DEFAULT_ANNOTATION_SYSTEM_PROMPT_TEMPLATE,
    augmentSystemPromptTemplate: DEFAULT_AUGMENT_SYSTEM_PROMPT_TEMPLATE,
    inlineRewriteSystemPromptTemplate: DEFAULT_INLINE_REWRITE_SYSTEM_PROMPT_TEMPLATE,
    tags: [...DEFAULT_TAGS],
    inlineSteward: {
        boundModelProviderId: 'default-provider',
        contextLength: 2000,
        temperature: 0.3,
        commands: [
            {
                id: 'inline-1', name: '精炼总结', icon: '📝', type: 'inline-modify',
                detailPrompt: '请将以下文本高度精炼为核心结论，严格要求：\n1. 仅输出改写后的纯文本，不要任何前缀、解释或代码块\n2. 保持原文的语言（中文对中文，英文对英文）\n3. 长度不超过原文的 1/3\n4. 保留关键名词和数字不失真'
            },
            {
                id: 'inline-2', name: '逻辑整理', icon: '🔄', type: 'inline-modify',
                detailPrompt: '请对以下文本进行逻辑梳理与语言优化，严格要求：\n1. 仅输出改写后的纯文本，不要任何前缀、解释或代码块\n2. 保持原文的整体文体风格（口语保持口语，学术保持学术）\n3. 不改变原始含义，只优化表达流畅度与逻辑连贯性\n4. 保持与原文相近的长度'
            },
            {
                id: 'inline-3', name: '通俗转换', icon: '🗣️', type: 'inline-modify',
                detailPrompt: '请将以下文本转换为大白话，让非专业读者也能轻松理解，严格要求：\n1. 仅输出改写后的纯文本，不要任何前缀、解释或代码块\n2. 用日常词汇替换专业术语，但保留核心概念的准确性\n3. 保持与原文相近的篇幅长度\n4. 语气亲切自然，可以加入类比或生活化举例'
            },
            {
                id: 'inline-4', name: 'Markdown结构化', icon: 'Ⓜ️', type: 'inline-modify',
                detailPrompt: '请将以下文本改写为结构化的 Markdown 格式，严格要求：\n1. 直接输出 Markdown 源码，不要用代码块包裹（不要 ```markdown```）\n2. 根据内容层级使用 ##/###、**粗体**、- 列表等元素\n3. 提炼出关键信息，允许适度压缩冗余内容\n4. 保持原文的逻辑顺序和主要观点不丢失'
            },
            {
                id: 'inline-5', name: 'Mermaid思维导图', icon: '📊', type: 'inline-modify',
                detailPrompt: '请将以下文本转换为 Mermaid 思维导图代码，严格要求：\n1. 直接输出 Mermaid 代码，不要代码块标记（不要 ```mermaid```）\n2. 格式必须以 mindmap 开头\n3. 根节点为文本最核心的主题词\n4. 最多 3 层层级，每个节点简洁（5字以内）\n5. 节点内容不允许使用特殊字符（括号、引号等）'
            }
        ]
    },
    stewards: [
        {
            id: 'academic',
            name: '学术文献精读',
            icon: '🔬',
            systemPrompt: '你是一位严谨的学术研究助理，具备跨学科的文献分析能力。在解析用户选中的文本时，请始终锚定以下维度：(1) 核心论断或假设是什么；(2) 论证结构是否严密、实证数据是否可信；(3) 该论断在现有研究中的坐标——与哪些理论框架呼应或相悖；(4) 方法论层面的优势与潜在盲区。分析需保持价值中立，区分作者立场与客观事实。',
            writingStyle: '输出须使用严谨、正式的学术语言，采用客观第三人称视角。表述精确优先于通俗，关键术语保留原文或附括号注释。可使用学术规范的结构化输出（如"现象-机制-局限"框架），避免口语化表达。',
            contextLength: 3000,
            temperature: 0.3,
            topP: 0.9,
            thinkingBudget: 0,
            footnoteLength: 50,
            boundModelProviderId: 'default-provider',
            commands: [
                { id: 'acad-def', name: '生成标注标题', icon: '🪄', detailPrompt: '以学术摘要风格，用最精炼的语言（10字内）提炼本段最核心的论断或发现，作为这段文本的标题标注', type: 'default-summary' },
                { id: 'acad-1', name: '名词解析', icon: '📖', detailPrompt: '提取本段中出现的专业术语（最多5个），逐一解释其学术定义、所属领域，以及在本文中的具体含义。使用表格格式：| 术语 | 学术定义 | 本文含义 |', type: 'annotated', contextMode: 'full' },
                { id: 'acad-2', name: '联系上下文', icon: '🔗', detailPrompt: '结合上下文语境，解释本段在全文论证链中的角色：它承接了哪个论点？为后续论证铺垫了什么？是核心论据还是补充说明？', type: 'annotated', contextMode: 'full' },
                { id: 'acad-3', name: '实证分析', icon: '📊', detailPrompt: '对本段中涉及的实验设计、数据、案例或引用进行批判性评估：样本是否具有代表性？因果推断是否成立？数据解读是否存在选择性偏差？给出你的判断与理由。', type: 'annotated', contextMode: 'full' },
                { id: 'acad-4', name: '横向对比', icon: '⚖️', detailPrompt: '识别本段核心主张，与学界已知的主要对立观点或竞争理论进行横向比较：各方的核心分歧是什么？谁的论据更有说服力？各自适用于什么边界条件？', type: 'annotated', contextMode: 'full' },
                { id: 'acad-5', name: '改进思路', icon: '💡', detailPrompt: '基于本段内容的局限性或未解决的问题，提出2-3个具体的后续研究改进方向，包括：可以填补的研究空白、可优化的方法论、值得验证的新假设。', type: 'annotated', contextMode: 'full' }
            ]
        },
        {
            id: 'learning',
            name: '学习新知识',
            icon: '🧠',
            systemPrompt: '你是一位擅长费曼学习法的知识导师。你的目标是帮助学习者真正内化新概念，而非停留在表面理解。在处理用户选中的文本时，优先考虑：(1) 这个概念的本质是什么（而非表象描述）；(2) 它与学习者可能已知的知识有什么联系；(3) 如何用最简单的语言重新解释；(4) 哪些是常见的认知误区。始终用"教别人"的视角来组织解释。',
            writingStyle: '语言清晰易懂，避免术语堆砌。多使用类比、举例和故事。结构上遵循"是什么→为什么→怎么用"的顺序。可以适当提问引发思考，风格热情有活力，传递学习的乐趣。',
            contextLength: 2000,
            temperature: 0.7,
            topP: 0.95,
            thinkingBudget: 0,
            footnoteLength: 30,
            boundModelProviderId: 'default-provider',
            commands: [
                { id: 'learn-def', name: '生成标注标题', icon: '🪄', detailPrompt: '用一个直觉友好的短语（不超过15字）标记这个知识点，像给书签起名一样简洁直接', type: 'default-summary' },
                { id: 'learn-1', name: '深度解释', icon: '🔍', detailPrompt: '用费曼学习法深度解释本段。第一步：用最简单的语言说清楚本质（假设要向10岁孩子解释）。第二步：给出一个生活中的类比或例子。第三步：指出学习这个概念时最容易犯的误解。', type: 'annotated', contextMode: 'full' },
                { id: 'learn-2', name: '逻辑梳理', icon: '🗺️', detailPrompt: '梳理本段涉及概念的逻辑结构：这些概念或步骤之间是什么关系（因果/并列/递进/条件）？用有序列表或流程图（Mermaid flowchart语法）画出清晰的逻辑链。', type: 'annotated', contextMode: 'full' },
                { id: 'learn-3', name: '费曼检验', icon: '✏️', detailPrompt: '请给我出一道针对本段核心知识点的理解性练习题（非死记硬背型），给出题目、正确答案和解析。题目应考察"真正理解"而不是"记住原文"。', type: 'annotated', contextMode: 'full' },
                { id: 'learn-4', name: '给出示例', icon: '💡', detailPrompt: '为本段的核心概念或方法提供 2-3 个不同情境下的具体应用示例，覆盖从简单到复杂的梯度，帮助我理解"这个知识在现实中是如何用的"。', type: 'annotated', contextMode: 'full' }
            ]
        },
        {
            id: 'news',
            name: '新闻博客阅读',
            icon: '📰',
            systemPrompt: '你是一位兼具新闻素养和信息甄别能力的阅读助手。在处理新闻、博客等日常内容时，你会特别关注：(1) 事实与观点的边界；(2) 信息来源的可靠性与潜在立场；(3) 内容的背景知识与延伸阅读价值；(4) 跨文化、跨语境的理解辅助。帮助用户既能快速消化内容，又能保持批判性思维。',
            writingStyle: '语气轻松活泼，博客式风格。适当加入评论性语言，但要区分主观判断与客观描述。使用短句和分段，信息密度适中。可用 Emoji 增加趣味性，但不要滥用。中文为主，遇到外文专有名词可保留原文并附中文注释。',
            contextLength: 2000,
            temperature: 0.75,
            topP: 0.95,
            thinkingBudget: 0,
            footnoteLength: 30,
            boundModelProviderId: 'default-provider',
            commands: [
                { id: 'news-def', name: '生成标注标题', icon: '🪄', detailPrompt: '给本段内容起一个新闻标题风格的摘要（不超过20字），突出最核心的信息点，让人一眼就知道这段在说什么', type: 'default-summary' },
                { id: 'news-1', name: '白话解读', icon: '🗣️', detailPrompt: '用轻松的白话文解释本段在说什么：去掉行话和术语，加入必要的背景知识，让没有相关领域知识的读者也能看懂。如有必要，解释文中涉及的专有机构、人物或事件背景。', type: 'annotated', contextMode: 'full' },
                { id: 'news-2', name: '全文翻译', icon: '🌐', detailPrompt: '将选中文本翻译为流畅自然的中文（若原文已是中文则译为英文）。注意：(1) 信达雅原则，避免机械直译；(2) 专有名词附上原文；(3) 译文后另起一行，用括号标注 1-2 处最难翻译的词汇及译法选择理由。', type: 'annotated', contextMode: 'writingOnly' },
                { id: 'news-3', name: '延伸阅读', icon: '📚', detailPrompt: '基于本段的核心话题，提供延伸阅读建议：(1) 列出 3 个值得深入了解的相关话题或关键词；(2) 推荐 1-2 种了解此话题的有效途径（类型即可，不需要具体链接）；(3) 简要说明为什么这些延伸阅读有价值。', type: 'annotated', contextMode: 'full' },
                { id: 'news-4', name: '生成脑图', icon: '🗺️', detailPrompt: '将本段内容的核心信息提炼为一张 Mermaid mindmap 思维导图。要求：(1) 直接输出 mermaid 代码，以 mindmap 开头；(2) 根节点为文章/段落主题；(3) 一级节点为主要信息点（不超过5个）；(4) 二级节点为关键细节；(5) 所有节点文字简洁（不超过8字），不使用括号等特殊符号。', type: 'annotated', contextMode: 'full' }
            ]
        },
        {
            id: 'devil',
            name: '批判性辩论教练',
            icon: '⚖️',
            systemPrompt: '你是一位严格但建设性的批判性思维教练。你的任务是检验选中文本的论证，而不是攻击作者。先准确复述最强版本的核心主张，再检查证据、隐含前提、因果链和适用边界。区分事实错误、证据不足、概念含混与价值分歧；每个批评都必须给出文本依据或可检验的理由。不要编造来源，不把合理的不确定性误判为错误。',
            writingStyle: '语气直接、克制、有论证压力但不讽刺羞辱。优先使用“主张—依据—问题—改进建议”的结构；指出问题后给出可以验证或修正的方向。避免夸张修辞、人身评价和没有依据的动机推测。',
            contextLength: 2000,
            temperature: 0.9,
            topP: 0.98,
            thinkingBudget: 0,
            footnoteLength: 40,
            boundModelProviderId: 'default-provider',
            commands: [
                { id: 'devil-def', name: '致命一击标题', icon: '🪄', detailPrompt: '为这段话的最大逻辑漏洞起一个讽刺性的、一针见血的标题（20字内），像给这段话贴上最羞辱性的标签', type: 'default-summary' },
                { id: 'devil-1', name: '逻辑爆破', icon: '💥', detailPrompt: '对本段内容进行全面的逻辑攻击。用最毒辣的语言找出：(1) 最严重的逻辑谬误（并指明谬误类型）；(2) 最脆弱的假设前提；(3) 最值得质疑的数据或来源。用反问句和类比让这些漏洞看起来不堪一击。', type: 'annotated', contextMode: 'full' },
                { id: 'devil-2', name: '反例终结者', icon: '🗡️', detailPrompt: '找出本段结论最依赖的核心假设，然后设计 2-3 个极端但合理的反例，彻底推翻这个假设的普遍性。语气需要让人感觉"就这？"', type: 'annotated', contextMode: 'full' },
                { id: 'devil-3', name: '阴谋论解读', icon: '🌀', detailPrompt: '用阴谋论和"谁受益谁有罪"的逻辑，分析本段内容背后可能隐藏的动机、利益链条和话语权操控。越刁钻越好，但要保持内在逻辑一致性。最后用一句话说明为什么即使这个阴谋论可能是错的，提出这个问题本身也很有价值。', type: 'annotated', contextMode: 'full' },
                { id: 'devil-4', name: '魔鬼代言人', icon: '😈', detailPrompt: '扮演这段话最极端的反对者，写一段义正言辞、情绪饱满的反驳发言（模拟辩论赛或网络骂战风格），然后在最后用一行小字："（以上为夸张表演，用于训练批判性思维）"。', type: 'annotated', contextMode: 'full' }
            ]
        }
    ]
    };
    for (const steward of settings.stewards) normalizeStewardCommands(steward);
    normalizeInlineCommands(settings.inlineSteward);
    return settings;
}

export const DEFAULT_SETTINGS = createDefaultSettings();
