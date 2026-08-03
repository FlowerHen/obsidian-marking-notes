# e04s01 建立新标注结果格式并迁移当前文档

## 1. Business Narrative

用户需要一种稳定、可读、可编辑的标注格式，使正文标记、当前 AI 结果、状态和标签保持关联，同时允许用户主动迁移旧文档。

## 2. Actor

单用户、本地 Obsidian Vault 的阅读者和笔记作者。

## 3. User Story

作为 Obsidian 用户，我希望把当前文档中的旧标注迁移为新格式，以便使用新的 UI、状态和结果管理能力。

## 4. Trigger

用户在当前 Markdown 文档中执行“迁移当前文档”命令。

## 5. Preconditions

- 当前文档已打开并可编辑。
- 文档中存在旧版标注，或迁移命令可以明确报告没有可迁移内容。
- 用户已经确认迁移影响范围。

## 6. Main Flow

1. 用户执行迁移命令。
2. 系统统计旧标注、旧结果块和无法识别项。
3. 系统展示变更摘要并请求确认。
4. 用户确认后，系统将当前文档转换为新格式。
5. 系统把迁移作为一次编辑事务提交。
6. UI 刷新新标注、结果块和状态。

## 7. Alternate Flows

- 没有旧标注时显示无变更结果。
- 用户取消确认时不修改文档。
- 已是新格式的标注保持不变。

## 8. Exception Flows

- 发现无法安全解析的旧标记时，取消提交并报告位置。
- 结果块无法建立稳定 ID 时，取消提交并保留原文。
- Obsidian 编辑事务失败时，不显示迁移成功。

## 9. Data

- 正文中的稳定标注 ID。
- 文档底部的自定义 fenced result block。
- 结果块中的状态、标签、摘要和当前 Markdown 内容。
- 插件 data.json 中的对话历史关联。

## 10. Requirements

### MODIFIED: Annotation storage contract

**Before:** 当前系统使用 `state.ts` 解析行内标注，并使用 `ai-footnote` Callout 保存结果。

**After:** 新系统使用稳定行内 ID 和人类可读的 fenced result block，结果块保存状态、标签、摘要和当前 Markdown 结果。

### ADDED: Current-document migration

用户可以主动迁移当前文档；迁移前显示影响摘要，确认后原地执行，并作为一次可由 Ctrl+Z 撤回的编辑事务。

### ADDED: Reconciliation rules

正文标注、结果块和插件历史必须按稳定 ID 自动检测删除、移动和失效关联。

### REMOVED: Legacy format as the canonical contract

**Before:** `ai-footnote` Callout 和旧版行内格式是新增功能使用的默认数据契约。

**After:** （移除）旧格式只作为用户主动迁移的输入，不再作为新功能的长期规范。

- 只处理当前文档，不自动扫描 Vault。
- 不创建备份文件。
- 不能删除用户未识别为标注的普通 Markdown。

## 11. UX

迁移确认界面必须显示文档名、标注数量、结果块数量、跳过项和风险提示。

## 12. Compatibility

旧版标注可以被识别并转换；新格式必须能被编辑模式和阅读模式识别。

## 13. Performance

当前文档迁移应在正常阅读笔记规模下完成，不阻塞 UI；大文档需要显示进行中状态。

## 14. Security and Privacy

迁移不向网络发送文档内容，不创建额外副本，不扩大 data.json 的历史范围。

## 15. Observability

记录迁移开始、确认、成功、取消和失败的本地日志，并包含数量和错误位置。

## 16. Dependencies

- Obsidian 当前文档编辑 API。
- 新格式解析与序列化能力。
- 结果块与 data.json 关联服务。

## 17. Acceptance Criteria

### Scenario: 用户迁移当前旧格式文档

Given 当前文档包含可识别的旧版标注
When 用户确认执行“迁移当前文档”
Then 系统将标注转换为新格式
And 当前结果、状态、标签和稳定 ID 可被 UI 读取
And 整次迁移可通过一次 Ctrl+Z 撤回

### Scenario: 用户取消迁移

Given 系统已显示迁移摘要
When 用户取消确认
Then 文档内容保持完全不变
And 系统不创建备份文件

### Scenario: 迁移遇到无法识别内容

Given 文档包含无法安全解析的旧标记
When 用户确认迁移
Then 系统取消整次迁移
And 文档不留下部分转换结果
And Notice 指出无法解析的位置

## 18. Out of Scope

- 整个 Vault 批量迁移。
- 自动创建备份文件。
- 继续扩展旧格式。

## 19. Test Strategy

- 为格式解析、序列化、迁移和回滚编写单元测试。
- 使用真实 Markdown 样本验证混合旧新内容。
- 在 Obsidian 中验证一次 Ctrl+Z 整体撤回。

## 20. Definition of Done

- 新格式有明确解析、写入和删除规则。
- 当前文档迁移命令完成并有取消和失败回滚。
- 迁移结果在编辑模式和阅读模式正确显示。
- 自动化测试和 Obsidian 手动验证均通过。
