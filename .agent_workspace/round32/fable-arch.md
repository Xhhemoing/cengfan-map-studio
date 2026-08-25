# R32-fable-arch — 项目工作台 skip-link

- **MODEL_SLUG**: claude-fable-5-thinking-xhigh
- **分支**: `cursor/agent-sota-polish-cbcd`（按约束未 commit/push）
- **缺口**（对照 BRIEF）: 编辑器壳与全局设置页已有 `SkipToStageLink`，项目工作台没有；键盘用户 Tab 进来直接落在页头「导入 / 新建项目」，无法一步跳到项目列表。

## 改动

| 文件 | 内容 |
| --- | --- |
| `src/components/workbench/projects-target.ts`（新增，6 行） | 共享常量 `WORKBENCH_PROJECTS_TARGET_ID = "workbench-projects"`。独立成模块的原因与 `studio-editor/stage-target.ts` 相同：`ProjectGrid.tsx` / `ProjectWorkbench.tsx` 保持仅导出组件，满足 react-refresh 约束。 |
| `src/components/workbench/ProjectGrid.tsx` | 项目列表 `<section className="workbench-grid" aria-label="项目列表">` 加 `id={WORKBENCH_PROJECTS_TARGET_ID}` 与 `tabIndex={-1}`，成为可编程聚焦的稳定落点。加载态/空态/卡片列表共用同一 section，落点在加载阶段就存在。空态文案未动。 |
| `src/components/ProjectWorkbench.tsx` | `<main>` 顶部（`WorkbenchHeader` 之前）渲染 `<SkipToStageLink targetId={WORKBENCH_PROJECTS_TARGET_ID} label="跳到项目列表" />`，与 `GlobalSettingsScreen` / `StudioStageScreen` 同一模式。复用组件即复用其点击拦截：`preventDefault` + `focus()`，不改写 `location.hash`，hash 路由（`#/project/<id>`）不受片段跳转影响。 |
| `src/components/ProjectWorkbench.test.tsx` | 新增 describe「skip link」镜像 `GlobalSettingsScreen.test.tsx`：① 链接是 `a.skip-link`、文案「跳到项目列表」、`href="#workbench-projects"`，落点 `tabindex="-1"` 且 `aria-label="项目列表"`，点击后 `document.activeElement` 为落点且 hash 不变；② `compareDocumentPosition` 断言链接在页头之前（DOM 顺序即 Tab 顺序）。附带把 `renderWorkbench` 的容器挂进 `document.body`（游离节点 `.focus()` 无效），`afterEach` unmount 后 `container.remove()`。 |
| `src/components/workbench/ProjectGrid.test.tsx` | 新增 describe「skip-link target」：section 暴露 `id`/`tabindex`/`aria-label` 且 `.focus()` 生效；加载态下落点仍存在（skip-link 不悬空）。 |

未改 `SkipToStageLink.tsx`（默认 prop 已支持传入 `targetId`/`label`）。`.skip-link` 样式在全局 `src/styles.css`（`position: fixed`，聚焦浮出），工作台页直接生效，无需新样式。

## 验证（failure → cause → fix → recheck）

全程无失败，一次通过，无需修复链：

1. `npx vitest run src/components/ProjectWorkbench.test.tsx src/components/workbench/ProjectGrid.test.tsx` → **2 files / 21 tests passed**（含新增 4 条）。
2. `npx tsc --noEmit -p tsconfig.app.json` → exit 0。
3. `npx eslint` 5 个触碰文件 → 0 报错（react-refresh 规则对新常量模块无异议）。
4. 行数：实现文件最大 203 行（`ProjectWorkbench.tsx`），全部 ≤400。

## 验收方式与回滚

- **验收**: 上述目标测试 + 类型检查 + lint；手动验证路径为打开工作台首个 Tab 即出现「跳到项目列表」，回车后焦点落在项目列表且地址栏 hash 不变。
- **回滚**: 纯增量 UI 改动，无数据/导出/API 形状变化；revert 本槽位 5 个文件即可，无迁移。

## 约束遵守

- 仅触碰允许路径；未动 StudioUi 兜底测、未引入 Playwright、无支付相关内容、未执行 git commit/stash/push/新分支。
