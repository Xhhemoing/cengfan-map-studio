# Round 1 结论简报 — 展示框排布重构

**模型编排:** 2×fable (`claude-fable-5-thinking-xhigh`) + 2×opus-fast (`claude-opus-5-thinking-high-fast`) + 2×gpt-sol (`gpt-5.6-sol-xhigh-fast`)
**分支:** `cursor/display-frame-layout-d264`

## 已实现功能

1. **双遮挡开关（独立障碍集）**
   - 文档：`allowMapOverlap`（已有）+ `allowElementOverlap`（新增，默认 false）
   - UI：`禁止遮挡地图` / `禁止遮挡其他元素`（正向勾选，默认开）
   - 求解器：`elementAreas` 只被 `allowElementOverlap` 放松；地图多边形/派生 zone 只被 `allowMapOverlap` 放松
   - 画布：装饰素材首次进入元素障碍（此前卡片会直接压上去）
2. **算法**
   - `proximity` 省份近：方环外扩贴近锚点，选点交叉优先
   - `columns` 分列整齐：左右两列 isotonic，贴地图外缘
   - `quadrant` 四周整齐等四个旧 mode 保留，默认不变
3. **连接线交叉**
   - `forbidConnectorCrossing` 默认 true（需带 `connectorStyle` 才强制）
   - `proximity` 探针 24 卡 straight **0 交叉**
   - 无 0 交叉解时 `status: "fallback"`，不抛
4. **拖拽自适应**
   - `adaptCardLayout`：钉住被拖卡、最多 8 轮推邻居
   - pointermove 仍只 clamp 当前卡；pointerup 一次 transaction 写回变化坐标（一步撤销）
5. **入口**
   - 检查器中文算法名、AI 白名单、缓存 key、刷新按钮 hint、CHANGELOG / USER_GUIDE

## 遗留缺陷

| ID | 问题 | 轮次 |
| --- | --- | --- |
| D1 | `card-layout.ts` 2016 行 > allowlist 1662，ratchet 必红；`modes.test.ts` 469 行未登记 | R2 必修 |
| D2 | `columns` / `quadrant` / `right-stack` 24 卡 straight 仍有 39–96 交叉；`chooseLayout` 遇到交叉立即 fallback，不比较后续 attempt、无拆线修复 | R2 必修 |
| D3 | gpt-sol 探针写于求解器落地前，5 项 `skipIf` 过时，需点亮 | R2 |
| D4 | `properties.test.ts` 遇非 solved 就 skip，180 种子 solved 率降至 107（grid/right-stack 最差） | R2 |
| D5 | 无头浏览器手测未做（jsdom 快照已有） | R3 |
| D6 | `scene-document.ts` 两字段挤一行以过 766 行 ratchet | R2 顺手 |

## 性能瓶颈

opus-1 复跑 gpt-1 探针（中位 ms）：proximity 24 卡 3.8 / 48 卡 13.5；columns 24 卡 2.6；quadrant 24 卡 9.2；adapt 24 卡 **0.14ms**（约全量 1/68）。侧打包路径快但交叉差；优化路径慢一些、交叉仍非 0。

## 下轮攻坚重点（注入 Round 2）

1. **拆分 `card-layout.ts`** 使 ratchet 下降（geometry / pack / optimize / proximity 模块），禁止上调 allowlist。
2. **交叉硬约束产品化**：side-pack / grid / right-stack 增加拆线或换侧修复；`chooseLayout` 在多 attempt 中取交叉最少；有 0 交叉则不得 fallback。
3. 点亮 gpt 探针与 properties 几何断言（不论 status）。
4. 补 columns 0 交叉单测 + 双开关端到端。
