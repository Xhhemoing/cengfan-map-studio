# 展示框自动排布重构 — 进度

**分支:** `cursor/display-frame-layout-d264`（Cloud Agent 命名约束；对应任务 `agent/display-frame-layout`）
**目标:** 重构数据展示框（destination cards）自动排布：双遮挡开关、三种主算法、连接线禁止交叉、高速求解 + 拖拽局部自适应。

## 状态

- Round 1: 完成（见 `cycle4/ROUND1-BRIEF.md`）
- Round 2: 完成（见 `cycle4/ROUND2-BRIEF.md`）
- Round 3: 完成（见 `cycle4/ROUND3-BRIEF.md`）

## 锁定规格（所有子代理必须遵守）

### 产品语义

展示框 = 画布上按省份/城市/院校聚合的数据卡片（`project.cards` + `solveCardLayout`），不是已下线的展示框工作台。禁止复活 DisplayFrame 工作台。

### 1. 两个遮挡可选项（文档字段，默认都禁止遮挡）

| 用户文案 | 字段 | 默认 | 含义 |
| --- | --- | --- | --- |
| 禁止遮挡地图 | `allowMapOverlap`（已有，**语义保持**） | `false` | `false` = 卡片/连接线避开省份多边形与地图内容区 |
| 禁止遮挡其他元素 | `allowElementOverlap`（**新增**） | `false` | `false` = 避开嘉宾面板、文本、装饰素材 AABB |

UI 用正向「禁止」勾选框，内部仍写 `allow*` 以兼容旧工程：

- `#cards-avoid-map-overlap` checked ⇔ `allowMapOverlap !== true`；取消勾选 → `{ allowMapOverlap: true }`
- `#cards-avoid-element-overlap` checked ⇔ `allowElementOverlap !== true`；取消勾选 → `{ allowElementOverlap: true }`

`PosterCanvas` 组装 `occupiedAreas`：

- 地图相关 rect：仅当 `allowMapOverlap !== true` 时并入（现有 `nonProvinceMapAreas`）
- 元素 rect：嘉宾面板、`textLayoutObstacle`、可见装饰 `assetElements`；仅当 `allowElementOverlap !== true` 时并入
- `occupiedPolygons`：仅当 `allowMapOverlap !== true` 时传入省份环

`CardLayoutBounds` 增加 `allowElementOverlap?: boolean`（默认视为 false）。`hitsProtected` / `clampCardPosition` 必须尊重两套开关，不能把元素障碍误当成地图、或 `allowMapOverlap` 时误放行元素。

旧工程 JSON 无 `allowElementOverlap` → 视为 `false`（继续避让元素）。

### 2. 排布算法

`CardLayoutMode` / `CARD_LAYOUT_MODES`：

| mode | 中文 | 行为 |
| --- | --- | --- |
| `proximity` | 省份近 | 每张卡片尽量贴近其地理锚点；同侧仍保持 gap |
| `columns` | 分列整齐 | 按锚点 X 分到左/右两列，列内按锚点 Y 等距/等齐 isotonic 打包，贴地图左右缘 |
| `quadrant` | 四周整齐（默认） | 现有四象限 isotonic |
| `radial` | 极角环绕 | 保留 |
| `right-stack` | 右侧单列 | 保留，旧工程继续可读 |
| `grid` | 边缘网格 | 保留 |

`normalizeLayoutMode` 未知值仍回落 `quadrant`。不要改默认，以免旧海报跳版。

### 3. 连接线禁止交叉（硬约束）

有连接线时（`connectorStyle` 存在即视为要画线；国际无锚点卡由调用方不送入求解器或宽高已在上层处理）：

- 任意两根连接线不得在中段交叉（沿用 `connectorGeometriesIntersect`，共享锚点花束豁免保持）
- 优化路径：有 0 交叉候选则禁止选交叉候选
- `validateHard` 在 `options.forbidConnectorCrossing !== false`（默认 true）时把交叉视为失败
- 无 0 交叉可行解：选交叉最少的布局，`status: "fallback"`，求解器永不抛

### 4. 速度 + 拖拽简单自适应

- 全量求解继续走 worker + `cardLayoutCache`；缓存 key 必须纳入 `allowElementOverlap`、新 mode
- 新增纯函数 `adaptCardLayout(placements, movedId, nextPosition, bounds, options?)`：夹紧被拖卡片，沿同侧主轴推开重叠邻居（有限迭代，O(n)），不触发全量回溯
- 拖拽过程（pointermove）只 clamp 当前卡（保持跟手）；pointerup 再 adapt 并写回所有变化的 `cards.positions`
- 禁止在 pan 时 clamp 已冻结坐标

### 5. 入口补齐

- `CardsInspector`：算法下拉用中文标签；两个禁止遮挡勾选；`autoBalance` 仅 `quadrant`/`columns` 可用
- 版式阶段「刷新展示框位置」保留；可加简短 hint
- AI：`update_cards` 允许 `allowElementOverlap`；`layoutMode` 枚举含新值；`auto_layout` 吃新 mode
- `CHANGELOG.md` Unreleased 写用户可见条目；`USER_GUIDE.md` 补一句版式排布

### 硬约束（全局）

- 不复活展示框工作台
- 不改 `data-*` 导出钩子名
- 不虚拟化画布 / 不换渲染器
- `MapLayerContent` 禁读 `settings.x/y`
- 不提交真实学生名单、支付/套餐代码
- 文件 >400 行优先抽模块，禁止把 `card-layout.ts` 再堆很长
- 子代理 **禁止 git commit / push / PR**（主调度器统一提交）
- 子代理输出**首行**必须是实际模型 slug

## 文件所有权（Round 1，禁止越界）

见各轮派发记录。冲突时以本表为准，越界文件作废。

## 回滚

新字段均为可选；回滚即还原本分支相对 `main` 的 diff。旧工程 JSON 在缺字段时行为与现在一致（避让地图+元素，四象限）。
