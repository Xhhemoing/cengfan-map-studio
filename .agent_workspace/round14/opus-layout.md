# R14-opus-layout — 侧栏排布把一整列卡片挤成一摞

MODEL_SLUG: claude-opus-5-thinking-high-fast

- **分支**: `cursor/agent-sota-polish-cbcd`（未 commit / stash / 新建分支 / push）
- **改动文件**: `src/lib/card-layout-modes.ts`（+10 行，其中实现 1 行）、`src/lib/card-layout-modes.test.ts`（115 → 238 行）
- **未改**: `card-layout-cache.ts`（禁改）、求解器其余全部模块、任何 bench 脚本、任何 UI

---

## 结论先说

`isotonicPack` 有一个**确定性重叠 bug**：只要某条边上的卡片锚点集中在这条边的尾部（比如东南沿海几个省的卡片都排在右栏底部），排布链会甩出 `span.end`，随后逐卡 clamp 会把所有甩出去的卡片**压到同一个坐标上**——即使这条边明明装得下它们。这不是饱和：复现盘上右栏有 660px，三张卡连间隙只要 624px。

修法是一行：反向传播开始前，先把最后一张卡拉回 span 尾部。这样「压扁」变成「整块上移」。

这个 bug 的下游后果比重叠本身更难看。修复前后同一块盘（900×700，三张 180×200 的卡锚在东南）：

| | guangdong | guangxi | hainan |
| --- | --- | --- | --- |
| 修前 | `right 612,240` | `right 20,20` | `left 20,236` |
| 修后 | `right 612,38` | `right 612,250` | `right 612,462` |

修前两张锚点在 x=720/740 的卡被甩到 **x=20 的左边距**，引线得横穿整张地图；其中一张的 `side` 还是假的（标着 `right` 却坐在左边距，见「顺带查到的两件事」）。修后三张整齐落在右栏，间距正好是 gap 12。

---

## 缺陷：反向传播只认头，不认尾

`isotonicPack` 是四步：**前向**推开重叠 → **反向**回收 → **逐卡 clamp 进 span** → **整块居中**。

前向只知道 `span.start`（它单调增），反向只用 `positions[i+1]` 约束 `positions[i]`——而 `positions[n-1]` **谁都不约束**。于是链条尾部可以停在 `span.end` 外面。第三步的 clamp 是**逐卡独立**的，凡是超出的卡全部被压到 `span.end - size` 这一个值上。

最小复现（span 100，两张 40 的卡，间隙 0——明显装得下）：

```
targets [60, 60]  sizes [40, 40]  gap 0  span [0, 100]
前向 → [60, 100]
反向 → [60, 100]     ← i=0 的约束是 100-40-0=60，不动；i=1 无人约束
clamp → [60,  60]     ← 100 被压成 60，两张卡完全重合
居中 → [30,  30]
```

真实量级的版本（`isotonicPack([460,480,500], [200,200,200], 12, {start:20,end:680})`）修前返回 `[240, 260, 260]`：后两张 200px 高的卡**逐像素重合**，第三张彻底看不见。

### 为什么线上没看到两张卡叠着

因为 `packSides` 兜住了：重合的那张过不了 `accepted.some(overlaps)` 校验，`blockBroken` 一置位，它和它后面的卡全被踢去邻边，邻边装不下再落到 `containFree`。**最终画面不重叠，但地理被撕碎**——这正是上表里两张东南的卡跑到左边距的原因。所以这个 bug 的表现形式是「卡片莫名其妙飞到对面」，不是「卡片叠在一起」，之前几轮盯重叠没盯出来大概就是这个缘故。

### 修法

```ts
positions[n - 1] = Math.min(positions[n - 1]!, Math.max(span.start, span.end - sizes[n - 1]!));
```

放在反向传播之前。`Math.max(span.start, ...)` 与后面 clamp 的写法一致，单张卡比 span 还大时不会反向。

**可以证明修完就对**：设 `totalPacked = sum(sizes) + packedGap*(n-1)`。加了种子之后 `b[n-1] ≤ span.end - sizes[n-1]`，而 `b[i] ≤ b[i+1] - sizes[i] - packedGap`，逐级展开得 `b[0] ≥ span.end - totalPacked`；同时反向只会减小前向值，前向值 `≥ span.start`。所以 `totalPacked ≤ span` 时每个 `b[i]` 都落在 `[span.start, span.end - sizes[i]]` 里，**第三步 clamp 一次都不触发**，链条严格 gap 分离。装不下时（`totalPacked > span`）clamp 照旧兜底，只是堆积点从 span 尾换到 span 头，重叠对数不变——这部分才是真饱和，没动。

两条既有 `isotonicPack` 用例的输出逐值未变（`[80,130,180]`、`[0,110,220]`），手算核过。

---

## 被这个 bug 伪装成「拥挤」的既有用例

`card-layout-modes.test.ts` 里的 `crowdedLeftColumn` 注释写着「左栏装不下分给它的四张卡」，断言 c1 溢出到 top。修完之后这条红了：**左栏其实装得下**——660px 的轴装 640px 的卡，四张全留在左边。也就是说这个 fixture 的「拥挤」是 bug 造出来的假象，断言锁住的是错误行为。

不能只改断言了事，这条用例守的是一个真契约（溢出时要退回**打断块的那张卡**，而不是 assignment 里同下标的那张——打包按边轴排序，两者顺序不同）。我先试着把 c1 加高到真超容量，结果发现**容量型溢出根本区分不出这个契约**：一旦超容量，`packedGap` 会压到 `MIN_GAP=4`，全线间距都低于 `space.gap=12`，块必定断在轴序第 1 张并把后面全部拖走，正确实现与按下标实现的最终画面完全一致（我扫了 h=180…320 共 15 个高度，两种实现输出**逐字节相同**）。

改用**障碍型**溢出：加一块 `lowerLeftZone {20,500,280,180}` 占掉左栏底部。左栏前三张照常落位，轴序最后一张 c1 的位置被占 → 只有它溢出到 top。这恰好还原了原用例的判别力：c1 在 assignment 里的下标对应的是 c3，而 c3 已经放好了。

**反向验证**：把 `rejected.push(card)` 换成 `rejected.push(assignment.cards[i]!)`，新 fixture 下 c3 被放两次（7 张卡出来 8 个 placement）、c1 跑到 bottom——用例红。旧 fixture（超容量版）下则**全绿**，证明换 fixture 是必要的而不是为了让测试好看。

---

## 新增用例

`card-layout-modes.test.ts` 9 → 11 条，文件 238 行（≤400）：

| 用例 | 守什么 |
| --- | --- |
| `slides a chain of low targets up as a block instead of stacking its tail` | 上面那个真实量级复现，逐对断言间距 ≥ size+gap |
| `separates every card whenever the span has room for the chain` | 400 组随机（确定性 PRNG）：只要 span 装得下就必须 gap 分离且不出界。这条覆盖的是上面那个证明 |
| `keeps a column that has room for its cards whole` | 原 `crowdedLeftColumn` 盘：四张卡都该留在左栏 |
| `keeps a cluster of southern anchors in the column they belong to` | 端到端过 `solveCardLayout`：东南簇必须留在右栏且 `x > map.x`（不许飞到对面）|
| `never overlaps cards while the canvas still has room for them` | **简报点名要的那条**：60 盘 × 2 模式，锚点全挤在地图一角，断言 `status === "solved"` 且零重叠对 |

最后一条**修前修后都绿**——如上所述，`packSides` 会把重叠吸收成「甩到对面」。我保留它是因为简报明确要求这条常驻护栏，并且它顺带钉住了「修完不许退化成 fallback」；真正抓这个 bug 的是前四条。

**反向验证（整体）**：把那一行实现删掉重跑 → **5 条红**（上表前四条 + 改造后的溢出配对用例），其余 6 条绿。

---

## 验证（failure → cause → fix → recheck）

1. **failure**：`isotonicPack([460,480,500],[200,200,200],12,{start:20,end:680})` 返回 `[240,260,260]`，后两张 200px 的卡完全重合；端到端 `solveCardLayout` 把两张东南的卡甩到 x=20 的左边距。
2. **cause**：反向传播不约束 `positions[n-1]`，链条尾部可以停在 `span.end` 外；随后**逐卡独立** clamp 把所有超出的卡压到 `span.end - size` 同一个坐标。
3. **fix**：反向传播前先把最后一张卡拉进 span 尾部（1 行），把「压扁」变成「整块平移」。
4. **recheck**：同一组输入 → `[38, 250, 462]`（间距正好 212 = 200+12）；端到端三张卡全部 `right 612,*`。`npx vitest run src/lib/card-layout-modes.test.ts` → 11/11。

其余检查：

- 布局全部套件 `card-layout{,-modes,-space,-index,-cache,-worker-protocol}.test.ts` → **117/117**；
- 全量 `npx vitest run` → **203 files / 1781 tests 全绿**（含本轮其他代理的改动，无 unhandled error）；
- `npx tsc -p tsconfig.app.json --noEmit` → 0 错误；
- `npx eslint src/lib/card-layout-modes.ts src/lib/card-layout-modes.test.ts` → 0 问题。

`git status` 确认我只碰了 `card-layout-modes.ts` / `card-layout-modes.test.ts` 两个文件（其余 diff 属同轮其他代理）；临时探针文件已删除。

---

## 顺带查到的两件事（**未修**，都在饱和末路径上，已验证可复现）

简报说「只找饱和残余就记下原因」。我找到的主 bug 不是饱和，但排查过程中确实撞到两处饱和路径的真问题，写清楚留给下一轮：

### 1. `stackAtMargin` 单趟扫描会漏掉它跳过的卡 —— 能造出**完全重合**的卡

`card-layout-pack.ts` 的 `stackAtMargin` 对 `placed.items` **只扫一趟**，且按插入顺序。一张一开始在 `y` 下方、因而被跳过的卡，会在后续卡把 `y` 往下推之后重新落进冲突区，但它不会被再看一眼。

已复现（`margin=0, gap=0`，新卡高 20，插入顺序 B(100–110) → A(0–10) → C(10–100)）：

- B：`100 < 0+20` 不成立 → 跳过；
- A：命中 → `y = 10`；
- C：命中 → `y = 100`；
- 结果落在 **(0, 100)**，与 B 的 (0, 100) **逐像素重合**——而 y=200 以下全是空的。

它的 docstring 明写「skipping past cards already there so nothing fully coincides」，所以这是违背自身契约；更糟的是 `layoutQuality` 把「完全重合」排在比「部分重叠」**更差**的位置（重合的卡不可读、不可选中），而这条路径恰恰能造出它。修法很小（先按 y 排序，或循环到稳定为止）。

**没在本轮修的原因**：只有 `containFree` 扫遍全画布无果、或 `packSides` 已经置位 `saturated` 时才会走到 `stackAtMargin`，触发条件本身就是饱和，落在简报划掉的范围里。

### 2. `packSides` 剩余卡的 `side` 是个占位符，会原样漏进结果

`packSides` 末尾给未放置的卡造探针 `{...card, x: margin, y: margin, side: "right"}`，这个 `"right"` 是占位符不是分配结果。`containFree` 在两条早退路径上会把它原样带出来：`isFree(placement)` 直接命中时整个返回探针；扫描无果时 `stackAtMargin` 也只改坐标不改 `side`（走扫描命中路径的那条是对的，会重算 `space.sideOf`）。

已复现：随机盘上出现 `c7 labelled right but sits left at 20,454`——坐在左边距、却带着 `right`。`side` 会喂给 `buildConnectorGeometry` 的 `preferredSide`，于是引线从卡片右缘出发、朝着背离锚点的方向绕回来。

**注意别扩大化**：我一开始用 `space.sideOf(p) !== p.side` 扫，400 盘扫出 1527 处，但绝大多数是**设计如此**——`side` 表示「归属哪一栏」，`resolveObstacles` 沿法线推开之后几何重心落进别的象限是正常的（`right 612,59` 就该叫 right）。真正错的只有剩余卡这一类，因为那个 `"right"` 压根不是分配出来的。修的时候应该只让 `containFree` / `stackAtMargin` 在返回前重算 `side`，不要去动 `packSideCards` 的栏位语义。

---

## 交付与回滚

- **验收方式**：PR + CI（`npm test` / `tsc` / `eslint`），上面四项已在本地全绿。手工验收：给东南几个省（广东/广西/海南）建卡并让它们的锚点都落在地图东南角 → 自动排版应把三张卡整齐排在右栏；改动前会有卡片飞到画布左边距、引线横穿地图。
- **用户可见变化**：纯排版质量改善。**不动数据、不动导出格式、不动 API 形状**——`isotonicPack` 签名与返回类型未变，`CardLayoutResult` 未变。此前会退成 `fallback` 的边角盘现在更容易拿到 `solved`（方向是好的），但 `solved` 的判据一个字没改。
- **回滚**：删掉 `card-layout-modes.ts` 里那一行 `positions[n - 1] = Math.min(...)` 即可完全恢复旧行为；测试侧 `git checkout src/lib/card-layout-modes.test.ts`。两者互相独立，但**回滚实现就必须一起回滚测试**（5 条用例会红），且 `crowdedLeftColumn` → `leftColumnBoard` 的 fixture 改名也在测试文件里。
- **风险**：饱和盘上堆积点从 span 尾移到 span 头，重叠对数不变、`layoutQuality` 不变，但具体像素坐标会变——若有人对饱和布局做过像素快照会受影响。全量 1781 条里没有这类断言。
