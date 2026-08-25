# Round 11 — R11-opus-layout：连接线锚点落到真实省份，而不是地图中心

MODEL_SLUG: claude-opus-5-thinking-high-fast

## 结果

| 文件 | 变更 |
| --- | --- |
| `src/lib/content-layout-objects.ts` | 省级行政中心表 + 闭式墨卡托适配，替掉「所有卡共用地图中心」的锚点兜底（307 行） |
| `src/lib/content-layout-objects.test.ts` | +7 用例：逐省锚点、防漂移锁（真 geojson 比对，含折叠南海）、跨省交叉、同省花束、邻省锚点、摆对不报（341 行） |
| `src/lib/connector-geometry.ts` | 未改（理由见「没动的部分」） |
| `src/lib/layout-health.ts` | 未改；Round 10 的同层卡片遮挡判定一行未动 |

`npx vitest run` 全量 **201 files / 1719 tests 全绿**；`tsc --noEmit -p tsconfig.app.json` 0 error；六个归属文件 eslint 0 问题。

---

## 缺陷：所有引线都指向同一个点

Round 10 的 `estimateDestinationCardLayouts` 给 `prepareDestinationCards` 传的是 `features: []` + `projection: () => null`，为的是不在体检路径上 JSON.parse 582KB 的 geojson。代价是 `findProvinceFeature` 永远返回 `undefined`，每张卡的锚点都回落到地图中心。于是体检看到的画面是：**所有引线汇成一束扎向图幅正中**。

这不是「精度差一点」，而是两个方向同时错：

- **漏报**：北京的卡摆在画面左侧、新疆的卡摆在右侧——真实画布上两条引线必然交叉，这是手工排版最典型的翻车。共锚点模型里两条线都指向中心，24px 裁剪把两条尾段一起吃掉，一条都不报。
- **误报**：两条本来各奔东西的引线，被强行拧到同一个中心点后，在半路上撞在一起。

### 量化（1200 盘受控对照）

同一批卡片矩形、同一套 `buildConnectorGeometry` + 24px 裁剪 + `checkLayoutHealth`，只把锚点在「真实省份锚点」与「地图中心」之间切换。3 种连接线样式 × 400 盘随机两省两卡（1500×1000 画布、安全边距内随机落点、种子固定）：

| 指标 | 值 |
| --- | --- |
| 真实几何下的交叉盘数 | 203 / 1200 |
| 旧模型（共用地图中心）报出的盘数 | 119 / 1200 |
| **漏报**（真交叉、旧模型不报） | **174** |
| **误报**（不交叉、旧模型报） | **90** |
| 结论不一致的盘 | 264 / 1200（22.0%） |

和 Round 10 的 800 盘一样，随机落点比真人落点更极端，22% 是**上界**不是线上发生率。但方向是确定的：旧模型既不是保守的、也不是激进的，而是**两头都错**。

---

## 修法：把渲染层的投影用闭式公式复刻一遍

渲染层的锚点是 `geoMercator().fitExtent([[0,0],[map.width, map.height]], mainland)(feature.center)`。关键观察是 d3 的 `fitExtent` 只做**等比缩放 + 居中**，缩放比与位移完全由要素集合投影后的包围盒决定：

```
k  = min(W / (right-left), H / (bottom-top))
tx = (W - k*(left+right)) / 2         // fitExtent 用的是和，不是差
screen = k * mercator150(lon, lat) + (tx, ty)
```

包围盒是常量（`china.geojson` 不会在运行时变），墨卡托是逐点闭式的，于是**整条投影退化成一个仿射变换，完全不需要要素几何**。落地成三件东西：

1. `PROVINCE_CENTER_COORDINATES`：34 个省级行政中心经纬度，逐字取自 geojson 的 `properties.center`（渲染层投影的就是这个点），按 `toShortProvinceName` 短名索引。
2. `CHINA_PROJECTED_BOUNDS`：全量要素在 `scale(150) / translate([0,0])` 下的包围盒，`open` / `folded` 两份——`collapseSouthChinaSea` 把南海诸岛折进右下角小图后，主图南边界抬到北纬 18.15°，整幅图的适配比例随之改变。
3. `PROVINCE_ANCHOR_FEATURES`：只带 `center` 的合成要素表，直接喂给 `prepareDestinationCards`。**省名匹配（全名/短名/后缀变体）与地图摆放变换沿用产品实现**，我一行都没有重写——认不出的省份（海外、自定义省名）仍旧回落地图中心，和今天的行为逐字相同。

### 为什么不是「按 group key 哈希撒点」

简报给的示例是哈希撒点。我没有采用：哈希撒出来的锚点是**自信地错**——它会把北京放到图幅西南角，然后言之凿凿地报一条用户在画布上根本看不到的交叉。体检的价值全在可信度上，把 22% 的双向错误换成另一种 100% 的错误不是改进。省份中心表是同一个约束（不解析 geojson）下唯一诚实的解。

### 这张表不是第二份地理事实

`content-layout-objects.test.ts` 里有一条**防漂移锁**：它读真 `china.geojson`，走渲染层真实路径（`getFeatureSplit` → `fitFeatureProjection`），对 34 个省逐个比对体检算出来的锚点，偏差超过 0.01px 就红，失败信息直接给出省名与偏差像素。geojson 一旦更新而表没跟，CI 立刻炸。解析 geojson 只发生在这条测试里，产品路径一次都没有。

离线扫过 6 种地图尺寸 × 2 种南海折叠 × 34 省，闭式公式与真投影的**最大偏差 0.0014px**。用例里固定跑默认地图（800×690, scale 1, 不折叠）与一组非默认地图（760×640 @ 300,90, scale 1.25, 折叠南海）——后者同时覆盖「宽高比不同 → fitExtent 居中留白方向不同」这一支。

### 24px 裁剪原样保留，花束仍然豁免

每条线只裁**自己那个**锚点周围的 24px，所以省份锚点分开之后花束逻辑仍然成立：

- 同省多张卡（按城市分组的杭州/宁波）锚点**逐字相同**，两条尾段一起被裁掉 → 不报。
- 紧挨着的两个省份锚点（香港/澳门相距 7.35px）落在同一个豁免圈量级内 → 不报。用例里显式断言了这个距离小于 `CONNECTOR_ANCHOR_EXEMPT_RADIUS`，把「相邻锚点靠裁剪半径兜住」这件事钉成契约而不是巧合。
- 真正跨图幅交叉的引线离两个锚点都远，一段都不会被裁 → 报。

---

## 验证（failure → cause → fix → recheck）

1. **failure**：北京卡在左、新疆卡在右，`listContentLayoutIssues` 一条 `connector-conflict` 都不返回；反过来「地图中心花束」在某些落点上被误报。
2. **cause**：`estimateDestinationCardLayouts` 传 `features: []` / `projection: () => null`，`findProvinceFeature` 恒 `undefined`，34 个省共用地图中心这一个锚点。
3. **fix**：省级行政中心表 + `fitExtent` 的闭式复刻，喂回同一个 `prepareDestinationCards`。
4. **recheck**：
   - `npx vitest run src/lib/content-layout-objects.test.ts src/lib/connector-geometry.test.ts src/lib/layout-health.test.ts` → **37 passed**。
   - **反向验证一（改动是否真的在起作用）**：把 `features` / `projection` 改回 `[]` / `() => null`（即 Round 10 语义），同一文件 → **4 failed**：两条防漂移锁（`黑龙江省 偏差 380.8655px`）、逐省锚点用例、跨省交叉用例。交叉用例确实咬住缺陷，不是摆设。
   - **反向验证二（防漂移锁是否真的锁得住）**：把 `浙江` 的经度改 0.1°（≈1.2px），→ **3 failed**，报 `浙江省 偏差 1.1531px` / `1.5426px`。
   - 邻面消费方：`studio-journey` / `agent-session-tools`（R11-fable-arch 在途）/ `studio-editor-helpers` / `stage-overview` / `resource-health` / `print-preflight(.journey)` / `src/hooks` / `StudioAssistant*` / `App.cards` → **14 files / 126 tests 全绿**，没有既有断言因为锚点变化而翻车。
   - 全量 `npx vitest run` → **201 files / 1719 tests 全绿**。（中途一次全量跑到过 2 个失败，分别落在 R11-fable-arch 的 `agent-session-tools.test.ts` 与 R11-fable-sota 的 `DeliveryWorkspace.test.tsx`——共享工作树里他们正在写盘，单跑即绿，非本次改动引入。）
   - 无侥幸重跑：新用例第一次就是绿的，所以专门做了上面两条反向验证，确认它们在旧语义下会红。

---

## 没动的部分（说清楚为什么）

- **`connector-geometry.ts` 一行未改。** 它的 `sharedAnchor` 判定要求两条线尾端相距 ≤ `clearance`（求解器传 1.5~2px），比体检的 24px 严得多。香港/澳门这种 7px 邻省锚点，在求解器眼里算交叉、会被强行推开，甚至可能逼出 `fallback`。这是**求解器既有的行为**（生产路径一直用真锚点），和本次改动无关；放宽它会改变每一份工程的自动排版结果，我没有 bench 证据支撑这种量级的变更，不在本轮动。
- **`layout-health.ts` 一行未改。** Round 10 的同层卡片遮挡判定原样保留（`layout-health.test.ts` 全绿）。
- **引线穿过别的卡片仍然不报。** `segmentIntersectsRect` 已经存在、求解器也在用（`connectorHitsCard`），但体检只做「线 × 线」不做「线 × 卡」。一条引线从别人卡片正中穿过去，比两条线交叉更难看。本轮不做：这是新增检测维度而非锚点问题，而且新增 issue kind 会牵动我改不到的 UI 文案表。**这是本轮明确留下的缺口，记在这里给 Round 12。**
- **自动排版的卡片仍然不产生连接线对象。** 体检只对 `cards.positions` 里手工摆过的卡建连接线；自动路径的落点要跑一遍求解器才知道，太重。与 Round 10 一致，未改。
- **一个顺带查清的事实**：学生行**显式填了省份列**时，`resolveStudentLocation → resolveProvinceName → getProvinceNames()` 今天就会解析 geojson（在 `search-catalog`，不在体检里）。城市反查省份的常见路径不会。所以「体检路径不解析 geojson」这句话对城市路径是完整成立的，对省份覆盖路径成立的是「体检**自己**不再多解析一次」。

---

## 交付与回滚

- **验收方式**：PR + CI（`npm test` / `tsc` / `eslint`）。手工验证路径：健康面板 / 交付页体检 / Agent `check_health`，把两张省份卡左右对调，应报 `connector-conflict`；摆回正确一侧应消失。
- **用户可见变化**：体检结论会变——原先漏报的跨省交叉开始出现，原先误报的中心花束消失。全部是 `warning` 级提示，**不动数据、不动导出格式、不动 API 形状**。
- **回滚**：`estimateDestinationCardLayouts` 里两行改回 `features: []` / `projection: () => null` 即可完全恢复 Round 10 语义；表、包围盒、闭式投影都是纯新增常量与私有函数，删掉不影响任何导出签名。`CONNECTOR_ANCHOR_EXEMPT_RADIUS` 与 `trimSegmentsNearAnchor` 的行为逐字未改。
- **维护提示**：`china.geojson` 更新后若防漂移锁变红，失败信息会直接给出省名与偏差；把该省的 `properties.center` 逐字抄回 `PROVINCE_CENTER_COORDINATES` 即可，包围盒只有在增删要素或改动南海折叠阈值时才需要重算。
