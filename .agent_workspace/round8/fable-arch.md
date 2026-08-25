# Round 8 — R8-fable-arch：`studio-editor-helpers.ts` 门面拆分

MODEL_SLUG: claude-fable-5-thinking-xhigh

## 摘要

`src/lib/studio-editor-helpers.ts` 401 行 → **215 行门面**（−186），按领域拆出 2 个新模块。公开导出完全不变（全部经门面 re-export），`listContentLayoutIssues` 签名未动，所有 12 个既有导入方（App.tsx、6 个 hooks、3 个 studio-editor 组件、测试）零改动。

## 拆分结果

| 文件 | 行数 | 内容 |
| --- | --- | --- |
| `src/lib/studio-editor-helpers.ts` | 215 | 门面：协作打包/门槛/差分、画布吸附与卡片冻结、素材使用图与去重入库、`listContentLayoutIssues`、选中解析与会话快照、历史摘要；顶部 re-export 两个子模块 |
| `src/lib/studio-editor-helpers-transactions.ts` | 118 | 全部 8 个 `ProjectTransaction` 工厂（应用内置模板、切换数据呈现、学生追加/替换/编辑/显隐/删除/批量显隐）+ `StudentEditPatch` |
| `src/lib/studio-editor-helpers-templates.ts` | 87 | `buildResolvedTemplate`、`buildCustomTemplateDraft` |

拆分原则：`create*Transaction` 工厂全部集中一处（消费方主要是 `use-project-actions` / App）；模板文档构建独立成模块（消费方 `LegacySidebarPanels` / 模板另存）。其余留在门面的函数彼此共享 `WorkspaceStateSnapshot` / `SceneSelection` 等类型，继续内聚。

- 代码为**逐字搬移**，无任何逻辑改动；`verbatimModuleSyntax` 下类型用 `export type { StudentEditPatch }` 单独 re-export。
- 门面卸掉了 `applyDataViewChange`、`createId`、`createDefaultScene`、`createSystemTemplate`、`mergeTemplateDocuments`、`createCustomTemplateFromProject` 等 6 个仅被搬走代码使用的导入。

## 验证（failure → cause → fix → recheck）

三项检查**首轮即绿**，无失败链：

1. `npx vitest run src/lib/studio-editor-helpers.test.ts src/hooks/use-project-health.ts`
   → **1 文件 / 23 测试全过**。测试经门面导入（含被搬走的 `createStudentUpdateTransaction`），re-export 路径被实际执行。`src/hooks/use-project-health.ts` 本身非测试文件，作为过滤器不匹配任何测试；其消费的 `listContentLayoutIssues` 留在门面且签名未变。
2. `npx tsc --noEmit -p tsconfig.app.json` → **0 错误**。
3. `npx eslint` 三个改动/新建文件 → **0 问题**。

注：工作区内另有他人在途改动（`resource-health`、`print-preflight` 等未提交文件）；tsc 全量通过说明与之无冲突。

## 交付与回滚

- **验收方式**：上述三条命令 + 本报告；行为等价重构，无 UI/数据/API 形状变更，无新增验收项。
- **回滚方案**：还原 `src/lib/studio-editor-helpers.ts` 并删除 `src/lib/studio-editor-helpers-{transactions,templates}.ts` 即完全还原；无数据/导出格式/API 形状变更。
- 按本轮指令**未提交**（git 操作在 FORBIDDEN 列表）。

## 遗留观察（未动，非本轮授权）

- Round 7 提到的 `object-in-bleed` 接线点仍在门面 `listContentLayoutIssues`（canvas 已传 `printBleedMm`），后续接线不受本次拆分影响。
- `use-project-health.ts` 尚无独立测试文件；如需补测，`listContentLayoutIssues` 现可从门面或直接从其定义处导入。
