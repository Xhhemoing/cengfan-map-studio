# 智能排版算法重构：有序径向布局（OPRL）

## 目标（硬约束）

1. **不压地图实际边界**：卡片矩形不得与 `occupiedAreas`（投影后的省份 AABB）重叠；无 `occupiedAreas` 时回退保护 `map` 框。
2. **方框互不重合**：卡片之间保持 `gap`。
3. **地理亲和**：同省/同城（锚点重合或极近）的卡片在环上保持相邻，并尽量靠近其地理锚点。
4. **连线不相交**：布局器与渲染器共用的 `buildConnectorGeometry` 线段不得相交（同锚点簇除外）；连线不得穿过其他卡片。

软目标（硬约束满足后优化）：

- 最小化 Σ 卡片中心到锚点距离
- 四侧轨道尽量均匀，利用地图内留白（非整框死区）
- 确定性：相同输入 → 相同输出

## 失败降级优先级

饱和时不得抛错、越界、隐藏卡片：

1. 画布内
2. 卡片不重叠
3. 不压省份内容
4. 连线零交叉（可行时）
5. 靠近锚点

状态：`solved` | `crossing-fallback` | `search-budget-exhausted`

## 算法：Order-Preserving Radial Layout (OPRL)

### 核心不变量

> 若卡片在围绕地图中心的**圆周参数 θ 上保持与锚点相同的角序**，则径向/近径向连接在直线意义下平面可嵌入，交叉概率极低；折线/曲线在同序下再做几何校验与局部修复。

### Phase 0 — 输入规范化

- 输入：`cards[{id, anchorX, anchorY, width, height}]`、`bounds`、`connectorStyle/Width`
- 地图中心 `C = center(map)`
- `angle(card) = atan2(anchorY - Cy, anchorX - Cx)` ∈ (-π, π]

### Phase 1 — 锚点簇（同省/同城亲和）

- 将 `hypot(Δanchor) ≤ clusterEps`（默认 8px）的卡片并入同一 `Cluster`
- 簇内按 `id` 稳定排序；簇代表角 = 簇内锚点平均角
- 后续所有侧分配/轨道打包**禁止拆散簇的圆周邻接**

### Phase 2 — 角序环

- 按簇代表角排序，展开为环序列 `ring[]`
- 该序列是后续一切移动的**全序约束**：只允许在环上滑动位置，不允许交换相对角序

### Phase 3 — 侧轨分配（保序）

- 初始侧：`sector(angle)` → `right | bottom | left | top`（45° 扇区）
- 容量：`floor((sideLength + gap) / (cardExtent + gap))`
- 超容量时：将**尾部连续子序列**旋转到下一侧（circular），多次扫描直到稳定
- 绝不按距离重洗牌（会破坏零交叉）

### Phase 4 — 有序 1D 首选打包

对每一侧、保持环序：

1. 计算每张卡在侧轴上的 preferred 坐标（锚点投影到侧轴，居中卡片）
2. **Isotonic 打包**：
   - 前向：`pos[i] = max(preferred[i], pos[i-1] + size[i-1] + gap)`
   - 后向：压入画布上界并回推
   - 再前向一次消除回推引入的重叠
3. 法向坐标：放在该侧外轨（map 外 `gap`），再进入 Phase 5 内拉

### Phase 5 — 径向内拉 + 留白利用

按环序逐卡：

- 沿侧法向朝锚点方向分步推进（~16 步）
- 每步检查：画布内、不压 `occupiedAreas`、不与已放置卡重叠
- 允许进入地图外框内的**非省份空白**（因为保护的是 `occupiedAreas` 而非整框）

### Phase 6 — 连接线几何校验与局部修复

- 用共享 `buildConnectorGeometry` 生成全部连线
- 若存在交叉或穿卡：
  1. 同侧邻卡微调侧轴位置（保序，±step 搜索）
  2. 仍失败 → Phase 7

### Phase 7 — 保序候选回溯（fallback）

- 每张卡只生成**角序兼容**候选：
  - 四侧外轨采样
  - 锚点射线外若干距离
  - 省份障碍边缘外侧
- 候选必须：`isAvailable` + 与全局环序相容（卡片中心极角夹在左右邻居允许弧内，放宽到 ±π/2）
- MRV 回溯 + 冲突缓存 + 搜索预算
- 严格模式含连线约束；失败则无连线约束的可见解 + `crossing-fallback`

### Phase 8 — 最终兜底

- `containedFallback` 网格紧凑摆放（保证可见），状态 `search-budget-exhausted`

## API（保持兼容）

```ts
solveDestinationCardLayout(cards, bounds, options?) -> { status, placements }
layoutDestinationCards(cards, bounds, options?) -> placements
clampDestinationCardPosition(position, bounds) -> { x, y }
```

## 验证矩阵

| 场景 | 断言 |
|------|------|
| 东西两省 | 分居左右，靠近锚点，不压省 |
| 同锚点 3 卡 | 相邻、不重叠、近锚点 |
| 12 张东侧密集 | 多侧分流、全在画布、零重叠 |
| 对角 4 省 + curve/elbow/straight | `solved` 且真实几何零交叉 |
| 6 省环绕 | 多侧、距离阈值、零交叉、零重叠 |
| 极端 9 密集 | 确定性、不抛错、全返回 |
| 簇亲和 | 同城 2 卡环上相邻且侧相同或邻侧 |

## 实现状态（已落地）

1. 设计文档（本文件）+ 验证脚本 `scripts/verify-oprl-layout.ts`
2. 扩展测试：同城簇亲和、混合省份四硬约束（`destination-layout.test.ts`）
3. 重写 `src/lib/destination-layout.ts` 主路径为 OPRL，并增加贪心近锚点兜底：
   - 锚点簇 → 角序环
   - 侧轨容量分配 + 连续溢出（不打乱序）
   - 先左右后上下的画框打包（角区避让）
   - 多轨间距硬校验、内拉、局部修复
   - `layoutGreedyAngular`：按环序近锚点候选，增量校验连线不交/不穿卡
   - 失败时回退到共享几何回溯 / 最少冲突可见解 / 网格兜底
4. 验证：
   - `destination-layout` 13 tests 通过
   - `connector-geometry` + `PosterCanvas` 相关测试通过
   - `npm run build` 通过
   - 原型脚本 5/5 通过

### 约束达成情况

| 约束 | 常规/混合场景 | 极端同侧密集（12 卡同侧） |
|------|---------------|---------------------------|
| 1. 不压实际省界 | ✅ | ✅ |
| 2. 方框不重合 | ✅ | ✅ |
| 3. 同省/同城靠近 | ✅ 簇保持同侧相邻 | ✅ 尽量靠近，饱和时次优先 |
| 4. 连线不相交 | ✅ `solved` | 可能 `crossing-fallback` / 预算耗尽；优先保持前三条 |

### 已知边界

- 极端同侧密集 + `elbow`：折线共享中段通道，零交叉更难；`curve`/`straight` 通常更好。
- 饱和时优先级：画布内 > 不重叠 > 不压省 > 零交叉（可行时） > 靠近锚点。
- 手动拖拽仍走 `clampDestinationCardPosition`；一键智能排版清空手动位置后重算。
