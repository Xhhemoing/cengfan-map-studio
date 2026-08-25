MODEL: claude-fable-5-thinking-xhigh

# Cycle 3 Round 2 — fable-A：C3-R2-1 门槛裁决核验（已落且 ≥1ms 成立）· 剩余 pan 成本 · Round 3 冻结清单

- **性质：** 纯核验 + 实测 + 收官规划。零 src 改动、只写本文件、未离开 `cursor/canvas-render-display-46a1`。合规披露：开场执行过一次只读 `git branch --show-current` 确认在位分支，此外零 git 命令（无 checkout/commit/stash）。
- **快照声明（本席目击整个落地过程，时序以 mtime + 实测对账）：** 17:47:48 不变量测试落（gpt-sol-B / C3-R2-3）→ 17:48:04–17:48:36 flowContentStart 收编批落（opus-B / C3-R2-2，fable-B 已单独核查）→ 17:48:33 opus-A 建 `MapLayer.panbench.test.tsx` 临时探针 → **17:53:42 `MapLayer.tsx` 终版落定（21682B）**，探针随后删除，opus-A 报告 17:54:36 出。本文全部结论性数字取自 17:53:42 之后的稳定树（17:57–17:59 三遍复测，期间 mtime 无再变）。
- **时序歧义登记（本轮唯一 failure，四步链见 §4）：** 我在 17:49–17:50 的两次探测跨在 opus-A 的 `git stash` 基线对拍窗口两侧——panbench（17:49:31）读数 0.071ms 与其**改后**值逐位吻合，紧随其后的 `perf:canvas`（~17:50）pan@24 却是 6.356ms（**基线**值）。即窗口内工作树在 memo 版与 stash 还原的基线版之间被反复切换，未同步的旁测在此期间不可归因。处置：全部作废，以稳定树复测为准。

---

## 1. 问题一裁决：MapLayer 窄 memo **已落地，且 ≥1ms 门槛达标**——门槛纪律被正确执行

### 1.1 落了什么（`MapLayer.tsx`，517 → 570 行）

拆两段：外层 `MapLayer` 只渲染 `<g data-map-layer transform=…>`（x/y/scale 唯一读点在 :573 的 transform 模板串）；内层 `MapLayerContent = memo(…, contentPropsEqual)` 承载原 `<g>` 内全部内容（双 MapDataLayer、南海小图、pins、标签、hit path、resize handles），`projectFeatures` 的 useMemo 随之下沉。比较器不是"窄 props"而是**跳 x/y 的逐键浅比较**（`settingsEqualIgnoringOrigin`：键数校验 + 除 x/y 外逐键 `Object.is`），子树拿到的仍是真实 settings 对象。附带 `NO_PINS`/`NO_USER_FONTS` 模块常量，消掉每次渲染新建默认数组对比较器的必败项。

**健全性审计（本席逐点核）：** ① 键数双向校验封死增删键漏判；跳过面严格限于 x/y。② 子树零读 x/y——grep 全 `MapLayer.tsx`/`MapDataLayer.tsx`，`settings.x|settings.y` 仅命中外层 :573 一处；`MapDataLayer` 的贴图 `placementBounds` 默认值本就是地图局部坐标系 `{x:0,y:0,width,height}`。③ 测试三锁（`MapLayer.pan-memo.cycle3.test.tsx`）：pan 改 transform 且 MapDataLayer 计数不增；`landColor`→`scale`→`provinceStyles` 三级递进计数必增（封死"永不更新"的假比较器）；标签/hit path/frame 在 pan 后仍在。本席复跑该文件 + `MapLayer.test.tsx`：**19/19 绿**。

### 1.2 ≥1ms 证据：三方独立数字互证

| 口径 | 改前 | 改后 | 增益 |
| --- | --- | --- | --- |
| MapLayer 单层 pan（34 省，opus-A stash 对拍） | 2.382 / 2.38 ms | 0.070 / 0.069 ms | **−2.31ms** |
| 同口径，本席在探针删除前实测（17:49:31，事后判定为 memo 版在树） | — | 0.071ms（首次 1.007ms） | 与 opus-A 改后值逐位吻合 |
| `posterCanvasMapPanRerender` n=24 | 6.356（本席）/ 6.338（gpt-sol-A）ms | 5.686 / 3.922 / 4.180 → **中位 4.180ms** | **≈ −2.2ms** |
| 同上 n=8 | 6.613 / 7.368 ms | 3.331 / 3.612 / 3.287 → **中位 3.331ms** | **≈ −3.3ms** |

基线侧我因禁 git 无法亲测（需 stash 切换），但 opus-A 的反向验证补上了这环：stash 还原基线后新测试红（`expected 4 to be 2`——基线一次 pan 确实重建两个 MapDataLayer），与端到端 −2.2ms 差值双向印证。**换色路径未劣化**：recolor@24 改后 5.27–5.43ms vs 改前 5.09–5.30ms，比较器开销（20 来个键浅比较）不可见。

### 1.3 Round 1 归因修正（登记）

Round 1 简报把该项记为 "~1–2ms"，实测单层 2.38ms——**低估了**。且机制侧写也需修正：d 字符串本就同引用（diff 走 `===` 快路径），那 2.3ms 是 34 省 × (fill+2 border+clip defs+hit+label) 的 **element 重建与 fiber diff 本身**。教训沉淀：子树成本要单层直测（本轮的 panbench 手法），不能靠端到端差分倒推。

## 2. 问题二：剩余 pan 成本 ≈ **4.2ms @24 卡 / 3.3ms @8 卡**（中位），构成已定性、无 ≥1ms 单杠杆残留

稳定树三遍（17:57–17:59，同机有并行席位负载，绝对值偏保守）：

| 指标（ms，中位/三遍） | n=8 | n=24 |
| --- | --- | --- |
| MapPan | **3.331**（3.29–3.61） | **4.180**（3.92–5.69） |
| FrozenMapPan | 2.517（2.35–2.55） | 3.630（3.52–5.02） |
| ProvinceRecolor | 4.662（4.61–4.76） | 5.425（5.27–5.43；另有一次 17.9 离群，见 §4） |
| CardPosition | 1.362 | 2.380（早先静时 1.13，环境负载佐证） |
| SelectedText（树 diff 地板） | 0.966 | 0.694 |

**构成（@24，~4.2ms）：** ~0.7ms 组件体重跑 + 全树 diff 地板（SelectedText 探针）；~1.5–2.4ms 卡层必要工作（锚点动 → 24 张卡 transform + 连接线 `d` 全部重写，CardPosition 探针的超集）；~0.07ms MapLayer（只剩外层一个 transform 属性）；余 ~1–1.5ms 为 pan 随动的 body memo 重算（provincePolygons 逐点仿射复制、provinceAreas 仿射、mapContentBounds/occupied 过滤、cardAnchors、key 仿射前缀 + LRU get、destinationCards 重组）。

**三条判定：** ① 8 卡（3.3）与 24 卡（4.2）首次拉开差距——卡数无关地板已被打穿，剩余以**必要工作**为主。② 余下 ~1–1.5ms 的 body 重算分摊在十余个 memo 上，无单项 ≥1ms；而跨运行噪声实测 ±0.5–1.7ms（改前 pan@24 各席读数 6.34–7.98），**任何 <1ms 的杠杆在本环境不可举证**——门槛纪律自身宣告优化终止。③ Cycle 2 曾定又在 Round 1 判"未达"的 unfrozen pan ≤5ms 验收线，memo 落地后**已达线**（中位 4.18）。

## 3. 问题三：Round 3 冻结清单（最后一轮，只固化不新增）

1. **优化冻结。** C3-R2-1 是本 cycle 最后一个获准的优化，已落且验收达标。C3-R2-4（map-edge/clip 等其余 defs 跨实例 id 碰撞）**不做**，归终局遗留清单（现状仅 connector 滤镜已 scope）。任何新 perf 立项一律拒绝——§2 已证无可举证杠杆。
2. **全量验证串行跑：** `npm test` 全量 + `npm run lint` + tsc，经 `scripts/run-heavy.mjs`，勿与他席并行（本轮 17.9ms 离群即并行负载所致）。
3. **验收线按稳定树中位重定（多次运行取中位为口径）：** 建议 pan ≤6.0 / frozen ≤5.5 / recolor ≤6.5 ms @24 卡（中位 4.2/3.6/5.4 + 噪声余量）。禁止为凑线改 bench 指标定义或牺牲碰撞精度。
4. **交付纪律红线（收官最大风险项）：** 全部改动至今**零 commit**（含 Cycle 2 遗留）。Round 3 必须分批提交推送，批次即回滚单元：① P0/P1（key 仿射化 + 换色不重投影 + affine/recolor 测试）；② edge-styles 滤镜 id 作用域；③ C3-R2-2 flowContentStart 收编；④ C3-R2-3 不变量测试；⑤ C3-R2-1 MapLayer 拆层 memo + pan-memo 测试；⑥ bench 脚本扩展；⑦ Cycle 2 视觉批单独成批。各批回滚方案已在各席文档记录；本地绿 + 口头完成不是交付证据。
5. **终局结论简报数字链：** pan@24 21 → 10 → 6.2 → **4.2ms**（Cycle 1→3）；MapLayer 单层 2.38 → 0.07ms；recolor ~20+ → 5.4ms；frozen 3.6ms；mount 82.7 → ~70–77ms（未动）。
6. **遗留清单固化移交（防散佚）：** C2-1/D1 city-only 视觉；C+D+E/S5 flow 求高族；部分冻结避让语义；C3-R2-4 defs 碰撞；`MapLayer.tsx` 570 行 / PosterCanvas 超 400 行拆分；bench 脚本 :185 同形回退链（gpt-sol-A 面）；mount 内 ~24ms 投影的模块级缓存（多实例可举证时）；**新增一条**：C3-R2-3 锁的是 key 函数级不变量，PosterCanvas 调用缝"centered 多边形必须恰为 occupiedPolygons 平移原点之逆"的调用方不变量仍无锁（Round 1 §4-R1 的 DEV 断言方案），Round 3 有余量可小补，否则登记移交。
7. **禁区照旧 + 新增一条：** 不复活展示框工作台、不 clamp 冻结坐标、不虚拟化、不改 `data-*`、不动求解器内部；**新增：`MapLayerContent` 子树内禁读 `settings.x/y`**（违者 pan 时读到上一帧值；注释 + pan-memo 测试已双锁，收官简报应明文收录）。

## 4. 验证纪律（failure → cause → fix → recheck）

- **失败 1：** 17:49–17:50 两次旁测互相矛盾（panbench 0.071ms 为改后值，紧邻的 perf:canvas pan@24 6.356ms 为基线值）。**根因：** opus-A 以 `git stash push/pop` 反复切换工作树做基线对拍，未同步的并行测量落在切换窗两侧。**修复：** 作废窗口内全部读数，等 `MapLayer.tsx` 终版 mtime（17:53:42）稳定后重测。**复检：** 三遍 perf:canvas 一致（§2 表），且与 opus-A 报告数字互证。
- **失败 2：** 稳定树第一遍 recolor@24 = 17.889ms（vs 既往 ~5.1–5.4）。**根因假设：** 并行席位全量测试挤占 CPU 的瞬时离群（同遍 cardPosition/mount 亦普涨）。**修复：** 无代码问题，间隔重跑。**复检：** 第二、三遍 5.425 / 5.270ms 回归常态；判定成立，不立缺陷。
- 测试复跑记录：`MapLayer.pan-memo.cycle3` + `MapLayer.test` 19/19 绿；`card-layout-cache.invariants.cycle3` 2/2 绿（C3-R2-3 落地确认）；panbench 探针删除前 2/2 绿。

**收束陈述：** C3-R2-1 已按门槛纪律落地——单层 2.38→0.07ms、端到端 −2.2ms（@24）/ −3.3ms（@8），远超 1ms 门槛且经本席独立复证；比较器健全、换色不劣化、三锁测试在位。剩余 pan 成本 4.2ms @24，构成以必要工作与树 diff 地板为主，无 ≥1ms 可举证杠杆，优化就此冻结。Round 2 三项登记（R2-1/R2-2/R2-3）全部核销，Round 3 唯余固化：全量验证、分批提交推送、验收线定稿、遗留清单移交。
