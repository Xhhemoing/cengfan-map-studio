[Model: claude-opus-5-thinking-high-fast]
round: R1
role: implement
scope: 交付工作台 / 导出 / 印刷提示 / 布局健康（提案 only，未落盘业务代码）

done:
- 只读扫描 `src/components/workspaces/DeliveryWorkspace.tsx`、`src/components/editor/ExportProjectDialog.tsx`、`src/components/editor/StageLayoutScreen.tsx`、`src/lib/layout-health.ts`、`src/lib/layout-health-input.ts`、`src/lib/print-size.ts`、`src/lib/usePosterExport.ts`、`src/lib/export-poster.ts`、`src/lib/editor-navigation.ts`、`src/lib/delivery-target.ts`、`src/lib/resource-health.ts`、`src/lib/grid.ts` 与对应 test。
- 用**临时探针测试**（跑完即删，`git status` 干净）取到三组运行时事实，而不是靠读代码推断：
  1. 示例项目 `createSampleProject()` 一进来就有 **4 条排版警告**，全部是 `X 遮挡了 map`；文档写的「水印越界」在当前默认值下**不成立**（水印底边 951.6 vs 安全线 952，差 0.4px 惊险通过）。
  2. 这 4 条的「定位」**全部跳到 `map`**，而不是文案里点名要挪的那个对象。
  3. 新版壳层顶栏「项目 → 导出工程」**是死按钮**：`ExportProjectDialog` 根本没挂载。legacy 壳层同一按钮正常。
- 逐条给出 unified diff 草稿（下方 6 项）。**未修改任何 `src/`、`server/`、docs 业务文件。**

open:
- 「印刷尺寸文案是否出现在导出旁」→ **已在**（`DeliveryWorkspace.tsx` 的 `[data-export-print-size]`，cm + dpi 齐全）。但倍率 > 1 时数字自相矛盾，见 P1-2。
- 「交付警告是否可点、点完是否跳到正确对象」→ 可点，但遮挡类**跳错对象**，见 P1-3。
- 「示例项目一进来就有警告」→ **成立，4 条**；根因不是水印越界而是 `map` 包围盒被当成遮挡受害者，见 P1-1。
- 「导出忙碌态/失败态/成功态」→ 失败态、成功态齐全且有测试；**忙碌态只有 `aria-busy` + disabled，没有任何可见文字**，见 P1-6。
- 「PDF 导出」→ 文档 P2，本轮**不做**，标 ASK（见 p0/p1/p2）。
- 未解决的语义问题（需产品拍板，未写进 diff）：`describeExportPrintHint` 对「具名画布」和「非具名画布」两套语义不一致——修完后前者是「尺寸不变、dpi 翻倍」，后者仍是「尺寸翻倍、dpi 不变」。统一成前者更贴合「画布定物理尺寸、倍率定精度」的产品模型，但会改动现有已断言的字符串，本轮不动。

tests:
- **基线（改动前）**：`npx vitest run src/components/workspaces/DeliveryWorkspace.test.tsx src/lib/print-size.test.ts src/lib/layout-health.test.ts src/lib/layout-health-input.test.ts src/lib/editor-navigation.test.ts src/lib/editor-navigation-actions.test.ts src/lib/usePosterExport.test.tsx src/lib/usePosterExport.naming.test.tsx src/lib/usePosterExport.generation.test.tsx src/lib/card-text-layout.test.ts` → **10 files / 74 tests 全绿（3.16s）**。这是任何一条落地后必须重跑的同一条命令。
- **现有测试的盲区**（每条都对应下方一个 P1，说明为什么 74 绿仍然漏掉这些缺口）：
  - `DeliveryWorkspace.test.tsx` 只断言 `exportState: "exporting"` 时 `aria-busy="true"` 且三个按钮 disabled，**没有断言任何可见文字**——所以「无声忙碌」测不出来。
  - `print-size.test.ts` 的倍率用例只覆盖**非具名**画布（1500×1000），**没有一条具名画布 × 倍率>1** 的用例——所以 A3@2× 说成 A1 测不出来。
  - `editor-navigation.test.ts` 的 fixture 用 `overlap:map:guests`，而 `checkLayoutHealth` 真实产出的 id 是 `map:cards` 这种 `back:front` 形状；测试断言「挑出 map」，恰好把「永远跳到被遮挡方」这个 bug 固化成了预期。
  - 没有任何测试断言「示例项目交付检查为 0 条」。
- **每条改动要补的测试**写在各项 Then 里；四步证据链（failure → cause → fix → recheck）本轮只走完 failure + cause（有运行时证据），fix/recheck 是提案，**尚未执行**。

p0/p1/p2:
- **P0 × 1**：新版壳层「导出工程」死按钮（P0-1）。这是默认路径上一个功能完全不通的导出入口。
- **P1 × 5**：印刷提示倍率矛盾（P1-2）、示例项目 4 条警告（P1-1）、定位跳错对象（P1-3）、体检把 `maxWidth` 当文字宽度且空文本参与（P1-4）、忙碌态无可见文案（P1-6）。
- **P2 × 1（本轮不给 diff，只给结论）**：超大 PNG 无前置提醒。实测导出像素：A3@2× = 17.4M、A3@3× = 39.1M、A2@2× = 34.8M、A2@3× = 78.3M、展板 90×60@2× = 33.5M。iOS Safari / 微信 WebView 的 canvas 面积上限通常在 1678 万像素左右（**此数值是假设，本机无法验证**），也就是说所有印刷预设只要选到 2× 就可能在手机上直接失败，而 `export-poster.ts` 没有任何前置校验——用户要等到 `computeImageLoadTimeout` 给的几十秒预算耗尽或 `toBlob` 返回 null 之后才知道。建议在倍率下拉旁加一句超限提示（纯前端、纯提示、不拦截导出）。
- **ASK × 1**：PDF 导出。文档 `docs/产品/市场化与实用化优化.md` §4 列在 P2「交付与复用」。它不是「小前端」——需要引入 PDF 生成依赖、决定矢量还是位图、以及是否算「改导出格式」（本轮禁止项）。**请产品先拍板再排期，本轮不做。**

assumptions:
- 「示例项目」= `createSampleProject()`（`src/lib/project-store.ts`，名称「示例：2026届毕业去向」）= `createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" })`。
- 「新版壳层」= 默认路径（`activeStage !== "content" || !legacyEditorEnabled` → `StageLayoutScreen`）；「legacy 壳层」= `LEGACY_EDITOR_STORAGE_KEY=1` 且 `activeStage === "content"`。
- P1-4 的字形宽度模型直接复用仓库已有的 `card-text-layout.ts`（CJK 1em / Latin 0.58em / 空白 0.35em），不引入新的度量口径。
- P1-3 的 `focusId` 取**可选**字段而非必填：必填在工程上更好（编译器逼每个产出点表态），但会改动多个测试 fixture；本轮按「小前端」取可选，如果 R2 愿意吃这点测试改动，建议改必填。

do_not_touch:
- 未改任何业务文件；本文件是本轮唯一产出。
- 不碰 `.cengfan` 工程包格式（`project-package.ts`）、不碰 PNG 编码链路（`svgToPngBlob` / `downloadBlob` / `export-filename.ts`）、不碰 `NAMED_PRINT_SIZES` 与 `CANVAS_SIZE_PRESETS` 的数值（改了等于改画布尺寸，属于数据破坏性变更）。
- 不碰 `sampleStudents` 与 `DEFAULT_TEXTS` 的坐标：P1-1 的根因在体检规则不在示例数据，挪默认坐标只是把症状按下去。
- P0-1 与 `R1-gpt-a11y.md` 第 2 条是**同一根因**（`ExportProjectDialog` 未挂载）。我这边给的是「按钮不通」的功能修法，他那边给的是焦点陷阱 / Esc / 焦点归还的无障碍修法。**合成时按一条处理，两个修法叠加，不要重复计数。**

next:
1. 先落 P0-1（死按钮），它是唯一一条「功能不通」。
2. 再落 P1-1 + P1-4（示例警告清零）。两条一起落，落完在 `project-store.test.ts` 或新建 `delivery-health.sample.test.ts` 加一条「示例项目交付检查 0 条」的守门测试，并回填 `docs/产品/市场化与实用化优化.md` §6 的「示例项目交付警告清零」状态。注意：文档写的是「水印越界」，实测不成立，落地时**顺手把文档这句话改成实际根因**，否则下一轮还会有人去找不存在的水印 bug。
3. P1-2、P1-3、P1-6 三条互不相干，可并行。
4. P2（像素上限提醒）单独排，需要先确认 iOS/微信 WebView 的实际上限数值。
5. PDF 走 ASK。

---

## P0-1 · 新版壳层「项目 → 导出工程」是死按钮

**Given** 默认（新版）壳层，任意阶段。
**When** 点顶栏「项目」→「导出工程」。
**Then** 当前：`openProjectExportDialog()` 把 `showProjectExportDialog` 置 true，但 `<ExportProjectDialog>` 写在 `App.tsx` 第 817 行，而 `StageLayoutScreen` 在第 728–787 行就 `return` 了——弹层永远不挂载。没有下载、没有弹层、没有报错，**按钮完全无反应**。修复后应出现 `[role="dialog"][aria-label="导出工程确认"]`。

运行时证据（临时探针，已删除）：

```
describe("probe: 顶栏项目菜单的导出工程")
  ✓ new stage shell: dialog never mounts     // 点击后 querySelector('[role="dialog"][aria-label="导出工程确认"]') === null
  ✓ legacy shell: dialog mounts              // 同一按钮在 legacy 壳层正常弹出
 Test Files  1 passed (1)  Tests  2 passed (2)
```

注意：交付轨自己的「工程包」按钮**不受影响**——`StageLayoutScreen` 给它接的是 `posterExport.exportProjectPackage`（直接导出，用交付轨自带的「工程包包含资源」勾选框），绕过了弹层。所以坏的只有顶栏这一个入口。

```diff
--- a/src/App.tsx
+++ b/src/App.tsx
@@
   if (activeStage !== "content" || !legacyEditorEnabled) {
     return (
-      <StageLayoutScreen
-        stage={activeStage}
+      <>
+        <StageLayoutScreen
+          stage={activeStage}
@@
-        onLocateDeliveryIssue={locateDeliveryIssue}
-      />
+          onLocateDeliveryIssue={locateDeliveryIssue}
+        />
+        {/* 顶栏项目菜单在两套壳层里都能开这个弹层，挂载点也必须在两套壳层里都有。 */}
+        <ExportProjectDialog posterExport={posterExport} />
+      </>
     );
   }
```

（`.dialog-backdrop` 是 `position: fixed; z-index: 100`，放在 `StageLayoutScreen` 之后不影响层叠。上面省略号处的其余 props 原样不动，实际 diff 是整段缩进 +2。若嫌缩进噪音大，等价写法是把 `StageLayoutScreen` 提成一个局部变量再返回 fragment。）

**要补的测试**：在 `src/App.project-persistence.test.tsx`（已有 legacy 版「导出工程弹层」用例，第 92–97 行）旁边加一条 `renderPublicApp()` 的对照用例，断言新版壳层点完同一按钮后弹层存在、`input[aria-label="导出时包含资源包"]` 默认勾选。

---

## P1-1 · 示例项目一进来就有 4 条排版警告，全部是「X 遮挡了 map」

**Given** 工作台点「载入示例项目」，进交付阶段。
**When** 看「交付检查 → 排版问题」。
**Then** 当前显示 **4 项**，宣发第一张图就带警告；修复后应为 **0 项**，且「检查全部通过」摘要出现。

运行时证据（临时探针，已删除）：

```
canvas: {width: 1500, height: 1000, safeMargin: 48}
layout issues (baseline):
  occlusion/map:cards        cards 遮挡了 map
  occlusion/map:text-title   text-title 遮挡了 map
  occlusion/map:text-subtitle text-subtitle 遮挡了 map
  occlusion/map:text-stats   text-stats 遮挡了 map
data issues: []   resource issues: []
```

根因不是水印。四条的被遮挡方**全是 `map`**，而 `map` 的包围盒是 350..1150 × 120..810 的一整只矩形，里面大半是海域和留白。真正的重叠量小得离谱：`cards` 只探进去 10px 宽（1800px²，占卡片面积 4.5%），`text-title` 探进去 18.6px 高。而渲染端对同一件事的口径完全不同——`PosterCanvas` 只把 `nonProvinceMapAreas` / 省份多边形当障碍物，并且 `cards.allowMapOverlap` 是一个一等公民的开关，说明「压在地图盒子上」本来就是既定版式而不是缺陷。

修法：`map` 不再作为遮挡的受害方。越界检查（`out-of-bounds` / `overflow`）对 `map` **照旧生效**，只摘掉遮挡配对这一项。探针验证：单这一条改动即可让示例项目的 4 条全部清零。

```diff
--- a/src/lib/layout-health.ts
+++ b/src/lib/layout-health.ts
@@ export function checkLayoutHealth(input: LayoutHealthInput): LayoutHealthIssue[] {
       if (leftZ === rightZ) continue;
       const back = leftZ < rightZ ? left.object : right.object;
       const front = leftZ < rightZ ? right.object : left.object;
+      // 地图的包围盒大半是海域和留白，卡片/标题压进盒子边缘是既定版式——`cards.allowMapOverlap`
+      // 就是给这件事的开关，渲染端也只把省份多边形当障碍物，不是整只盒子。把它当遮挡受害方，
+      // 换来的是示例项目一进来就有四条谁也不会去修的警告。越界检查不受影响。
+      if (back.kind === "map") continue;
       issues.push({
         id: `${back.id}:${front.id}`,
         kind: "occlusion",
```

**要补的测试**：
- `src/lib/layout-health.test.ts`：加一条「地图包围盒不作为遮挡受害方，但仍然参与越界检查」，同时保留一条「地图压在别人上面（zIndex 更高）时仍然报」以防改过头。
- 新增守门测试：示例项目 `checkLayoutHealth(buildProjectLayoutHealthInput(createSampleProject()))` 返回 `[]`。这条是文档 §6「示例项目交付警告清零」的验收依据。

---

## P1-2 · 印刷提示在倍率 > 1 时给出前后矛盾的厘米数

**Given** 画布选「展板 90×60cm（约 100dpi）」，在交付轨看导出旁的印刷提示。
**When** 把 PNG 倍率从 1× 依次调到 2×、3×。
**Then** 当前读到 `90 × 60 cm @ 100dpi` → `120 × 80 cm @ 150dpi` → `180 × 120 cm @ 150dpi`。**1×→2× 只放大了 1.33 倍，2×→3× 又放大 1.5 倍**，而且 dpi 从预设的 100 无声跳成默认的 150。修复后应读到 `展板 90×60cm · 90 × 60 cm @ 100dpi` → `@ 200dpi` → `@ 300dpi`：尺寸是用户选的那块板子，倍率只影响精度。

运行时证据（临时探针，已删除，逐个画布预设 × 1/2/3×）：

```
A3 展板 2480x1754 @1x -> 约合印刷：A3 横版展板 · 42 × 29.7 cm @ 150dpi
A3 展板 2480x1754 @2x -> 约合印刷：84 × 59.4 cm @ 150dpi          ← A3 变成了 A1
展板 90×60cm 3543x2362 @1x -> 约合印刷：展板 90×60cm · 90 × 60 cm @ 100dpi
展板 90×60cm 3543x2362 @2x -> 约合印刷：120 × 80 cm @ 150dpi       ← 既不是 90×60 也不是 180×120
展板 90×60cm 3543x2362 @3x -> 约合印刷：180 × 120 cm @ 150dpi
```

根因：`describeExportPrintHint` 把 `widthPx * scale` 交给 `describePhysicalSize`，放大后的像素**匹配不上任何具名尺寸**，于是掉进 `pxToMm(..., DEFAULT_PRINT_DPI)` 兜底分支——预设自带的 100dpi 被 150 顶掉了。这正是文档 §4「导出旁用厘米 + dpi 说话，方便复制给打印店」要避免的那种话。

```diff
--- a/src/lib/print-size.ts
+++ b/src/lib/print-size.ts
@@
-/** Hint next to PNG export: exported pixels, spoken as print-shop centimetres. */
+/**
+ * Hint next to PNG export: exported pixels, spoken as print-shop centimetres.
+ *
+ * 画布已经是一块具名板子时，倍率买到的是精度而不是更大的板子：尺寸钉死在用户选的
+ * 那块上，dpi 随倍率走。否则放大后的像素匹配不上任何具名尺寸，会掉进 150dpi 兜底，
+ * 把 100dpi 的 90×60 展板说成「120 × 80 cm」——既不是原尺寸也不是整数倍。
+ */
 export function describeExportPrintHint(widthPx: number, heightPx: number, scale: number): string {
   const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
+  const named = matchNamedPrintSize(widthPx, heightPx);
+  if (named) {
+    const dpi = Math.round(named.dpi * safeScale);
+    return `约合印刷：${named.label} · ${formatCentimeters(named.widthMm)} × ${formatCentimeters(named.heightMm)} cm @ ${dpi}dpi`;
+  }
   return `约合印刷：${describePhysicalSize(widthPx * safeScale, heightPx * safeScale)}`;
 }
```

**这条不改任何现有断言**：`print-size.test.ts` 的倍率用例走的是非具名画布（1500×1000），`DeliveryWorkspace.test.tsx` 第 103 行同理，两者都落在未改动的兜底分支上。`describeExportPrintHint` 全仓只有 `DeliveryWorkspace.tsx` 一个调用方；`CanvasInspector.tsx` 用的是不带倍率的 `describePhysicalSize`，不受影响。**要补的测试**：`print-size.test.ts` 加「具名画布的倍率只抬 dpi、不改厘米数」，覆盖 A3@2× = `@300dpi` 与 100dpi 展板@2× = `@200dpi`（后者专门守住 dpi 被 150 顶掉这个回归）。

---

## P1-3 · 遮挡警告的「定位」永远跳到被遮挡的那一方

**Given** 交付检查里有一条「cards 遮挡了 map」。
**When** 点它右侧的「定位」。
**Then** 当前跳到 **map** 并选中地图——文案让你去挪 `cards`，界面却把地图选给你。修复后应选中 `cards`。

运行时证据（临时探针，已删除，对示例项目的每一条真实警告求解）：

```
detail=cards 遮挡了 map        | id=map:cards        | selection={"type":"map"}
detail=text-title 遮挡了 map   | id=map:text-title   | selection={"type":"map"}
detail=text-subtitle 遮挡了 map| id=map:text-subtitle| selection={"type":"map"}
detail=text-stats 遮挡了 map   | id=map:text-stats   | selection={"type":"map"}
```

根因：遮挡问题的 id 是 `` `${back.id}:${front.id}` ``，而 `resolveLayoutIssueSelection` 用 `id.split(":").find(...)` 取**第一个**认得的片段，也就是永远取 back。靠拆字符串猜意图这件事本身就不稳；与其调整取哪一段，不如让产出方直接说清楚该动谁。

（P1-1 落地后示例项目不再有遮挡警告，但用户自己叠出来的遮挡照样走这条路径，所以这条独立成立。）

```diff
--- a/src/lib/layout-health.ts
+++ b/src/lib/layout-health.ts
@@ export interface LayoutHealthIssue {
   id: string;
+  /** 用户该去动的那个对象：遮挡问题里是压在上面的一方，其余就是对象自己。 */
+  focusId?: string;
   kind: LayoutHealthIssueKind;
   severity: LayoutHealthSeverity;
   detail: string;
 }
@@ export function checkLayoutHealth(input: LayoutHealthInput): LayoutHealthIssue[] {
     if (outsideCanvas(bounds, input.canvas)) {
       issues.push({
         id: object.id,
+        focusId: object.id,
         kind: "out-of-bounds",
@@
     } else if (outsideSafeArea(bounds, input.canvas)) {
       issues.push({
         id: object.id,
+        focusId: object.id,
         kind: "overflow",
@@
     if (hasLowContrast(object)) {
       issues.push({
         id: object.id,
+        focusId: object.id,
         kind: "unreadable-text",
@@
       issues.push({
         id: `${back.id}:${front.id}`,
+        // 文案说的是「front 遮挡了 back」，那么要挪的就是 front。
+        focusId: front.id,
         kind: "occlusion",
@@
       issues.push({
         id: `${left.id}:${right.id}`,
+        focusId: left.id,
         kind: "connector-conflict",
```

```diff
--- a/src/lib/editor-navigation.ts
+++ b/src/lib/editor-navigation.ts
@@
 /**
  * 布局问题的 id 是一串由冒号连接的参与者(例如 `overlap:map:text-title`)。
  * 只认工程里真实存在的那一段,认不出来就不动选区 —— 跳到一个不存在的元素比不跳更糟。
+ * 产出方给了 `focusId` 就先认它:遮挡问题的 id 形如 `back:front`,靠位置猜会永远
+ * 选中被压住的那一方,而文案要求用户去挪的是压在上面的那一方。
  */
 export function resolveLayoutIssueSelection(
   project: ProjectDocument,
-  issue: { id: string },
+  issue: { id: string; focusId?: string },
 ): SceneSelection | null {
-  const target = issue.id.split(":").find((id) => (
+  const candidates = issue.focusId ? [issue.focusId, ...issue.id.split(":")] : issue.id.split(":");
+  const target = candidates.find((id) => (
     id === "map"
     || id === "cards"
     || id === "guests"
```

现有的「picks the map out of a composite overlap id」用例传的 fixture 没有 `focusId`，走原路径，**保持绿**。**要补的测试**：`editor-navigation.test.ts` 加「有 `focusId` 时选中 focusId 指的对象」+「`focusId` 指向已删除元素时回退到 id 拆解，而不是不动选区」；`layout-health.test.ts` 断言遮挡问题的 `focusId === front.id`。同一修复顺带惠及 `StudioAssistantRail` 的 `onLocateLayoutIssue` 与阶段总览的 `locate-layout` 动作，三处共用这一个解析器。

---

## P1-4 · 体检把 `maxWidth` 当文字宽度，空文本也参与体检

**Given** 默认文案「我们的毕业去向」（7 个汉字、42px、`maxWidth: 640`）。
**When** 跑排版体检。
**Then** 当前它的包围盒被算成 72..712 共 640px 宽——比实际渲染的 294px 宽了一倍多，于是横跨到地图头上；同时 `text-stats` / `text-note` 内容为空、屏幕上什么都没有，却照样参与遮挡配对（示例项目 4 条里有 1 条就是空的 `text-stats`）。修复后 `text-title` = 72..366、`text-subtitle` = 72..234、空文本不参与。

两处根因都有仓库内的现成对照：
- `TextLayer.tsx` 渲染的是**单个不换行的 `<text>`**（`style={{ maxWidth, inlineSize }}` 在 SVG 文本上没有浏览器实现），`maxWidth` 只是选中框尺寸和卡片求解器的预留区，**不是**文字宽度。拿它当宽度，短标题被算成一整条横幅（虚报遮挡），长标题又被算窄（漏报越界）。
- `PosterCanvas.textLayoutObstacle` 第一行就是 `if (!text.visibility || !text.content.trim()) return null;`——渲染端早就把空文本排除在障碍物之外了，体检这边没跟上。

宽度估算直接复用已有的确定性字形模型，不引入新口径：

```diff
--- a/src/lib/card-text-layout.ts
+++ b/src/lib/card-text-layout.ts
@@
-function fragmentWidth<T>(fragment: CardTextFragment<T>, fontSize: number): number {
-  let width = 0;
-  for (const character of Array.from(fragment.text)) width += characterWidth(character, fontSize);
-  return width;
-}
+/** CJK 一个 em，拉丁 0.58em，空白 0.35em；不依赖浏览器度量，排版与体检共用同一把尺。 */
+export function measureTextWidth(text: string, fontSize: number): number {
+  let width = 0;
+  for (const character of Array.from(text)) width += characterWidth(character, fontSize);
+  return width;
+}
+
+function fragmentWidth<T>(fragment: CardTextFragment<T>, fontSize: number): number {
+  return measureTextWidth(fragment.text, fontSize);
+}
```

```diff
--- a/src/lib/layout-health-input.ts
+++ b/src/lib/layout-health-input.ts
@@
+import { measureTextWidth } from "./card-text-layout";
 import type { LayoutHealthInput, LayoutHealthObject } from "./layout-health";
 import type { ProjectDocument } from "./project-document";
@@
-/** 文本按对齐方式决定包围盒起点:居中与右对齐时 x 是锚点,不是左边界。 */
+/**
+ * 文本按对齐方式决定包围盒起点:居中与右对齐时 x 是锚点,不是左边界。
+ * 宽度按字形估算而不是 `maxWidth`——`TextLayer` 渲染的是单个不换行的 `<text>`,
+ * `maxWidth` 只是选中框与卡片求解器的预留区。拿它当宽度,短标题会被算成一整条横幅
+ * (虚报遮挡),长标题又会被算窄(漏报越界)。
+ */
 function textBounds(text: ProjectDocument["textElements"][number]) {
+  const width = measureTextWidth(text.content, text.fontSize);
   const x = text.textAlign === "right"
-    ? text.x - text.maxWidth
+    ? text.x - width
     : text.textAlign === "center"
-      ? text.x - text.maxWidth / 2
+      ? text.x - width / 2
       : text.x;
-  return { x, y: text.y - text.fontSize, width: text.maxWidth, height: text.fontSize * 1.3 };
+  return { x, y: text.y - text.fontSize, width, height: text.fontSize * 1.3 };
 }
@@
-    ...project.textElements.map((text) => ({
+    // 空文本在画布上什么都不渲染,不该参与体检;`PosterCanvas.textLayoutObstacle` 已是同一口径。
+    ...project.textElements.filter((text) => text.content.trim()).map((text) => ({
       id: text.id,
       kind: "text" as const,
```

探针实测（示例项目，单独应用本条）：4 条降到 2 条（`map:cards`、`map:text-title`），与 P1-1 叠加后为 0；水印包围盒从虚高的 1072..1432 收敛到真实的 1312.2..1432，**没有引入任何新警告**。

**要补的测试**：`layout-health-input.test.ts` 加「右/居中对齐按估算宽度反推起点」「空文本不进入体检对象」「内容超过 `maxWidth` 时宽度按实际字形算而不是被 `maxWidth` 截断」；`card-text-layout.test.ts` 给新导出的 `measureTextWidth` 补 CJK/拉丁/空白三类字符的直接断言。

---

## P1-6 · 导出忙碌态没有任何可见文案

**Given** 交付轨点「PNG」，大画布导出要几秒到几十秒（`computeImageLoadTimeout` 给的预算是 `4s + 2s/MB + 1s/百万像素`，上限 60s）。
**When** 等待期间看界面。
**Then** 当前三个按钮变灰、`aria-busy="true"`，但**文字一个没变**，页面上没有任何一处说「在导出」——用户只能猜是不是没点上。成功态（`已导出 xxx.png`）和失败态（`导出失败` + 重试）都有专门的条，唯独中间这段是空的。修复后应出现一条 `role="status"` 的「正在导出，请稍候…」，主按钮文案变「导出中…」。

同仓库已有两处对照，说明这不是有意为之的省略：`LegacyEditorSidebar.tsx` 的导出按钮写了 `exportState === "exporting" ? "导出中..." : "导出 PNG"`，`stage-overview.ts` 的 `EXPORT_STATE_LABELS.exporting` 是「正在导出…」。只有新版交付轨漏了。

```diff
--- a/src/components/workspaces/DeliveryWorkspace.tsx
+++ b/src/components/workspaces/DeliveryWorkspace.tsx
@@
+      {exportState === "exporting" && <div className="delivery-workspace__progress" role="status"><span>正在导出，请稍候…</span></div>}
       {exportState === "success" && <div className="delivery-workspace__result" role="status">
@@
-        <button type="button" className="primary-button" onClick={onExportPng} disabled={exportState === "exporting"}><ImageDown size={16} aria-hidden />PNG</button>
+        <button type="button" className="primary-button" aria-label="导出 PNG" onClick={onExportPng} disabled={exportState === "exporting"}><ImageDown size={16} aria-hidden />{exportState === "exporting" ? "导出中…" : "PNG"}</button>
```

```diff
--- a/src/components/workflow-workspaces.css
+++ b/src/components/workflow-workspaces.css
@@
-.delivery-workspace__check, .delivery-workspace__controls, .delivery-workspace__error, .delivery-workspace__result { padding: 14px; background: var(--editor-surface); border: 1px solid var(--editor-line); border-radius: 7px; }
+.delivery-workspace__check, .delivery-workspace__controls, .delivery-workspace__error, .delivery-workspace__progress, .delivery-workspace__result { padding: 14px; background: var(--editor-surface); border: 1px solid var(--editor-line); border-radius: 7px; }
+.delivery-workspace__progress { color: #33566b; background: #f4f8fb; border-color: #c3d6e2; }
```

刻意不加转圈动画：`DESIGN-CONTRACT.md` 的 Motion Grammar 要求 `prefers-reduced-motion` 下非必要动效立即化，一条静态文字就够用，也省掉这项适配。

**注意现有测试会红**：`DeliveryWorkspace.test.tsx` 第 145 行断言 `exportState: "exporting"` 时 `[role="status"]` 为 null。这是本轮唯一一处需要**修改**（而非新增）既有断言的地方——那条断言原本要守的是「忙碌时不要错报成功」，改成「忙碌时出现的是 progress 条、不是 result 条」即可保住原意：`expect(container.querySelector('[role="status"]')?.classList).toContain("delivery-workspace__progress")`。给主按钮补 `aria-label="导出 PNG"` 是因为它的文案现在会变，靠文字选按钮的测试会失效（SVG/工程包两个按钮早就有 aria-label 了，这里只是补齐）。

**回滚方案**：以上六条都是纯前端、纯展示/判定层改动，不触及 `.cengfan` 工程包格式、不触及 PNG 编码链路、不改任何持久化字段，`git revert` 单个 commit 即可，旧工程照常打开。唯一有数据形状变化的是 `LayoutHealthIssue.focusId`，它是**可选**字段且只在内存里活着（不进工程包、不进 API），移除即回滚。
