# R31-fable-arch — ProjectGrid 空状态 MapPinned 钉 aria-hidden

- **模型**: claude-fable-5-thinking-xhigh
- **日期**: 2026-08-25
- **分支**: cursor/agent-sota-polish-cbcd（按约束未做任何 git 操作）

## 改动

### `src/components/workbench/ProjectGrid.tsx`

两处空状态（加载中 `role="status"` 与「还没有项目」）的 `MapPinned` 按仓库惯例在 Lucide SVG 本体钉上 `aria-hidden`，父级 `span.workbench-empty__mark` 的 `aria-hidden="true"` 保持不变：

```tsx
<span className="workbench-empty__mark" aria-hidden="true"><MapPinned size={22} aria-hidden /></span>
```

文件 46 行，远低于 400 行上限。渲染分支逻辑、文案、ProjectCard 透传均未动。

### `src/components/workbench/ProjectGrid.test.tsx`（新增，66 行）

沿用 `WorkbenchHeader.test.tsx` / `ProjectCard.test.tsx` 的模式：`createRoot` + `flushSync` 渲染、roots 数组收集、`afterEach` 中 `flushSync(() => root.unmount())` + `vi.restoreAllMocks()`。空状态无需真实项目数据，`projects: []` 即可，故未用到 `createSampleProject`（类型上引用了 `StoredProject`）。

覆盖两条分支：

1. `loading && projects.length === 0` → 断言存在 `role="status"` 的 `.workbench-empty`；容器本身**没有** `aria-hidden`（读屏可读到「正在加载项目」文案）；`.workbench-empty__mark svg` 的 `aria-hidden === "true"`。
2. `projects.length === 0 && !hasError && !loading` → 断言「还没有项目」文案存在、容器未被隐藏、同样的 svg `aria-hidden` 断言。

按任务书未追加完整项目列表路径（已由 `ProjectCard.test.tsx` 覆盖卡片内图标）。

## 验证（failure → cause → fix → recheck）

无失败环节，一次通过：

- `npx vitest run src/components/workbench/ProjectGrid.test.tsx` → 1 file / 2 tests passed（652ms）。
- `npx tsc --noEmit -p tsconfig.app.json` → 退出码 0。

## 验收与回滚

- 验收：跑上述 vitest 命令；或在工作台清空项目后用读屏确认空状态图标不发声、加载/空文案仍可读。
- 回滚：还原 `ProjectGrid.tsx` 两处 `aria-hidden`、删除测试文件即可，无数据/API 形状变化。

## 未触碰

`StudioUi.test.tsx`、`StudioUi.controls.test.tsx`、ProjectCard 菜单图标、其余槽位文件。
