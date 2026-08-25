MODEL_SLUG: claude-fable-5-thinking-xhigh

# Round 29 — stage-slots 阶段顶栏图标 aria-hidden

## 改动文件
- `src/components/studio-editor/stage-slots.tsx`（修改，仍为 307 行 ≤ 400）
  - frame 阶段：`刷新展示框位置` 的 `<RefreshCw size={18} />` → `<RefreshCw size={18} aria-hidden />`
  - content 阶段：`刷新展示框位置`（RefreshCw）与 `返回地图样式`（MapPinned）同样补上 `aria-hidden`
  - 与仓库其他调用点（如 `MapInspector.tsx`、`CardsInspector.tsx`）的裸 `aria-hidden` 写法一致；ToolbarButton 的 `decorativeIcon` 兜底仍在，但调用方按约定显式书写。
- `src/components/studio-editor/stage-slots.test.tsx`（新增，独立渲染 `buildStageSlots`，未动 LegacyEditorChrome.test.tsx）

## 测试设计
- 通过 `buildStageSlots("frame" | "content", ctx)` 取 `stageActions`，用 `createRoot` + `flushSync` 渲染。
- ctx 桩沿用 `LegacyEditorChrome.test.tsx` 的 `buildCtx` 模式（`Partial<StageSlotsContext> as StageSlotsContext` + `createProjectDocument`）。
- `vi.mock` 桩掉 stage-slots 引入的重工作台/侧栏模块（CardsInspector、DataWorkspace、DataUpload/MapStyle/ReferenceCardStyle/ContentLayout/DeliveryWorkspace），ToolbarButton 与 lucide-react 保持真实实现。
- 断言两层：
  1. DOM：按钮保留 `aria-label`，其内 `svg` 的 `aria-hidden === "true"`；
  2. 调用点：直接检查 JSX `icon` 元素的 `props["aria-hidden"] === true` —— 因为 `decorativeIcon` 会兜底克隆 aria-hidden，仅靠 DOM 断言无法发现调用点漏写的回归。

## 验证证据链（failure → cause → fix → recheck）
1. 首跑 `npx vitest run src/components/studio-editor/stage-slots.test.tsx` → 1 文件 2 用例全绿（1.01s）。
2. 变异检查（主动制造 failure）：临时删掉 frame 阶段图标的 `aria-hidden` → 同一命令 1 failed | 1 passed；cause：DOM 断言被 `decorativeIcon` 兜底掩盖，调用点 props 断言精准命中（`expect(icon.props["aria-hidden"]).toBe(true)` 收到 `undefined`）。
3. fix：恢复调用点 `aria-hidden`。
4. recheck：`npx vitest run src/components/studio-editor/stage-slots.test.tsx src/components/studio-editor/LegacyEditorChrome.test.tsx` → 2 文件 5 用例全绿（1.07s）。
5. 附加检查：`npx eslint` 两个被触文件通过；`npx tsc -b --force` 全工程类型检查 exit 0（根 tsconfig 为 references 结构，裸 `tsc --noEmit` 不检查任何文件，故用 `-b`）。

## 合规说明
- 仅触碰 `stage-slots.tsx` 与新建 `stage-slots.test.tsx`；未 commit/stash/checkout/push/建分支（工作区内其他改动为同分支其他 agent 预先存在）。
- 未引入 Playwright / 支付相关内容。
- 回滚方案：本改动为纯增量 a11y 属性 + 新测试文件，撤销这两个文件的改动即可回滚，无数据/导出格式/API 形状变化。
