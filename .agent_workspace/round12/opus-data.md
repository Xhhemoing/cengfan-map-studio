# Round 12 — R12-opus-data

MODEL_SLUG: claude-opus-5-thinking-high-fast
分支：`cursor/agent-sota-polish-cbcd`（未 commit、未 stash、未新建分支、未 push）

修掉 Round 10/11 两次记账都没动的遗留：**位置式解析的 `filter(Boolean)` 会压掉空单元格，
把后面的列整体左移一格**。先复现红、再修、再复跑同一条命令。

---

## 改动文件

| 文件 | 行数 | 改动 |
| --- | --- | --- |
| `src/lib/import-data.ts` | 393 | 新增 `paddingColumnsByDelimiter`；`splitParts` 只丢「整篇都空」的列，保留行内空格位；其余段落只做等价压行 |
| `src/lib/import-data.test.ts` | 398 | 新增 4 条断言（错列 1、三列缺口 1、padding 列 1、同一篇里 padding 与缺口并存 1）；旧断言只压行不改语义 |

`import-headers.ts` / `data-health.ts` 在 allowlist 内但**一字未动**——该缺陷不在这两处，
它们的列读取本来就按下标走（`readStudentCell`），没有 `filter` 语义。
未碰 `binary-import.ts`（R12-fable-arch 正在拆）。测试夹具只用 林舟 / 苏禾 / 周晴 / 顾言。

Round 10 的两条行为原样保留，各自断言仍绿：重复表头回落（`StudentColumnAlternates`）、
「部分映射行不按位重读」（`mappedPartially` 分支，见下）。

---

## 缺陷：一个空单元格让整行右侧列左移，且**无声导入**

### failure（复现）

在 `src/lib/import-data.test.ts` 新增断言，旧代码上直接红：

```ts
parseStudentText("苏禾,浙江大学,杭州市,\n林舟,,北京市,海外")
```

实测旧输出（vitest diff 原文）：

```
candidates: [
  { name: "苏禾", university: "浙江大学", city: "杭州市", sourceLine: 1 },
  { name: "林舟", university: "北京市", city: "海外",   sourceLine: 2 },   ← 凭空捏造
]
unparsed: []
```

林舟这一行的 院校 是空的，结果 **城市 顶替成院校、去向类型 顶替成城市**，
生成一条「就读于北京市、城市叫海外」的完整记录，`unparsed` 里一个字都没有。
用户在数据工作台看到的是「导入 2 人」——**静默出错，不是可见的漏报**。
（三列的 `林舟,,北京市` 旧代码只是压成 2 段后落到未识别，方向对但同一根因。）

### cause

`splitParts` 在有分隔符时 `splitDelimitedLine(line, delimiter).filter(Boolean)`。
`filter(Boolean)` 按值筛，不按位：空串被删掉后，**它右边每个单元格的下标都减 1**。
`toCandidate` 随后固定取 `parts[0..3]` 当 姓名/院校/城市/去向类型，
所以只要行里有 ≥1 个空格位且总列数 ≥4，就会拼出一条看起来齐全的错记录。

同一函数 Round 10 已经在**有完整表头**的路径上防住过（`mappedPartially`：
映射行只要填了部分列就不再按位重读），但**没有表头 / 表头缺必填列**时仍然走 `splitParts`，
那条路上的 `filter(Boolean)` 一直没改。

### fix

`splitParts` 不再按值筛，改成按列筛，筛的依据是整篇 paste 而不是单行：

- 新增 `paddingColumnsByDelimiter(lines)`：按分隔符分组，扫一遍所有行，
  记下「至少被填过一次」的列下标与「出现过空值」的列下标，后者减前者 =
  **整篇都没人填的列**。实现就是两个 `Set` 相减，一次线性扫描。
- `splitParts(line, delimiter, padding)` 只丢这些列，**其余单元格一律保位**，空的也保。

判定的分界线是「这一列到底存不存在」：

| 形态 | 判定 | 处理 |
| --- | --- | --- |
| 某列在**每一行**都空 | 导出留下的填充列（左边空的 序号 列、CSV 行尾那个分隔符） | 丢掉，位置式读数照常从 姓名 开始 |
| 某列**只在部分行**空 | 这一列是真列，这一行是缺口 | 保位，`toCandidate` 看到空值 → 报未识别行 |

这样两种真实粘贴都不被牺牲：`,林舟,北京大学,北京市` 这种前导空列的名单**继续整篇导入**
（直接删掉 `filter(Boolean)` 会让它整篇变成未识别，是比原缺陷更糟的回归），
而 `,苏禾,,杭州市` 这种既有填充列又有缺口的行，填充列被丢、缺口被保，只报这一行。

顺带把 `detectDelimiter` 的四条 `if` 压成 `CELL_DELIMITERS.find`（顺序不变），
以及若干多行签名/返回对象压行——为了让文件停在 400 以内，行为逐条等价。

### recheck

```
npx vitest run src/lib/import-data.test.ts   → 34 passed（修前 1 failed，即上面那条）
```

分支有效性双向验证（临时改坏再改回，两次都用同一条命令）：

| 临时改动 | 失败用例 | 说明 |
| --- | --- | --- |
| `splitParts` 退回 `filter(Boolean)` | `reports a row with an empty cell instead of shifting its later columns left` | 空格位又开始左移 |
| `paddingColumnsByDelimiter` 末尾 `empty.clear()`（永不丢填充列） | `still reads a paste padded with a column no row fills`、`tells a padding column apart from a gap in the same paste` | 前导空列的名单整篇变未识别 |

两个方向都承重，不是保险起见的死代码。

---

## 400 行约束

`import-data.ts` 加完 padding 分析到 415 行，`import-data.test.ts` 加完断言到 483 行
（该测试文件在本轮之前就已经是 417 行）。超出部分**只用等价压行**消化：

- 源文件：`detectDelimiter` 改 `find`；`toCandidate` / `candidateFromColumns` /
  `parseLabeledCandidate` 的多行签名与返回对象字面量合并成单行。→ **393**
- 测试：把 `{ name: …, university: …, … }` 逐字段一行的字面量并成单行；
  只有「表头 + 1 行」的两行夹具改成文件里本来就有的 `"a\nb"` 写法
  （3 行以上的名单夹具保留数组形式，读起来是一张表）；
  两条 padding 断言合并成一个 `for` 循环。→ **398**

压行前后跑的是同一批断言，全绿；断言条数只增不减。

---

## 验证

```
npx vitest run src/lib/import-data.test.ts src/lib/import-headers.test.ts \
  src/lib/data-health.test.ts src/lib/binary-import.test.ts   → 4 files / 86 tests passed

npx tsc --noEmit -p tsconfig.app.json                          → 0 error
npx eslint src/lib/{import-data,import-headers,data-health}.ts + 对应测试 → 0 error / 0 warning
npx vitest run（全量）→ 203 files / 1739 tests passed，1 个 suite 加载失败：
  src/lib/scratch-chord-probe.test.ts「Cannot find module」——他人在途的临时文件，与本组无关。
```

途中 `binary-import.test.ts` 有一条
`re-exports the html table parser extracted into html-table-parse` 红过。
按纪律先归因再继续：把 `import-data.ts` 换回 `git show HEAD:` 的版本重跑，**同样红**，
确认是 R12-fable-arch 拆 `html-table-parse` 的在途状态，不是本组引入；
其后该文件再跑已自行转绿。

---

## 交付与回滚

**验收方式.** CI 跑上面 4 个测试文件 + `tsc` + `eslint`。
人工验收：数据工作台 → 导入 → 粘贴一段**没有表头**的名单，其中一行的院校留空、后面还有去向类型列。
要看的是：那一行出现在「未识别」里并给出行号，而**不是**被导入成「就读于某城市」的学生；
同时前面带空 序号 列的名单仍然整篇导入。

**破坏性变更.** 无 API / 数据结构变更：`parseStudentText`、`parseDelimitedTable`、
`splitDelimitedLine`、`ImportCandidate`、`UnparsedLine` 的签名与字段全部不变，
`splitParts` 是模块私有函数。唯一可观察的行为变化是**原本被静默错列导入的行，
现在进 `unparsed` 并报「无法识别学生名称、录取院校和城市」**——方向是「原本错的现在报出来」。
风险面：如果某个用户此前依赖错列结果（不可能有人依赖），会看到导入人数下降、未识别行增加。

**回滚.** 改动集中在 `import-data.ts` 的 `splitParts` 一段：
`git checkout HEAD -- src/lib/import-data.ts src/lib/import-data.test.ts` 即回到 Round 11 状态。
只想退掉 padding 判定而保留保位，把 `splitParts` 第三个参数不传即可（每列都保），
但那会让前导空列的名单整篇变未识别，不建议。

---

## 已知遗留（未修，据实记录）

1. **`matrixToText` 的 `row.filter(Boolean)` 还在**（`binary-import.ts`，本轮 allowlist 之外，
   R12-fable-arch 在拆）。它把 xlsx 矩阵转文本时就先压掉了空单元格，
   所以「表头缺必填列」的兜底路径上，空格位在进 `parseStudentText` 之前已经丢了。
   本轮的修复让**下游具备了接住空格位的能力**：那一行只要改成
   `rows.map((row) => row.join("\t"))`（保留外层 `.filter((line) => line.length > 0)`），
   制表符行的空列会自动按「整列都空 → 丢，单行缺口 → 保位报错」处理，无需再改 `import-data`。
   同文件的 `rawLine = row.filter(Boolean).join("\t")` 只影响回显文案，可一并处理。
2. **无分隔符的自由文本仍无法表达空列。** `林舟  北京市` 里连续空白会被
   `split(/[\s,，、;；\-\|]+/)` 合并，缺口不可见，只能落到「未识别」。这是格式本身的信息缺失，没做。
3. **填充列判定以整篇 paste 为单位。** 如果用户一次只粘一行且那行带缺口
   （`林舟,,北京市`），这一列在这篇里「从没被填过」，会被当填充列丢掉，
   结果仍是 2 段 → 未识别行（与修复前同一结论，方向正确），但理由是「列不存在」而非「缺口」。
   要区分得引入表头之外的先验，收益不抵复杂度。
4. **重复学生合并口径不一致**（`student-data.ts` 的 姓名+院校 vs `data-duplicate.ts` 的
   姓名+院校+城市+去向类型）仍在，`data-duplicate.ts` 不在本轮 allowlist。
5. **xlsx 多工作表**只取 UI 边界选中的那张，取舍在 `src/components/*`，不在本组路径内。
