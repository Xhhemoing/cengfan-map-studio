# R13-opus-layout — 引线穿卡的「定位」落到卡片上

- **模型**: claude-opus-5-thinking-high-fast
- **分支**: `cursor/agent-sota-polish-cbcd`（未 commit / stash / 新建分支）
- **改动文件**: `src/lib/studio-editor-helpers.ts`（+46 行）、新增 `src/lib/studio-editor-helpers-locate.test.ts`（97 行）
- **未改**: `layout-health.ts`、`content-layout-objects.ts`、`use-project-health.ts`、求解器、任何 UI 组件

---

## 先核 Round 13 缺口 #3：穿卡到底能不能定位

简报问的是「引线穿卡已报，但点击定位是否跳到对应卡未核」。核了：**产品路径上能定位，但是撞运气撞对的。**

链路是 `DeliveryWorkspace` / `StudioAssistantRail` → `nav.locateLayoutIssue(issue)` → `resolveLayoutIssueSelection(project, issue.id)`。穿卡问题 id 是 `connector-<出发卡键>:<被穿的卡键>`（`layout-health.ts` 拼的，例如 `connector-北京市:浙江省`）。老实现把 id 按 `:` 全切开，再 `find` 第一个能在工程文档里认出来的片段：

- `connector-北京市` 认不出来（它是连接线 id，不是画布对象）→ 跳过；
- `浙江省` 在 `cards.positions` 里 → 命中，选中 `{ type: "cards" }`。

也就是说它落在**被穿的那张卡**上（正是用户要挪的东西），但靠的是「连接线 id 恰好谁都不匹配」这个副作用，而不是任何有意的规则。顺着这条线查下去，同一个 `split(":")` 还漏了三种真会静默失效的情况——点了「定位」画布一点反应都没有，也没有任何提示。

## 三处静默失效（先复现，再修）

| 场景 | 问题 id | 老结果 |
| --- | --- | --- |
| 卡片分组键自带 `:` | `杭州:西湖`（超边界）、`connector-北京市:杭州:西湖`（穿卡） | `null`，不动 |
| 被穿的卡已不在手工位置里 | `connector-北京市:浙江省`（`positions` 只剩北京） | `null`，不动 |
| 引线互相冲突（两端都是连接线） | `connector-北京市:connector-浙江省` | `null`，不动 |

第一种不是臆想出来的边角：分组键就是名单里的省 / 市 / 院校名（`buildLayoutGroups` 直接拿 `student.city` / `student.university` 当 key），导入的表格里出现一个冒号，这张卡的**所有**排版问题（超边界、遮挡、穿卡）就都定位不了了。第三种是 Round 12 报告里已经点名过的遗留问题（`connector-conflict` 定位不了），这次一并解决。

## 改法

`resolveLayoutIssueSelection` 里换掉「按 `:` 全切开」：

1. **穷举跨分隔符的连续片段**（`issueIdFragments`）。同一起点先长后短，所以含 `:` 的完整键先于它的碎片被验证；起点靠前的先来，于是「取 id 里第一个真对象」的既有次序原样保留（遮挡 `后:前` 仍然选中「后」那个）。
2. **前缀兜底**：第一轮都认不出来时，把 `connector-` 前缀剥掉再验一遍，还原出发卡。

穿卡的定位目标因此从「撞对的」变成写死的规则：第一轮就会命中被穿的卡；被穿的卡不在了才退回出发卡。片段数是 `O(k²)`，`k` 是 id 里的冒号数 + 1（实际 ≤ 3），定位是点击时才跑的一次性操作，成本无关紧要。

一条刻意保留的优先级：画布上如果真有个 id 就叫 `connector-北京市` 的元素，它赢过「剥前缀还原出的北京市卡」——原样匹配始终先于兜底，兜底不会劫持真实 id。有用例锁着。

## 验证（failure → cause → fix → recheck）

1. **failure**：先写 7 条用例再改代码，`npx vitest run src/lib/studio-editor-helpers.test.ts -t "resolveLayoutIssueSelection"` → 3 红 4 绿。红的全是 `expected null to deeply equal { type: 'cards' }`（上表三种）；绿的里包含走真实 `listContentLayoutIssues` 的产品路径穿卡用例——它本来就过，正好把「今天已能定位到被穿的卡」这一结论钉住，改动不得让它变色。
2. **cause**：`issueId.split(":")` 把 id 当成「片段即对象」，于是（a）含 `:` 的对象 id 被切碎，(b) 连接线 id 永远匹配不上、又没有回退路径。
3. **fix**：上面两步，只动 `resolveLayoutIssueSelection` 及其两个新私有函数。
4. **recheck**：同一条命令 → 30/30 绿（含原有用例）。

其余检查：

- `npx vitest run src/lib/studio-editor-helpers-locate.test.ts src/lib/studio-editor-helpers.test.ts src/lib/content-layout-objects.test.ts src/lib/layout-health.test.ts src/App.test.tsx` → 84/84；
- 全量 `npx vitest run` → **203 files / 1762 tests 全绿**（含同轮其他代理的改动）；
- `npx tsc -p tsconfig.app.json --noEmit` → 0 错误；
- `npx eslint src/lib/studio-editor-helpers.ts src/lib/studio-editor-helpers-locate.test.ts` → 0 问题。

用例一开始加在 `studio-editor-helpers.test.ts` 里，文件涨到 414 行超了 400 上限，于是整块移到新的 `studio-editor-helpers-locate.test.ts`（定位映射自成一题，命名沿用 `studio-editor-helpers-*` 的同族约定）；原测试文件已与 HEAD 逐字一致。`studio-editor-helpers.ts` 220 行。

## 交付与回滚

- **验收方式**：纯前端定位逻辑，无数据 / 导出格式 / API 形状变更，CI 跑上述 vitest + tsc + eslint 即可。手工验收路径：名单里给某个城市名加个冒号 → 手工摆两张卡让引线穿过其中一张 → 交付页「排版问题」点「定位」，应跳到内容阶段并选中数据框图层（改动前无反应）。
- **回滚**：`git checkout src/lib/studio-editor-helpers.ts && rm src/lib/studio-editor-helpers-locate.test.ts`。函数签名 `(project, issueId: string)` 没变，调用方（`use-studio-navigation.ts`）一行都没动，回滚不牵连别处。

## 没做的

- **没给 `LayoutHealthIssue` 加结构化 `targets` 字段。** 那是比字符串拆解更干净的做法，但 `nav.locateLayoutIssue` 只把 `issue.id` 传进解析器，要接线就得改 `use-studio-navigation.ts`——本轮不在允许清单里。留给以后：加 `targets?: readonly string[]`，`locateLayoutIssue` 改传整个 issue，解析器优先读它，本次的片段穷举退化成旧 id 的兼容路径。
- **没改 `layout-health.ts` 的 id 拼法。** 把卡片放到 id 前面确实更直白，但 `content-layout-objects.test.ts` / `agent-session-tools.test.ts` 都逐字断言了现有 id，那两个文件本轮不可改。
- **没碰求解器、没碰穿卡判定（弦长阈值 / 锚点豁免）。** 本轮只解决「报出来之后点得动」。
- **定位粒度仍是整层 `cards`。** `SceneSelection` 没有「单张目的地卡」这种选中类型，手工摆放的卡片只能落到数据框图层——这是既有 UI 契约（遮挡类问题也一样），不在本轮改。
