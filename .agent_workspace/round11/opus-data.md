# Round 11 — R11-opus-data

MODEL_SLUG: claude-opus-5-thinking-high-fast
分支：`cursor/agent-sota-polish-cbcd`（未提交、未 stash、未切换分支）

修掉 Round 9/10 记下的遗留静默缺陷：**嵌套 `<table>` 把外层行截断**。
`parseHtmlTableRows` 从「正则扫 `<tr>` / `<td>`」改为**带表栈的词法遍历**，
外层行不再被内层 `<tr>` 结束。先复现红、再修、再复跑同一条命令。

---

## 改动文件

| 文件 | 行数 | 改动 |
| --- | --- | --- |
| `src/lib/binary-import.ts` | 400 | `TABLE_TOKEN` 词法遍历 + `TableFrame` 表栈替换 `HTML_ROW_PATTERN` / `HTML_CELL_PATTERN`；其余段落只做等价压行 |
| `src/lib/binary-import.test.ts` | 495 | 新增 5 条断言（嵌套截断 2 条、布局包裹 1 条、嵌套网格取舍 1 条、并列两张表 1 条） |

`import-data.ts` / `import-headers.ts` / `data-health.ts` 未改（Round 10 的重复表头回落、
「部分映射行不按位重读」、否定 `未出国` 三条行为原样保留，各自测试仍绿）。
未碰 `GlobalDataScreen` / `DataQualityPanel`。测试夹具只用 林舟 / 苏禾。

---

## 缺陷：嵌套 `<table>` 让外层行的后续单元格无声消失

### failure（复现）

`src/lib/binary-import.test.ts` 里两条新断言，在旧解析器上直接红：

```html
<table>
  <tr><th>姓名</th><th>院校</th><th>城市</th><th>备注</th></tr>
  <tr><td>林舟</td><td>北京大学</td><td>北京市</td><td><table><tr><td>2026 秋</td></tr></table></td></tr>
  <tr><td><table><tr><td>甲班</td></tr></table>苏禾</td><td>浙江大学</td><td>杭州市</td><td></td></tr>
</table>
```

旧输出（实测）：

```
[["姓名","院校","城市","备注"], ["林舟","北京大学","北京市",""], ["2026 秋"], [""], ["甲班"]]
```

- 第二条更狠：`<td><table>…</table>北京大学</td>` 这种写法下，
  外层行只剩 `["林舟",""]`，**北京市连同整行剩余列凭空消失**，`unparsed` 里什么都没有；
- 苏禾那一行整条不见，只留下一个 `["甲班"]` 的幽灵行。

用户看到的是「导入了 1 人」而不是「有 1 行没读懂」——**属于静默出错，不是可见的漏报**。

### cause

`HTML_ROW_PATTERN` 的行内容是 `[\s\S]*?` 加前瞻 `(?=</?tr\b|</(?:tbody|thead|tfoot|table)\b|$)`，
`HTML_CELL_PATTERN` 同理在 `td|th|tr|tbody|thead|tfoot|table` 任一边界处收尾。
正则没有嵌套概念：**内层表的第一个 `<tr>` 就是外层行的终点**，
外层行在该单元格处被剪断，后面的列既不进矩阵，也没有任何一处记它「丢了」。
`matchAll` 随后从内层 `</tr>` 继续找 `<tr`，外层这一行剩下的 `<td>` 再也不会被扫到。

### fix

`parseHtmlTableRows` 改成一次线性 token 遍历（仍不建 DOM，worker / 测试里结果一致）：

- `TABLE_TOKEN = /<(\/?)(table|thead|tbody|tfoot|tr|td|th)\b(TAG_ATTRIBUTES)>/gi`
  —— 属性片段沿用原来的 `"…"|'…'` 交替写法，`data-sheets-value='{"2":"本科>硕士"}'` 仍不会把标签截断。
- `TableFrame` 表示一张打开中的表：已完成的行、进行中的行/列号、`rowspan` 欠账、
  当前单元格在源串里的起点。`<table>` 压栈、`</table>` 出栈，**内层表再也影响不到外层的行**。
- 未闭合的 `</td>` / `</tr>`（学校手写页面的常态）照旧容忍：任何边界 token 都会关掉还开着的单元格与行；
  源串结束时把栈里没闭合的表全部收尾。
- `rowspan` / `colspan` 的填充语义与旧实现逐条对齐（含「比本行更靠右的 rowspan 仍属于本行」）。

**内层表怎么处理，是这次唯一的取舍**：

| 内层表形态 | 处理 | 理由 |
| --- | --- | --- |
| 自身是网格（≥2 行且某行 ≥2 列） | 它的行**升格**成文档里的行，紧跟在承载它的外层行之后；承载它的单元格留空 | 老学校页面把整张名单塞在一个全宽布局表的单元格里，这是名单的真身 |
| 更小（多为 Word 导出的单列多行块） | 压平成文本，并入承载它的单元格 | 那是单元格装饰，升格只会造出没人能映射的行 |

两边都不完美，所以按「**错的那一侧要可挽回**」来选：

- 误升格（名单表的数据单元格里有个小网格）→ 多出几行，被报成 `缺少城市` 等 **可见的未识别行**，
  学生本行照样完整导入；
- 误压平（布局包裹被当装饰）→ **整张名单变成一个单元格，静默清零**。

后者不可挽回，因此判定偏向升格。这条取舍本身有断言
（`reports the rows of a nested grid instead of hiding them in one cell`），
把「会多出两行未识别」这个代价写死在测试里，而不是留在注释里自说自话。

顺带：被内层表打断的单元格，前半段文本在切断处补一个空格再接后半段，
`<td>甲班<table>…</table>苏禾</td>` 得到 `甲班 苏禾` 而不是粘成一坨。

### recheck

```
npx vitest run src/lib/binary-import.test.ts   → 31 passed（修前同文件 2 failed）
```

分支有效性双向验证（临时改 `isGridTable` 再改回）：

| 临时改动 | 失败用例 | 说明 |
| --- | --- | --- |
| `isGridTable` 恒 false（全部压平） | `imports every row of a roster wrapped in a layout table`、`reports the rows of a nested grid instead of hiding them in one cell` | 布局包裹会静默清零 |
| `isGridTable` 恒 true（全部升格） | `keeps the whole outer row when a cell holds a nested table`、`keeps a nested table from swallowing the rows that follow it` | 单元格装饰会污染矩阵 |

两个分支都是承重的，不是保险起见的死代码。

---

## 400 行约束

加完表栈后 `binary-import.ts` 到 469 行。超出部分**只用等价压行**消化，没有删任何行为：

- 词法遍历部分改写成 `TableFrame` 类（去掉每个函数重复的 `frame` 形参与散落的小 helper）；
- 注释按仓库既有的宽度（~110 列）重排，句子一句不少；
- `emptyMetadata` / `matrixToText` / `parseOcrLikeText` / 导入清单等纯列举压成单行；
- `createMetadata` 的返回类型抽成 `ExcelMetadata` 别名。

最终 400 行整。压行前后跑的是同一批 31 条断言，全绿；`import-data` / `import-headers` /
`data-health` 三个文件一字未动。

---

## 验证

```
npx vitest run src/lib/binary-import.test.ts src/lib/import-data.test.ts \
  src/lib/import-headers.test.ts src/lib/data-health.test.ts   → 4 files / 95 tests passed

npx tsc --noEmit -p tsconfig.app.json
  → 唯一报错是 src/lib/content-layout-objects.test.ts(59,10) 'centeredPosition' 未使用，
    出自 R11-opus-layout 在途改动（`git diff` 可见该函数是本轮新增），与本组文件无关。

npx eslint src/lib/{binary-import,import-data,import-headers,data-health}.ts + 对应测试
  → 0 error / 0 warning

npx vitest run（全量）→ 201 files / 1716 tests，1 failed：
  src/lib/agent-session-tools.test.ts（未跟踪的新文件，R11-fable-arch 在途），同样与本组无关。
```

---

## 交付与回滚

**验收方式.** CI 跑上面 4 个测试文件 + `tsc` + `eslint` 即可。
人工验收：数据工作台 → 导入 → 从浏览器复制一张学校去向表粘贴进来。
两个要看的点：(1) 某个单元格里带小表格的行，**后面的城市列还在**；
(2) 整张表被 `<table width="100%">` 包着的老页面，名单仍能识别出全部学生。

**破坏性变更.** 无。`parseHtmlTableRows` 的签名与返回类型不变（`string[][] | null`），
`ImportCandidate` / `ExcelImportResult` 字段不变，未触及持久化结构、导出格式与 HTTP API。
唯一可观察的行为变化就是嵌套表场景下多出/补齐的行，方向是「原本丢的现在有了」。

**回滚.** 改动集中在 `binary-import.ts` 的 HTML 段：
`git checkout HEAD -- src/lib/binary-import.ts src/lib/binary-import.test.ts` 即回到 Round 10 状态。
若只想退掉取舍而保留防截断，把 `isGridTable` 改成恒 false（全部压平）即可——
但那会让布局包裹的名单重新静默清零，不建议。

---

## 已知遗留（未修，据实记录）

1. **嵌套网格会多出未识别行。** 见上表的取舍：名单表的数据单元格里若嵌了 ≥2 行 ≥2 列的表，
   它的行会被升格并报成 `缺少…`。要根治得判断「内层表是否本身像一张学生表」
   （例如用 `looksLikeStudentHeader`），但没表头的位置式名单会被误判，本轮没做。
2. **布局包裹会在矩阵开头留一行空行。** 承载名单的那个单元格留空 → 首行 `[""]`，
   `headerRowIndex` 因此后移一位（新增用例断言的就是 1）。表头之前的行本来就被忽略，
   不影响导入；只是粘贴框回显会多一个空行。想去掉需要裁剪前导空行，会改动行号语义，未做。
3. **`matrixToText` 的 `row.filter(Boolean)` 仍会压掉空单元格**（Round 10 记过）。
   该路径只在「表头缺必填列」时走，且真正造成串列的是 `parseStudentText` 里的
   `splitParts` 同样 `filter(Boolean)`——只改 `matrixToText` 不解决问题，
   要按缺陷 3 的思路整体处理「表头不完整时是否允许按位兜底」，超出本轮范围。
4. **重复学生合并口径不一致**（`student-data.ts` 的 姓名+院校 vs `data-duplicate.ts` 的
   姓名+院校+城市+去向类型）仍在，`data-duplicate.ts` 不在 allowlist。
5. **xlsx 多工作表**只取 UI 边界选中的那张，取舍发生在 `src/components/*`，不在本组路径内。
