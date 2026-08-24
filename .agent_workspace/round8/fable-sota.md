# Round 8 — 主调度补完：交付页出血尺寸与印前体检接线

MODEL_SLUG: cursor-grok-4.6（parent orchestrator）

R8-fable-sota 因 harness 资源错误未产出。主调度完成：

- `DeliveryWorkspace`：印刷检查合并 `object-in-bleed` 与 `printPreflight`（跳过 missing-font）；出血时显示成品/导出像素；未测量位图提示。
- `useProjectHealth`：传入 `pngScale`/`transparentExport`；资源栏过滤 `low-print-resolution`。
- `stage-slots` / `workspace-props`：拆出 `printIssues` + `printPreflight`。
- `USER_GUIDE`：交付页尺寸与印前体检。
- 测试：五段检查状态、出血尺寸文案、印前问题定位且不重复缺字体。
