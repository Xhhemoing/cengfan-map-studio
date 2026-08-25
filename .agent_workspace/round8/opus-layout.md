# Round 8 — R8-opus-layout: 印前体检（print preflight）

MODEL_SLUG: claude-opus-5-thinking-high-fast

## 结果

Round 7 把出血几何做对了，但「这份导出能不能送印」仍要靠人肉记忆检查。本轮新增 `src/lib/print-preflight.ts`，把导出参数相关的印刷风险聚成一份可定位的清单，并接进 `useProjectHealth` 的返回值。

| 文件 | 变更 |
| --- | --- |
| `src/lib/print-preflight.ts` | 新增（382 行）：`runPrintPreflight` 纯函数 + data URL 位图尺寸解码器 |
| `src/lib/print-preflight.test.ts` | 新增（10 个用例） |
| `src/hooks/use-project-health.ts` | 只加返回值 `printPreflight`，以及两个带默认值的可选入参 |

## 检查项与分工

刻意不重复既有模块，只补三件事：

| 项 | kind | 级别 | 判据 |
| --- | --- | --- | --- |
| 缺字体 | `missing-font` | error | 复用 `listResourceHealthIssues` 的 font 结果，附上印刷后果说明 |
| 位图欠分辨率 | `low-resolution-raster` | warning | 有效 dpi < `min(300, 96 × pngScale)` |
| 透明背景撞出血 | `transparent-bleed` | warning | `printBleedMm > 0` 且导出勾了透明背景 |
| 导出倍率不够 | `export-resolution` | warning | `printBleedMm > 0` 且 `96 × pngScale < 300` |

- **出血区里的对象几何不在这里**：`layout-health` 的 `object-in-bleed` 已经覆盖，重复报会让交付页出现两条同义警告。
- **字体引用遍历不在这里**：`resource-health` 已经走过 text / cards / map-labels / guests / display-frame 全部引用点，本模块只做映射。两套遍历必然漂移，所以宁可依赖它（该文件本轮 FORBIDDEN，只读不改）。

## 分辨率口径

沿用 `print-bleed` 的单位约定：画布坐标 = 96dpi CSS 像素，于是

```
有效 dpi = 原生像素 × 96 ÷ 画面占用的画布像素
```

判据取 `min(targetDpi, 96 × pngScale)` 而不是死磕 300：1× 导出整张图只有 96dpi，此时苛求单张素材 300dpi 只会让每个工程都亮满红灯。用导出分辨率当上限后，警告的含义变成「这张图比整张海报还软」，才是可行动的信息。导出本身欠分辨率单独由 `export-resolution` 报一次（仅在用户已声明印刷意图，即出血 > 0 时）——UI 只提供 1×/2×/3×，3× = 288dpi 仍在 300 线下，所以那条警告的建议是导 SVG 交给印前放大。

轴向聚合按渲染方式区分（`preserveAspectRatio` 决定）：`contain`（meet）取两轴较宽松者，`cover`/`stretch`（slice/none）取最差一轴。装饰与落款素材是 meet，省份贴图实例是 slice，跟画布实际渲染一致。

参与判定的画面：背景图（按**出血框**算，导出时它要铺满到出血）、地图图片（含 alignment 的整幅换算，乘 `map.scale`）、省份外观贴图（仅在 `sizingMode: custom` 或统一尺寸开启、几何可确定时）、可见素材实例（画布坐标系，不跟随地图缩放）。

## 量不到就说量不到

原生像素尺寸的来源依次是：工程里已记录的 `naturalWidth/Height` → 调用方传入的 `assets[].naturalWidth/Height` → 从 data URL 头部解码（PNG IHDR / JPEG SOF / GIF / WebP VP8X·VP8L·VP8）。三条都不成立（远程链接、未知格式）时**不猜也不静默放过**，定位串进 `unmeasured`，由 UI 提示人工确认。解码只吃 base64 前 64K 字符并按 4 字符组对齐截断，避免为了一个宽高把几 MB 的 data URL 全解一遍。

## 不做 CMYK

与 `print-bleed.ts` 同一立场：浏览器只能出 sRGB PNG，四色分色与输出意图必须留给印前软件。本模块给出的每个数字都是画布几何推导出来的事实，没有任何色彩空间断言。

## 验证（failure → cause → fix → recheck）

- `npx vitest run src/lib/print-preflight.test.ts src/hooks/use-project-health.ts` → **1 file / 10 tests passed**（第二个路径无对应测试文件，vitest 按过滤器只跑到前者）。
- `npx tsc --noEmit -p tsconfig.app.json` → 0 error。
- `npx eslint` 三个改动文件 → 0 问题。
- 回归消费方：`npx vitest run src/App.test.tsx src/lib/resource-health.test.ts src/components/workspaces/DeliveryWorkspace.test.tsx` → **3 files / 138 tests passed**。
- 一次通过，无 failure→fix 循环。唯一预防性处理：dpi 比较留 0.5% 余量（`DPI_MATCH_TOLERANCE`），否则 `300 × 96 ÷ 300 = 96` 这类整除结果会被浮点尾差判成不达标。

## 与并行代理的交叠

本轮另有代理在 `resource-health.ts`（本轮对我 FORBIDDEN）里加 `code: "low-print-resolution"` 的资源级分辨率检查。两边不会互相污染：`runPrintPreflight` 只取 `kind === "font"` 的结果，新增的 `kind === "resource"` 项不会进印前清单。但交付页若同时展示「资源缺失」与「印前体检」两栏，分辨率警告会出现两次，接线时需要主调度定夺留哪一份口径（本模块按导出倍率浮动下限，资源侧是固定线）。该代理写的 `src/lib/print-preflight.journey.test.ts` 直接打我的 API，已随本轮一起跑通。

## 交付方式与回滚

- 验收：PR + CI（上述四项检查）。
- **非破坏性**：新模块是纯增量，无 schema、无导出格式、无 API 形状变化。`useProjectHealth` 的两个新入参 `pngScale` / `transparentExport` 都有默认值（1 / false），现有调用方一行不改即可编译。
- 回滚：删 `print-preflight.ts` 与其测试，还原 `use-project-health.ts` 的四处增量（import、可选入参、memo、返回字段）即可，无数据迁移。

## 未接线（本轮 ownership 之外）

`DeliveryWorkspace.tsx` 本轮 FORBIDDEN，所以交付页还没有「印前体检」分区。接线只需：

```tsx
// stage-slots / workspace-props 把 printPreflight 传下去，并传入真实导出参数
const health = useProjectHealth({ ..., pngScale, transparentExport });
<CheckSection title="印前体检" issues={health.printPreflight.issues.map((issue) => ({ kind: "resource", issue }))} onLocate={onLocate} />
```

`PrintPreflightIssue.target` 用的就是 `resource-health` 那套定位串（`background` / `map` / `province:X` / `asset:X` / `text:X` / `cards:X` …），`resolveDeliveryIssueLocation` 现成可解析，因此本轮没有改 `delivery-target.ts`。唯一例外是全局项 `export-resolution` 的 `target: "export"`：它不对应任何画布对象，解析返回 `undefined`，`locateDeliveryIssue` 已按 no-op 处理。若之后要让它跳到导出设置，需要给 `DeliveryIssueLocation` 加一个分支并同步 `use-studio-navigation.ts`（两者本轮都不可改）。
