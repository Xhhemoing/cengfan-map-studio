# R30-fable-sota — WorkflowGuide 流程导航 Lucide 图标钉 `aria-hidden`

- **模型**: claude-fable-5-thinking-xhigh
- **日期**: 2026-08-25
- **改动文件**: `src/components/WorkflowGuide.tsx`（327 行）、`src/components/WorkflowGuide.test.tsx`（358 行），均 ≤400 行

## 改动内容

1. **实现**（`WorkflowGuide.tsx` L147）：流程导航步骤图标由 `{Icon && <Icon size={16} />}` 改为 `{Icon && <Icon size={16} aria-hidden />}`，与仓库惯例一致——即使父 `span.workflow-nav__icon` 已 `aria-hidden="true"`，Lucide 组件本身也显式钉住。
2. **测试加固**（`WorkflowGuide.test.tsx` "hides the decorative step icons from the accessibility tree"）：保留原有父 span 断言，新增对每个图标内部 `svg` 的断言——`svg` 必须存在且 `aria-hidden="true"`，防止未来去掉 Lucide 钉后即使父级仍 hidden 也能被测试捕获。
3. 未触碰 `WorkflowStepper` / `WorkflowStageStepper`（其 Check/AlertTriangle/Circle 已钉）。

## 验证纪律证据链（failure → cause → fix → recheck）

1. **基线（改动后首跑）**：`npx vitest run src/components/WorkflowGuide.test.tsx` → 18/18 通过。
2. **尝试反证——单纯去掉钉不失败**：临时把 L147 回退为 `<Icon size={16} />` 重跑 → 仍 18/18 通过。
   - **根因**：本仓库安装的 lucide-react **1.26.0** 在无 children 且无 a11y prop 时自动给 svg 加 `aria-hidden="true"`（`node_modules/lucide-react/dist/cjs/lucide-react.js` L92：`...!children && !hasA11yProp(rest) && { "aria-hidden": "true" }`）。因此仅删钉不改变渲染 DOM，新断言守的是 **DOM 结果** 而非源码文本；显式钉是防御库默认行为变化 / 有人传入 a11y prop 顶掉默认值的场景。
3. **真实反证——证明新断言会咬**：临时改为 `<Icon size={16} aria-hidden={false} />` 重跑 → 目标测试失败，且精确落在新增的 svg 断言上（`WorkflowGuide.test.tsx:323`，`Expected: "true" / Received: "false"`），其余 17 个测试通过；父 span 断言此时仍通过，证明旧测试确实覆盖不到 svg 层。
4. **恢复复检**：还原为 `<Icon size={16} aria-hidden />` → `npx vitest run src/components/WorkflowGuide.test.tsx` 18/18 通过；`npx tsc --noEmit -p tsconfig.app.json` 通过（退出码 0）。

## 验收方式与回滚

- **验收**：`npx vitest run src/components/WorkflowGuide.test.tsx`（18 passed）+ `npx tsc --noEmit -p tsconfig.app.json`；无 API / 数据 / 导出格式变化，纯可访问性钉固 + 测试加固，非破坏性。
- **回滚**：还原 `WorkflowGuide.tsx` L147 一行与测试中新增的 svg 断言块即可（两处相互独立，svg 断言在 lucide-react 1.26.0 默认行为下即使先还原实现也不会红）。
- 按约束未做 git 提交；工作区内其他槽位（server/card-layout/html-table-parse）的改动非本槽位产物，未触碰。
