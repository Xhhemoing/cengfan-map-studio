MODEL_SLUG: claude-fable-5-thinking-xhigh

# Round 7 — R7-fable-sota：印刷出血 UI 接线 + 文档

分支：`cursor/agent-sota-polish-cbcd`（按指令未 commit / stash / 切分支；共享工作树内其他 R7 agent 的在途文件——`print-bleed.ts`、`export-poster.ts`、`layout-health*`、`project-migration*`、`agent-session*`、`server/collaboration*` 等——均未触碰）。

## 一、改动清单（仅限授权文件）

| 文件 | 改动 |
| --- | --- |
| `src/components/inspector/CanvasInspector.tsx` | 「安全边距」之后新增「印刷出血(mm)」数字输入：`label[for]`/`id` 双向关联、`type="number"`、min 0、max = `MAX_PRINT_BLEED_MM`（20，直接 import R7-opus-layout 的常量保持单一事实源）、复用 `DeferredInput`（Enter 提交 / Escape 取消 / blur 提交，键盘完全可操作）、越界值静默拒绝、`canvas.printBleedMm ?? 0` 兜底旧场景 |
| `src/components/inspector/CanvasInspector.test.tsx` | 新建，6 用例（见 §三） |
| `src/lib/usePosterExport.ts` | `exportSvg`/`exportPng` 把 `project.canvas.printBleedMm` 传入 `serializePosterSvg`；PNG 栅格尺寸改用 `posterPngExportSize(project.canvas, { scale, printBleedMm })`（出血 = 0 时与旧算式 `width × scale` 等值，仅多 `Math.round`/`Math.max(1,·)` 防护） |
| `USER_GUIDE.md` | 「导出与分享」两条：出血用途 + 默认 0 = 不加出血且**无任何裁切标记**；出血（管外侧防露白）vs 安全边距（管内侧防切内容）方向相反、配合使用；CMYK 需印前软件。FAQ 增「送印出血怎么设」 |
| `README.md` | 功能表「高清导出」行补短注：送印可设「印刷出血(mm)」0–20，默认 0 不加裁切标记 |

## 二、跨 agent 协调（本轮工作树高频并发，动手前逐一核对）

- **类型字段**：任务允许我在字段缺失时向 `scene-document-types.ts` 添加 `printBleedMm`；动手瞬间 R7-opus-layout 已并发写入（含 96dpi 换算注释），于是**未触碰**该禁改文件（首次 StrReplace 因文件已变而失败，即证据）。
- **usePosterExport 条件授权判定**：初读时 `serializePosterSvg` 不接受出血（早期在途的 `print-export-helpers.ts` 包装器会丢 `transparentBackground`/`blockFontDisplay`，接它必回归），当时结论是不接线；R7-opus-layout 落地后 `SerializePosterSvgOptions extends PrintBleedOptions` 且新增 `posterPngExportSize`，「helper already accepts them」成立，遂按其报告 §未接线 的两处建议完成接线（写法逐字一致）。
- 出血语义（三层框、背景铺满出血框、裁切标记 iff 出血 > 0）全部由 `lib/print-bleed` 保证；UI 层只负责录入 0–20 的毫米数，归一化由 `normalizeScene`（clamp 0–20、脏值回 0）与 `normalizePrintBleedMm` 兜底，双保险不冲突。

## 三、测试（新建 6 用例）

1. 可及性契约：`label[for="canvas-printBleedMm"]` 文案含「印刷出血(mm)」，input `type=number`、min "0"、max "20"、默认值 "0"；同时断言 width/height/safeMargin/背景色控件仍在（防止新增行挤掉旧控件）。
2. 旧场景兜底：`printBleedMm: undefined` 渲染为 "0"。
3. 延迟提交：输入 "3" 不触发 onPatch，blur 后 `{ printBleedMm: 3 }`（与其余画布数字字段的 DeferredInput 契约一致，单次历史记录）。
4. 越界拒绝："25" 与 "-2" blur 后 onPatch 零调用。
5. 键盘提交：Enter → `{ printBleedMm: 5 }`。
6. 键盘取消：Escape 后草稿回 "0"，再 blur 也不提交。

## 四、验证证据（failure → cause → fix → recheck）

**故意失败链（证明测试咬得住）**：临时删除 inspector 里的出血行 → `npx vitest run src/components/inspector/CanvasInspector.test.tsx` → **6/6 失败**；cause 即被删控件；fix 恢复该行；recheck 复跑 **6/6 通过**。

最终证据（全部改动完成后复跑）：

```
npx vitest run src/components/inspector/CanvasInspector.test.tsx
→ Test Files 1 passed, Tests 6 passed (6)
```

- `npx tsc -p tsconfig.app.json --noEmit` → 0 error（含本次 usePosterExport 接线与并发在途文件）。
- `npx eslint`（3 个触碰的 ts/tsx 文件）→ 0 problem。
- 消费侧回归：`npx vitest run src/lib/export-poster.test.ts` → 13 passed（含 R7-opus-layout 的 0 出血逐字节不变、3mm 扩展、PNG 尺寸用例，确认接线口径一致）。

## 五、验收方式与回滚（交付纪律）

- **验收**：跑上方 vitest 命令 + 手动走查——编辑器选中画布 → 属性面板「印刷出血(mm)」填 3 → 导出 SVG，viewBox 应大于画布且末尾出现 `<g data-print-crop-marks>`；导出 PNG 像素尺寸按媒体框放大；改回 0 后导出与改动前逐字节一致。Tab 可聚焦该输入框，Enter 提交、Escape 还原。
- **用户可见行为变化**：仅新增一个默认 0 的画布属性；出血 = 0（含所有旧工程）时导出路径经 `applyPrintBleedToSvg` 提前返回，SVG markup 与 PNG 尺寸均与改动前相同。
- **回滚**：无数据/API 形状变更（`printBleedMm` 字段归 opus-layout 所有）。`git checkout -- src/lib/usePosterExport.ts src/components/inspector/CanvasInspector.tsx USER_GUIDE.md README.md` 并删除 `CanvasInspector.test.tsx` 即还原本 agent 全部改动。

## 六、遗留缺口（如实，均在他人所有权内）

1. `DeliveryWorkspace.tsx:139`「最终像素尺寸」仍按 `canvas × scale` 显示，出血 > 0 时低估实际 PNG 尺寸；单行修复：改用 `posterPngExportSize(project.canvas, { scale: pngScale, printBleedMm: project.canvas.printBleedMm })`。该文件非本轮授权。
2. R7-opus-data 的 `object-in-bleed` 版面体检仍未在 `studio-editor-helpers.ts` / `agent-session.ts` 接线（其报告已给出单行 diff），故 USER_GUIDE 本轮**未**宣传该告警，接线后可补一句。
3. 出血输入步进为浏览器默认 1mm；如需 0.5mm 精度可给 DeferredInput 传 `step`，属锦上添花未做。
