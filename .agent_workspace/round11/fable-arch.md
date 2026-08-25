MODEL_SLUG: claude-fable-5-thinking-xhigh

# Round 11 — fable-arch：Agent 与交付路径共用体检 + 自动排版钉住手工位置

改动文件（仅允许清单内）：

- `src/lib/agent-session-tools.ts`（修改，245 行）
- `src/lib/agent-session-tools.test.ts`（新建，125 行）

Print: trim=canvas, bleed expands out.（`layout-health.ts` 的语义：`canvas.width/height` 是裁切框（trim box），`printBleedMm` 从裁切线向外扩展出血区；越过画布边缘的对象已落入出血区，有被裁掉的风险。本轮未改此语义，`check_health` 改走产品路径后 Agent 首次拿到同一套出血检查。）

## Bug 1：Agent `check_health` 用假卡片输入，与交付页看到的问题不一致

- **原状**：`agent-session-tools.ts` 里的 `healthInput` 自造体检输入——单个假卡片对象 `{ x: cards.x, y: cards.y, width: maxWidth, height: 180 }`，完全不构造连接线（connectors）。Agent 与 DeliveryWorkspace 对同一工程报出不同问题。
- **修复**：删除 `healthInput`，`check_health` 直接调用产品入口 `listContentLayoutIssues(project)`（grep 确认的真实导出名，位于 `src/lib/content-layout-objects.ts`，同文件还导出 `buildContentLayoutInput`；两者均只读未改）。Agent 由此获得：逐卡实测宽高（`prepareDestinationCards`）、手工 positions 真坐标、每张卡的连接线折线（含 24px 共锚点豁免裁剪）、出血/裁切检查。
- 同时删除对 `checkLayoutHealth` / `LayoutHealthInput` / `LayoutHealthObject` 的导入；工具结果形状不变（`{ ok, issues }`），`agent-session-compaction.ts` 的 `check_health` 压缩分支（`issueCount` + 前 20 条）无需改动。

## Bug 2：Agent `auto_layout` 不传 `fixedPositions`，一跑就撤销用户拖拽

- **原状**：`runAutoLayout` 调 `solveCardLayout(cards, bounds, { mode, autoBalance })`，未传手工位置；求解器把用户拖过的坐标当空地重新分配。
- **修复**：第三参数（`CardLayoutOptions`）加 `fixedPositions: project.cards.positions`。选项名在磁盘上逐字确认：`card-layout-types.ts` 第 73 行 `fixedPositions?: Readonly<Record<string, CardPoint>>`；`solveCardLayout`（`card-layout.ts` 第 295 行）经 `planPinnedCards` 把钉住卡片原坐标保留并转成受保护区域，`mergePinnedCards` 按输入序织回结果——即 Round 10 起画布求解走的同一条路径。
- **连带修正 `lostManualLayout`**：原来只要存在手工位置就报 `true`（并在 UI 显示「将丢弃手工位置」）。钉住之后手工位置原样保留，该旗标改为逐键对比新旧 positions：只有确实被丢弃或挪动的键（如没有对应分组的残留键）才报 `true`。风险闸门无回退：`agent-risk.ts`（未改）在存在手工位置时仍将 auto_layout 判为 high，确认流程不变。

## 验证（failure → cause → fix → recheck）

1. **首轮 vitest 失败（3 例）**。
   - 其中 2 例在 `src/lib/content-layout-objects.test.ts`（「anchors every card at the scale-invariant map center」「reports a connector conflict…」）：该文件与其源码 `content-layout-objects.ts` 均为工作区里其他并行改动（锚点从「全部压到地图中心」升级为内联省级行政中心 + 闭式墨卡托投影），我的改动不涉及其任何导入。复跑时该文件已被并行工作更新完毕，全绿。
   - 1 例是我新写的连接线用例：按旧「共用地图中心锚点」假设摆的两张同列卡在新的逐省锚点下不再交叉。**根因**：用例假设过时。**修复**：改为镜像产品测试的布局——北京（锚点在东）与新疆（锚点在西）左右对调摆放，引线必然交叉。**复跑**：通过。
2. `npx tsc -p tsconfig.app.json` → 通过（0 错误）。
3. `npx vitest run src/lib/agent-session-tools.test.ts src/lib/agent-session.test.ts src/lib/content-layout-objects.test.ts` → **3 文件 57/57 通过**（含要求保持绿色的 `content-layout-objects.test.ts`）。
4. `npx eslint src/lib/agent-session-tools.ts src/lib/agent-session-tools.test.ts` → 通过（0 问题）。
5. 行数纪律：245 / 125 行，均 ≤400。

## 新增测试覆盖（agent-session-tools.test.ts）

- `check_health`：与 `listContentLayoutIssues(project)` 逐条相等（同输入同输出的一致性锁）；能看到旧假输入永远看不见的连接线交叉冲突；实测高 96 的短卡在 y=852 不再被 180 估高伪报出画布，且旧 `cards` 汇总占位块在有手工位置时不出现。
- `auto_layout`：手工拖到奇数坐标 (137,211) 的卡在自动排版后坐标逐字保留（只能来自钉住），`lostManualLayout=false`；残留键（无对应分组）被丢弃时如实报 `true`；无手工位置时为 `false`。

## 回滚方案

单文件行为回滚：还原 `src/lib/agent-session-tools.ts` 中 `check_health` 与 `runAutoLayout`/`auto_layout` 两处（`git checkout <base> -- src/lib/agent-session-tools.ts` 即可）。无数据、导出格式或 API 形状变更；工具结果 JSON 形状（`{ ok, issues }` / `{ ok, placements, lostManualLayout }`）与快照 schema 均未变，旧快照重放不受影响（重放走同一 `executeAgentToolCall`，钉住行为对重放是确定性的）。

## 遗留说明（不在本轮编辑权限内）

- `groupCards`（agent-session-tools.ts）喂给求解器的锚点仍是绕地图中心的 cos/sin 散布、高度仍是 fontSize 估算——与画布求解的真实锚点/实测尺寸不同源。本轮范围只要求钉住手工位置与体检同源；若后续统一，可复用 `estimateDestinationCardLayouts` 的实测结果。
- 工作区存在其他并行未提交改动（`content-layout-objects.*`、`binary-import.*`、`server/*`、根目录 `tmp-*.mjs` 草稿），均非本人所改，未触碰。
