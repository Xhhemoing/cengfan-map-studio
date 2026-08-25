# Round 3 — opus-fast-2：文案纠偏 / a11y / 国际卡拖拽连线

**模型:** `claude-opus-5-thinking-high-fast` · **范围:** CardsInspector（+测试）、DestinationCardsLayer（+测试）、CHANGELOG / USER_GUIDE 纠偏句
**未提交**（按分工要求不执行 git commit），新增文件已 `git add` 入暂存区以便 file-size ratchet 扫描到。

---

## 1. Hint 纠偏（fable-2 审计 D5 / 缺口 4）

**旧文案（虚假陈述）：** 「遮挡开关同时作用于自动排布与手动拖拽：勾选后卡片与连接线会避开省份轮廓 / 嘉宾面板、文本、装饰素材。」
求解器里 `elementAreas` / `occupiedPolygons` 只参与卡片矩形的 `placementBlocked`；连接线侧只有 `connectorMapIntersections`（候选排序的打分项，`card-layout-candidates.ts` / `card-layout-optimize.ts`），且完全没有 connector-vs-元素检测。手动拖拽更是只做矩形 clamp。

**新文案（`#cards-overlap-hint`）：** 「两个「禁止遮挡」只约束卡片矩形本身，自动排布与手动拖拽都生效：勾选「禁止遮挡地图」时卡片避开省份轮廓与地图区域，勾选「禁止遮挡其他元素」时卡片避开嘉宾面板、文本、装饰素材。连接线不受这两个开关约束——排布只另外去搜索「连接线互不交叉」，不保证连接线绕开省份轮廓、文本或装饰素材。」

- 正向「禁止」勾选语义原样保留（`checked = allowXOverlap !== true`，取消勾选写 `true`），控件 id、label 文案、`data-*` 钩子一个没动。
- 「连接线互不交叉」被明确摆成**另一条搜索目标**，与遮挡开关并列，而不是遮挡开关的一部分。
- 同步纠偏 USER_GUIDE 2.1（「卡片矩形避开…」+ 新增一条「两个开关都只约束卡片矩形」）与 CHANGELOG Unreleased 第一条（「前者让卡片避开省份轮廓……连接线不在避让范围内，仍可能从轮廓、文本或装饰素材上穿过」）。
- 回归护栏：`expect(container.textContent).not.toContain("卡片与连接线")`，旧措辞回潮即红。

## 2. autoBalance 禁用可读（审计 §4）

- 抽出 `autoBalanceAvailable = AUTO_BALANCE_MODES.has(layoutMode)`；禁用时渲染 `#cards-auto-balance-hint`（「「自动平衡左右」仅「四周整齐」「分列整齐」可用：其他排布方式不按左右两列打包，所以这里是禁用状态。」）并把 checkbox 的 `aria-describedby` 指向它。
- **可用时不渲染该段、也不设 `aria-describedby`**——避免指向不存在的 id（悬空引用在部分读屏里会静默丢描述），也避免给可用控件加无用播报。
- 顺带补两处既有欠账关联：`#cards-layout-mode` → `#cards-crossing-hint`，两个遮挡 checkbox → `#cards-overlap-hint`。焦点落在控件上即可听到诚实说明，不必靠视觉扫描旁边那段小字。
- 未动的 a11y 欠账（不属本轮授权范围）：`data-cards-layer` 的 `role="button"` 仍缺 `tabIndex` / 可访问名称 / 键盘处理；卡片拖拽仍无键盘替代。

## 3. 国际卡拖拽预览无连接线

`DestinationCardsLayer` 的 pointerdown 快照里：

```diff
- connectorHidden: !card.isInternational && borderless && (appearance.opacity ?? 1) < 0.9,
+ connectorHidden: card.isInternational || (borderless && (appearance.opacity ?? 1) < 0.9),
```

旧式子对国际卡恒为 `false`：每帧 `updateCardPreview` 都为一张**根本不存在连接线**的卡调用 `buildConnectorGeometry`，再对空集合 `querySelectorAll(":scope > path")` 写 `d`。渲染侧（`isInternational ? null : buildConnectorGeometry(...)`）从来不给国际卡画线，两侧语义直接对立。新式子与渲染侧同构：国际卡无锚点 → 恒隐藏；borderless 且填充过透明 → 隐藏。

**测试：** 在测试文件里给 `../../lib/connector-geometry` 装 spy（透传真实实现，只记录调用），因此断言的是「有没有算」，而不仅仅是「有没有画」——后者在修复前后都是 0 条 path，测不出这个 bug。

- `keeps the drag preview of an international card free of a connector`：拖国际卡，transform 更新到 `translate(290 390)`、`connectorGeometry.calls` 为空、DOM 内 0 条 path、落点仍单卡提交 `("海外", 290, 390)`。
- `keeps drawing the drag preview connector for a domestic card in the same layer`：同一层里国内卡的预览连接线照常重画（防止把 spy 断言写成「永远不算」的假绿）。
- 既有拖拽用例补 `expect(connectorGeometry.calls.length).toBeGreaterThan(0)`，证明 spy 真的活着。

## 4. 边界纪律

- 求解器模块（`src/lib/card-layout*`）一行未改，`data-*` 钩子名（`data-cards-layer` / `data-destination-card` / `data-destination-connector` / `data-destination-anchor` / `data-connector-*` / `data-property-pair`）全部保持。
- 展示框工作台没有复活；`displayFrame` 相关断言原样。

## 5. 验证（failure → cause → fix → recheck）

**指定命令：**

```
npx vitest run src/components/inspector/CardsInspector.test.tsx src/components/canvas/DestinationCardsLayer.test.tsx
→ Test Files 2 passed (2) · Tests 29 passed (29)
```

**故障注入（证明新测试不是摆设）：** 把 `connectorHidden` 改回旧式子重跑 → `keeps the drag preview of an international card free of a connector` 失败，`connectorGeometry.calls` 收到一次 `{card:{x:290,y:390,…}, anchor:{x:620,y:300}, style:"straight"}`。恢复修复后重新转绿。

**过程中的真实失败链：**

1. *failure* — `scripts/file-size-ratchet.test.ts` 红：`DestinationCardsLayer.test.tsx` 429 行 > 400 限。
2. *cause* — 新增三段拖拽用例把测试文件顶过 ratchet，而 allowlist 是棘轮、不给新债留位。
3. *fix* — 按仓库既有约定（`card-layout-test-fixtures.ts`）把 `card()` / `appearance()` / `layerProps()` / `draggable()` / `DRAG_BOUNDS` 抽到 `src/components/canvas/destination-cards-layer-test-fixtures.ts`（85 行），测试文件降到 355 行；`vi.mock` 仍留在测试文件内（mock 注册按文件生效，fixtures 经同一 registry 解析，取到的是 mock 版）。
4. *recheck* — ratchet 5 passed；两个指定测试文件 29 passed。

**外围复跑（改动可能波及的面）：**

- `npx vitest run src/components/canvas src/components/inspector` → **53 files / 264 tests passed**
- `npx tsc --noEmit -p tsconfig.app.json` → 无输出
- `npx eslint`（四个改动文件 + 新 fixtures）→ 无告警

## 6. 交付与回滚

- **验收方式：** PR diff 读文案三处（inspector hint / USER_GUIDE 2.1 / CHANGELOG Unreleased）+ CI 跑上述套件；人工验收在「版式」阶段右栏切「极角环绕」看禁用说明，再拖一张海外卡确认无线。
- **破坏性变更：** 无。未改数据结构、导出格式、API 形状与任何 `data-*` 钩子；纯文案 + 一个布尔取值 + a11y 属性。
- **回滚：** 单独 revert 本轮 commit 即可；三处文案与 `connectorHidden` 一行互不依赖，也可逐条回退（回退文案只是回到夸大表述，回退 `connectorHidden` 只是恢复国际卡拖拽的无用几何计算）。

## 7. 移交（本轮未授权触碰）

1. `agent-session.ts` 的 AI 一键排版仍走另一套障碍（无 polygons、无 `occupiedAreas`、嘉宾高度硬编码 120、缺文本与装饰）——在它复用 `collectElementObstacles` 之前，「禁止遮挡其他元素」对 AI 排版名不副实，本轮 inspector 文案说的是画布排布，未替 AI 路径背书。
2. `data-cards-layer` 的 `role="button"` 三件套仍缺 `tabIndex` / 可访问名称 / 键盘处理。
3. 手工冻结卡也会被拖拽让位、带让位的落点不做网格吸附——两条已知取舍仍未进用户文档。
