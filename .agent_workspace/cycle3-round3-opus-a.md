MODEL: claude-opus-5-thinking-high-fast

# Cycle 3 Round 3（FINAL freeze）— opus-fast-A

**结论：找到 2 个真实缺口，均为「有注释无锁」型；只新增 2 个测试文件，生产代码零 diff。**

- 新增 `src/components/canvas/PosterCanvas.polygon-origin.cycle3r3.test.tsx`（2 例）
- 新增 `src/components/canvas/MapLayer.origin-isolation.cycle3r3.test.tsx`（2 例）
- **未改** `MapLayer.tsx` / `PosterCanvas.tsx` / `card-layout-cache.ts`（`git diff` 对三者为空）
- **未碰** `scripts/perf-canvas-bench.ts`（opus-B 所有）
- 无 DEV 断言、无新 memo 层、无结构改动、无求解器改动

---

## 1. 缺口一：布局 key 的调用方不变量（Round 2 §边界风险第 4 条移交项）

### 缺口定义

`card-layout-cache.ts:15-16` 白纸黑字写着这条契约：

> The caller owns the invariant that `bounds.occupiedPolygons` is exactly `polygons` translated by `originX`/`originY`; the key trusts it instead of re-walking the rings.

调用方只有一处（`PosterCanvas.tsx:624-633`）：key 收到 `bounds.occupiedPolygons = layoutOccupiedPolygons`（绝对坐标，`provincePolygons`），同时收到 `polygonOrigin.polygons = layoutOccupiedCenteredPolygons`（中心相对，`centeredProvincePolygons`）。两条链各自独立地在 `allowMapOverlap` 上分叉（`PosterCanvas.tsx:370-380`）。

一旦两侧走偏（未来只在一侧加过滤、只在一侧改 origin），**key 描述的是 A 几何，求解器吃的是 B 几何**。这不是慢，是错误缓存命中——两个真实不同的输入映射到同一 key，卡片布局会串。

### 为什么此前无锁（已实测，非推断）

我用两个反向补丁做了变异测试，对照组是所有相关既有测试：

| 变异 | `polygon-origin.cycle3r3`（新） | `pan-projection.cycle2` | `polygon-pan.cycle2` | `cache.affine.cycle3` | `cache.invariants.cycle3` |
| --- | --- | --- | --- | --- | --- |
| 变异 1：`centeredProvincePolygons.slice(1)`（少一个省，两侧数量不等） | **FAIL** `polygon count 329 !== centered count 328` | PASS | PASS | PASS | PASS |
| 变异 2：`originX: mapOriginX + 1`（数量守恒，逐点偏移 1） | **FAIL**（两例都挂） | PASS | PASS | PASS | PASS |

对照组全绿的原因是可解释的，不是巧合：

- `pan-projection.cycle2` 用例二比的是「增量 pan 的 key」vs「平移位置全新挂载的 key」。两侧走的是同一份被污染的代码，**污染方式相同**，两个 key 依然逐字节相等 → 结构性看不见。
- `polygon-pan.cycle2` 只看求解器侧 `occupiedPolygons` 是否按 delta 平移，从不回头对照 key 侧的 centered 数组。
- `affine` / `invariants` 是**函数级**测试：测试自己构造成对的输入，等于自己保证了不变量，因此永远测不到调用方是否也保证。

这正好复现 fable-A 在 `cycle3-round2-fable-a.md` 登记的那条移交：「C3-R2-3 锁的是 key 函数级不变量，PosterCanvas 调用缝的调用方不变量仍无锁」。**缺口属实。**

### 落地的锁

`PosterCanvas.polygon-origin.cycle3r3.test.tsx`：

1. **`hands the key polygons that translate to exactly the solver's obstacles`** — mock `createCardLayoutCacheKey` 捕获**入参**（不是 key 字符串），在 6 个状态下逐一核对 `bounds.occupiedPolygons[i]` 恰为 `polygonOrigin.polygons[i]` 平移 `(originX, originY)`：mount / pan / recolor / 隐藏省份 / zoom / `allowMapOverlap`。六个状态覆盖两条链可能走偏的每一种方式（只动 origin、重建 centered、重投影、两侧同时清空）。
   - 用 `!==` 精确比较而非 `toBeCloseTo`：两侧都是 `origin + point` 的同一次浮点加法，结果必须逐位相同，没有放宽的理由。
   - 返回「首个不符点」字符串而非逐点 `expect`：失败信息直接点名 `polygon 12 ring 0 point 37`，且避免上万次 `expect` 调用。
2. **`keeps the origin on the map center...`** — 锁 `originX/originY` 就是 `project.map.x + width/2`，即 centered 几何真正的减去项（`PosterCanvas.tsx:290-297` 以 `map.width/2` 为中心）。这条单独存在是因为变异 2 表明「两侧数量一致」时仍可能整体错位。

**反空跑保护：** 断言基线 `ringPointCount > 1000`（真实省界，实测 mount 态 328 个多边形）、隐藏省份态点数必须下降、`allowMapOverlap` 态必须归零。否则一旦几何意外变空，上面所有检查会全部空转通过。

---

## 2. 缺口二：`MapLayerContent` 不得读 `settings.x/y`（Round 2 冻结条款 4 的最后一项）

### 缺口定义

Round 2 冻结明令「禁止 `MapLayerContent` 子树读 `settings.x/y`」。当前代码是成立的——全仓 `settings.x/y` 只出现在 `MapLayer.tsx:573`（wrapper transform，正确位置）和 `RegionalAssetLayer.tsx:171-172`（在 `PosterCanvas` 里平级渲染，不在 memo 子树内）。

但这条禁令**只有注释，没有测试**。它又恰恰是 `contentPropsEqual` 跳过 `x`/`y` 的**唯一安全前提**：若哪天子组件开始读 `settings.x`，memo 会照常 bail out，子树保留上一帧的旧值——**渲染出错，且完全静默**。

### 为什么此前无锁（已实测）

变异 3：在 `data-map-content` 上加 `data-origin-x={settings.x}`（模拟子组件读了 x）。

| 变异 | `origin-isolation.cycle3r3`（新） | `pan-memo.cycle3` | `MapLayer.test` |
| --- | --- | --- | --- |
| 变异 3：子树读 `settings.x` | **FAIL** `data-origin-x="350"`（平移后残留）vs `"440"`（新挂载） | PASS | PASS |

`pan-memo.cycle3` 看不见的原因有两层：它 mock 掉了 `MapDataLayer`（真实子组件读什么都被替换掉了），而且它数的是**渲染次数**——子组件读 x 恰恰**不会**增加渲染次数，那正是 bug 本身。**缺口属实。**

### 落地的锁

`MapLayer.origin-isolation.cycle3r3.test.tsx`（**不 mock** `MapDataLayer`，用真实省界输出）：

1. **`draws the panned subtree exactly as a fresh mount at the panned offset would`** — 「A 渲染后平移到 B」的子树 `innerHTML` 必须与「直接在 B 全新挂载」逐字节相等。这是能捕获此类 bug 的最小判据：memo 保留旧值，新挂载没有旧值，任何对 `x/y` 的读取都会在这里现形。前置确认过子树内无 `useId`/随机 id（`MapDataLayer` 的 id 全部派生自 `feature.id`），跨挂载确定性成立。
2. **`moves the map by the wrapper transform alone`** — 反向：平移到 `(0,0)` 后 wrapper transform 必须变、子树 `innerHTML` 必须一字不变。

**反空跑保护：** 断言子树含真实 `[data-province-hit="1"]` 且 `innerHTML.length > 200`。

---

## 3. `MapLayer.tsx` 注释：判定为已完整，不改

指令允许在注释缺失或不完整时补一条不变量说明。核查 `MapLayer.tsx:302-305`：

```302:305:src/components/canvas/MapLayer.tsx
interface MapLayerContentProps {
  /** Read everything except `x`/`y`: this subtree draws in the map's own coordinate space,
   *  and the memo below skips re-rendering it when only those two moved. */
  settings: MapSettings;
```

以及 `332-334` 的 `contentPropsEqual` 说明。二者已把「不得读 x/y」与「为什么」都写清楚，且注释就挂在 props 定义上——未来改子树的人必然经过。**不重复添加**，保持生产代码零 diff。上面第 2 节的测试比再加一句注释强得多。

---

## 4. 验证链（failure → cause → fix → recheck）

本轮**无非预期失败**。三次 FAIL 全部是我主动注入的变异测试，用于证明新测试确有捕获力（否则「新增测试全绿」不构成任何证据）。

| 步 | 内容 |
| --- | --- |
| failure | 变异 1/2/3 分别令新测试 FAIL（详见 §1、§2 表格），对照组既有测试全绿 |
| cause | 三处变异精确对应两条无锁不变量：调用方两侧几何脱钩、子树读 `settings.x` |
| fix | 逐条 `StrReplace` 还原（非 `git checkout`，避免误伤并行席位的未提交改动） |
| recheck | `git diff -- src/components/canvas/MapLayer.tsx src/components/canvas/PosterCanvas.tsx` **输出为空**，两文件与 HEAD 逐字节相同 |

### 最终命令与结果

```
npx vitest run <2 新文件 + 10 邻接套件>
  → Test Files 12 passed (12) / Tests 43 passed (43)
```

覆盖：`MapLayer.origin-isolation.cycle3r3`、`PosterCanvas.polygon-origin.cycle3r3`、`MapLayer.pan-memo.cycle3`、`MapLayer.test`、`PosterCanvas.pan-projection.cycle2`、`PosterCanvas.polygon-pan.cycle2`、`PosterCanvas.pan-wrap.cycle2`、`PosterCanvas.recolor.cycle3`、`PosterCanvas.recolor-projection.cycle3`、`card-layout-cache.affine.cycle3`、`card-layout-cache.invariants.cycle3`、`card-layout-cache.test`。

```
npx eslint <2 新文件>          → exit 0
npx tsc -p tsconfig.app.json --noEmit → exit 0（全仓，非仅新文件）
```

`tsc` 本轮**未复现** Round 1 那次 `card-layout-cache.ts` TS18048 假阳性（当时判定为并行席位保存中间态），佐证该判定正确。

---

## 5. 交付与回滚

- **验收方式：** CI 跑上述 12 个套件即可；两个新文件均为纯测试，不引入运行时代码路径。
- **破坏性变更：** 无。无数据、导出格式、API 形状、`data-*` 契约变更；生产代码零 diff。
- **回滚方案：** 删除两个 `*.cycle3r3.test.tsx` 文件即可，无其他牵连。

## 6. 冻结后仍未锁的项（登记移交，本轮不动）

1. **两个新测试锁的是「当前唯一调用方」。** 若将来出现第二个 `createCardLayoutCacheKey` 调用点，它不会被自动覆盖。真正一劳永逸的做法是把不变量收进 key 函数内部（DEV-only O(1) 首点抽查），但那是生产改动，本轮冻结禁止，且首点抽查也弱于本轮的逐点核对。
2. `MapLayer.tsx` 606 行、`PosterCanvas.tsx` 超 400 行，仍超 AGENTS.md 的拆分阈值。
3. C3-R2-4（其余 defs 跨实例 id）按 Round 2 决议保持不做。
