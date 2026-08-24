# Round 7 — R7-opus-layout: 海报导出印刷出血几何

MODEL_SLUG: claude-opus-5-thinking-high-fast

## 结果

补上 Round 6 遗留缺口里的“无出血”一项：海报导出现在可以产出带出血与裁切标记的印刷几何。CMYK/ICC 仍不做（浏览器 PNG 不可行，见下）。

| 文件 | 变更 |
| --- | --- |
| `src/lib/print-bleed.ts` | 新增（237 行）：mm↔px 换算、三层框几何、裁切标记、SVG 就地改写、位图尺寸推导 |
| `src/lib/print-bleed.test.ts` | 新增（14 个用例） |
| `src/lib/export-poster.ts` | `serializePosterSvg` 接受出血选项；新增 `posterPngExportSize` |
| `src/lib/export-poster.test.ts` | 新增 3 个用例（0 出血不变、3mm 扩展 + 裁切标记、PNG 尺寸） |
| `src/lib/scene-document-types.ts` | `CanvasSettings.printBleedMm?: number` |
| `src/lib/scene-document-normalize.ts` | `printBleedMm` 归一化，默认 0 |
| `src/lib/scene-document-factories.ts` | 默认场景 `printBleedMm: 0` |

## 单位口径（已固定并测试）

**96dpi CSS 像素**。场景画布坐标 = SVG 用户单位 = 96dpi CSS px，所以 `1mm = 96/25.4 px ≈ 3.7795`。选它而不是 300dpi 的理由：出血必须和画布 viewBox 同坐标系才能直接扩展，混用两套 dpi 会让 `map.x/cards.x` 这些既有像素值含义分裂。需要 300dpi 成品时用 PNG 导出倍数（300/96 = 3.125）整体放大，出血几何本身不随 dpi 变化。`resolveBleedExportSize` 的 `scale` 参数就是这个入口。

## 三层框

沿用印前术语，`resolvePrintBleedGeometry(trim, options)` 一次算出：

- `trim`：成品裁切框 = 原画布 viewBox；
- `bleed` = trim 外扩 `bleedPx`：画面必须铺满到这里；
- `media` = bleed 再外扩一个裁切标记长度（默认 3mm）= 导出的 viewBox。

裁切标记 8 条（每角一横一竖），从出血框边缘起向外延伸到 media 边缘，延长线正好指向成品边，因此标记永远落在成品框外、也永远不超出 viewBox。`cropMarks: false` 时 `media === bleed`。

出血为 0 时三框全等、`cropMarkSegments()` 返回空数组——“裁切标记 iff 出血 > 0”是几何层保证的，不是调用方约定。

## `serializePosterSvg` 行为

顺序：剥离编辑器覆盖层（选择框/地图选择框/素材选择框/网格）→ 可选剥离背景 → `applyPrintBleedToSvg`。所以出血路径下编辑器覆盖层照样被剥离（有用例覆盖）。

`applyPrintBleedToSvg` 在克隆体上就地：

1. 按 `media/trim` 比例缩放 `width`/`height` 属性，保留原单位后缀（`1000px` → `1022.68px`）；
2. 改写 `viewBox` 为 media 框；
3. **把 `[data-canvas-background]` / `[data-background-image]` 拉伸到 bleed 框**——没有这步，扩出去的区域只是透明空白，裁切偏移仍然露白，出血就没有意义；
4. 追加 `<g data-print-crop-marks="true">`。

出血为 0、或 SVG 既无合法 `viewBox` 又无 `width`/`height` 时返回 `null` 且一个属性都不动，markup 与旧版逐字节相同（用例 `expect(withoutBleed).toBe(baseline)` 断言的就是这个）。

## 明确不做 ICC / CMYK

`print-bleed.ts` 头部注释写明：浏览器 canvas 只能输出 sRGB PNG，既无法嵌入输出意图（output intent）也无法四色分色；印厂要的 CMYK 转换必须在印前软件（Acrobat / Illustrator / Scribus）按纸张与油墨曲线做。本模块只负责把出血尺寸与裁切标记的几何做对，让印前环节拿到正确的可用几何。

## 验证（failure → cause → fix → recheck）

- 目标三套：`npx vitest run src/lib/print-bleed.test.ts src/lib/export-poster.test.ts src/lib/scene-document.test.ts` → **3 files / 47 tests passed**。
- 全量：`npm test` → **184 files / 1600 tests passed**（Round 6 为 181/1572）。
- `npx tsc --noEmit -p tsconfig.app.json` → 0 error。
- `npx eslint` 七个改动文件 → 0 问题。
- 过程中一次性通过，无 failure→fix 循环。唯一预防性修正：裁切标记端点与 media 边界的比较加 `1e-6` 容差，避免 `-22.6772 + 1545.3544` 这类浮点尾差让 `toBeLessThanOrEqual` 偶发失败；几何值本身统一 `roundPx` 到 4 位小数。

## 交付方式与回滚

- 验收：PR + CI（上述四项检查）。
- **非破坏性**：`printBleedMm` 是可选字段、默认 0；旧工程文件不含该字段，`normalizeScene` 补 0，导出行为逐字节不变。导出格式（SVG markup / PNG 尺寸）只在 `printBleedMm > 0` 时改变，而当前 UI 尚无处设置它，所以对现网用户零影响。
- 回滚：删除 `print-bleed.ts` 与其测试，还原 `export-poster.ts` 的两处引用与三个 scene-document 文件的单行改动即可；无数据迁移，已存盘工程里的 `printBleedMm: 0` 会被忽略。

## 未接线（本轮 ownership 之外）

`src/lib/usePosterExport.ts` 与 `CanvasInspector.tsx` 不在本轮可改文件内，所以出血还没有 UI 入口。接线只需两处：

```ts
// usePosterExport.exportSvg / exportPng
serializePosterSvg(svg, { ..., printBleedMm: project.canvas.printBleedMm });
// usePosterExport.exportPng 的尺寸
svgToPngDataUrl(source, {
  ...posterPngExportSize(project.canvas, { scale: pngScale, printBleedMm: project.canvas.printBleedMm }),
  transparentBackground: transparentExport,
});
```

外加 CanvasInspector 一个 0–20mm 的数字输入（`updateSceneTarget(scene, { type: "canvas" }, { printBleedMm })` 已经能正确归一化）。透明背景 + 出血组合下 bleed 区为透明，属预期。
