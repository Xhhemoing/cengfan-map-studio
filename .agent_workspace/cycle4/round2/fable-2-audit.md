# Round 2 交叉审计 — fable-2（UI / 障碍组装 / 无障碍 / 文档）

**模型:** `claude-fable-5-thinking-xhigh` · **范围:** 只读审计，未改任何代码
**输入:** ROUND1-BRIEF + CardsInspector / PosterCanvas 障碍组装 / card-layout-obstacles / DestinationCardsLayer + card-drop-adapt / scene-document / card-layout-cache / CHANGELOG Unreleased / USER_GUIDE 2.1，并顺藤核对了 `card-layout.ts`、`card-layout-adapt.ts`、`editor-canvas-actions.ts`、`canvas-edit-transactions.ts`、`agent-session.ts`、`card-layout.overlap-flags.test.ts`。

---

## 1. 双开关：勾选 → bounds → clamp/solve 语义链

**主链路（PosterCanvas 画布）无分叉。** UI 正向勾选（`checked = allowXOverlap !== true`，取消勾选写入 `true`）→ 归一化 `=== true`、默认 `false`（`scene-document.ts` 540/639 行）→ `cardLayoutBounds` 同一对象同时喂给求解器 worker 和拖拽 clamp（`dragBounds={cardLayoutBounds}`），两侧对同一份障碍几何做判定。缓存 key 把两个 flag 与两个数组都纳入（`card-layout-cache.ts` 124-127 行），开关切换必然重解。这条链是对的。

**但两个开关走的是不同层的放松，库内留下三处潜在语义分叉：**

- **(a) polygons 的 clamp/solve 不一致（库级 bug，主链路被 caller 掩盖）。** `clampCardPosition` 在 `allowMapOverlap` 时把 `occupiedPolygons` 置空（card-layout.ts 1922 行），而求解侧 `placementBlocked` 对 `bounds.occupiedPolygons` **无条件**避让（492-499 行），不看该 flag。`overlap-flags.test.ts` 第一条用例只对 clamp 编码了「flag 即放行 polygons」——solver 侧行为正好相反。PosterCanvas 因为在 caller 层把 polygons 换成 `EMPTY_CARD_POLYGONS` 才两侧一致；任何绕过 PosterCanvas 的调用方（测试、AI、未来功能）传 polygons + `allowMapOverlap: true` 会得到「拖得进去、自动排布进不去」。
- **(b) 两开关放松层级不对称。** `protectedZones` 对已定义的 `occupiedAreas` 无视 `allowMapOverlap`（放松责任在 caller，449-452 行注释有声明），`elementAreas` 则在库内由 `elementZones` 放松。后果之一是缓存 key：map 侧关避让时数组被 caller 置空，地图编辑不再重 key；element 侧关避让（`allowElementOverlap: true`）时 `layoutElementAreas` 仍全量序列化进 key——**移动文本 / 装饰 / 嘉宾面板会触发一次结果不可能变化的重解**。建议 R2 要么统一为「caller 过滤」，要么在 key 里当 flag 为 true 时跳过对应数组。
- **(c) AI 一键排版走另一套障碍组装（最重分叉）。** `agent-session.ts` 342-350 行：不传 polygons、不传 `occupiedAreas`（地图保护退化为整块外框）、`elementAreas` 只有嘉宾面板且**高度硬编码 120**（不用 `computeGuestPanelLayout`），文本与装饰素材完全缺席。即「禁止遮挡其他元素」勾着，AI 排版仍会把卡片压在文本和装饰素材上——与 CHANGELOG「装饰素材首次进入元素障碍」的承诺直接矛盾。属代码修复项，应移交代码线；文档在修复前至少要声明这个差距。

## 2. 装饰旋转 AABB / 隐藏透明素材 / 嘉宾隐藏

- **旋转 AABB 正确。** `decorationLayoutObstacle` 用 `w·|cos|+h·|sin|` 绕矩形中心外扩，与 `DecorationLayer` 的 `rotate(deg centerX centerY)` 渲染语义严格一致。
- **隐藏/透明正确。** `visibility === false || opacity <= 0` 返回 null；`normalizeScene` 保证 opacity 数值 ∈[0,1]、visibility 布尔化，半透明仍占位（可见即障碍，合理）。小风险：assetElements 归一化用 `...asset` 展开，**rotation 未做 finite 校验**，NaN rotation 会让障碍盒变 NaN、所有 overlap 判定静默失效（`?? 0` 只兜 undefined）。
- **嘉宾一致。** 障碍侧 `visibility === false → null` 与渲染侧 `visibility !== false` 完全同一谓词，高度取 `computeGuestPanelLayout`（对比 AI 路径的硬编码 120，见 1(c)）。
- **文本障碍是单行近似。** 高度恒为 `fontSize*1.3`、宽度恒为 `maxWidth`。TextLayer 给 `<text>` 设了 `inline-size`（SVG2 自动换行，Chromium 生效），换行文本的第二行不在障碍内；反向，短内容按满 maxWidth 过度封锁。可接受的近似，但应记为已知限制。
- 观察项：只收 `kind === "decoration"`；`landmark` 素材不进元素障碍（通常贴地图、由地图障碍覆盖，但脱离地图区域的 landmark 会被卡片压住）。

## 3. 拖拽自适应：冻结卡 / 国际卡 / 一步撤销

- **一步撤销成立。** `adaptCardDrop` 返回整组落点 → `moveCardsTransaction` 单事务合并写 `positions`，label「调整数据框位置」，`editor-canvas-actions.test.ts` 309-319 行有覆盖；`pointercancel` 恢复原位也正确。
- **冻结卡「会被挤开」是设计行为但文档未说。** adapt 收到全部 placement（含手工冻结的），冻结邻居会被推走并在同一事务覆写坐标——符合 CHANGELOG「被挤开的邻居会一起让位」，撤销可整组还原；但「我手动摆过的卡不该再动」的用户预期被打破，USER_GUIDE/CHANGELOG 均未点明手工卡也参与让位。另有质量瑕疵：部分冻结时，被 manual 覆写坐标的卡沿用求解器对**自动位置**算出的 `side`，adapt 的推挤轴向（`trackAxis`）可能因 side 过期而选错方向（全冻结路径用 `frozenCardSide` 重算，无此问题）。
- **国际卡参与推挤正确**（纯矩形，无锚点依赖）。但 `DestinationCardsLayer` 186 行 `connectorHidden: !card.isInternational && borderless && …` 对国际卡恒为 false → 拖拽预览每帧为一张**根本没有连接线**的卡白算 connector 几何（`querySelectorAll` 找不到 path，无视觉 bug，纯浪费且语义反直觉；应为 `card.isInternational || (borderless && opacity < 0.9)`）。
- **snap 分叉需知情：** 单卡落点走 `snap(x,y)` 网格吸附；带 adapt 的落点整组绕过吸附（注释解释了原因：再吸附会把邻居推回障碍）。开网格时拖出的卡不再落格，属有意取舍，文档未提。

## 4. 无障碍

- 三个新控件（自动平衡左右 / 禁止遮挡地图 / 禁止遮挡其他元素）都是 label 包裹 + `htmlFor`/`id`，可访问名称完整 ✅。正向勾选措辞（「禁止遮挡」勾=开）避免了双重否定 ✅。
- **autoBalance 禁用无解释。** 非 quadrant/columns 时 `disabled`，UI 无 title、无 hint、无 `aria-describedby` 说明「仅对四周整齐与分列整齐有效」；这句话只在 USER_GUIDE 2.1 里。读屏用户只听到「已禁用」，不知道为何、如何解禁。
- 两条 `property-panel__hint` 段落（交叉说明、遮挡说明）未用 `aria-describedby` 关联到对应 checkbox，焦点落在控件上时不播报。
- `data-cards-layer` 的 `<g role="button">` 只有 onClick：无 `tabIndex`、无可访问名称、无键盘处理——role=button 三件套缺两件；卡片拖拽（含新增的邻居让位）纯 pointer，无键盘替代。属既有欠账，本轮功能放大了差距。
- 正面样本：交叉说明 hint（CardsInspector 167 行）措辞诚实（「不保证……保留交叉最少的一版」）；「刷新展示框位置」的 title 明确提到按两个禁止遮挡设置重算 ✅。

## 5. 文档是否夸大「连接线会避开」

**是，三处夸大，两个维度：**

- **「连接线避开省份轮廓」只是软目标。** `validateHard` 只硬查几何 + 连接线互交；`connectorMapIntersections` 仅作为排序评分项（optimizedLayout 候选分与 `scoreSides` 的 `throughMap` 位），没有 0 穿越保证，手动拖拽时连接线更是完全不受约束。CardsInspector 170 行 hint、USER_GUIDE 2.1 第 42 行、CHANGELOG Unreleased 第一条均写成了确定语气。
- **「连接线避开嘉宾面板/文本/装饰素材」目前根本不存在。** 求解器没有任何 connector-vs-`elementAreas` 检测项。CardsInspector 170 行「卡片与连接线会避开省份轮廓 / 嘉宾面板、文本、装饰素材」把连接线也带上了，属虚假陈述。
- **交叉承诺与 columns 现实。** D2：columns/quadrant/right-stack 24 卡 straight 仍 39–96 交叉；且 `chooseLayout`（1852-1871 行）在首个几何可行的 attempt 有交叉时直接以 fallback 返回、不比较后续 attempt——「保留交叉最少的一版」实际是「保留第一版」，连 inspector 那条诚实 hint 都略乐观。CHANGELOG/USER_GUIDE 对 fallback 行为只字未提。
- 准确的部分：USER_GUIDE 第 36 行拖拽让位 + 一步撤销描述属实；CHANGELOG 对「后者让**卡片**避开元素」未捎带连接线，措辞正确。
- 顺带：D6（`scene-document.ts` 挤行）在本审计进行中已被并行代理拆开（248/540/639 三处现均分行）；`agent-session.ts` 346/349 行仍留有同款挤行。

## 6. Round 2 必须改的 UI / 文案（≤6 条）

1. **改 CardsInspector 170 行 hint**：拆开卡片与连接线——「卡片会避开省份轮廓 / 嘉宾面板、文本、装饰素材；连接线尽量绕开省份轮廓，排不开时不保证」。删除「连接线避开元素」的含义。
2. **同步纠偏 USER_GUIDE 2.1 与 CHANGELOG Unreleased 第一条**：「卡片与连接线避开省份轮廓」改为「卡片避开…，连接线尽量绕开…」，并补一句 fallback 语义（排不开时保留当前找到的版本，可换排布方式或手动拖开）。
3. **autoBalance 禁用说明**：给「自动平衡左右」补 hint 并用 `aria-describedby` 关联——「仅『四周整齐』『分列整齐』两种排布有效」；两条遮挡 hint 同样建立 `aria-describedby` 关联。
4. **修 `connectorHidden` 国际卡取值**（DestinationCardsLayer 184 行改为 `card.isInternational || (borderless && opacity < 0.9)`）：消除拖拽预览为无连接线卡片白算几何。
5. **`data-cards-layer` role=button 补齐**：`tabIndex={0}` + `aria-label`（如「选中数据框图层」）+ Enter/Space 键盘处理，或干脆移除 role。
6. **文档补两条已知差距**：(a) 手工摆放过的卡也会被拖拽让位（撤销一次整组还原）、带让位的落点不做网格吸附；(b) 在 `agent-session.ts` 障碍组装修复前，声明 AI 一键排版暂不避让文本与装饰素材。

**移交代码线（非 UI/文案，供 R2 排期）：** ① `placementBlocked` 与 `clampCardPosition` 对 polygons×`allowMapOverlap` 的库内分叉（见 1(a)）；② `agent-session.ts` 复用 `collectElementObstacles` + 真实嘉宾高度（见 1(c)）；③ `allowElementOverlap: true` 时缓存 key 仍序列化 elementAreas 的无效重解（见 1(b)）；④ assetElements 归一化补 rotation finite 校验（见 2）。
