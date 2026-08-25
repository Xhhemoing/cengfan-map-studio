# Round 3 — fable-1 最终 SOTA 验收

- 作者：fable-1（最终验收），模型 `claude-fable-5-thinking-xhigh`
- 取证时刻：2026-08-25 09:39–09:41Z 工作区快照，全部结论基于本轮实际执行的命令与文件读取，非转述简报。
- 取证命令：
  - `npx vitest run src/lib/card-layout scripts/file-size-ratchet.test.ts` → **1 failed | 128 passed**（唯一失败为 ratchet，见 M1）
  - `npx vitest run src/lib/card-layout.perf.probe.test.ts --disable-console-intercept` → 28/28，交叉与耗时日志见 §2
  - `npx vitest run src/components/canvas/PosterCanvas.overlap-obstacles.round1.test.tsx src/components/canvas/DestinationCardsLayer.test.tsx` → 19/19
  - `wc -l src/lib/card-layout*.ts` → 门面 301 行，全部模块 ≤400

---

## 结论：**CONDITIONAL ACCEPT**

四条用户原目标中三条已达标且有运行证据；「连线不交叉」机制到位、口径诚实，残余交叉不构成否决。但存在 1 项当前红着的仓库纪律硬门槛（ratchet）、1 处应用内不实宣传（与 CHANGELOG 自相矛盾）、AI 入口与画布入口的约束分叉，以及交付纪律要求的手测证据缺失。修完下方 M1–M7 即转 ACCEPT；任何一条未闭环维持 CONDITIONAL。

---

## 1. 对照用户原目标逐条判定

### 目标 1：双遮挡开关 — **达标（画布路径）**

- `allowMapOverlap` / `allowElementOverlap` 两套障碍独立门控：求解器侧 `elementZones` 只被元素开关放松（`card-layout.ts` clampCardPosition 203–207 行同一逻辑用于拖拽）；画布侧 `collectElementObstacles` 汇总文本/装饰/嘉宾（`PosterCanvas.tsx` 358 行），装饰素材已进障碍。
- 证据：`PosterCanvas.overlap-obstacles.round1.test.tsx` 通过（含「开关互不串」「拖不上装饰素材」断言）。
- 缺口移至 M4：AI `auto_layout` 入口不共享这套障碍（见目标 3 附注）。

### 目标 2：多算法可选 — **达标**

- 6 种模式（quadrant / radial / columns / right-stack / grid / proximity），检查器中文名齐全（`CardsInspector.tsx` 27–29 行）。
- 模式身份保留：`chooseLayout` 把 `repackAll` 标记为 `recovery`，仅在模式自身 attempt 全灭时才启用（`card-layout.ts` 106–147 行），Round 2 担心的「所有 mode 塌成同一网格」未发生——探针 mode-detection 日志确认 columns/proximity 结果不等于 quadrant。

### 目标 3：连线不交叉 — **机制达标，三处收尾（M2/M3/M5）**

- 硬约束链完整：`crossingsEnforced` 默认开（带 connectorStyle 即强制）→ 每个 attempt 先过 `repairConnectorCrossings` 拆线（`card-layout.ts` 160–165 行）→ `chooseLayout` 按交叉数排名、无 0 交叉解取最少者出 `fallback`。
- 本轮实测 24 卡 dense straight 残余交叉：**proximity 0 / radial 0 / quadrant 1 / columns 5 / grid 5 / right-stack 7**（right-stack 比 Round 2 简报的 6 多 1，属探针场景差异或漂移，纳入 M5 钉死）。48 卡最坏中位 quadrant 47ms、单样本峰值 79ms，远低于 200ms 软线。
- 口径诚实性：USER_GUIDE 45 行、CHANGELOG 17 行、检查器 hint（167 行）三处均写明「硬性要求去搜索、不保证、保留交叉最少一版」。**残余交叉不作否决理由**：无数学证明任意名单存在 0 交叉解，「尽力 + 诚实 + 逃生通道（换算法/刷新/手拖）」是站得住的产品口径。
- 但三处必须修：
  - **应用内自相矛盾（M2）**：`CardsInspector.tsx` 170 行 hint 称「卡片**与连接线**会避开省份轮廓/嘉宾面板、文本、装饰素材」，而 CHANGELOG 17 行明确写「两个开关约束的都是卡片矩形本身，**连接线不在避让范围内**」。代码裁决：`card-layout-connectors.ts` 全文无任何元素避让逻辑，CHANGELOG 是对的，hint 是不实宣传。
  - **AI 入口无交叉约束（M3）**：`agent-session.ts` runAutoLayout（340–350 行）options 只传 `mode`/`autoBalance`，不传 `connectorStyle` → `crossingsEnforced` 恒 false，AI 一键排布完全绕过「连线不交叉」这条用户目标。
  - **无回归保护（M5）**：探针对交叉数只断言 `>= 0`（perf.probe 173 行），`crossing.test.ts` dense columns 只断言「不比无约束差」（99–100 行）。今天的 0/0/1/5/5/7 没有任何测试钉住，回归到 Round 1 的 39/96 不会红。

### 目标 4：速度 + 拖拽自适应 — **达标**

- `adaptCardLayout` 24 卡中位 **0.120ms**；接线完整：`DestinationCardsLayer.tsx` 11 行 → `card-drop-adapt.ts`（pointerup 一次事务、单步撤销、无邻居让位时回退单卡提交）。
- 组件测试 `DestinationCardsLayer.test.tsx` 通过（但该文件本身超行数，见 M1）。

---

## 2. 本轮实测数据（验收基线）

| mode | 8 卡中位 | 24 卡中位 | 48 卡中位 | 24 卡 dense 交叉 |
| --- | ---: | ---: | ---: | ---: |
| proximity | 1.19ms | 6.77ms | 31.3ms | **0** |
| columns | 0.06ms | 15.9ms | 27.2ms | **5** |
| quadrant | 11.6ms | 23.9ms | 47.2ms | **1** |
| radial | 7.26ms | 11.5ms | 38.2ms | **0** |
| right-stack | 0.12ms | 5.4ms | 27.6ms | **7** |
| grid | 0.19ms | 1.7ms | 9.4ms | **5** |
| adapt（拖拽） | — | **0.120ms** | — | — |

---

## 3. ACCEPT 前置清单（Round 3 本轮必修，全部可证伪）

- **M1 — ratchet 回绿（当前就是红的）。** `src/components/canvas/DestinationCardsLayer.test.tsx` 429 行 > 400 且未登记，`scripts/file-size-ratchet.test.ts` 现在 1 failed。修法：拆测试文件，**禁止新增 allowlist 条目**（守卫注释原文：新增条目需 reviewer 显式决定）。证伪：`npx vitest run scripts/file-size-ratchet.test.ts` 5/5 通过。
- **M2 — 撤回 hint 的连接线避让承诺。** `CardsInspector.tsx` 170 行删去「与连接线」，改为只承诺卡片矩形避让，与 CHANGELOG 17 行口径一致。证伪：`rg "连接线会避开" src/` 零命中；相关 jsdom 断言同步更新且通过。
- **M3 — AI `auto_layout` 打开交叉约束。** `runAutoLayout` options 补传 `connectorStyle: project.cards.connectorStyle` 与 `connectorWidth`。证伪：新增单测——带 connectorStyle 的项目跑 auto_layout，按该 style 计数交叉 ≤ `forbidConnectorCrossing: false` 基线（沿用 crossing.test.ts 的对照法）。
- **M4 — AI 障碍集收敛或如实声明（二选一，必居其一）。** 优先：把 `collectElementObstacles` 从 `src/components/canvas/` 迁入 `src/lib/`（消除反向依赖），`runAutoLayout` 用真实文本/装饰/嘉宾几何替换「仅嘉宾 + 硬编码高 120」；若本轮不做，则 USER_GUIDE 与 AI 文档必须写明「AI 一键排布暂不避让文本与装饰素材」。证伪：迁移路径出测试，或文档 diff 落盘。
- **M5 — 残余交叉钉回归基线。** 探针或 crossing 测试为 24 卡 dense 场景加绝对上限断言：proximity=0、radial=0、quadrant≤1、columns≤5、grid≤5、right-stack≤7（以本轮实测为准，收敛更低则钉更低）。证伪：断言存在且通过；人为把 `repairConnectorCrossings` 短路后该测试必须变红。
- **M6 — 浏览器手测证据（Round 1 D5 两轮未偿 + 仓库交付纪律）。** 版式阶段实际操作：两个遮挡开关勾选/取消、至少 3 种算法切换、拖拽让位、顶栏「刷新展示框位置」，出演示视频/截图落 artifacts。证伪：验收材料存在且四项全覆盖。
- **M7 — autoBalance 禁用原因用户可读。** 现仅代码注释（`CardsInspector.tsx` 30 行），复选框 disabled 时用户不知为何。给 label 加 title 或 hint「仅四周整齐/分列整齐支持左右平衡」。证伪：DOM 可访问文案存在。

### 不阻塞 ACCEPT 的记录项（不派本轮）

- legacy `solveDestinationCardLayout`（门面 284 行）仍丢 `connectorStyle` 透传，与 `destination-layout.ts` 的 `...options` 不一致；但产品代码零消费（仅自身测试），后续统一或删除即可。
- 极端饱和 fallback 允许卡卡重叠且 UI 无提示（Round 2 风险 6），属既有「不丢内容」设计，建议排后续轮。
- columns/grid/right-stack 残余交叉向 0 收敛是持续优化方向，不是本轮验收门槛（口径已诚实 + M5 钉住基线）。

---

## 4. 验收方法说明（对齐仓库交付纪律）

本报告的 failure → cause → fix → recheck 链：ratchet 失败已复现（M1 附完整断言输出要点）、根因是新增测试文件 429 行未拆、修复动作与复检命令均已在 M1 写死。M1–M7 每条自带证伪命令或落盘物证，父调度器复跑同一命令集（§0 取证命令 + 各 M 条证伪项）即可裁决 ACCEPT。
