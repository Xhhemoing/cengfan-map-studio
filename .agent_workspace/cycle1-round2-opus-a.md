# Cycle 1 Round 2 — opus-fast-A 报告

**Slug:** `claude-opus-5-thinking-high-fast`（未降级）
**分支:** `cursor/canvas-render-display-46a1`（未提交,按指令不 commit/push）
**范围:** P0-1、P0-2、P2（P2 为 cheap 版本）

---

## P0-1 `App.tsx` 回调身份稳定化

### 问题

`App.tsx` 在两处 `PosterCanvas` 挂载点(`ContentLayoutWorkspace` 约 1839 行、legacy 编辑器约 2374 行)以及 `MapStyleWorkspace`(约 1709 行)全部内联箭头函数。这些闭包捕获 `project` / `maybeSnap` / `commitProject` / `patchScene`,每次 App 渲染都是新引用,`PosterCanvas` 内 `MapLayer`、`DestinationCard` 等 `memo` 一律被击穿。

### 做法

沿用仓库既有的 latest-ref 约定(`saveWorkspaceNowRef` / `projectLifecycleRef`,注释里已写明「lint 禁止渲染期写 ref」):

- 新增 `canvasCallbacksRef`,在**无依赖数组的 `useEffect`** 中同步 `{ project, maybeSnap, commitProject, patchScene, handleSceneSelect, handleLegacySceneSelect }`;`useRef` 初值就是首帧闭包,覆盖 effect 未跑完的首帧事件窗口。
- 新增 9 个 `useCallback(..., [])`:`handleCanvasSelect`、`handleCanvasLegacySelect`、`handleCanvasMoveText`、`handleCanvasMoveAsset`、`handleCanvasResizeAsset`、`handleCanvasMoveProvinceTexture`、`handleCanvasResizeMapImage`、`handleCanvasMoveCard`、`handleCanvasMoveGuests`。
- `captureCardPositions` 原本每渲染新建,已改为 `useCallback([])`(只写 ref,无捕获)。附带收益:`PosterCanvas` 里 `onCardPositionsResolved` 的 effect 不再每次 App 渲染重跑。
- 三处挂载点的内联 lambda 全部替换为上述稳定引用。

### 行为保持

- 仍走 `commitProject(applyTransaction(project, ...))`,**没有**改成 `commitProjectTransaction`——后者会额外 `setAgentPreview(null)`,属于行为变更,已刻意避开。
- `maybeSnap` 语义不变(`showGrid` 常为 false → `Math.round`);`patchScene` 的 `freezeCardPositionsForMapChange` 分支不变。
- `onMoveAsset` / `onResizeAsset` 的「位置未变则不提交」空转保护通过 ref 读最新 `project.assetElements`,等价。

### 覆盖

新增 `src/App.canvas-callbacks.test.tsx`(mock `PosterCanvas` 记录 props):

1. `onSelect({type:"map"})` 触发重渲染后、以及一次 `onMoveCard` 提交(`project` 换新对象)后,9 个回调全部 `toBe` 同一引用。
2. 连续三次提交(两次 `onMoveCard` + 一次 `onMoveGuests`)互不覆盖 → 证明 ref 读到的是**最新** `project`,不是挂载期快照;`maybeSnap` 取整仍生效(`40.4/60.6 → 40/61`)。

**反向验证:** 临时把 legacy 站点的 `onMoveGuests` 包回内联 lambda,测试如期失败
(`AssertionError: onMoveGuests identity should survive the re-render`),随后还原并复跑通过。该用例确实能锁住回归。

---

## P0-2 `useCardLayoutWorker` stale-while-revalidate

### 问题

派发 worker 前无条件 `setState({ key, result: null, pending: true })`,并且渲染期 `state.key !== request.key` 时返回 `resolved.result`(cache miss 即 `null`)。`PosterCanvas` 的 `destinationCards` 在 `!layoutState.result` 时返回 `[]` → 布局期整层卡片卸载再挂载,肉眼可见闪烁。

### 做法(`useCardLayoutWorker.ts`,两处)

1. 派发分支改为函数式更新,保留上一份结果:
   `setState((previous) => ({ key: currentRequest.key, result: previous.result, pending: true }))`
2. 渲染期返回改为三段:
   - `state.key === request.key && state.result` → 返回 state(已结算或正携带旧结果 revalidate 中);
   - `resolved.key === request.key && resolved.result` → 命中缓存 / `forceSync` / 无 worker 的同步解;
   - 否则返回 `{ result: state.result, pending: true }`——**保留上一 key 的结果**,只有从未解出过布局时才是 `null`。

`state.key` 语义微调为「当前 pending/已结算的 key」,`result` 可能仍属于上一个 key;注释已写明。**过期响应过滤逻辑未动**:仍靠 `requestIdRef` + `activeKeyRef` 双重比对丢弃迟到消息;worker `onerror` 的同步兜底同样未动。

### 覆盖

- `useCardLayoutWorker.test.tsx`:原用例 `does not expose the previous result while a new key is pending` 与 P0-2 直接冲突,改写为 `keeps serving the previous result while a new key is pending`——断言新 key 的每一帧渲染都拿到旧结果、`pending: true`,worker 回包后切到新结果、`pending: false`。
- 同文件 `replaces an errored worker before posting the next cache miss`:第三个 key 派发期间由「`result` 为 `null`」改为「仍是 error 兜底解出的第二份结果」,迟到的过期响应依然被忽略(`toBe(fallbackResult)`)。
- gpt-sol 侧已先行落的 `useCardLayoutWorker.stale.test.tsx`(慢 worker 全链路 SWR)在本实现下**直接转绿**,未做修改。

### 与 `onCardPositionsResolved` 的交互(已核查)

SWR 期间 `destinationCards` 不再为空,`onCardPositionsResolved` 会带着旧坐标再报一次。而 `resolvedCardPositionsRef` 在旧行为下本来就保留着同一批旧坐标(空数组时 effect 直接 early-return),内容一致,`freezeCardPositionsForMapChange` 行为不变。

---

## P2 布局 cache key 序列化

两处改动,**不触碰 `solveCardLayout` 语义**:

1. `src/lib/card-layout-cache.ts`:省多边形段从 key 主体中拆出、按数组实例做 `WeakMap` 记忆化,再以 `|` 拼到 JSON 主体后面。多边形段只含数字/括号/固定的 `rings`/`bounds` 字面量,不含 `|`,拼接可逆、无碰撞风险。
2. `src/components/canvas/PosterCanvas.tsx`:`provincePolygons` 的依赖由整块 `project.map` 收窄为实际读到的字段(`renderSource / provinceStyles / width / height / x / y / scale`)。改地图描边色、陆地色、高亮色、省名标签开关不再重投影+重简化全部省份轮廓,多边形数组实例得以保留。

微基准(34 省 × 160 点/环,300 次):

| 场景 | 每次 key 生成 |
| --- | --- |
| 多边形数组实例稳定 | **0.015 ms** |
| 多边形数组每次新建 | 0.842 ms |

约 56×。

**仍未覆盖:** 单省配色改的是 `project.map.provinceStyles`,依然会换掉多边形数组;彻底解决需要额外抽一个「隐藏省份集合」memo,超出本轮 `PosterCanvas` 只允许改依赖数组的边界,留给后续。另外 `mapContentBounds` / `layoutOccupiedAreas` 仍吃整块 `project.map`,所以配色改动仍会重算 `layoutRequest` memo——只是现在这次重算里最贵的多边形序列化被 WeakMap 挡掉了。

---

## 验证证据链

规定命令(`useCardLayoutWorker.stale.test.tsx` 属他人新增,一并跑):

```
npx vitest run src/components/canvas/useCardLayoutWorker.test.tsx \
  src/components/canvas/useCardLayoutWorker.stale.test.tsx \
  src/lib/card-layout-cache.test.ts \
  src/components/canvas/PosterCanvas.performance.test.tsx \
  src/components/canvas/PosterCanvas.test.tsx
→ 5 files / 59 tests passed
```

加上新增 App 用例:

```
npx vitest run src/components/canvas/useCardLayoutWorker.test.tsx src/lib/card-layout-cache.test.ts \
  src/components/canvas/PosterCanvas.performance.test.tsx src/components/canvas/PosterCanvas.test.tsx \
  src/App.canvas-callbacks.test.tsx
→ 5 files / 60 tests passed
```

回归面:

```
npx vitest run src/App.test.tsx src/App.debug.test.tsx src/components/AppProjectMode.test.tsx \
  src/components/canvas src/lib/card-layout.test.ts
→ 23 files / 307 tests passed
```

静态检查:`npx tsc -p tsconfig.app.json --noEmit` 无输出;`npx eslint`(6 个改动文件)无输出。

### failure → cause → fix → recheck

本轮只出现两类 failure,均已闭环:

1. **failure** `useCardLayoutWorker.test.tsx` 两个用例断言「pending 时 result 为 null」。
   **cause** 这正是 P0-1 结论里认定的缺陷行为,旧测试把它锁成了契约。
   **fix** 按 SWR 语义改写断言(保留旧结果 + `pending: true`),过期响应过滤的断言原样保留。
   **recheck** 同一条 vitest 命令重跑,5 文件全绿。
2. **failure(主动构造)** 把 `onMoveGuests` 还原成内联 lambda,`App.canvas-callbacks.test.tsx` 报身份不等。
   **cause** 内联箭头每渲染换引用——即 P0-1 本体。
   **fix** 还原为稳定 `useCallback`。
   **recheck** 同文件重跑通过。用例具备反向鉴别力,不是恒真断言。

期间 `tsc` 曾报 `DestinationCard.tsx(9,1) TS6192`,系 opus-B 在同一工作树内的在途编辑,与本轮改动无关,其修复后该报错自行消失。

---

## 交付与回滚

- **验收方式:** 上述 vitest 命令 + `npx tsc --noEmit` + `npx eslint`;人工验收看两点——(a) 拖动一张去向卡时地图层不重绘;(b) 改卡片字号/新增学生等触发重排时,卡片层不再整层消失再出现。
- **破坏性变更:** 无。数据结构、导出格式、API 形状、`data-*` 契约均未动;`createCardLayoutCacheKey` 的输出字符串形状变了(多边形段后置),但它只作为进程内 LRU 的键,不落盘、不跨版本比对。
- **回滚:** 三个改动互相独立,可单独还原 `src/App.tsx`(P0-1)、`src/components/canvas/useCardLayoutWorker.ts` + 其测试(P0-2)、`src/lib/card-layout-cache.ts` + `PosterCanvas.tsx` 依赖数组(P2)。

## 改动文件

- `src/App.tsx`
- `src/App.canvas-callbacks.test.tsx`(新增)
- `src/components/canvas/useCardLayoutWorker.ts`
- `src/components/canvas/useCardLayoutWorker.test.tsx`
- `src/lib/card-layout-cache.ts`
- `src/components/canvas/PosterCanvas.tsx`(仅 `provincePolygons` 依赖数组 + 注释)
