# 左右栏信息架构 — 实现计划（0.2.0）

> **For agentic workers:** 先读规格 [../specs/2026-08-26-left-right-rail-ia.md](../specs/2026-08-26-left-right-rail-ia.md)。本文件只拆任务。**0.1.1 发布分支不得实施下列任务。**
>
> 基准代码：发布标签 `v0.1.1`（或合入 `main` 后的对应提交）。`App.tsx` 只做组合，行数闸门 923 只降不升。

## 全局约束

- 红绿重构；失败 → 根因 → 最小修复 → 重跑同一命令。
- 不恢复「一键智能排版」。不把检查器塞进左栏。不改 `ProjectDocument`。
- 不移动 App 顶层 hooks / `posterRef`。
- 重操作走 `scripts/run-heavy.mjs`，不要并行全量 lint + test。

## 测试锁（动手前必读）

实现时 **改测试以追随新契约**，不要为了保绿维持三页签：

| 文件 | 0.1.1 锁什么 | 0.2 怎么改 |
|---|---|---|
| `StudioAssistantRail.test.tsx` | 三 tab；有名单默认 AI；「高级功能」唯一入口 | 无 `role="tablist"` 三 tab；AI 与总览同挂；无「高级功能」按钮 |
| `App.stage-workbenches.test.tsx` / `App.workflow-guidance.test.tsx` | 抽屉 tab 顺序 `AI 助手, 本阶段, 高级功能` | 抽屉内可见 AI 区 + 本阶段区；aria 随规格 |
| `App.shell-layout.test.tsx` | `rightRailLabel` 五元组 | 跟规格 §3.2 新标题 |
| `MapInspector.test.tsx` | `keeps advanced controls open by default` | **不要改这条**；只改调用方是否传 `collapsible` |
| `StudioAssistantDrawer.integration.test.tsx` | 抽屉名含「高级功能」 | 改为「AI 与本阶段」 |

## 任务顺序

每任务独立提交。前一任务绿了再开下一件。

### P0 — 右栏减噪（不改左栏页签）

可在 0.2 第一批单独合入，用户仍看到三页签，但右栏先瘦。

1. **地图栏去掉重复撤销重做**  
   文件：`MapStyleWorkspace.tsx`（`MapStyleRail`）。  
   验收：地图阶段右栏不再有 `aria-label="地图样式历史"`；顶栏撤销重做仍可用。  
   测试：给 `MapStyleRail` 加一条「不含历史按钮」；现有 App 历史测试仍绿。

2. **版式 TemplatePicker 默认 `<details>`**  
   文件：`ReferenceCardStyleWorkspace.tsx`。  
   验收：进入版式阶段，模板列表默认收起，展示框样式仍在首屏。  
   测试：查询 `details[aria-label]` 无 `open`，或 summary 可展开后看到模板名。

3. **展示框四格与 CardsInspector 收成一处**  
   文件：`ReferenceCardStyleWorkspace.tsx`、必要时 `CardsInspector`。  
   验收：同一展示框字段只出现一套控件（四格 **或** 检查器，不要两套可写）。  
   先写失败测试钉「重复 label 数量」。

4. **地图 / 内容调用方给检查器传 `collapsible`**  
   不改 `MapInspector` 默认。  
   测试：地图阶段高级区可折叠；`keeps advanced controls open by default` 仍绿。

5. **名单右栏去掉与外壳重复的「数据质量」标题**  
   文件：`DataUploadWorkspace.tsx`、可选 `stage-metadata.ts`。  
   若本步还没改 `rightRailLabel`，只删栏内重复 `h2/PanelHeader`。  
   P2 再改外壳标题为「名单记录」。

### P1 — 左栏分栏（破坏性，集中改测试）

6. **`StudioAssistantRail` 改为上 AI、下总览**  
   - 删除 `activeTab` 三态与「高级功能」整页。  
   - AI 用 `<details>` 或等价折叠，空名单默认 `open=false`，有名单 `open=true`；总览始终挂载。  
   - `onStageOverviewAction` 的 `elements`：改为选中画布 / 打开内容阶段大纲，不再 `setActiveTab("advanced")`。  
   - 协作 / 项目菜单 / 前往版式按钮从左栏移除。  
   文件：`StudioAssistantRail.tsx`、`StudioLayoutTemplate.tsx`（抽屉文案）、`App.tsx` 仅改传递文案（若有「高级功能」字符串）。  
   同步改 §测试锁 全部 tab 断言。  
   CSS：两区独立 `overflow`，沿用现有 token，不新造皮肤。

7. **窄屏抽屉文案**  
   `aria-label="打开AI助手与高级功能"` → `打开AI与本阶段`（或同等中文，全仓统一）。  
   文件：`App.tsx`、相关测试。

### P2 — 按搬迁表挪摘要（仍禁止检查器进左栏）

8. **左栏增加阶段摘要入口，右栏删主入口**  
   优先顺序：名单质量条数 → 地图表达 → 版式模板入口 → 内容大纲/素材浏览 → 交付检查摘要。  
   每挪一项：扩展 `stage-overview.ts` 卡或在总览下方加 **只读 + 跳转** 控件；从对应 `*Rail` 删除主入口。  
   模板 apply **只保留一处** `onApplyTemplate`（见规格搬迁表注释）。  
   `export-png` 动作继续只表示「失败重试」，不要在左栏复制 SVG / 工程包按钮。

9. **更新 `STAGE_METADATA.rightRailLabel` 与 T0 锚点**  
   与规格 §3.2 表一致。

### P3 — 收尾

10. **阶段说明一行**（右栏顶，默认折叠）  
    文案用 `WORKFLOW_STAGES` 已有 description，不要在 App 里新写长文案。

11. **CHANGELOG / 帮助版本**  
    实现合入时切 `0.2.0`：`package.json` + `APP_VERSION` 手抄同步。把本规格从 Unreleased 挪进 0.2.0 条目。

## 每任务本地验收

```
npx vitest run <本任务改过的测试文件>
```

P1 之后加一次：

```
npx vitest run src/components/StudioAssistantRail.test.tsx src/App.shell-layout.test.tsx src/App.workflow-guidance.test.tsx src/App.stage-workbenches.test.tsx
```

整包发布前：

```
npm test
npx tsc -b
```

（不要与 lint 并行。）

## 风险

| 风险 | 处理 |
|---|---|
| `StudioAssistantRail` 涨过 400 行 | 把大纲列表抽到 `StudioElementOutline.tsx`，不要抬 App 闸门 |
| 模板左右两处 apply | 任务 8 只留一处回调 |
| 抽屉焦点 / Escape | 沿用 `StudioAssistantDrawer`，只改 label |
| 与 0.1.1 演示站混发 | 必须从 `v0.1.1` 另开 `cursor/` 分支，禁止在发布热修里夹带 P1 |

## 回滚

`git revert` 实现 PR。无 schema 迁移。演示站回滚 = 把 `main` 指回 `v0.1.1` 后重跑 Pages。
