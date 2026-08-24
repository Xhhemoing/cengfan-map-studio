# R8-opus-data

## Result

`src/lib/resource-health.ts` 现在除了缺资源 / 缺字体，还会报「打印分辨率不足」告警。

- 新增 `code?: ResourceHealthCode`（`missing-resource` / `missing-font` / `low-print-resolution`），
  旧字段 `kind` / `target` / `detail` / `severity` 一律不变，现有调用方（`use-project-health`、
  `DeliveryWorkspace`、`stage-overview`、`print-preflight`）无需改动。
- 判定口径与 `lib/print-bleed` 一致：画布坐标 = 96dpi CSS 像素，成品精度 = `原图边长 / 落位边长 × 96`，
  低于 300dpi（留 0.5dpi 舍入余量）时产出 `severity: "warning"`、`kind: "resource"` 的条目。
- 覆盖三处落位：画布素材实例（按 `xMidYMid meet` 收缩到元素框）、背景图（画布框 + `backgroundFit`）、
  地图图片（`map.width/height × map.scale`；有 `alignment` 时用 `mapImageElementPlacement` 的落位框，
  原图尺寸只认 `alignment.sourceWidth/sourceHeight`，不会误把 `alignment.width/height` 当原图）。
- 原图尺寸来源：素材记录上的 `width/height` 或 `naturalWidth/naturalHeight`；没有时从 base64 data URL
  文件头解 PNG / JPEG(SOF) / GIF（只解码前 64KB）。SVG 等矢量、WebP/AVIF 等未解析格式、
  远程 URL、解不出的载荷一律跳过——**缺元数据不报错**。
- 素材本身缺失时只报既有的 `missing-resource` 错误，不再叠一条分辨率告警。
- 省份贴图（`provinceStyles[].appearance`）暂不检查：它的落位需要省份多边形包围盒，
  几何在渲染层，属于跳过而非误报。

## Verification（failure → cause → fix → recheck）

1. **failure**：首版把 `readRecordedImageSize` 直接套在 `MapImageAlignment` 上。
2. **cause**：`alignment.width/height` 是「落位尺寸」，与素材记录里的「原图尺寸」同名，
   会被优先命中，导致地图图片的 dpi 恒等于 96/scale，既漏报也可能误报。
3. **fix**：地图分支改为显式读 `sourceWidth/sourceHeight`，并从 `readRecordedImageSize` 里去掉
   `sourceWidth/sourceHeight` 分支，避免同一歧义在别处复发。
4. **recheck**：新增「prefers the alignment source size over the asset record」用例，
   同一工程先断言 6000px 原图不告警、再把 `sourceWidth/sourceHeight` 降到 100px 断言告警，重跑通过。

- `npx vitest run src/lib/resource-health.test.ts`：1 文件 / 15 用例通过（含要求的 10×10 拉伸到 1000px 用例）。
- `npm test`（全量）：187 文件 / 1633 用例通过。
- `npx tsc --noEmit -p tsconfig.app.json`：通过。
- `npx eslint src/lib/resource-health.ts src/lib/resource-health.test.ts`：无告警。
- `git diff --check`：通过。未提交、未建分支，按要求只留工作区改动。

## 交付与回滚

- 验收方式：`npx vitest run src/lib/resource-health.test.ts` + 导出阶段右栏「资源缺失」里出现
  「…打印分辨率不足：原图 A×B，铺满 C×D 画布像素后约 N dpi（300dpi 需要 X×Y）」的警告条目。
- 非破坏性：函数签名、既有 issue 字段与错误级别都没变，`code` 是可选新增字段。
- 回滚：还原 `src/lib/resource-health.ts` 与 `src/lib/resource-health.test.ts` 两个文件即可，无数据/导出格式变更。

## 与 R8 print-preflight 的重叠（需要 Round 8 owner 定夺）

同轮另一位 agent 在 `src/lib/print-preflight.ts` 里实现了 `low-resolution-raster`，口径相同。
两者不会互相污染（preflight 只消费 resource-health 的 `kind === "font"` 结果），全量测试也通过，
但如果两条链路都上 UI，同一张图会在「资源缺失」栏和印前报告里各出现一次。
建议二选一：交付栏保留本条告警、印前报告只做汇总；或反之，由 preflight 独占分辨率结论，
本模块的 `low-print-resolution` 只作为纯函数供其复用（`decodeRasterImageSize` / `effectivePrintDpi`
/ `fittedDrawSize` 已导出，可直接复用）。这属于 `print-preflight.ts` 的所有权范围，本轮未改动。
