# Round 10 — R10-opus-data

MODEL_SLUG: claude-opus-5-thinking-high-fast
分支：`cursor/agent-sota-polish-cbcd`（未提交、未切换分支）

修了 4 个「静默出错」缺陷：2 个指派的 + 1 个自查到的严重导入串列 + 1 个去向类型误判。
全部有回归测试，且每条都先复现失败再修。

---

## 改动文件

| 文件 | 行数 | 改动 |
| --- | --- | --- |
| `src/lib/import-headers.ts` | 375 | 新增 `StudentColumnMapping` / `StudentColumnAlternates`、`detectHeaderMapping`、同名副列回落 |
| `src/lib/import-data.ts` | 389 | 表头映射串接；去向类型否定语；禁止「部分映射行」回落到按位读取 |
| `src/lib/binary-import.ts` | 380 | 串接 `detectHeaderMapping`；副列不再报为「未使用」 |
| `src/lib/data-health.ts` | 168 | 新增 `dataIssueKindLabel`（问题种类文案的唯一出处） |
| `src/components/DataQualityPanel.tsx` | 98 | `filterLabel` / `onClearFilter` / `totalIssues`；筛选态不再声称「数据状态良好」 |
| `src/components/GlobalDataScreen.tsx` | 149 | 传入筛选上下文；地图映射不再与遗留 `issueFilter` 取交集 |

测试：`import-headers.test.ts` `import-data.test.ts` `binary-import.test.ts`
`GlobalDataScreen.test.tsx` `DataQualityPanel.test.tsx`。

未动 layout / delivery / server / `App.tsx` / china-universities。测试夹具仍用 林舟 / 苏禾 / 周晴 / 顾言。

---

## 缺陷 1：重复表头列把数据丢掉（指派）

**现象.** 表头 `["姓名","姓名","院校","城市"]`、数据行 `["", "林舟", "北京大学", "北京市"]`。
第 0 列被 name 认领，`readStudentColumn` 只看这一列，读到空串，整行报「缺少姓名」被丢弃——
而 林舟 明明就在第 1 列。合并两份导出、或者「姓名 / 曾用名」这类表格常有这种不均匀填充。

**根因.** `detectHeaderColumns` 只返回 `字段 → 单个列号`，副本列的信息在检测阶段就被扔了；
`readStudentColumn` 拿不到任何回落目标。

**修法.** 检测阶段额外记录副列：

- `detectHeaderMapping(headers)` 返回 `{ indexes, alternates }`。`alternates[field]` 是
  「归一化后与被认领列表头**完全相同**、且没有被别的字段认领」的列号（按表格顺序）。
- `detectHeaderColumns` 保留为 `detectHeaderMapping(...).indexes` 的薄封装，
  「重复表头第一列胜出」的既有语义和既有断言原样保留。
- 行读取统一走内部 `readStudentCell`：主列 `trimImportCell` 后非空就用主列
  （两列都填时仍是第一列胜出），只有主列为空才依次看副列。
  `rowRestatesHeader` 用它返回的实际列号去比对表头单元格，比对不会因为回落而错位。
- `readStudentColumn` / `missingRequiredCells` / `isSummaryRow` / `countExactHeaderCells` /
  `rowRestatesHeader` / `missingRequiredColumns` / `candidateFromColumns` 现在接受
  `StudentColumnLookup = StudentColumnIndexes | StudentColumnMapping`，裸 index map 仍能用。

**边界：只回落到「同一个表头写法」的列，不回落到同字段的其它别名。**
`["姓名","高校","生源地","城市"]` 里 `生源地` 是**来源地**不是去向地；城市列为空时拿生源地顶上，
会把学生标到老家的省份——那是把「漏报」换成「错报」，比原缺陷更糟。所以副列必须是重复表头。
这一条本身写了断言（`only falls back to a column repeating the same header, never to a different alias`）。

**顺带.** xlsx 侧 `createMetadata` 把副列计入 `mappedIndexes`，
副本列不再出现在「未使用：…」提示里（它确实在被当备份用）。

---

## 缺陷 2：筛选把问题藏起来后仍说「数据状态良好」（指派）

**现象 A.** 数据总览里点一个计数为 0 的桶（比如「查看重复记录」），
`issueFilter` 置为 `duplicate`，`visibleIssues` 变成空数组，
`DataQualityPanel` 于是渲染「数据状态良好 / 当前名单可以直接进入地图与卡片编辑」——
而名单里还有未匹配城市没处理。

**现象 B.** 从总览点「查看隐藏记录」（filter = `hidden`），再切到「地图映射」。
导航原本对 `mapping` 也保留 filter，映射视图又拿 `visibleIssues` 再按
`unresolved-location / manual-province` 过滤一次 —— 两个条件取交集后必然为空，
于是一张仍然缺人的省份地图被报成「数据状态良好」。

**根因.** `issues` 是「调用方决定展示什么」的结果，空数组有两种完全不同的含义
（名单干净 / 这个桶是空的），面板无从分辨，就默认按前者播报。

**修法.**

- `DataQualityPanel` 新增可选 `filterLabel` / `onClearFilter` / `totalIssues`。
  有 `filterLabel` 时：标题 meta 写成 `已筛选「X」· N 项，另有 M 项未显示`；
  空列表渲染「没有「X」记录 / 名单中还有 M 项其他状态需要查看。」，**永不**说「数据状态良好」。
  给了 `onClearFilter` 才渲染「清除筛选」按钮（`[data-clear-issue-filter]`）。
- `GlobalDataScreen` 的数据质量页传 `filterLabel={dataIssueKindLabel(issueFilter)}`、
  `onClearFilter`、`totalIssues={issues.length}`。
- 地图映射改用 `mappingIssues`（**直接从完整 `issues` 派生**，不经过 `issueFilter`），
  并传 `filterLabel="定位问题"`（不传 `onClearFilter`，那里没有可清的用户筛选），
  这样它空的时候说的是「没有「定位问题」记录 / 名单中还有 M 项其他状态需要查看」，
  而不是替整份名单背书。
- 导航切走时清筛选的条件从 `view !== "quality" && view !== "mapping"` 收紧为 `view !== "quality"`。
- 问题种类文案搬到 `data-health.ts` 的 `dataIssueKindLabel`，
  避免从组件文件导出非组件（`react-refresh/only-export-components` 告警）。

---

## 缺陷 3（自查）：表头完整时，缺格的行被按位重读，整行串列导入

allowlist 内、`src/lib/import-data.ts`。这是本轮最严重的一个。

**复现.**

```
学号,姓名,院校,城市
20260001,林舟,北京大学,
```

修复前 `parseStudentText` 的实际输出：

```json
{ "candidates": [ { "name": "20260001", "university": "林舟", "city": "北京大学" } ], "unparsed": [] }
```

学号变成姓名、姓名变成院校、院校变成城市，**`unparsed` 是空的**——没有任何告警，
用户看到的是一条「完整」的记录。

**根因.** `parseStudentText` 的兜底链是「表头映射 → 标签式 → 按位」。
表头映射因为城市空而返回 null 之后，控制流继续走到 `splitParts` + `toCandidate`；
`splitParts` 会 `filter(Boolean)` 丢掉空单元格，剩下 3 个非空值刚好凑满
「姓名/院校/城市」三个位置，于是造出一条看起来合法的记录。
原有测试没抓到，是因为它们的缺格行剩不到 3 个非空值（`只有姓名,,` → 1 个），够不着这条路径。

**修法.** 记 `mappedPartially`：表头完整、且该行按映射读出的必填项**不是全空**时，
说明这行确实是按表头排的，缺的就是真的缺 —— 直接按 `缺少城市` 报到 `unparsed`，
不再让按位读取接手。

必填项**全部**读不到时（例如表头是逗号分隔而某行是制表符分隔，映射根本对不上），
才保留按位兜底。标签式解析（`姓名：苏禾，学校：…`）任何情况下都保留：它是自描述的，不会串列。
两条都有断言（`never re-reads an incomplete mapped row by position`、
`still reads a labeled line that the header mapping cannot place`）。

xlsx / HTML 表格走 `parseExcelWorkbookRows`，本来就是直接报 `unparsed`，不受影响。

---

## 缺陷 4（自查）：「未出国」被读成海外去向

**现象.** `是否出国` 列的否定回答里，海外标记是完整出现的：
`parseLocationScopeValue("未出国")` 命中 `出国`，返回 `international`。
一个从没出过国的学生被标成海外去向，从省份地图上无声消失（`buildProvinceSummary` 会排除海外记录）。
`不出国`、`国内（非海外）`、`not abroad` 同理。

**修法.** 先 `stripNegatedMarkers`：把「否定词 + 海外标记」里的标记删掉、**保留否定词**，
循环到不再变化，于是否定词能顺延到下一个标记（`未出国留学` → `未留学` → `未`）。
只有紧邻的否定才算数，所以 `非全日制海外硕士` 仍然是海外。
判不准的一律留在中国去向 —— 这是 `parseLocationScopeValue` 本来就写明的默认，也是可挽回的一侧。

---

## 验证（failure → cause → fix → recheck）

每条都先把修复临时回退、跑出红，再恢复、跑绿。

| 缺陷 | failure（回退修复后） | cause | fix | recheck |
| --- | --- | --- | --- | --- |
| 1 重复表头 | `readStudentCell` 去掉副列循环 → 2 failed：`falls back to a repeated header column when the claimed one is blank`、`reads a merged export whose duplicated 姓名 columns are filled unevenly` | 检测阶段丢弃副本列，行读取无回落目标 | `detectHeaderMapping` + `alternates` + 主列为空才回落 | import-headers 30 passed / binary-import 22 passed |
| 2 筛选诚实性 | 还原 `visibleIssues` 交集与无参 `DataQualityPanel` → 2 failed，报文均为 `expected '…' not to contain '数据状态良好'` | 空数组的两种含义无法区分 | `filterLabel` / `onClearFilter` / `totalIssues`；映射视图脱离 `issueFilter` | GlobalDataScreen 4 passed / DataQualityPanel 5 passed |
| 3 按位串列 | `if (mappedPartially \|\| true)` → 1 failed：`never re-reads an incomplete mapped row by position` | 映射失败后控制流继续落到 `splitParts`，`filter(Boolean)` 补齐三列 | 部分映射行直接报 `缺少X`，只有全空才兜底 | import-data 30 passed |
| 4 否定去向 | 还原 `normalized.includes(token)` → 2 failed：`reads a negative answer to 是否出国 as a China destination`、`keeps a whole roster of 是否出国 answers on the right side of the map` | 否定回答里标记完整出现 | `stripNegatedMarkers` 迭代剥离「否定词+标记」 | import-data 30 passed |

指定命令：

```
npx vitest run src/lib/import-headers.test.ts src/lib/import-data.test.ts src/lib/data-health.test.ts \
  src/lib/student-data.test.ts src/lib/binary-import.test.ts src/components/GlobalDataScreen.test.tsx \
  src/components/DataQualityPanel.test.tsx src/components/DataOverview.test.tsx
→ 8 files / 119 tests passed

npx tsc --noEmit -p tsconfig.app.json     → 0 error
npx eslint <上表 6 个源文件 + 6 个测试文件>  → 0 error / 0 warning
npx vitest run（全量，含其它 agent 的在途改动） → 199 files / 1684 tests passed
```

`import-data.ts` 加完逻辑一度到 423 行，把两段纯转出/转入清单压成每行多个符号后回到 389 行，
其余源文件均 < 400。`import-data.test.ts` 416 行——测试文件在本仓库超 400 是常态
（`binary-import.test.ts` 416、`card-layout.test.ts` 1285），且拆分目标文件不在 allowlist 内。

---

## 交付与回滚

**验收方式.** 上面 8 个测试文件 + `tsc` + `eslint`，CI 跑同一套即可。
人工验收路径：数据工作台 → 数据总览 → 点一个计数为 0 的桶（应看到「没有「X」记录」+「清除筛选」，
不应看到「数据状态良好」）→ 点「查看隐藏记录」再切「地图映射」（未匹配城市应仍然列出）。
导入路径：粘贴 `学号,姓名,院校,城市` 且末列留空的一行（应报「缺少城市」而不是导入一条串列记录）。

**破坏性变更与回滚.**

- 未改动任何持久化数据结构、导出格式或 HTTP API 形状。`ImportCandidate`、`ExcelImportResult`
  的字段没变；`unmappedHeaders` 的内容在「有重复表头列」时会少列出副本列（更准确，非结构变化）。
- 内部 API 变了：`detectHeaderColumns` 语义与签名不变，但行读取函数的第二参数放宽为
  `StudentColumnLookup`（联合类型，裸 index map 仍合法），`candidateFromColumns` 同理。
  仅 `import-data.ts` / `binary-import.ts` 两个调用方，均已同步。
- 行为变化会影响导入结果的有三处，回滚粒度都是单点：
  1. 副列回落 —— 回滚：`readStudentCell` 删掉 `lookupAlternates` 循环。
  2. 部分映射行不再按位兜底 —— 回滚：把 `if (!mappedPartially)` 改回无条件执行。
     风险面：以前会被按位「救回来」的缺格行，现在进 `unparsed`。这正是目的
     （被救回来的记录是串列的），但如果有用户依赖旧行为，这一行就能回退。
  3. 否定去向 —— 回滚：`parseLocationScopeValue` 里去掉 `stripNegatedMarkers` 调用。
- UI 侧 `DataQualityPanel` 三个新 prop 全部可选，不传时渲染与改动前一致（除了地图映射视图，
  它现在显式传 `filterLabel`）。

## 已知遗留（未修）

- 嵌套 `<table>` 的剪贴板粘贴仍按 documented-unfixed 处理。
- `matrixToText` 在「表头缺必填列」的兜底路径上 `row.filter(Boolean)` 会压掉空单元格、
  使后续列左移。该路径本身就是「表头不可信、退回按位」，且横跨 xlsx/HTML 两个入口，
  本轮没动；如果要修，应和缺陷 3 同样的思路处理（宁可报缺失，不要按位补齐）。
- `student-data.ts` 的 `duplicateKey`（姓名+院校）与 `data-duplicate.ts` 的重复判定
  （姓名+院校+城市+去向类型）口径不一致，`data-duplicate.ts` 不在 allowlist，未动。
