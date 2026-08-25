# Round 2 结论简报 — verify merged code

**HEAD:** `1e3af69` on `cursor/verify-merged-code-e17a`  
**Models:** fable ×2, opus-fast ×2, gpt-sol ×2（无降级）

## 演进对比（相对 Round 1）

| Round 1 | Round 2 |
| --- | --- |
| 合并主体 ACCEPT；唯一 BLOCKER 为导出打断 | `70f95b9` **fable ACCEPT**：三计数（generation / latestPng / inFlight）语义正确 |
| 测试装置可能空转 | `19ffd72` 修好 `startGatedPngExport`，补 PNG-supersede-PNG 成功路径与 `exportingPng` 双飞行计数 |
| Unwired extracts 可能被误认已交付 | 无生产 import、无 barrel、vite sourcemap 确认未进 bundle |
| WorkflowStepper 第六步「素材」 | **非 merge 错解**：文件自 `897a2a6` 未改；且 `aria-hidden` + clip，用户看不见 |
| Pages 404 | 维持运维结论；allowlist 未撒谎（usePosterExport 249 / ProjectMenu 307，均 <400） |
| 全量 2411 @ 388eafc | gpt-sol @ fix 后：**2414 pass / 2 skip**（尚未含 `19ffd72` 的 +2 声称 2416） |

## 潜在边界风险

- `LegacyEditorSidebar` SVG 未灰显：hook 已保护产物，仅状态行可能被打断。
- `print-bleed.mmToPx` 与 `print-size.mmToPx` 同名不同 arity：误导入会 typecheck 失败，安全。
- `DataWorkspace` 两条 AI 粘贴路径无 consent：pre-merge 已有，**OUT-OF-SCOPE**（不要在本任务接线）。
- Round 3 必须在含 `19ffd72` 的 HEAD 上重跑全量测试（R2 sol 跑的是 2414 节点）。

## SOTA 验收差距

- **合并正确性：无 MUST-FIX。** 产品代码唯一必要修复已在 `70f95b9`。
- 差距均属后续产品任务：consent 接线、bleed UI、启用 GitHub Pages。
- Round 3：全量测试链 + 交叉核验 + 将本 PR 合入 main。
