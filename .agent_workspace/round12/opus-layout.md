# Round 12 — R12-opus-layout：引线从别人卡片正身穿过去，体检开始报了

MODEL_SLUG: claude-opus-5-thinking-high-fast

## 结果

| 文件 | 变更 |
| --- | --- |
| `src/lib/layout-health.ts` | 新增 `connector-crosses-card` 检测：连接线压进**别人**卡片正身则报警（343 行） |
| `src/lib/layout-health.test.ts` | +7 用例：穿身报、擦角不报、贴自己卡框不报、花束豁免半径两侧、贴别人卡框要报、隐藏对象、手工坐标（271 行） |
| `src/lib/connector-geometry.ts` | 新增 `segmentRectOverlapLength`（卡内弦长）；`trimSegmentsNearAnchor` 与 `CONNECTOR_ANCHOR_EXEMPT_RADIUS` 从 content-layout 迁入（330 行） |
| `src/lib/connector-geometry.test.ts` | +3 组弦长用例 + 迁入的 3 条裁剪用例（202 行） |
| `src/lib/content-layout-objects.ts` | 每条连接线带上 `cardId` 与 `anchor`；裁剪函数改为转出（279 行） |
| `src/lib/content-layout-objects.test.ts` | +4 用例：真实工程里的穿卡、让开、共锚点花束、花束之外仍报（390 行） |

`npx vitest run` 全量 **202 files / 1740 tests 全绿**；`tsc --noEmit -p tsconfig.app.json` 0 error；六个归属文件 eslint 0 问题。**未 commit。**

按简报要求：`card-layout*.ts` 求解器评分一行未动，同层卡片遮挡判定与 Round 11 的省份锚点原样保留。

---

## 缺陷：比两条线交叉更难看的那一类，一直没人报

Round 11 的收尾里我自己记了这个缺口：体检只做「线 × 线」，不做「线 × 卡」。一条引线从别人卡片正中横穿过去，在画面上比两条线在半空交叉刺眼得多，但体检一声不吭。`segmentIntersectsRect` 早就存在、求解器（`connectorHitsCard`）也一直在用，只是体检这条路径从来没接上。

难点不在「怎么判相交」，在**怎么不误报**。直接拿 `segmentIntersectsRect` 套一遍，三类东西会立刻淹掉真问题：

1. **自己那张卡。** 引线的起点就落在自己卡片的边框上，永远「相交」。
2. **共锚点花束。** 卡片常常就摆在自己省份上方，锚点落在卡身里；同锚点的每一条引线扎向锚点时最后十几像素都会扎进那张卡。这是花束的固有形状，不是排版事故。
3. **擦角。** 斜线削掉卡片一个角 2px，布尔判定说「相交」，画面上什么都看不出来。

---

## 修法：把「碰没碰到」换成「压进去多长」

### 1. 判据是卡内弦长，不是布尔值

新增 `segmentRectOverlapLength(segment, rect)`：Liang–Barsky 参数裁剪，返回线段落在矩形内部那一截的长度。求解器要的是「碰没碰到」，`segmentIntersectsRect` 保持原样一行未动；体检要的是「压进去多长」，这是两个问题。

弦长 < `CARD_CROSSING_MIN_CHORD`（4px，连接线自身描边的量级）就不报。曲线被采样成 16 段折线，各段互不重叠，逐段弦长**相加**就是整条线压在卡内的总长度——用 max 会让长曲线因为每段都短而漏报。

### 2. 自己那张卡按身份豁免，不靠几何巧合

`LayoutHealthConnector` 新增 `cardId`。也可以不加：引线端口正落在自己边框上、朝外走，弦长天然是 0。但那是巧合不是契约——elbow / curve 的控制点完全可能让线拐回自己卡身上（用例里就构造了「贴着自己右边框上行 60px」，弦长 40px）。显式豁免。

### 3. 花束豁免的是半径，不是「共锚点」这个身份

`LayoutHealthConnector` 新增 `anchor`，判定前先用 `trimSegmentsNearAnchor` 把锚点周围 24px 的会合区裁掉，与 Round 11 线×线判定用的是同一个 `CONNECTOR_ANCHOR_EXEMPT_RADIUS`。

关键是它**不是**「共锚点就整条豁免」。用例里同一束、同一个锚点，只把那张压着锚点的卡向锚点深处挪 70px：24px 圈外还剩 56px 实打实压在卡身上，照报。豁免的是一个半径，不是一张免罪符。

### 4. 常量与裁剪函数迁到 `connector-geometry`

`layout-health` 需要同一套裁剪，而 `content-layout-objects` 反过来依赖 `layout-health`——只能让它们共同的下游（`connector-geometry`，引线几何的自然归属地，不依赖任何人）持有。`content-layout-objects` 原样转出这两个名字，外部导入端一个都没改。

### 5. 包围盒粗筛（先量了再加，不是凭感觉）

curve × 卡片数很快上万次裁剪。**加之前先测**：102 张卡、curve 连接线的压力盘，`listContentLayoutIssues` 从 41.0ms 涨到 49.4ms（+8.4ms，+20%）。加一次连接线整体包围盒比较后降到 42.6ms（**+1.6ms**，省掉 4/5 开销），**产出的 2218 条问题逐条不变**。

粗筛用的是自己写的 `separated` 而不是既有的 `overlaps`：`overlaps` 是严格不等，会把「正压在卡片边框上竖直走」这种**零宽包围盒**当成够不着而提前筛掉——那恰恰是要报的情况。这一条单独有用例钉住（见下面反向验证 E）。

---

## 验证（failure → cause → fix → recheck）

1. **failure**：北京卡在画面左侧、浙江卡摆在它与北京锚点之间，北京的引线从浙江卡正中横穿 220px；`listContentLayoutIssues` 一条问题都不返回。
2. **cause**：`checkLayoutHealth` 只有「连接线 × 连接线」一个循环，从来没有「连接线 × 卡片」这一维。
3. **fix**：新增 `connector-crosses-card`，判据为「锚点 24px 之外、非自身卡片、卡内弦长 ≥ 4px」。
4. **recheck**：`npx vitest run` 三个归属测试文件 → **51 passed**；全量 → **202 files / 1740 tests 全绿**；tsc 0 error；eslint 0 问题。

### 反向验证：五道闸门逐个拆掉，看用例是不是真的会红

新用例第一次就是绿的，所以逐条确认它们在缺陷语义下会失败（每次只拆一处，跑完立即还原）：

| 拆掉的闸门 | 失败用例 |
| --- | --- |
| A. 整个检测（阈值设 ∞） | 5 条：两个文件的「穿身要报」「花束外仍要报」「手工坐标」 |
| B. `cardId` 自身豁免 | 3 条，含「贴着自己卡框走 60px」 |
| C. 锚点 24px 裁剪 | 1 条：花束豁免（产品路径那条测不到——`buildContentLayoutInput` 已经先裁过一道，属于双重保险） |
| D. 弦长阈值（设 1e-9） | 1 条：擦角不报 |
| E. 粗筛改回严格 `overlaps` | 1 条：贴着别人卡框走要报 |

D 一开始我把阈值设成 0，结果 6 条一起红。查下来是**我的反向验证写错了**，不是代码有问题：`chord < 0` 恒假，等于「所有卡片对都上报」。改成 1e-9 后只剩擦角那一条红。顺手用一次性探针把产品路径三个场景的真实弦长打了出来（穿卡 220.00、让开 0、花束 0），确认 4px 阈值在真实工程里**没有掩盖任何非零弦长**——它只挡住了我在单测里手工构造的 2.8px 擦角。

### 邻面消费方

`connector-crosses-card` 是新增 kind。全仓没有对 `LayoutHealthIssueKind` 的穷尽 switch 或文案映射表——UI（`StudioAssistantRail` / `DeliveryWorkspace`）直接渲染 `issue.detail`，`workspace-props` 只按 `!== "object-in-bleed"` 二分，所以不需要改我够不到的文案表（Round 11 担心的那一点，查证后不成立）。id 取 `${connector.id}:${card.id}`，`resolveLayoutIssueSelection` 按 `:` 拆开后能命中卡片 key，点击可以定位到展示框——既有的 `connector-conflict`（两段都是 `connector-` 前缀）反而定位不了。

---

## 没动的部分

- **`segmentIntersectsRect` 与求解器评分一行未改。** 求解器的 `connectorHitsCard` 要的就是布尔值，弦长是体检独有的需求；按简报要求不碰自动排版。
- **只查 `kind === "card"`。** 引线压过文字/素材也可能难看，但那两类的高度是估算值（同层遮挡判定为此专门豁免了它们），拿估算高度报穿卡会是噪声。
- **自动排版的卡片仍不产生连接线对象。** 与 Round 10/11 一致：体检只对 `cards.positions` 里手工摆过的卡建连接线。

---

## 交付与回滚

- **验收方式**：PR + CI（`npm test` / `tsc` / `eslint`）。手工验证：把两张省份卡摆成「A 的引线从 B 身上横穿」，健康面板 / 交付页体检 / Agent `check_health` 应出现「A 的连接线从 B 上穿过」，点击定位到展示框；把 B 挪开应消失。
- **用户可见变化**：体检多一类 `warning`。**不动数据、不动导出格式、不动 API 形状**——`LayoutHealthConnector` 的 `cardId` / `anchor` 都是可选字段，老调用方原样工作（只是拿不到自身豁免与花束豁免）。
- **回滚**：删掉 `checkLayoutHealth` 末尾那个循环即可完全恢复 Round 11 行为，其余都是纯新增的常量与私有函数。若只想调灵敏度，改 `CARD_CROSSING_MIN_CHORD` 一个数字。
- **迁移提示**：`trimSegmentsNearAnchor` / `CONNECTOR_ANCHOR_EXEMPT_RADIUS` 的定义位置从 `content-layout-objects` 移到了 `connector-geometry`，但前者原样转出，两个导入路径都可用。
