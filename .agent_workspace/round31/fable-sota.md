# R31-fable-sota — ContinueEditingCard 恢复卡 `History` 图标钉 `aria-hidden`

- **模型**: claude-fable-5-thinking-xhigh
- **日期**: 2026-08-25
- **改动文件**: `src/components/workbench/ContinueEditingCard.tsx`（39 行）、`src/components/workbench/ContinueEditingCard.test.tsx`（新增，66 行），均 ≤400 行

## 改动内容

1. **实现**（`ContinueEditingCard.tsx` L31）：`<History size={22} />` 改为 `<History size={22} aria-hidden />`，与仓库惯例（R30 WorkflowGuide、ProjectCard 菜单图标）一致——即使父 `span.workbench-resume-icon` 已 `aria-hidden="true"`，Lucide 组件本身也显式钉住，防御库默认行为变化或未来有人传入 a11y prop 顶掉默认值。
2. **保持不变**：父 span 的 `aria-hidden="true"`、按钮的 `aria-label="继续编辑本地内容"`、CTA 里的装饰 `→` span 均未动。图标钉 `aria-hidden` 后不可能产生第二个可访问名称，按钮名称仍唯一来自 `aria-label`。
3. **新增测试**（`ContinueEditingCard.test.tsx`）：仿照 `WorkbenchHeader.test.tsx` 的 createRoot + flushSync 模式（roots 数组 + afterEach unmount + `vi.restoreAllMocks`）。stub 的 `LocalWorkspaceEntry` 用真实工厂 `createProjectDocument`（students 为空数组，无学生 PII）+ `createProjectPackage` 构造，`source: "mirror"`。三个断言：
   - 按可访问名称找到按钮（`button[aria-label="继续编辑本地内容"]`），且可见文本包含同名字符串；
   - `.workbench-resume-icon` 父 span `aria-hidden="true"` 且其内部 `svg` 自身 `aria-hidden="true"`；
   - 点击按钮调用 `onResume` 恰好一次。

## 验证纪律证据链（failure → cause → fix → recheck）

1. **基线（改动后首跑）**：`npx vitest run src/components/workbench/ContinueEditingCard.test.tsx` → 3/3 通过；`npx tsc --noEmit -p tsconfig.app.json` 退出码 0。
2. **反证——证明 svg 断言会咬**：临时把 L31 改为 `<History size={22} aria-hidden={false} />` 重跑 → 精确失败在新增 svg 断言（`ContinueEditingCard.test.tsx:57`，`Expected: "true" / Received: "false"`），其余 2 个测试（可访问名称、点击回调）仍通过。
   - **根因说明**：同 R30 结论，lucide-react 1.26.0 在无 children 且无 a11y prop 时自动给 svg 加 `aria-hidden="true"`，故仅删钉不会改变渲染 DOM；新断言守的是 **DOM 结果**，`aria-hidden={false}` 反证证明断言真实覆盖 svg 层而非只靠父 span。
3. **恢复复检**：还原为 `<History size={22} aria-hidden />` → 同一命令重跑 3/3 通过。

## 验收方式与回滚

- **验收**：`npx vitest run src/components/workbench/ContinueEditingCard.test.tsx`（3 passed）+ `npx tsc --noEmit -p tsconfig.app.json`（退出码 0）；纯可访问性钉固 + 新增测试，无 API / 数据 / 导出格式变化，非破坏性。
- **回滚**：还原 `ContinueEditingCard.tsx` L31 一行并删除新测试文件即可，两者相互独立（lucide 1.26.0 默认行为下先还原实现测试也不会红）。
- 按约束未做 git 提交/切分支；`git status` 中 `server/client-ip*`、`ProjectGrid*`、`import-data*`、`card-layout.test.ts`、`PosterCanvas.performance.test.tsx` 为本轮其他槽位产物，未触碰。
