# Round 3 fable-2 — 文档 / CHANGELOG / 向后兼容冻结审计

审计对象：工作区未提交状态（分支 `cursor/round3-uncross-ai-obstacles-6265`，含 CHANGELOG / USER_GUIDE / CardsInspector 的 Round 3 改动）。
证据来源：CHANGELOG Unreleased 第一条、USER_GUIDE 2.1、`src/lib/scene-document.ts` normalize 默认值、`src/lib/project-persistence.test.ts`、`src/components/canvas/PosterCanvas.tsx` 冻结逻辑、`git show 7bc8144^`（回滚方向验证）。

## 一、文档是否诚实

**已修复（Round 3 工作区 diff 确认）：**

- 「连接线避让」过度承诺已在三处统一改口：CHANGELOG 现写「两个开关约束的都是卡片矩形本身，连接线不在避让范围内」；USER_GUIDE 2.1 新增「两个开关都只约束卡片矩形」条目；CardsInspector hint 写「不保证连接线绕开省份轮廓、文本或装饰素材」。与代码一致：`connectorMapIntersections` 只是 optimize 路径（quadrant/radial ≤80 卡）的软评分项，columns/right-stack/proximity/grid 完全不考虑，说「不保证」是唯一诚实的方向。ROUND2-BRIEF 风险 #4 已消。
- 「连接线互不交叉是硬性要求但不是承诺」三处口径一致，与 `chooseLayout` 实现（solved 即返回、否则按交叉数取最优 fallback）吻合。
- 「拖动一张卡片时被挤开的邻居会一起让位，并且只占一步撤销」：`moveCardsTransaction` 单事务提交，属实。
- 「自动平衡左右对四周整齐/分列整齐有效」：与 `AUTO_BALANCE_MODES = {quadrant, columns}` 一致。

**仍不诚实的一句：「老海报不会跳版」（CHANGELOG Unreleased 第一条括号内）。**
卡片位置只在手动拖拽或任何地图修改时才被钉进工程（`freezeCardPositionsForMapChange`）；纯自动排布、从没碰过地图的老工程 `positions` 为空，`PosterCanvas.frozenPlacements` 返回 null → 重开即用新求解器重排。而新求解器默认多了两类变化：`allowElementOverlap` 默认 false（嘉宾/文本/装饰全部成为障碍，装饰此前完全不避让）＋交叉修复重排槽位。这类老海报**会**跳版，且括号里的「默认仍是四周整齐」救不了它——同为 quadrant，输出已不同。该句只对「位置已全部钉住」的老海报成立。

**次级遗漏（不算说谎，是没说）：** 老工程重开后「禁止遮挡其他元素」也默认开启，且作用于手动拖拽的 `clampCardPosition`——以前特意压在文本框/装饰上的卡片，拖动一下就放不回去了，用户没有任何提示要去关开关。

## 二、破坏性变更有无

- **数据形状：非破坏。** 旧字段 `allowMapOverlap` 原样保留（老「允许卡片覆盖地图」的勾选映射为「禁止遮挡地图」不勾，语义连续）；`allowElementOverlap` 为新增可选字段，normalize 用 `=== true` 收敛、缺省 false；`layoutMode` 新增两个枚举值。`project-persistence.test.ts` 覆盖了双开关 + `layoutMode: "columns"` 的序列化往返（145–172 行）与 v1 老工程迁移（默认值由 normalize 兜底，测试未显式断言缺字段时两开关为 false——建议 Round 3 测试组补一行断言，非文档职责）。
- **视觉行为：对未钉位置的老海报是破坏性的**（重排结果不同），对已钉位置的老海报无影响。CHANGELOG 目前把这条风险用「老海报不会跳版」盖掉了，方向反了。
- **API：** `solveDestinationCardLayout` 等旧签名保留为委托，非破坏。

## 三、回滚是否成立

**机制上成立，但零记录。** 已验证 `7bc8144^` 的旧代码：旧 `normalizeLayoutMode` 会把未知的 "proximity"/"columns" 收敛为 "quadrant"；旧 `normalizeScene` 用 `...scene.cards` 展开保留未知键，`allowElementOverlap` 被无害携带。即：回退旧版本后新工程文件仍可打开、不丢数据，仅排布回落四周整齐。AGENTS.md 交付纪律要求破坏性变更记录回滚方案——本条 Unreleased 涉及老海报视觉变化，CHANGELOG 里却一个字没有（对比同页「工程包命名」条目主动写了「历史文件继续可导入」）。补一句即可闭环。

## 四、还缺哪句用户能看懂的说明

1. **饱和重叠**（ROUND2-BRIEF 风险 #6）：18+ 卡小画布时 fallback 允许卡片相互重叠（「不丢内容」设计），求解器门面注释还写着 "Cards never overlap" 的硬约束——用户文档与 UI 均零披露。用户看到叠卡只会以为是 bug。
2. 老海报何时会/不会跳版（见第一节）。
3. 回退版本后文件会怎样（见第三节）。

## 五、Round 3 文档补丁建议（≤5 条，不自己改文件）

**P1 — CHANGELOG.md（Unreleased 第一条，修正过度承诺）**
原句：`（原有四周整齐 / 极角环绕 / 右侧单列 / 边缘网格保留，默认仍是四周整齐，老海报不会跳版）`
改句：`（原有四周整齐 / 极角环绕 / 右侧单列 / 边缘网格保留，默认仍是四周整齐。手动摆过卡片或改过地图的老海报，位置已钉住不会动；从未固定过位置的老海报重新打开会按新规则重排一次，结果通常更整齐，但与旧版位置不同）`

**P2 — CHANGELOG.md（Unreleased 第一条，补回滚记录）**
原句：`两个开关同样作用于手动拖拽；拖动一张卡片时被挤开的邻居会一起让位，并且只占一步撤销。`
改句：`两个开关同样作用于手动拖拽；拖动一张卡片时被挤开的邻居会一起让位，并且只占一步撤销。回退到旧版本也能打开新版保存的工程：旧版本会把「省份近」「分列整齐」当作「四周整齐」处理并忽略「禁止遮挡其他元素」字段，数据不丢。`

**P3 — CHANGELOG.md（Unreleased 第一条，披露饱和重叠）**
原句：`卡片多、空间不够时会退而保留它找到的交叉最少的一版，需要换一种排布方式、点顶栏「刷新展示框位置」重算或手动拖开个别卡片。`
改句：`卡片多、空间不够时会退而保留它找到的交叉最少的一版，需要换一种排布方式、点顶栏「刷新展示框位置」重算或手动拖开个别卡片；极端拥挤时为了不丢任何一张卡片，允许卡片相互重叠，换更大画幅或减小字号可缓解。`

**P4 — USER_GUIDE.md（2.1 末行，老工程拖拽行为变化提示）**
原句：`- 两个开关同时作用于自动排布和手动拖拽。手动摆过之后想回到自动结果，点顶栏「刷新展示框位置」`
改句：`- 两个开关同时作用于自动排布和手动拖拽；老项目打开后同样默认开启，以前特意压在文本或装饰素材上的卡片若拖动后放不回原处，先关掉「禁止遮挡其他元素」。手动摆过之后想回到自动结果，点顶栏「刷新展示框位置」`

**P5 — USER_GUIDE.md（2.1「连接线交叉」条目，披露饱和重叠）**
原句：`看到交叉可以换一种排布方式、点顶栏「刷新展示框位置」重算，或手动拖开个别卡片`
改句：`看到交叉可以换一种排布方式、点顶栏「刷新展示框位置」重算，或手动拖开个别卡片。名单很多、画布很小放不下时，自动排布优先保证每张卡片都留在画布内，可能出现卡片相互重叠，换更大画幅、减小字号或减少展示字段可缓解`

## 附：非文档职责的移交项

- `src/lib/project-persistence.test.ts` 的 v1 迁移用例未断言缺字段时 `allowElementOverlap === false`（「默认勾选」这句话的持久化证据缺一角）→ 移交测试组。
- `src/lib/card-layout.ts` 门面 docstring「Cards never overlap」与饱和 fallback 行为矛盾 → 移交拆分/求解器组改注释。
