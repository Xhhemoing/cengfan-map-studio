# Cycle 3 Round 2 — opus-a（C3-R2-1 MapLayer 省份子树不随 pan 重建）

**模型：** claude-opus-5-thinking-high-fast

## 任务

Round 1 结论 C3-R2-1：「MapLayer 省份子树仍随 pan diff（~1–2ms）。仅当窄 props memo 实测 ≥1ms 才落。」

允许改动：`MapLayer.tsx*`、`PosterCanvas.tsx` 的 MapLayer props、MapLayer 测试、本报告。禁止 `card-layout-cache.ts`、`DestinationCard.tsx`、git commit。

**结论：达标并落地。** MapLayer 单层平移 2.38ms → 0.070ms（−2.31ms），整块 PosterCanvas 平移（24 卡）6.65ms → 4.20–4.88ms（−1.8~2.4ms）。远超 1ms 门槛，故未回退。

## 根因

`PosterCanvas` 里 `MemoizedMapLayer = memo(MapLayer)`，但平移是 `{ ...project.map, x, y }`——整份 `map` 换 identity，`memo` 必然 miss。MapLayer 内部虽然已经做对了两件事：

- `projectFeatures` 的 `useMemo` 依赖 `settings.width/height`（标量），平移不重投影；
- `path(feature)` 的 `d` 字符串来自投影内部的 `Map` 缓存，平移返回同一个字符串引用。

但整个 `MapLayer` 函数体仍然重跑：34 省 × (fill path + 2 条 border path + texture clip defs + hit path + label text) 全部重新创建 element、重新走 React diff。d 字符串虽是同引用（比较走 `===` 快路径），element 创建与 fiber diff 本身就是那 ~2.3ms。

平移真正改变的只有最外层 `<g data-map-layer>` 的 `transform`；`settings.x/y` 在这层以下**一处都没有被读到**（`MapDataLayer` 的贴图 `placementBounds` 默认值本来就写死 `{x:0,y:0,width,height}`，即地图局部坐标系）。

## 方案（`src/components/canvas/MapLayer.tsx`）

把组件拆成两段：

1. **外层 `MapLayer`**：只渲染 `<g data-map-layer transform=…>` 及其 data 属性 / role / 键鼠回调。平移只改这一个属性。
2. **内层 `MapLayerContent = memo(…, contentPropsEqual)`**：原来 `<g>` 内的全部内容（选中虚框、frame、`data-map-content`、南海小图、pins、标签、hit path、resize handles）原样搬入，`projectFeatures` 的 `useMemo` 随之下沉。

关键在自定义比较器而不是「窄 props」：

```ts
function settingsEqualIgnoringOrigin(previous, next) {
  if (previous === next) return true;
  const keys = Object.keys(previous);
  if (keys.length !== Object.keys(next).length) return false;
  return keys.every((key) => key === "x" || key === "y" || Object.is(previous[key], next[key]));
}
```

`contentPropsEqual` 对 `settings` 走上式、其余 props 走 `Object.is`。子树拿到的仍是**真实的 settings 对象**（不是被改写过 x/y 的副本），只是「只有 x/y 变」时不重渲染——因为子树不读 x/y，这次跳过在输出上不可观测。

顺带把两个默认值提成模块常量 `NO_PINS` / `NO_USER_FONTS`：`pins = []` 这种默认值每次渲染都新建数组，会让比较器永远失败。

### 试过但被 lint 否决的写法

先实现的是 `useLocalOriginSettings`：用 `useRef` 缓一份跨 pan 稳定的 `{...settings, x: 0, y: 0}` 传给普通 `memo`。`npx eslint` 报 `react-hooks/refs`「Cannot access refs during render」（6 处）。换成比较器后不仅 lint 干净，性能也更好——ref 方案每次换色都要多克隆一次 settings，换色比基线**慢** 0.15ms（2.41 → 2.57ms）；比较器方案换色与基线持平（2.40ms）。

`PosterCanvas.tsx` 未改动：传给 MapLayer 的 `counts / mapPins / mapTheme / selectMap / selectProvince / onMoveProvinceTexture / userFonts` 本来就是 `useMemo` / `useCallback` 稳定值，平移时只有 `settings` 换 identity。

## 实测（≥1ms 门槛的证据）

方法：临时 bench 测试文件（跑完已删除），jsdom + `createRoot`，真实 34 省 `getChinaMapFeatures()`，除 `settings` 外全部 props 保持 identity 稳定；预热 10 次后取 41 次 `flushSync` 渲染的中位数。基线用 `git stash push src/components/canvas/MapLayer.tsx` 切换，同机连续跑，每项跑 2–3 遍确认不是噪声。**每个用例单独 `-t` 过滤运行**——同文件内先跑的用例会给后跑的用例预热 JIT，混跑会把换色项虚高读成 1.3ms。

| 指标（中位数） | 改前 | 改后 |
| --- | --- | --- |
| **MapLayer 平移（34 省）** | 2.382 / 2.38 ms | **0.070 / 0.069 ms** |
| MapLayer 换色（`provinceStyles` 单省 manual-color） | 2.411 / 2.405 / 2.424 ms | 2.419 / 2.377 ms |
| **PosterCanvas 整块平移（24 卡）** | 6.672 / 6.649 ms | **4.883 / 4.197 ms** |

- 平移路径 **−2.31ms（约 34×）**，单层已降到「外层 `<g>` 改一个 transform 属性」的量级。
- 换色路径在噪声内持平（子树该重渲染时照常重渲染，只多一次 20 来个 key 的浅比较）。
- 端到端 24 卡平移 **−1.8~2.4ms**；剩下的 ~4.2ms 是 Round 1 报告里列的求解器侧开销（逐点仿射复制、`cardAnchors` 等），不在本轮范围。

bench harness 要点（可复现）：

```tsx
const render = (settings: MapSettings) => flushSync(() => root.render(
  <svg><MapLayer settings={settings} features={features} counts={counts}
    dataView="province" theme={theme} onSelectMap={noop}
    onSelectProvince={noopProvince} onMoveProvinceTexture={noop} selectedProvince={null} /></svg>));
render(base);
for (let i = 0; i < 10; i += 1) render(i % 2 === 0 ? base : panned);   // warm-up
for (let i = 0; i < 41; i += 1) { const t = performance.now(); render(i % 2 === 0 ? base : panned); samples.push(performance.now() - t); }
```

`panned = { ...base, x: base.x + 16, y: base.y + 9 }`。

## 新增测试 `src/components/canvas/MapLayer.pan-memo.cycle3.test.tsx`（3 例）

计时数字不适合进 CI，所以把「省份子树没被重建」变成确定性断言：`vi.mock("./MapDataLayer")` 换成计数 stub（省份 fill / 贴图 / 边界全部由它画）。

1. *moves the map without rebuilding the province subtree*：平移后 `data-map-layer` 的 transform 变成 `translate(440 160)`，而 MapDataLayer 渲染次数不变。
2. *still repaints provinces when an appearance setting changes*：`landColor` → `scale` → `provinceStyles` 三级递进，每一步计数都必须上升。没有这条，一个「永远不更新」的比较器也能让第 1 条通过。
3. *keeps province labels and hit targets on the panned map*：平移后标签文本、hit path、frame 宽度、选中虚框都还在——这些节点同样在 memo 子树里，跳过重渲染不等于可以丢。

## 验证（failure → cause → fix → recheck）

1. **failure：** `npx eslint src/components/canvas/MapLayer.tsx` 报 6 个 `react-hooks/refs`。
   **cause：** 第一版用 `useRef` 在 render 期间读写缓存对象（`useLocalOriginSettings`），该规则禁止 render 期读 ref。
   **fix：** 去掉 hook，改用 `memo(Component, contentPropsEqual)` 自定义比较器。
   **recheck：** 同一条 eslint 命令 → 干净；`npx tsc --noEmit -p tsconfig.app.json` → 干净。

2. **反向验证（构造失败以证明测试有效）：** `git stash push src/components/canvas/MapLayer.tsx` 后跑新测试 → *moves the map without rebuilding the province subtree* 失败：`expected 4 to be 2`（基线一次平移把两个 MapDataLayer 全部重建）。`git stash pop` 还原 → 3 例全绿。

检查记录：

- 指定命令 `npx vitest run src/components/canvas/MapLayer.test.tsx src/components/canvas/PosterCanvas.performance.test.tsx src/components/canvas/PosterCanvas.pan-projection.cycle2.test.tsx` → 3 files / 23 tests passed；加上新测试 → 4 files / 26 tests passed。
- `npx vitest run src/components/canvas` → 31 files / 210 tests passed。
- `npx vitest run src/App.test.tsx src/lib/export-poster.test.ts src/lib/export-poster.round3.test.ts` → 3 files / 124 tests passed（导出与编辑器两条真实渲染路径）。
- `npx tsc --noEmit -p tsconfig.app.json`、`npx eslint`（改动+新增文件）→ 干净。

## 风险与残余

- 比较器是「按 key 全量浅比较 + 跳过 x/y」，新增 `MapSettings` 字段无需改这里；但**如果将来 MapLayer 子树里有人开始读 `settings.x/y`，平移就会读到上一帧的值**。`MapLayerContentProps.settings` 的注释与第 1 条测试各写了一半这个约束。真要用坐标，正确做法是用地图局部坐标（原点 0,0），跟 `MapDataLayer` 的 `placementBounds` 默认值一致。
- `MapLayer.tsx` 从 517 行涨到 570 行，已超 AGENTS 的 400 行建议（改前就已超）。拆文件会越过本轮 ALLOWED 边界，留给后续。

## 交付

未提交（按指令不 git commit）。改动/新增：

- `src/components/canvas/MapLayer.tsx`（拆外层 wrapper + `memo` 内容层 + 比较器）
- 新增 `src/components/canvas/MapLayer.pan-memo.cycle3.test.tsx`
- 本报告

**验收方式：** 上述 vitest / eslint / tsc 命令；性能按「实测」一节的 bench harness 用 `git stash` 对拍复现。

**回滚方案：** 纯渲染结构改动，无数据、导出格式、API 形状变更，无持久化影响。回滚 = 还原 `MapLayer.tsx` 并删除新测试文件。
