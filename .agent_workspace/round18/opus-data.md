# Round 18 — R18-opus-data

MODEL_SLUG: claude-opus-5-thinking-high-fast
分支：`cursor/agent-sota-polish-cbcd`（未 commit、未 stash、未 push、未新建分支）

找到并修掉**一处**真实静默错列：无表头粘贴里的**纯数字列**（序号 / 学号 / xlsx 未格式化
日期留下的序列值）被按位读成 `姓名`，整行字段左移一列，且 `unparsed` 为空——用户看不到
任何提示。四步链（failure → cause → fix → recheck）见下。

---

## 改动文件

| 文件 | 行数 | 改动 |
| --- | --- | --- |
| `src/lib/import-data.ts` | **400**（改前 400，+36/−36，净 0） | `paddingColumnsByDelimiter` → `usableColumnsByDelimiter`：从「哪些列要丢」改成「哪些列可用」，并把整列纯数字判为不可用；新增 `SERIAL_CELL`；`splitCells` 第三参改名 `usable`；三处腾行见下 |
| `src/lib/import-data.test.ts` | 558（+62） | 新增 describe「number columns in a header-less paste」6 条用例 |
| `src/lib/binary-import.test.ts` | 359（+17） | 新增 1 条用例：Excel 日期序列值列 |

`binary-import.ts` **一字未动**：无表头矩阵本来就经 `matrixToText` → `parseStudentText`
落到同一条按位读取路径，缺陷与修复都在 `import-data.ts`。`html-table-parse.ts` 未碰
（连测试都没 import 它）。

**400 行硬约束的腾行**（加 36 行必须删 36 行，逐条可核）：

1. `interface SourceLine` 由 4 行折成 1 行（2 字段私有形状）——省 3 行。
2. `parseLabeledCandidate` 里 4 组 `fields.get(...) ?? fields.get(...)` 链抽成 `pick(...labels)`
   ——省 2 行。语义**逐字保持**：用 `.find((value) => value !== undefined)` 而不是
   `.find(Boolean)`，否则 `姓名：（空）` 会被跳过去取下一个别名，那是本轮不该带的行为变更。
3. `toCandidate` 里 `if (parts.length < 3) return null;` 是死代码（少于 3 段时 `city` 为
   `undefined`，紧接着的 `!city` 必然拦住）——省 1 行。
4. `splitCells` 文档由 6 行压到 5 行（`padding` 参数已改名，本来就要重写）——省 1 行。
5. `usableColumnsByDelimiter` 里四行的 map 初始化并成一行——省 3 行；新函数体与旧函数体
   同为 19 行。

---

## 缺陷：整列数字被读成姓名，后面每个字段左移一列

### failure（复现，改前）

三种入口、同一个根因，都是 `candidates` 完整、`unparsed` 为空：

```ts
// 1) 无表头 CSV，最左是学号
parseStudentText("20260001,林舟,北京大学,北京市\n20260002,苏禾,浙江大学,杭州市")
// → { name: "20260001", university: "林舟", city: "北京大学" } ×2

// 2) 无表头 CSV，最左是序号（制表符同样）
parseStudentText("1,林舟,北京大学,北京市\n2,苏禾,浙江大学,杭州市")
// → { name: "1", university: "林舟", city: "北京大学" } ×2

// 3) 无表头 xlsx：日期列没设单元格格式，xlsx 交出来的是序列值
parseExcelWorkbookRows([[45810, "林舟", "北京大学", "北京市"], [45811, "苏禾", "浙江大学", "杭州市"]])
// → { name: "45810", university: "林舟", city: "北京大学" } ×2
```

学号列夹在中间（`林舟,20260001,北京大学,北京市`）时同理：`university` 变成 `20260001`，
`city` 变成 `北京大学`。三列俱全，`未识别` 面板一行不报——正是「看起来完整所以没人发现」
的那一类。

### cause（根因）

按位读取（`toCandidate`）只认前四段是 `姓名/院校/城市/去向类型`。它读到的段来自
`splitCells(text, detectDelimiter(text), padding)`，而 `paddingColumnsByDelimiter` 只会丢
**没有任何一行填过的列**——导出留下的空序号列、CSV 行尾的多余分隔符。一列**填满了数字**
的序号/学号列在这条规则下是「有内容的列」，于是原样留在第 0 段上，`姓名` 被挤到第 1 段。

xlsx 那条是同一根因的另一副面孔：未格式化的日期在 sheet 里就是 `45810`，`normalizeMatrix`
`String()` 之后与学号无异。

顺带确认这不是「表头映射」路径的问题：`candidateFromColumns` 按表头下标读，`学号` 列有名字、
不参与 `姓名/院校/城市` 的认领，`学号,姓名,院校,城市` 一直是对的（`import-data.test.ts`
第 158 条早有用例）。缺陷只在**没有表头**、退回按位读取时出现。

### fix（最小修复）

把 `paddingColumnsByDelimiter`（「丢哪些列」）翻成 `usableColumnsByDelimiter`（「哪些列能
用」），判据从「有没有内容」升级为「有没有装过**姓名/院校/城市可能取的值**」：

```ts
const SERIAL_CELL = /^\d+(?:\.\d+)?$/;   // 序号、学号、Excel 留下的日期序列值（含带时间的小数）
```

* 某列只要有**一行**填了非纯数字的值 → 可用（`named`）。
* 一行都没填过的列 → 不可用（保持旧的 padding 行为，逐位等价）。
* 整列都是裸数字 → 不可用，丢掉。

两条护栏，都是有意为之：

1. **有表头就不生效。** 统计覆盖全部行，表头行的 `学号` 本身是非数字，会把那一列标成
   「可用」。所以这条规则只可能作用在真正无表头的粘贴上——正是我复现出问题的那一类。
2. **列数不够就不丢。** 丢完若剩下的可用列少于 3（`REQUIRED_STUDENT_COLUMNS.length`），
   把 `filled` 全部加回去。`001,北京大学,北京市` 是匿名化名单，`001` 就是姓名本身；
   `1,林舟,北京大学`（3 段 2 名列）同样保持原样，宁可维持现状也不猜。

`splitCells` 由「过滤掉 dropped」改成「保留 usable」（`columns?.has(index) ?? true`，
不传第三参时行为不变）。**关键点**：`usable` 只在按位回退那一处传入
（`parseStudentText` 第 384 行）；`detectTextHeader`、表头行读取、以及统计自身调用
`splitCells` 都不传，所以按下标读列的路径一格都没动。

> 这里踩过一次刀口：最早想把「丢数字格」直接塞进 `splitCells` 或 `toCandidate` 之前的
> 通用位置。若塞进 `splitCells` 的公共分支，`学号,姓名,院校,城市` + `20260001,林舟,...`
> 会在数据行少一格、表头行不少格，`姓名` 直接读成 `北京大学`——正是任务里点名的
> 「先 `filter` 再按列下标读」那类事故。所以数字列的判定只挂在**跨行的列统计**上，
> 且只在按位路径生效。

### recheck（同一条检查重跑）

```
npx vitest run src/lib/import-data.test.ts src/lib/binary-import.test.ts \
                src/lib/import-headers.test.ts src/lib/html-table-parse.test.ts
→ 4 files / 105 tests passed
npx tsc -b            → 0
npx eslint <4 files>  → 0
npm test              → 210 files / 1846 tests passed（73.9s）
```

复现脚本改后重跑：上面三条 failure 全部变成
`{ name: "林舟", university: "北京大学", city: "北京市" }`，`unparsed` 仍为空；
`rawLine` 保留原始整行（`45810\t林舟\t北京大学\t北京市`），用户回看时仍对得上源行。

### 新增用例（7 条）

`import-data.test.ts` — describe「number columns in a header-less paste」：

1. 学号列被丢，两行都按 `姓名/院校/城市` 正确导入；
2. 序号列（制表符）丢掉后 `去向类型` 仍对齐（`海外` → `international`），且 `rawLine` 保留序号；
3. 学号夹在中间也识别；
4. `001,北京大学,北京市` 保持原样（列数不够，数字可能就是姓名）；
5. 同一列另一行是 `苏禾` 时整列保留（有跨行证据说明这是真列，不背着用户丢）；
6. `学号,姓名,院校,城市` 有表头时仍走表头映射。

`binary-import.test.ts` — Excel 日期序列值列（`45810`）不再变成学生姓名，断言到完整对象
（含 `rawLine`）。

---

## 我读过但确认**没有**问题的地方（不编造重构）

* **BOM 落在第一个表头格**：`trimImportCell` 的 `INVISIBLE_CELL_CHARS` 已含 `\uFEFF`
  且 `normalizeHeaderCell` 走同一个函数，`splitLines` 另外全局剥了一遍。
  `import-data.test.ts:118`、`binary-import.test.ts:137` 两条现成用例覆盖，无缺口。
* **`splitCells` 自由文本分支残留的 `.filter(Boolean)`**：任务点名的「先 filter 再按列
  下标读」在这里**不成立**——`detectTextHeader` 与数据行都用同一个 `delimiter=null`
  分支、同样 filter，表头下标和数据下标同源；空格分隔的行本来也表达不了空列。
* **`candidateFromColumns` / `readStudentCell` 的 alternates 回退**：只在认领列为空时找
  同名孪生列，返回值带回真实 `index`，`rowRestatesHeader` 用的就是这个 index 去比表头格，
  没有错位。
* **`expandMergedCells`**：`while (target.length < column) target.push("")` 只补到
  `column-1` 再赋值，长度对；只填空格、不覆盖用户已填值。
* **`joinQuotedLines` / `scanDelimitedLine`**：`sourceLine` 用物理行号，跨行引用合并后
  行号仍指向记录起始行，`MAX_QUOTED_LINE_JOIN` 兜住野引号。

## 已知的相邻情形（本轮**不**动，理由写明）

空格分隔的自由文本里裸序号仍会被读成姓名：`"1 林舟 北京大学 北京"`（注意 `1.` / `1、` /
`1)` 已被 `LIST_MARKER` 覆盖，缺的只有「数字 + 纯空格」这一种写法）。**没有顺手修**是因为：

* 自由文本行没有跨行列证据，只能逐行判断，风险与本轮的跨行判据不是一个量级；
* 走不了 `LIST_MARKER`：把它放宽成 `^\d+[.、)]?\s+` 会连制表符一起吃掉，
  `1\t林舟\t北京大学\t北京市` 会被剥成 3 格，而表头行 `学号\t姓名\t...` 不被剥——
  直接制造一处比现在严重得多的表头错列。

要修它得单开一条只作用于按位路径的逐行规则，属于下一轮的独立决定，不该混在这次里。

## 交付方式与回滚

* **验收**：CI 跑 `npm test` + `npm run lint`；人工验收路径 = 导入面板粘贴
  `1,林舟,北京大学,北京市`，改前得到姓名「1」，改后得到姓名「林舟」。
* **破坏性**：无导出格式 / API 形状变更。行为变更仅一处——**无表头**粘贴中的整数字列
  不再占用 `姓名/院校/城市` 位次。改前该列产出的是错误记录，不存在依赖它的正确用法。
* **回滚**：`git revert` 本次提交即可（`import-data.ts` 三处：`SERIAL_CELL` 常量、
  `usableColumnsByDelimiter` 的 `named` 统计、`splitCells` 的保留式过滤）；
  或把 `usableColumnsByDelimiter` 里 `if (!SERIAL_CELL.test(cell))` 的条件去掉，
  即退回「只丢全空列」的旧语义，其余代码无需改动。

## 未做的事

未 commit、未 stash、未 push、未建分支（按要求）；未碰 allowlist 外任何文件；
`.github/workflows/ci.yml`、`GlobalSettingsScreen*`、`HistoryControls.tsx`、
`card-layout-pack*`、`USER_GUIDE.md`、`SkipToStageLink.tsx` 的改动是工作区里**其他
agent** 留下的，本轮一字未动。
