# Marking Note - Development Plan & Checklist

## 1. Core Concept
A progressive AI knowledge annotation plugin for Obsidian that operates as a 4-stage state machine. It parses native Markdown highlights and footnotes, decouples metadata into inline footnotes, and offloads heavy rich-text AI responses into safe Callout blocks.

---

## 2. Architecture Overview

### Data Flow
```
User selects text → FloatingMenu appears → User clicks 🪄/⚡ →
handleAIAnnotation() wraps selection as ==text==[^[0][#ID]] →
AIClient sends contextual request → Response parsed into summary + richText →
Inline marker updated to [^[1][#ID] summary] → Callout appended to bottom vault
```

### Files
| File | Purpose |
|---|---|
| `main.ts` | Plugin entry, settings interfaces, Settings UI, handleAIAnnotation |
| `src/ai.ts` | AI client, prompt construction, response parser, connection test |
| `src/cm6.ts` | CM6 ViewPlugin, decorations, CapsuleWidget, floating menu trigger |
| `src/ui.ts` | FloatingMenu, PopoverEditor, LightningCommand dropdown |
| `src/sidebar.ts` | Sidebar view with dynamic refresh, stats, click-to-jump |
| `src/storage.ts` | Callout CRUD, vault separator, range finder |
| `src/state.ts` | MarkState enum, MarkingNode interface, regex parser |
| `styles.css` | All visual styles, animations, capsule/popover/menu/sidebar |

---

## 3. Implementation Checklist

### A. 数据模型与接口
- [x] `ModelProvider` 接口 (id, name, baseURL, apiKey, modelId)
- [x] `LightningCommand` 接口 (id, name, icon, detailPrompt, param overrides)
- [x] `StewardConfig` 增加 `boundModelProviderId` 与 `commands[]`
- [x] `MarkingNoteSettings` 改为 `modelProviders[]` 数组
- [x] 向后兼容处理（loadSettings 中确保数组存在）
- [ ] Debug: 安装到 Obsidian，验证旧配置不丢失

### B. 多模型管理
- [x] 模型提供商增删改 UI（卡片式）
- [x] 默认模型标记与切换
- [x] API 连通性测试按钮 (`testConnection`)
- [x] 管家级模型绑定下拉框
- [x] Provider 回退逻辑 (`getProviderForSteward`)
- [ ] Debug: 添加 Ollama/DeepSeek 模型，验证绑定与回退

### C. 管家 (Steward) 系统
- [x] 管家增删改 UI（卡片式）
- [x] 活跃管家选择下拉框
- [x] Icon/Emoji 编辑入口
- [x] 上下文截断长度滑动条 (0-5000)
- [x] Temperature / TopP 滑动条
- [x] 思考预算、脚注长度配置
- [ ] Debug: 新建多个管家，切换后验证 AI 行为差异

### D. 快捷指令 (Lightning Commands)
- [x] 快捷指令增删改 UI（嵌套在管家卡片内）
- [x] 指令级参数覆写字段
- [x] AI 详细内容指令 (detailPrompt)
- [x] 悬浮菜单 ⚡ 下拉触发
- [ ] Debug: 创建"翻译"指令，验证 temperature 覆写生效

### E. CM6 编辑器引擎
- [x] 修复 CapsuleWidget `view` 为 null 的 bug
- [x] 改用 ViewPlugin 构建装饰器（替代 StateField）
- [x] 事件委托处理胶囊点击
- [x] Widget `eq()` 比较防止不必要重渲染
- [x] 状态 0-3 高亮样式与胶囊样式
- [x] 呼吸灯动画 (State 2)
- [ ] Debug: 在 Live Preview 模式下验证胶囊可见且可点击

### F. 悬浮菜单
- [x] 划词 200ms 后弹出
- [x] 🪄 分析按钮
- [x] ⚡ 快捷指令下拉
- [x] ✖ 关闭按钮
- [ ] 🏷️ 管家切换按钮（暂缓，可通过设置切换）
- [ ] 🗑️ 删除高亮按钮
- [ ] Debug: 验证各按钮在不同主题下可见

### G. Popover 编辑窗
- [x] 基础弹窗容器 + 毛玻璃效果
- [x] Header: ID 显示 + 复制按钮 + 关闭按钮
- [x] Body: Textarea 编辑
- [x] Footer: 多轮对话输入框（事件派发）
- [x] 可拖拽 Header
- [x] 视口边界检测
- [x] syncToBottom 双向同步（通过 CM6 Transaction）
- [x] 弹出入场动画
- [ ] Body 阅读态（Markdown 渲染）vs 编辑态切换
- [ ] 归档按钮 / Pin 按钮
- [ ] Debug: 在小窗口中编辑验证底部 Callout 同步变更

### H. Sidebar 侧边栏
- [x] 动态刷新（active-leaf-change + vault modify 事件）
- [x] 状态统计面板（各状态数量 badge）
- [x] 点击条目跳转到教育器高亮位置
- [x] 手动刷新按钮
- [x] Hover 效果 + 缩放动画
- [ ] 状态筛选/过滤
- [ ] Debug: 切换文件后验证侧边栏自动刷新

### I. 数据格式与存储
- [x] 行内格式 `==text==[^[State][#ID] Summary]`
- [x] 底部 Callout `> [!ai-footnote]- #ID`
- [x] 华丽分割线 (AI Data Vault 注释)
- [x] ID 改为 6 位随机（时间戳 base36 + 随机数）
- [ ] Debug: 手动创建标注，验证 Obsidian 阅读模式下 Callout 折叠

### J. AI 客户端
- [x] 上下文截取（前后文）
- [x] 快捷指令 prompt 覆写与注入
- [x] 多策略响应解析器（3 级 fallback）
- [x] 连通性测试方法
- [x] 错误时 Notice 提示
- [ ] Debug: 实际调用 API，验证脚注格式与富文本分离

---

## 4. Debug 验证流程

1. **构建验证**: `npm run build` 无错误 ✅
2. **安装测试**: 将 `main.js`, `manifest.json`, `styles.css` 复制到 Obsidian Vault 的 `.obsidian/plugins/marking-note/`
3. **设置页验证**: 打开 Obsidian Settings → Marking Note → 确认所有 UI 元素可见
4. **模型连通**: 添加真实 API Key，点击"测试连通"按钮
5. **划词触发**: 在编辑器中选中文本，验证悬浮菜单弹出
6. **AI 标注**: 点击"🪄 分析"，验证行内标记与底部 Callout 生成
7. **胶囊点击**: 点击胶囊标签，验证 Popover 弹窗弹出
8. **双向同步**: 在 Popover 中编辑，验证底部 Callout 同步更新
9. **侧边栏**: 打开侧边栏，验证条目列表与点击跳转
