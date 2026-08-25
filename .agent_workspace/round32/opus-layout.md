# R32-opus-layout — `solveCardLayout` 出口的 side 不变量

- **模型**: claude-opus-5-thinking-high-fast
- **分支**: `cursor/agent-sota-polish-cbcd`(未 commit / 未 push,按任务书要求)
- **改动文件**: `src/lib/card-layout.ts`、`src/lib/card-layout-space.ts`、`src/lib/card-layout.test.ts`、`src/lib/card-layout-space.test.ts`

## 缺口

Round 18–31 逐个补齐了 leftover / repair / pinned 各条路径的 `side = space.sideOf(...)`,但公共出口本身没有最后一道不变量:`packSides` 仍然把**分栏结果**(`classifySides` 判出的 left/right/top/bottom)直接盖在 placement 上,而 `resolveObstacles` 之后卡片可能已经不在那一侧了。矮地图 + 高画布时,右栏 isotonic 打包后整条链居中,最上/最下两张卡在几何上位于地图**正北 / 正南**,却依然带着 `"right"` 标签——连接线因此从远离地图的那条边出发。

## 实现

1. `card-layout-space.ts` 新增导出(`sideOf` 的近邻,不进入 `card-layout.ts` 的公共 API 面):

```ts
export function sideForShippedPlacement(placement: CardPlacement, space: LayoutSpace): CardPlacement {
  return { ...placement, side: space.sideOf(placement) };
}
```

2. `card-layout.ts` 单一公共出口(pinned merge 之后)对每个 placement 调用一次;x/y 原样透传,pinned 坐标不夹取、不移动。
3. `solve()` 的入参由 `bounds` 改为已构造好的 `LayoutSpace`,由 `solveCardLayout` 用 `pinned?.bounds ?? bounds` 构造一次并与出口共用——出口不会为了 relabel 再建第二个 space,非空求解路径的 `LayoutSpace` 构造次数与改动前完全一致。
4. 模块头的硬约束清单补第 5 条:shipped `side` 描述座位,不描述分栏。

未触碰:`repairPlacement` 的 `side: "right"` 种子、`stackAtMargin` 的 `y=maxY` 与单列边距、`pack.ts` 几何、`classifyRightStack`、`leastBad` 的 `orderResult`。也没有再包一层 packer。

## 验证(failure → cause → fix → recheck)

- **failure**: 新增 `src/lib/card-layout.test.ts` 的 `side labels at the solve exit`(900×1400 画布 / 300×200 矮地图 / 8 张东侧卡)。先把出口 relabel 换成 `{ ...placement }` 直通,`npx vitest run src/lib/card-layout.test.ts -t "relabels"` → 2 failed,`expected 'right' to be 'top'`(第二个 pinned 用例失败在自由卡那一行,pinned 卡自身的 side 断言已通过)。
- **cause**: `packSideCards` 用 assignment 的 side 盖章,`resolveObstacles` 之后没人再核对;facade 直接透传。
- **fix**: 出口 `merged.map((p) => sideForShippedPlacement(p, space))`。
- **recheck**: 同一命令 → 全绿。测试里保留了 `packed.map(side)` 全为 `"right"` 且 `packed.filter(side !== sideOf).length > 0` 的断言,出口 relabel 一旦被删就必然红——这条不变量是承重的,不是重复断言。
- 另在 `card-layout-space.test.ts` 加了 helper 的单元测:地图以北的座位带着 `"right"` 进来,出来是 `"top"`,`toEqual({ ...seat, side: "top" })` 覆盖 x/y 不变,并断言入参对象未被就地改写。

命令与结果:

| 检查 | 结果 |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.app.json` | 通过 |
| `npx vitest run` 指定 5 个 layout 测试文件 | 5 files / 142 tests 通过 |
| 加上 `card-layout-space.test.ts` | 6 files / 152 tests 通过 |
| `npm test`(全量) | 226 files / 2037 tests 通过 |
| `npm run lint` | 通过 |

行数:`card-layout.ts` 381(≤400),`card-layout-space.ts` 362。

## 行为影响与回滚

- **面向用户的变化**:高画布 / 矮地图下,原来被标成 `"right"` 的最北、最南卡片现在标成 `"top"` / `"bottom"`,连接线改从朝向地图的那条边出发。坐标一律不变,导出格式、API 形状、`CardPlacement` 字段均未变;`side` 的取值域也未变。
- **验收方式**:CI 全量 vitest + lint;人工可在编辑器里把画布调高、地图调矮,观察最北那张卡的引线是否从卡片下沿(朝地图)而非右沿出发。
- **回滚**:单点回滚——把 `solveCardLayout` 里那一行 `merged.map(...)` 换回 `merged`(可一并删掉 `sideForShippedPlacement` 与两个新测试),`solve(space)` 的签名改动可保留,不影响行为。

## 已知取舍

`solve()` 不再自己造 `LayoutSpace`,改由 facade 统一构造,因此**空名单**(0 张卡)也会走一次 `LayoutSpace` 构造(此前直接短路)。代价是一次障碍索引构建,且 `useCardLayoutWorker` 按 key 缓存结果、不会每帧重付;为此加一个可空 `space` 分支不划算,故保持直白写法。非空路径的构造次数没有增加。
