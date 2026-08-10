# 统一编辑器壳层设计规格

## 目标

将蹭饭地图工作室的正式编辑路径统一为紧凑 A 型编辑器：稳定的左侧流程栏、统一顶栏、中心任务区和可选可调宽度的右侧属性栏。引入 MUI 作为基础组件系统，同时以 Animal Island UI 的温和自然感作为仅视觉参考，禁止直接安装或复制其实现。

## 已确认决策

- 用户选择 A 型紧凑工作台，而不是重新比较视觉方案。
- 引入 MUI；使用其 MIT 许可组件和主题能力。
- Animal Island UI 仅作为视觉参考。它使用 CC-BY-NC-4.0，不能作为未来商业化产品的运行时依赖或代码来源。
- 覆盖所有正式编辑界面并保留目前已有功能；复杂右栏内容允许被拆分、收起或迁移到准确的全局设置入口，但不能成为失效入口。
- 现有工作树很脏，按文件职责增量修改，不能重置或回退其他变更。
- 原有展示框位置冻结修复必须保留，刷新位置仍只位于展示框样式和内容与排版的顶栏。

## Layout

### Desktop

1. `StudioTopbar` 由品牌、六阶段步骤、阶段动作、工程动作和主题动作组成。
2. `StudioEditorShell` 使用 CSS Grid：`var(--studio-left-width) minmax(0, 1fr) [optional] var(--studio-right-width)`。
3. 左栏总是渲染 `StudioLeftRail`，包含相同的六阶段按钮，AI 和高级功能为较低优先级入口。
4. 右栏是统一 `StudioRightRail`，共享 220-420px 的持久宽度和现有键盘/指针 resize 行为。不同工作区只提供其内容。
5. 若工作区没有检查器，右栏不存在，中心区占用剩余空间。

### Small screens

- 760px 以下中心区保持主导；步骤导航变为可横向滚动的一行。
- 左栏中的 AI/高级入口折叠到顶栏菜单。
- 右栏改用 MUI `Drawer`，由带 aria-label 的顶栏图标按钮打开。
- 海报预览独立处理滚动，不允许总页面横向滚动。

## Stage Mapping

| Stage | Center | Right rail | Topbar stage actions |
| --- | --- | --- | --- |
| Template | 模板预览和影响摘要 | 模板目录 | 应用/撤销选择 |
| Data | 导入、表格、筛选 | 数据质量/映射/素材标签 | 导入和数据操作 |
| Map | 地图海报画布 | 表达方式与地图/省份属性 | 撤销、重做 |
| Frame | 局部展示框编辑器 | 公共样式、图层和项目属性 | 撤销、重做、刷新展示框位置 |
| Content | 海报编辑画布 | 当前对象属性、素材 | 撤销、重做、刷新展示框位置 |
| Export | 最终预览 | 检查和导出设置 | PNG、SVG、工程包 |
| Global settings | 设置正文 | 不另起属性栏 | 撤销、重做、完成 |
| Legacy editor | 保持画布 | 现有 InspectorPanel 适配进同一右栏 | 保留现有操作 |

## Component Interfaces

```ts
export type StudioRightRailProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  tabs?: Array<{ id: string; label: string; panel: ReactNode }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export type StudioEditorShellProps = {
  stage: WorkflowStageId;
  leftRail: ReactNode;
  rightRail?: ReactNode;
  rightRailLabel?: string;
  children: ReactNode;
};

export type StudioTopbarProps = {
  activeStage: WorkflowStageId;
  project: ProjectDocument;
  progress: WorkflowProgress;
  stageActions?: ReactNode;
  projectActions: ReactNode;
  onChangeStage: (stage: WorkflowStageId) => void;
};
```

Workspace components retain their domain props. They are refactored to expose `center` and `rightRail` regions or receive a `renderRightRail` slot only where doing so avoids duplicating forms. Existing input IDs, aria labels and callbacks remain stable.

## Component Library

Install exact MUI compatible dependencies through npm. Create a local `StudioMuiProvider` that maps MUI palette, typography, spacing, shape and component variants to project CSS variables. Import MUI from direct module paths such as `@mui/material/Button`, not from `@mui/material`. Use `@mui/icons-material` only when a MUI composition needs it; continue using existing Lucide icons where practical.

MUI is responsible for generic interaction primitives: `Button`, `IconButton`, `Tooltip`, `Tabs`, `Drawer`, `Menu`, `Dialog`, `Divider`, `CssBaseline` and theming. It is not used to redraw `PosterCanvas` or replace domain SVG rendering.

## High-risk behavior

- `PosterCanvas` reports automatic positions; App freezes them before map/province transactions. No shell refactor may remove `onCardPositionsResolved`, `freezeCardPositionsForMapChange`, or the refresh confirmation.
- Existing routes, IndexedDB project loading, project package export/import, browser storage mirroring, undo/redo semantics and global settings controls must continue working.
- A stage action should not be rendered twice in a workspace body and the topbar.

## Test and Acceptance

1. Unit tests establish that every stage receives a single topbar, a common left rail and correct right-rail visibility.
2. Existing workspace tests are adapted without changing domain assertions.
3. Resize test covers right rail pointer/key resizing and persistence for stage shells.
4. App integration test verifies stage switch preserves selection and that map updates retain frozen display-frame positions until explicit refresh.
5. Browser checks at 1680px, 760px and 390px verify left/top/right behavior, no horizontal overflow, topbar actions, right rail Drawer and focusable controls.
6. Run targeted Vitest, full `npm test`, `npx tsc --noEmit`, `npm run build`, `npm run lint`, `git diff --check`, then inspect MUI dependency and bundle impact.

## Rollback

UI-only changes are reversible by reverting the shell/provider/component commits. Project data and exported files are unchanged, so no data migration rollback is required.
