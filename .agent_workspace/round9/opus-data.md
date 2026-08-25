# Round 9 — R9-opus-data：导入 / 数据健康的剩余边角

MODEL_SLUG: claude-opus-5-thinking-high-fast

## 结果

四个真实缺陷，其中两个会**静默地让用户看到错的东西**（凭空多一条学生、真实告警被吞掉），两个是**静默丢数据/丢定位信息**。

| # | 缺陷 | 后果 | 文件 |
| --- | --- | --- | --- |
| 1 | CSV 引号内换行的记录被按物理行撕开 | 尾半截被当成**一条新学生**导入 | `import-data.ts` |
| 2 | `sourceLine` 是「非空行序号」而不是真实行号 | 导入面板「第 N 行未识别」指到一条空行 | `import-data.ts` |
| 3 | 零宽字符省份覆盖被当成真填写 | 「城市未匹配」告警被**无声关掉** | `student-data.ts` / `data-health.ts` |
| 4 | 缺 `</td>` / `</tr>` 的手写表格解析出 0 行；属性里的 `>` 截断单元格 | 粘贴学校官网的去向表整张丢失 | `binary-import.ts` |

另外证实**不是**缺陷、只补了回归测试的：rowspan/colspan 跨窄行的承接、空表 / 空 sheet、BOM、引号里包着一整行 CSV。

---

## 1. 引号内换行：凭空造出一条学生

RFC4180 允许被引号包住的单元格里含换行，Excel 导出带两行备注的字段就长这样。`splitLines` 先按 `\r?\n` 切，再交给 `splitDelimitedLine`，于是这条记录在切分前就已经断成两截。

输入（4 个物理行，实际是 3 条记录）：

```
姓名,院校,城市
"张
三",北京大学,北京市
李四,清华大学,北京市
```

| | 结果 |
| --- | --- |
| 修复前 | 候选 = `三"`（北京大学 / 北京市）+ `李四`；`"张` 落进未识别 |
| 修复后 | 候选 = `张 三`（sourceLine 2）+ `李四`；未识别为空 |

`三"` 是**被导入的错误记录**——名字带一个游离的引号，学校城市都对，用户很难在候选列表里发现它是半条数据。

修复：切分前先做 RFC4180 的物理行合并。把 `splitDelimitedLine` 的状态机抽成 `scanDelimitedLine`，同时返回 `cells` 和 `open`（行尾是否停在未闭合的引号里），`joinQuotedLines` 用 `open` 决定是否把下一物理行并进同一条记录，换行本身换成空格（与 HTML 分支 `<br>` → 空格一致；CJK 姓名里的这个空格随后被 `normalizeStudentName` 的 padding 规则吃掉）。

两个刻意的约束：

- **不许一个游离引号吞掉整段粘贴。** 只有引号在 `MAX_QUOTED_LINE_JOIN`（32）行内真的闭合，合并才被采纳；否则原样退回单行。`"林舟,北京大学,北京市`（永不闭合）后面接两条正常记录，修复后仍然是 1 条未识别 + 2 条正常候选，和修复前一致。
- **续行常常没有分隔符。** `"张` 里既无逗号也无 tab，`detectDelimiter` 返回 null，第一版改动因此完全没生效。现在以整段粘贴的分隔符（首个能测出分隔符的行）兜底。

## 2. 行号：空行让「第 N 行」整体错位

`splitLines` 会 `.filter(line => line.length > 0)`，而 `sourceLine` 取的是过滤后数组的下标。导入面板 (`data-workspace-import-panel.tsx:176`) 直接把它显示成 `第 ${row.sourceLine} 行`。

```
1 姓名,院校,城市
2
3 林舟,北京大学,北京市
4
5
6 只有姓名
7 苏禾,浙江大学,杭州市
```

| | 林舟 | 只有姓名（未识别） | 苏禾 |
| --- | --- | --- | --- |
| 修复前 | 2 | **3** | 4 |
| 修复后 | 3 | **6** | 7 |

修复前提示「第 3 行未识别」，用户翻到第 3 行看到的是一条正常记录（林舟），第 3 行的错误行其实在第 6 行。名单里夹空行是很常见的（按班级分段粘贴），一旦有空行，所有行号从此全错。

修复：`splitLines` 返回 `{ text, sourceLine }`，行号在过滤空行**之前**就定好；合并出来的多行记录报告它起始的物理行号。`parseStudentText` 里所有 `index + 1` 换成 `line.sourceLine`（`index` 仍用于表头位置比较，那是数组下标语义，不是行号）。

## 3. 零宽字符：不可见的值关掉了真实告警

`data-health.ts` 用 `.trim()` 判空，而导入链路其余部分一律用 `trimImportCell()`（额外去掉 BOM 与 `\u200b`–`\u200d`、`\u2060`）。口径不一致产生两个后果，第二个更严重：

**a. 零宽姓名逃过必填检查。** `"\u200b".trim()` 非空 → 不报 `missing-field`，`studentName` 直接渲染成不可见字符，数据质量面板里就是一个**空的加粗行**。（有意思的是 `\u00a0` 姓名会被 `trim()` 抓到，`\u200b` 不会，所以同一份名单里两条同类记录只有一条被告警。）

**b. 零宽省份覆盖静默吞掉「城市未匹配」。** `resolveStudentLocation` 见到 `student.province?.trim()` 为真就返回 `status: "resolved"`——手动指定省份视为已定位是**有意**的语义，问题是一个只含零宽字符的省份格也被当成「手动指定」。

```ts
{ name: "林舟", university: "北京大学", city: "火星市", province: "\uFEFF" }
```

| | summary.unresolved | 列出的问题 |
| --- | --- | --- |
| 修复前 | **0** | `manual-province`（info）「使用省份覆盖：」← 冒号后面什么都没有 |
| 修复后 | **1** | `unresolved-location`（warning）「无法定位城市：火星市」 |

一个 warning 降级成了内容为空的 info，而这个城市**确实进不了省份地图**。这类零宽字符从网页表格复制粘贴进来相当常见。

修复：`resolveStudentLocation` 与 `data-health` 的 `missingFields` / `studentName` / 各 detail 文案统一改用 `trimImportCell`。

## 4. HTML 表格：省略闭合标签 = 整张表丢失

`parseHtmlTableRows` 的正则要求闭合标签：`<tr\b[^>]*>([\s\S]*?)<\/tr\s*>` 与 `<(td|th)\b([^>]*)>([\s\S]*?)<\/\1\s*>`。浏览器会自动补齐这些标签，所以**从学校官网复制一张手写的去向表**，剪贴板里的 markup 就是省略版的。

| 输入 | 修复前 | 修复后 |
| --- | --- | --- |
| `<tr><th>姓名<th>院校<th>城市</tr>…`（缺 `</td>`/`</th>`） | `[[], []]` — 表格识别成功但一个单元格都没有 | 正常两行三列 |
| 完全没有 `</tr>` | `null` — 当作「剪贴板里没有表格」 | 正常两行三列 |
| `<td data-sheets-value='{"2":"本科>硕士"}'>` | 单元格文本变成 `b">姓名` 这类残缺 markup | `本科>硕士` |

第一种情况尤其阴险：`parseHtmlTableRows` 返回非 null，`pasteHtmlTable` 里 `rowsToTabText` 得到空串才让它 return false 退回纯文本粘贴——能用，但 HTML 分支（保留空单元格、展开 rowspan）等于白写。

修复：

- 单元格/行的内容改为「读到闭合标签**或**下一个表格边界标签（`</?td|th|tr|tbody|thead|tfoot|table`）为止」的前瞻，两种写法都能读。
- 起始标签的属性段用 `(?:[^>"']|"[^"]*"|'[^']*')*` 而不是 `[^>]*`，引号里的 `>` 不再截断标签。三个分支互不重叠，不会引入回溯爆炸。在线表格把单元格原值以 JSON 回填在 `data-sheets-value` 里，「本科>硕士」这种去向写法会直接踩到。
- 单元格内联标签（`<span style>` / `<a href>`）同样处理。

## 变更清单

| 文件 | 行数 | 变更 |
| --- | --- | --- |
| `src/lib/import-data.ts` | 375 | `scanDelimitedLine` 抽取；`joinQuotedLines`；`SourceLine` 真实行号 |
| `src/lib/binary-import.ts` | 377 | `TAG_ATTRIBUTES` / 边界前瞻的行、单元格、内联标签正则 |
| `src/lib/data-health.ts` | 154 | 判空与文案统一 `trimImportCell` |
| `src/lib/student-data.ts` | 169 | `resolveStudentLocation` 忽略只含不可见字符的省份覆盖 |
| `src/lib/import-data.test.ts` | 361 | +4 用例（引号换行、失控引号、两组行号） |
| `src/lib/import-headers.test.ts` | 253 | **新增**：从 `import-data.test.ts` 拆出表头引擎用例 |
| `src/lib/binary-import.test.ts` | 400 | +3 用例（rowspan 跨窄行、省略闭合标签、属性内 `>`） |
| `src/lib/data-health.test.ts` | 226 | +2 用例 |
| `src/lib/student-data.test.ts` | 252 | +1 用例 |

`name-format.ts` 读过，未发现需要修的行为，未改动。

`import-data.test.ts` 加完用例是 603 行（改动前已经 530 行，本来就超）。按模块归属拆出 `import-headers.test.ts`：表头别名、模糊匹配、宽表/重复表头三组 `describe` 属于 `import-headers.ts` 这个引擎，`import-data.test.ts` 留文本解析器拿到映射之后的行为。纯搬运，无语义改动，两个文件都回到 400 以内。

## 验证（failure → cause → fix → recheck）

1. **failure**：写了 25 个探针用例把可疑输入喂进解析器，把输出 dump 成 JSON 逐条读。四处输出与预期不符（多出的 `三"` 记录、错位的行号、`unresolved: 0`、`[[], []]`）。
2. **cause**：分别定位到 `splitLines` 的切分顺序、过滤后取下标、`.trim()` 与 `trimImportCell` 的口径差、闭合标签强制要求。
3. **fix**：见上，每处都是所在模块内的最小改动。
4. **recheck**：探针重跑，四处全部翻转；探针删除后落成 10 个回归用例。

- `npx vitest run` 全量：**196 files / 1708 tests passed**
- `npx tsc --noEmit -p tsconfig.app.json`：0 error
- `npx eslint src/lib src/components`：0 error（5 个 `react-refresh` warning 属既有文件，与本次无关）

中途一次全量跑出现 `src/lib/scratch-min.test.ts` 失败，是并行 agent 的临时草稿文件（内容是连接线分侧，与本次无关），该文件随后已被其作者删除，重跑即全绿。

## 交付与回滚

- **验收方式**：上述回归用例即验收；人工验收路径 = 导入面板粘贴带空行的名单（看「第 N 行」是否指对）、粘贴学校官网表格（看是否识别出行列）、给一条城市写不出来的记录粘一个零宽省份格（看「未匹配城市」是否还在）。
- **回滚**：四个源文件各自独立，还原任一文件不影响其余。无数据迁移、无导出格式变化、无 API 形状变化。唯一对外可见的输出契约变化是 `ImportCandidate.sourceLine` / `UnparsedLine.sourceLine` 的取值（现在是真实物理行号）——`data-workspace.ts` 只把它当 key 用，不依赖连续性。

## 未修 / 需要别人接手

1. **重复表头列里的数据被丢弃。** 表头 `["姓名","姓名","院校","城市"]`、数据行 `["", "林舟", …]` 时，第 0 列被认领、第 1 列的真实姓名读不到，整行报「缺少姓名」。现有测试明确固化了「重复表头第一列胜出」的语义（那是对的），需要补的是「主列为空时回落到同名副列」。**改动点在 `import-headers.ts` 的 `readStudentColumn` / `detectHeaderColumns`，不在本次 ALLOWED 范围内**，没动。

2. **`GlobalDataScreen` 的筛选把质量面板骗成「数据状态良好」。** 这是 GOAL 里 filter-hidden quality 那条，缺陷是真的，但修复点在 `GlobalDataScreen.tsx`（不在 ALLOWED 里），`DataQualityPanel` 自己拿不到「当前有筛选」这个信息，单独改只能把诚实的空态文案改糊，所以留给下一手。

   复现 A：数据总览里每个指标都是按钮，与数值无关（`DataOverview.tsx:45`）。名单有 3 条未匹配城市、0 条重复记录时点「重复记录 0」→ `issueFilter = "duplicate"` 且跳到质量页 → 面板收到空数组 → 显示「数据状态良好 / 当前名单可以直接进入地图与卡片编辑。」

   复现 B：`GlobalDataScreen.tsx:80` 切换视图时只在 `view !== "quality" && view !== "mapping"` 才清筛选。带着 `issueFilter = "duplicate"` 从质量页走到地图映射页，映射页再 `.filter(kind === "unresolved-location" || "manual-province")`（`:108`），两个筛选取交集恒为空 → 同样一句「数据状态良好」，而这页正是用来修未匹配城市的。

   建议：让 `DataQualityPanel` 接一对可选的 `filterLabel` / `onClearFilter`，空态在有筛选时改说「当前筛选下没有问题」并给一个清空筛选的按钮；映射页则不该再叠加 `issueFilter`。

3. **嵌套表格仍会丢列。** `<td><table>…</table></td>` 下，内层 `<tr>` 会截断外层行，外层该行后面的单元格丢失。正则扫描做不到配对嵌套，要真修得换成栈式扫描。名单表里嵌套表格罕见，判断为不值当，记录在此。
