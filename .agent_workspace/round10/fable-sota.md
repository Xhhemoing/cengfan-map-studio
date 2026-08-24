# R10-fable-sota — 交付预览出血/裁切标记示意层

MODEL_SLUG: claude-fable-5-thinking-xhigh

## 改动文件（均在允许清单内）

- `src/components/workspaces/DeliveryWorkspace.tsx`（315 行，≤400）
- `src/components/workspaces/DeliveryWorkspace.test.tsx`（304 行，新增 1 个用例，13/13 通过）
- `USER_GUIDE.md`（「交付页尺寸」条目补一句示意说明）

## 做了什么

`printBleedMm > 0` 时，交付预览不再只画成品框，而是把 `PosterCanvas` 包进一个
出血示意舞台（`BleedPreviewStage`），用户能直接看到出血环与裁切标记：

1. **几何与导出同源**：舞台用导出链路同一份纯函数——`resolvePrintBleedGeometry`
   算 trim/bleed/media 三层框，`cropMarkPathData` 生成八条裁切标记路径——
   没有复制任何印前数学，`print-bleed.ts` / `export-poster.ts` 一字未改。
2. **结构**（全部在 DeliveryWorkspace 内，PosterCanvas 排版不动）：
   - 舞台 div `data-print-bleed-stage`，`width: min(100%, mediaWidth px)`，相对定位；
   - 流内叠加 SVG `data-print-bleed-overlay`（viewBox = 媒体框）撑起舞台的纵横比，
     绘制：evenodd 挖洞的出血色环（只盖出血区、不压画面）、出血框虚线、
     成品框（裁切线）虚线、以及与导出完全一致的裁切标记路径；
     描边用 `vector-effect: non-scaling-stroke`，缩放后仍 1px 可见；
   - 海报画布放在按 `trim/media` 百分比定位的绝对占位框里，DOM 上先于叠加层——
     `preview.querySelector("svg")` 拿到的第一个 svg 仍是海报本身，
     viewBox 断言 `0 0 1500 1000` 原样保留（Round 9 测试未动即通过）；
   - 一段组件内 `<style>` 把 `.bleed-stage .poster` 钉成 100%×100%，
     抵消移动端 `.poster { width: 760px }` 规则，防止示意层错位。
3. **可访问性**：叠加 SVG 纯装饰（`aria-hidden="true"`、`focusable="false"`、
   `pointer-events: none`）；读屏用户听到的仍是标题「成品尺寸 W × H px」+
   说明行「导出将向外扩出 Nmm 出血……实际导出尺寸更大」（Round 9 文案保留，
   前面加了半句解释浅色环/角上短线是什么）。
4. **bleed === 0**：无舞台、无叠加层、无 `<style>`、标题与说明行与原来逐字一致
   （既有测试 + 新用例都断言了这一点）。
5. **USER_GUIDE.md**：「交付页尺寸」条目追加一句——设了出血后交付预览会在成品
   四周画出出血区与裁切标记示意，真正的导出像素仍以右侧「导出设置」为准。

## 为什么不改 PosterCanvas / 不用外层 svg 包海报

- 外层 svg 会成为 preview 里文档序第一个 svg，破坏「viewBox 保持成品框」的既有
  断言，且嵌套 svg 在 `.poster` 的 CSS max 约束下缩放行为不可控；
- div + 百分比占位是纯声明式的：舞台由流内叠加 SVG 撑尺寸（媒体框比例），
  占位框按同一几何取百分比，缩放时两层永远对齐，无 ResizeObserver、无副作用。

## 验证（failure → cause → fix → recheck）

本轮三项检查一次通过，无失败链需要记录：

- `npx vitest run src/components/workspaces/DeliveryWorkspace.test.tsx` → 13 passed
  （含新用例：叠加层 viewBox = `resolvePrintBleedGeometry` 的媒体框、裁切标记 d =
  `cropMarkPathData`、aria-hidden/指针穿透、第一个 svg 仍是 `.poster` 且
  viewBox `0 0 1500 1000`、bleed=0 无示意层）；
- `npx tsc --noEmit -p tsconfig.app.json` → 0 错误；
- `npx eslint` 两个 TSX 文件 → 0 问题。

导出行为零改动：`usePosterExport` 只读 `posterRef.current`（仍指向海报 svg 本身），
`serializePosterSvg` / `applyPrintBleedToSvg` 未触碰。

## 验收方式与回滚

- 验收：交付页给画布属性填 3mm 出血 → 预览四周出现浅色出血环 + 角上裁切短线 +
  成品框虚线；清零出血 → 预览恢复原样。像素级以右栏「导出设置」双尺寸为准。
- 回滚：纯 UI 示意层，无数据/导出格式/API 形状变更；revert 本轮三个文件即可。

按指令未 commit / 未 push。
