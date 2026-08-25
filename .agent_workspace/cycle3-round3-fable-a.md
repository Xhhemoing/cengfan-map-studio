MODEL: claude-fable-5-thinking-xhigh

# Cycle 3 Round 3（FINAL freeze）— fable-A：终局 SOTA 验收裁决 · 遗留清单终稿 · 交接冻结

- **性质：** 纯核验 + 实测 + 交接定稿。零生产代码、只写本文件、未离开 `cursor/canvas-render-display-46a1`。合规披露：git 仅执行只读命令（`status`/`log`/`diff`/`show`/`branch --show-current`），零 checkout/stash/commit/push/建分支。
- **快照声明（等待其他写手收敛后测量）：** 本席 18:07 入场时树仍在变——18:07:43 opus-B 落 bench 两行注释、18:08:53 与 18:10 前后 opus-A 落两个 `*.cycle3r3.test.tsx`、期间 `MapLayer.tsx` 出现过一次瞬时 `M`（18:09:54 mtime 变动后 `git diff` 为空，为 opus-A 变异测试还原的尾迹，opus-A 报告 §4 的 StrReplace 还原自证吻合）。18:11:56 复核：opus-A/B、gpt-sol-A/B 四份 Round 3 报告全部出齐，load average 0.10，无 vitest/tsx 残留进程，`MapLayer.tsx`/`PosterCanvas.tsx` 与 HEAD（`d43631c`）逐字节一致。**测量在此稳定树上进行（18:12–18:13，三遍连跑）。** 工作树与 HEAD 的全部差异：bench 两行注释（非执行文本）+ 两个未跟踪测试文件 + Round 3 报告——三者均不进入 bench 的模块加载图，测量语义与 HEAD 等同。

---

## 1. 问题一裁决：**FINAL ACCEPT** —— 三项 @24 中位全部达线，且与 gpt-sol-A 独立两遍互证一致

### 1.1 本席三遍实测（18:12–18:13，串行连跑，三遍 exit 0）

| 指标（ms） | Run 1 | Run 2 | Run 3 | **中位** | @8 中位 |
| --- | ---: | ---: | ---: | ---: | ---: |
| posterCanvasMapPanRerender @24 | 3.976 | 4.091 | 3.875 | **3.976** | 3.315 |
| posterCanvasFrozenMapPanRerender @24 | 3.401 | 3.450 | 3.416 | **3.416** | 2.329 |
| posterCanvasProvinceRecolorRerender @24 | 5.146 | 5.286 | 5.184 | **5.184** | 4.733 |
| posterCanvasMount @24 | 75.085 | 71.921 | 74.766 | 74.766 | — |
| posterCanvasSelectedTextRerender @24 | 0.720 | 0.727 | 0.731 | 0.727 | — |
| posterCanvasCardPositionRerender @24 | 2.356 | 2.368 | 2.298 | 2.356 | — |

跨遍散布极小（pan@24 极差 0.216ms、frozen 0.049ms、recolor 0.140ms），**无并行负载离群，无一遍需作废**。唯一波动是 pan@8 第三遍 4.766ms（vs 3.27/3.32），中位口径天然吸收，不影响任何 @24 结论。

### 1.2 验收表（中位 @24，验收线 = Round 2 冻结条款）

| 指标 | 本席中位 | 验收线 | 余量 | 判定 | gpt-sol-A 两遍中位 | 两席差 |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| pan | **3.976** | ≤6.0 | 2.024（34%） | **PASS** | 3.959 | +0.017 |
| frozen pan | **3.416** | ≤5.5 | 2.084（38%） | **PASS** | 3.456 | −0.040 |
| recolor | **5.184** | ≤6.5 | 1.316（20%） | **PASS** | 5.128 | +0.056 |

两席合并五遍取中位：pan **3.976** / frozen **3.416** / recolor **5.184**——与本席三遍中位逐位相同。两个独立席位、五遍读数、两两之差 ≤0.06ms，远小于历史跨运行噪声（±0.5–1.7ms），本轮环境异常安静，数字可信度为三个 cycle 以来最高。

### 1.3 四步链登记

**无失败触发。** 三遍 exit 0、脚本内建不变量断言（卡片计数、map transform、frozen 不漂移、recolor fill、guest 计数）全过、无离群作废。唯一预防性处置：入场时树在变，按指令**等待写手收敛**（18:07→18:11）并以 mtime + `git diff` 为空 + 四报告出齐三重确认后才开测——这是时序纪律，不是 failure。

### 1.4 终局数字链（写入全局总结的口径）

pan@24 中位：**21 →（C1）→ ~10 →（C2）→ 6.2 →（C3R2 MapLayer memo）→ ~4.0ms**；MapLayer 单层 pan 2.38 → **0.07ms**；frozen pan@24 **3.4ms**；recolor@24 ~20+ → **5.2ms**；mount@24 ~75ms（未立项，维持）。SelectedText 0.73ms 即全树 diff 地板——pan 剩余 ~4.0ms 中约 0.7ms 是地板、~2.4ms 是卡层必要工作（CardPosition 探针超集），Round 2 "无 ≥1ms 单杠杆残留"的定性在终局数字下继续成立。**优化冻结判定维持，不翻案。**

## 2. 问题二：遗留清单终稿——「已文档化」与「仍会咬到用户」逐项对账（一律不修）

### 2.1 已落地的**视觉 delta**（不是缺陷，PR 必须申报的行为变更）

| 项 | 载体提交 | 触发条件与幅度 | 文档出处 |
| --- | --- | --- | --- |
| city-only 卡高 +1px | `67e7269`（C2R2 行高统一批） | `visibleFields===["city"]` 且无 city 字号覆盖且 fontSize≥10：rowHeight +1（fs16: 21→22，卡高 77→78）。方向是**修对**——末行不再掉出 bottomPadding | cycle2-round2-opus-b（含主动 red 变异证明）、cycle2-round3-conclusion |
| photo 长标题更早换行 | `5fa70cb`（C2R3 批） | photo 模式长标题：标题宽减 `headerOffset`，不再压照片；正文宽不变 | cycle2-round3-conclusion |
| flow 多行标题行距随文档倍率 | `5fa70cb`（C2R3 批） | flow 模式多行标题：行距用画布 `lineHeight` 倍率 | cycle2-round3-conclusion |

三项均有测试锁与单批回滚路径（revert 对应提交）。对用户的「咬」仅体现为**与旧版本导出的像素 diff**，无功能损伤。

### 2.2 未修的**真缺陷**——特定配置下仍会咬到用户（全部已文档化，S5 全批统一解）

**flow 求高族（C + D + §3.2 + E，四条同根：求解侧字号/步进与 paint 侧级联不一致）：**

| 子项 | 触发配置 | 用户可见症状 | 出处 |
| --- | --- | --- | --- |
| C：flow 标题 fontSize 叉 | flow + 块显式 `style.fontSize` | 换行宽/行数按 typography 字号算、glyph 按块字号画 → 可右溢 | cycle3-round1-fable-b §2.2 |
| D：flow 求高整体近似 | flow 文档普遍 | `destinationCardHeight` 对所有模式套 HEADER_HEIGHT 44 + fixed 步进，高度是近似值 | 同上 §2.5 |
| §3.2：flow 光标不查 typography | flow + 设 `fieldTypography.title` 而块无 `style.fontSize` | 标题 glyph 按 typography 字号画、光标按纯 fontSize 推进 → 头部欠保留 | 同上 §3.2；`destination-card-metrics.ts` JSDoc 已明文 |
| E：行默认 paint 字号盲区 | 设 `fieldTypography.name`（**无论 name 是否可见**——分隔符 " · " 与自定义表达式 fragment 按行级字号画） | glyph 可顶破 bottom padding | 同上 §3.1（触发面修订版） |

四条全部有精确触发条件与最小修复路径存档；无用户报告在案；修复横跨 solver 与渲染，按 C3R1-fable-B 裁决归 **S5 全批**另立门户。**C 若单独提前做，必须与 `destinationCardFlowContentStart` 喂同一已解析字号，且 S5 立项时核销之**——这条联动边界随清单移交。

**defs 跨实例 id（C3-R2-4）：** `MapDataLayer` 的 `map-edge-soft-glow`/`map-edge-ink` 等 filter id 固定前缀不 scope；单独打开导出 SVG 自洽，**同文档内嵌多份导出/编辑器 SVG 时才碰撞**。connector 滤镜已用 `useId` scope 且有导出测试，本项是仅存缺口。gpt-sol-B 本轮已终稿定性（含「先写期待重复 id 的绿测试反而固化缺陷」的不立锁理由）。按 Round 2 决议不做，咬合面窄（多 SVG 内嵌是罕见工作流）。

### 2.3 本轮**已闭合**的项（从遗留清单出栈）

| 项 | 闭合方式 |
| --- | --- |
| 调用方不变量（centered 多边形 = occupiedPolygons 平移原点之逆） | opus-A `PosterCanvas.polygon-origin.cycle3r3.test.tsx`：mock key 函数捕获**入参**，6 状态逐点核对平移逆等式 + origin=地图中心锁 + 反空跑（>1000 点）。两个变异（少一省 / originX+1）均 FAIL 而全部既有测试 PASS——捕获力已证。残余：只锁当前唯一调用点（opus-A §6.1），第二调用点出现时需 DEV 断言进 key 函数（生产改动，冻结期禁止） |
| `MapLayerContent` 禁读 `settings.x/y` 无测试锁 | opus-A `MapLayer.origin-isolation.cycle3r3.test.tsx`：增量 pan 子树 innerHTML 必须与目标位新挂载逐字节相等（不 mock MapDataLayer）。变异 3（子树读 x）FAIL 而 pan-memo 测试 PASS——恰好补上计数型测试的结构盲区 |
| bench :185 「同形回退链」疑点 | opus-B 终稿判定 Round 2 怀疑**不成立**：那是 prepared-wrap 的 typography-first 链（`cardFieldFontSize` 同构），非 flow 游标副本；两行注释钉死判别，未换实现（换了反而改变测量对象） |

### 2.4 纯登记项（不咬用户，交接留档即可）

- **行数超标：** `MapLayer.tsx` 606 / `PosterCanvas.tsx` 948 / `MapDataLayer.tsx` 508，均超 AGENTS.md 400 行阈值。维护债，非行为缺陷。（Round 2 记的 570 行是 17:53 快照，终版含注释为 606。）
- **bench :187 city 降档漂移：** 仅 bench 自身对 `visibleFields` 里的 city 多降一档（`["city"]` 时 bench 11 vs real 12），当前 fixture 零影响。opus-B §4 已附修法。
- **mount 内 ~24ms 投影的模块级缓存：** 多实例场景可举证时再立。
- **部分冻结避让语义**（Cycle 2 存档）：随清单移交，指针在 cycle3-round2-fable-a §3.6。

## 3. 问题三：终局交接冻结——父调度器全局总结 + PR 的必备件

### 3.1 先做（收官前最后一批提交）

工作树尚有三样未入库：opus-A 两个 `*.cycle3r3.test.tsx`（回滚 = 删文件，零牵连）、opus-B bench 两行注释（回滚 = 删两行）、Round 3 六报告 + 结论 + PROGRESS 勾选。建议两批：`test(canvas): lock polygon-origin and content-isolation invariants` 与 `docs(agent): Cycle 3 Round 3 conclusion`（bench 注释可并入前者）。提交后跑一次全量 `npm test` + `npm run lint` + tsc（经 `scripts/run-heavy.mjs`，**串行**）作为 PR 前最终绿证据——本地绿 + 口头完成不是交付证据，PR/CI 才是。

### 3.2 全局总结必录（六条，缺一不可）

1. **数字链：** §1.4 全套（21→10→6.2→**4.0ms**；MapLayer 2.38→0.07；recolor→5.2；frozen 3.4；mount ~75 未动）。标注测量协议：`npm run perf:canvas` **中位口径、≥2 遍、离群作废重测、与其他负载串行**——单遍读数与均值口径均不可比。
2. **验收线（永久基线）：** 中位 @24：pan ≤6.0 / frozen ≤5.5 / recolor ≤6.5 ms。终局实测余量 34%/38%/20%。回归超线即 revert 最近 perf 批。**禁止为凑线改 bench 指标定义。**
3. **优化冻结判定：** 无 ≥1ms 可举证杠杆残留（SelectedText 0.73ms 地板 + CardPosition 2.4ms 必要工作），后续任何 perf 立项须先推翻该定性。
4. **不变量锁清单（必须常绿的守卫测试及各自守什么）：** `MapLayer.pan-memo.cycle3`（pan 跳子树 + 比较器不假死）；`MapLayer.origin-isolation.cycle3r3`（子树禁读 x/y 的字节级判据）；`PosterCanvas.polygon-origin.cycle3r3`（布局 key 调用方不变量）；`card-layout-cache.affine/invariants.cycle3`（key 函数级）；`destination-card-metrics.test` 对拍 + 反内联硬锁（flowContentStart 逐字回退链）；`prepared-card-content.test` city-only 三值锁。**这些红 = 不变量破，不是测试烦，禁止顺手放宽。**
5. **禁令带原因收录：** 不复活展示框工作台；不 clamp 冻结坐标；不虚拟化画布；不改 `data-*` 导出钩子；不动求解器内部；`MapLayerContent` 子树禁读 `settings.x/y`（违者 pan 静默渲染旧帧，现有字节级测试锁）；`destinationCardFlowContentStart` 禁换 `cardFieldFontSize`（换 = 伪装成重构的隐性像素批）；bench prepared-wrap 的 typography 链禁换 flow 回退（换 = 改变测量对象）。
6. **遗留登记簿：** §2.2 + §2.4 全文（含触发条件、最小修复路径、S5 联动边界），防下一个进场者重新考古。

### 3.3 PR 描述必备件（验收方式 + 回滚方案，按仓库交付纪律）

**验收方式：** ① CI 全量 Vitest + lint + tsc；② `npm run perf:canvas` 中位 @24 三项对照 §3.2-2 验收线（本轮五遍数据附 gpt-sol-A/fable-A 两报告）；③ 视觉验收：除下表三项申报 delta 外零像素——flowContentStart 有逐字对拍、MapLayer memo 有「增量 pan ≡ 新挂载」字节级等式背书。

**视觉 delta 申报（逐项写进 PR，供下游判断是否需重导出）：** §2.1 表全文——city-only +1px（`67e7269`）、photo 长标题早换行（`5fa70cb`）、flow 标题行距随倍率（`5fa70cb`）。

**回滚映射（批 = 回滚单元，按依赖倒序单独可 revert）：**

| 批 | 提交 | 回滚后果 |
| --- | --- | --- |
| MapLayer 窄 memo | `96a7652` | pan@24 回到 ~6.2ms，无视觉变化 |
| 布局 key 不变量测试 | `e4c0d4c` | 仅失守卫 |
| flowContentStart 收编 | `7cc4fb6` | 零像素回退，仅失反内联硬锁 |
| 仿射 key + connector 滤镜 scope | `451fff3` | pan 回 WeakMap-miss 路径 ~10ms；connector id 恢复碰撞 |
| 省界仿射缓存（C2R3，含 photo/flow 视觉批） | `5fa70cb` | pan 回 ~20ms + **两项视觉 delta 回退** |
| frozen 跳求解 + 行高统一（C2R2，含 city-only +1px） | `67e7269` | frozen pan 回退 + **+1px 回退（重新引入 bottomPadding 溢出）** |
| Cycle 1/2 前期批 | `44312ea`…`1d8932c` | 逐批同理，见各 round 结论 |
| Round 3 测试 + bench 注释 | 待提交 | 删文件/删两行，零牵连 |

**破坏性变更声明：** 无。数据格式、导出格式（`data-*` 钩子）、API 形状全程未动——PR 可明写此句并以 export 测试与 `data-*` 全程未改为证。

---

**收束陈述：** 终局裁决 **ACCEPT**——稳定树三遍中位 pan 3.976 / frozen 3.416 / recolor 5.184 ms @24，三项全部过线且余量 20–38%，与 gpt-sol-A 独立五遍互证差 ≤0.06ms，无离群、无失败、四步链无触发点。遗留面收束为：三项已申报视觉 delta（有提交号与回滚路径）、flow 求高族四条与 defs id 一条真缺陷（触发条件与修法全部存档，S5 另立门户）、两条本轮新闭合的不变量锁（变异测试证明捕获力）、四条纯登记项。交接件已冻结成文：最后一批提交清单、全局总结六条、PR 验收/视觉申报/回滚映射三件套。画布 pan 管线三 cycle 收官：21 → 4.0ms，优化冻结，守卫在位，可以合入。
