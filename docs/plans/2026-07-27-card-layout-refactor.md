# 文本框自动排布算法重构：实时边界 + 简洁多模式排布

**日期：** 2026-07-27
**状态：** 待批准
**参考：** https://uni.utities.online/map-creator 的四象限 isotonic 排布

## 目标

1. 修复布局器对"地图实际边界/地理内容范围"的实时感知（自定义覆盖图、缩放平移后仍准确）。
2. 用一个简洁、确定、高效的算法替换当前 1166 行的 OPRL 复杂回溯实现；保留多种排布方式供用户选择。

## 第一部分：实时地图边界

### 现状缺陷

`PosterCanvas` 计算 `provinceAreas = mapPath.bounds(feature)`（按当前投影+缩放），并作为 `occupiedAreas` 传入。但：

- `bounds.map` 直接用 `project.map` 外框（`{x,y,width,height}`），不反映实际地理内容范围。
- 当用户用自定义覆盖图并设置 `alignment`（手动 x/y/宽高/旋转）时，地理内容可能只占外框的一部分；布局仍按整框与全部矢量省份 AABB 作为障碍，锚点仍按完整矢量投影，导致排布与视觉脱节。
- `MapSettings.scale` 改变时 `provinceAreas` 虽重算，但布局中心 `centerOf(bounds.map)` 用外框中心而非地理质心，四象限分界偏移。

### 修复

1. 新增纯函数 `computeMapContentBounds(map, features, projection, mapPath)`：
   - 矢量模式：取所有可见大陆省份 `mapPath.bounds` 的并集 AABB，再按 `map.x/y/scale` 变换到画布坐标，得到 `contentBounds`（实际地理内容范围）。
   - 覆盖图模式（有 `alignment`）：以 `mapImageElementPlacement(alignment)` 的 `{x,y,width,height}` 为 `contentBounds`（图像就是地理内容）。
   - 回退：`project.map` 外框。
2. 布局 `bounds.map` 改用 `contentBounds`（用于侧轨法向、中心、分界）；`occupiedAreas` 仍用 `provinceAreas`（矢量模式）或覆盖图 `contentBounds`（图片模式）。
3. 锚点统一用省份中心投影到画布（已有逻辑保留），但分界与中心基于 `contentBounds`。
4. 在 `PosterCanvas` 用 `useMemo` 依赖 `project.map` 全量字段与 `mainlandFeatures/projection/mapPath`，保证实时。

### 测试

- `computeMapContentBounds` 单测：矢量并集、覆盖图 alignment、回退三种路径。
- 现有 `destination-layout` 集成测试保持通过（bounds.map 语义不变，只是来源更准）。

## 第二部分：简洁多模式排布算法

### 新算法 `src/lib/card-layout.ts`（替换 destination-layout 排布主路径）

核心思想（参考站点 + 保留我们的省份几何优势）：

**输入**：`cards[{id, anchorX, anchorY, width, height}]`、`bounds{width,height,map,margin,gap,occupiedAreas?}`、`mode`。

**Phase 1 — 区域归类**：按锚点相对 `contentBounds` 中心的位置分到 `left/right/top/bottom`：
- 顶部带：锚点在内容区上半部且水平居中段 → top
- 底部带：锚点在内容区下半部且水平居中段 → bottom
- 否则按 `splitX`（默认内容中心 x）分 left/right
- 可选 `autoBalance`：优化 splitX 使左右两列所需高度的最大值最小（扫描候选分界）。

**Phase 2 — 每侧保序打包**（isotonic，参考 `eU`）：
- 每侧卡片按锚点的侧轴坐标排序（left/right 按 y，top/bottom 按 x）。
- 目标坐标 = 锚点投影到侧轴 - 卡片尺寸/2。
- 前向推开：`pos[i] = max(target[i], pos[i-1] + size[i-1] + gap)`。
- 后向推开：`pos[i] = min(pos[i], pos[i+1] - size[i] - gap)`。
- 若总高超过可用长度，等比压缩 gap（下限 4px）。
- 整体居中到可用区间的中点。
- 法向坐标：贴内容边界外侧 `gap`（left/right 用 `contentBounds.x - gap - width` / `contentBounds.x + contentBounds.width + gap`；top/bottom 同理）。

**Phase 3 — 障碍避让**（保留我们优于参考站的能力）：
- 对每张卡检查 `occupiedAreas`（省份 AABB）重叠；重叠则沿法向往外推到不压省界的最近轨。
- 卡片互不重叠由 isotonic 保证；最后做一次全局去重叠校验。

**Phase 4 — 兜底**：若某侧装不下，溢出卡片转到相邻侧（top↔left/right，bottom↔left/right，left/right↔top/bottom）；仍不行则紧凑网格兜底，保证全部可见、不抛错。

### 多种排布方式（`mode` 选项）

1. **`quadrant`**（默认，参考站同款）：上述四象限 isotonic。
2. **`radial`**：按锚点极角环绕内容区，贴边等距分布（适合省份分布均匀、想凸显环绕感）。
3. **`right-stack`**：全部右侧单列纵排，按锚点 y 排序（简洁信息图风格，参考站窄屏时行为）。
4. **`grid`**：画布边缘网格，适合超多卡片。

每种 mode 都是同一框架下不同的"区域归类 + 侧轴排序/法向"策略，共享 isotonic 打包与避让。

### API（兼容 + 扩展）

```ts
export type CardLayoutMode = "quadrant" | "radial" | "right-stack" | "grid";

solveCardLayout(cards, bounds, options?: { mode?, gap?, ... }) -> { status, placements, mode }
layoutCards(...) -> placements  // 便捷包装
clampCardPosition(position, bounds) -> {x,y}  // 手动拖拽，保持现有语义
```

保留 `solveDestinationCardLayout` / `layoutDestinationCards` / `clampDestinationCardPosition` 作为兼容别名（内部转发），现有调用点零改动即可工作；新增 `mode` 默认 `quadrant`。

### UI

`CardsInspector` 增加"排布方式"下拉（quadrant/radial/right-stack/grid）+ "自动平衡左右"开关（仅 quadrant），存到 `CardSettings.layoutMode` / `autoBalance`。一键智能排版用所选 mode 重排。

## 任务分解（TDD）

1. 新增 `src/lib/card-layout.ts` + `card-layout.test.ts`：四 mode + 兼容别名 + clamp。先写测试（四硬约束：画布内、不重叠、不压省、确定性；各 mode 形态断言）。
2. 新增 `computeMapContentBounds`（放 `map-alignment.ts` 或 `map-data.ts`）+ 测试（矢量并集/覆盖图/回退）。
3. `PosterCanvas` 接入 `computeMapContentBounds` 与 `solveCardLayout`（mode 来自 project）。
4. `CardSettings` 增加 `layoutMode` / `autoBalance`；`CardsInspector` 增加控件；迁移默认值。
5. `App.tsx` 一键排版传 mode；`clampDestinationCardPosition` 兼容。
6. 删除/归档旧 `destination-layout.ts` 的复杂回溯（保留兼容导出转发到新实现）；更新测试。
7. 验证：`npm run test` / `npm run lint` / `npm run build` / 启动预览 8787 实际截图。

## 验收

- 四硬约束在所有 mode 下成立（画布内、不重叠、不压实际省界/覆盖图、不抛错）。
- 自定义覆盖图调整 alignment 后，排布实时跟随图像实际范围。
- 代码量大幅下降，无回溯搜索预算/冻结风险。
- 现有测试通过或等价迁移。
