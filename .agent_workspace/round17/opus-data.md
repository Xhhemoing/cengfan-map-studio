# Round 17 — R17-opus-data

MODEL_SLUG: claude-opus-5-thinking-high-fast
分支：`cursor/agent-sota-polish-cbcd`（未 commit、未 stash、未新建分支、未 push）

修掉无表头/无分隔符路径上两处**静默错列**：`-` 被当分隔符切开姓名；`、` / `|` / `；`
不在 `CELL_DELIMITERS` 里，空列被 `.filter(Boolean)` 压掉后整行左移。
四步链逐条记录（failure → cause → fix → recheck），并附一条**自查发现的自引回归**。

---

## 改动文件

| 文件 | 行数 | 改动 |
| --- | --- | --- |
| `src/lib/import-data.ts` | 400 | `CELL_DELIMITERS` 加 `；` `\|` `、`；`detectDelimiter` 先剥列表序号、`、` 需两次才算列；`splitParts`/`splitCells` 合并成一个 `splitCells`；自由文本分隔改 `FREEFORM_SEPARATOR`（不切紧贴的 `-`）；新增表格分隔行护栏 |
| `src/lib/import-data.test.ts` | 495 | 新增 6 条用例（连字符姓名、空格连字符 vs 紧贴连字符、`\|` 空列不左移、`、` 空列报缺少院校、`；` 空列、`、` 作序号/句内顿号、markdown 分隔行）；旧用例只改被本轮明确推翻的那一条 |

`import-headers.ts` 在 allowlist 内但**一字未动**——`CELL_DELIMITERS` 是 `import-data.ts`
私有常量，不共享，没有「必须动」的理由。未碰 `html-table-parse.ts` / `binary-import.ts`
（后者的 `parseOcrLikeText` 本来就先把 `|`/`｜` 换成空格再调 `parseStudentText`，
不受本轮 `|` 升格影响，其 342 行测试全绿）。夹具沿用 林舟 / 苏禾 / 周晴 / 顾言，
新增的 玛丽-克莱尔 / 巴黎高等师范 是缺陷本身要求的连字符姓名。

---

## 缺陷一：`-` 把姓名切成两列，拼出一条像模像样的错记录

### failure（复现）

```ts
parseStudentText("玛丽-克莱尔 巴黎高等师范 巴黎")
```

旧代码（`split(/[\s,，、;；\-\|]+/)`）切出 4 段 `玛丽 / 克莱尔 / 巴黎高等师范 / 巴黎`，
`toCandidate` 固定取前三段：

```
{ name: "玛丽", university: "克莱尔", city: "巴黎高等师范" }   ← 三列俱全，unparsed 为空
```

用户看到的是「导入 1 人」，没有任何警告。第四段 `巴黎` 被当成去向类型丢掉。

### cause

`-` 同时是**姓名内部的合法字符**（玛丽-克莱尔、Winston-Salem、UC-Berkeley）和
某些粘贴格式的分隔符。旧正则无条件按 `-` 切，等于把「值里的字符」当「值之间的字符」，
一旦姓名带连字符，后面每一列都往前顶一格，而 `toCandidate` 只检查前三段非空，
顶完照样成立 —— 这正是错列静默通过的条件。

### fix

自由文本分隔符改成 `FREEFORM_SEPARATOR = /\s+[-–—]+\s+|[\s、]+/`：

| 形态 | 判定 | 依据 |
| --- | --- | --- |
| `玛丽-克莱尔 巴黎高等师范 巴黎` | 连字符**不切**，按空白切三列 | 紧贴两侧的连字符属于值 |
| `顾言 - 复旦大学 - 上海市` | 连字符**切**（含 `–` `—`） | 前后有空白的孤立连字符不可能在姓名里 |
| `顾言-复旦大学-上海市` | 一段 → 进 `unparsed` | 无从判断该连字符属于姓名还是分列，报出来让用户决定 |

第三行是**本轮唯一推翻的旧断言**（原用例断言它切成 顾言/复旦大学/上海市）。
把「猜对一半」换成「明说不认识」是有意的取舍：同一条规则不可能既保住 玛丽-克莱尔
又切开 顾言-复旦大学，而错列是静默的、未识别是可见的。旧用例改成空格连字符写法，
紧贴连字符另立断言，两种形态都锁死。

### recheck

```
npx vitest run src/lib/import-data.test.ts   → 41 passed（修前该文件 1 failed，即被推翻的旧断言）
```

---

## 缺陷二：`、` / `|` / `；` 不是分隔符，空列被压掉后整行左移

### failure（复现）

```ts
parseStudentText("苏禾|浙江大学|杭州市|海外\n林舟||北京市|海外")
```

旧代码里 `|` 只出现在自由文本正则中，`.filter(Boolean)` 按值筛不按位筛：

```
candidates: [
  { name: "苏禾", university: "浙江大学", city: "杭州市" },
  { name: "林舟", university: "北京市",   city: "海外"   },   ← 凭空捏造
]
unparsed: []
```

`、` 同理：`姓名、院校、城市` 这张表连表头都走不进有分隔符的分支，
`林舟、、北京市` 的空院校会被压掉，北京市顶成院校。
这与 Round 16 给 workbook `rawLine` 修的是同一类缺陷，只是发生在文本粘贴侧。

### cause

`CELL_DELIMITERS = ["\t", ",", "，", ";"]`。只有被它认出来的分隔符才会走
`splitDelimitedLine` 的**保位**路径（Round 12 建立的「整篇都空的列才丢、行内缺口保位」规则），
其余一律落到自由文本正则，而那条正则用的是 `[...]+` 合并连续分隔符 + `.filter(Boolean)`，
**结构上无法表达空列**。所以问题不在自由文本正则写得不好，在于这三种真实分隔符没被认出来。

### fix

`CELL_DELIMITERS = ["\t", ",", "，", ";", "；", "|", "、"]`，顺序即优先级
（tab/逗号在前，`、` 最后，CSV 单元格里的顿号不会抢走逗号的位置）。
这样这三种粘贴自动继承既有的保位与 padding 规则：

- `林舟||北京市|海外` → `["林舟", "", "北京市", "海外"]` → 院校为空 → 报未识别行；
- `姓名、院校、城市` 表头 + `林舟、、北京市` → 走表头映射 → 报 **缺少院校**（不是左移成「就读于北京市」）；
- `| 林舟 | 北京大学 | 北京市 |` 这类 markdown 表格首尾的空列，被 padding 判定为「整篇都空」而丢掉，整表照常导入。

`、` 是唯一需要额外约束的：它同时是**句内顿号**（`波士顿、剑桥`）和**列表序号**（`1、林舟 …`）。

| 约束 | 规则 | 保住的形态 |
| --- | --- | --- |
| 出现 ≥2 次才算分隔符 | `content.split("、").length >= 3` | `周晴 哈佛大学 波士顿、剑桥` 仍按空白切三列 |
| 分隔符探测与切分前先剥列表序号 `^\d+[.、)]\s*(?=\D)` | `LIST_MARKER` | `1、林舟 北京大学 北京`、`2、苏禾、浙江大学、杭州市` 都不会把 `1`/`2` 当姓名 |

「≥2 次」不会误伤任何真记录：一条学生行至少三列，`、` 分隔就必然出现两次以上。
`(?=\D)` 前瞻是为了不把 `1.5,北京大学,北京` 的 `1.` 当序号剥掉（旧正则有这个坑，一并堵上）。
被拒的单个 `、` 仍留在 `FREEFORM_SEPARATOR` 里，行为与旧代码一致。

### recheck

```
npx vitest run src/lib/import-data.test.ts src/lib/import-headers.test.ts src/lib/binary-import.test.ts
  → 3 files / 83 passed
```

---

## 自引回归：markdown 分隔行被导入成一名叫「---」的学生

**据实记录：这条不是原缺陷，是本轮 `|` 升格引入的，自查脚本跑真实粘贴形态时发现。**

failure：`| 姓名 | 院校 | 城市 |` / `| --- | --- | --- |` / `| 林舟 | 北京大学 | 北京市 |`
→ 首行成了表头，分隔行的三个 `---` 正好落在 姓名/院校/城市 三列上，
`candidateFromColumns` 认为三列俱全 → 导入一名 `---`。
旧代码侥幸没事，只是因为 `|` 和 `-` 都在自由文本正则里，那一行被切成空数组。

cause：`|` 一旦是真分隔符，分隔行就变成一条「列对齐、单元格非空」的合法行，
而「非空」的判定只看 `trimImportCell` 是否为空串，`---` 不是空串。

fix：`parseStudentText` 每行开头加一道 `DATA_CHARACTER = /[\p{L}\p{N}]/u` 护栏——
**一行里连一个字母或数字都没有，就不可能是学生**，静默跳过（表格分隔行、`,,`、
`--------` 这类装饰行都归此类，且不再污染未识别列表）。

recheck：`reads a pasted markdown table without importing its rule row` 用例锁死；
撤掉护栏该用例立刻红（见下表）。

---

## 分支承重（临时改坏 → 同一条命令复跑 → 改回）

| 临时改动 | 失败用例 | 说明 |
| --- | --- | --- |
| `FREEFORM_SEPARATOR` 退回 `/[\s、\-]+/` | 连字符姓名、空格/紧贴连字符 2 条 | 玛丽-克莱尔 又被切成两列 |
| `CELL_DELIMITERS` 退回四项 | `\|` 空列、`、` 缺院校、`；` 空列 3 条 | 空列重新被压掉、整行左移 |
| `LIST_MARKER` 置空 | 自由文本三段、`、` 序号列表 2 条 | `1、`/`1.` 的序号被当成姓名 |
| 去掉 `DATA_CHARACTER` 护栏 | markdown 分隔行 1 条 | 又导入一名 `---` |

四个分支都承重，没有「保险起见」的死代码。改回后 `cmp` 与原文件逐字节相同，41 条再跑全绿。

---

## 400 行约束

`import-data.ts` 加完新逻辑一度 411 行，用**等价手段**压回 **400**：

- `splitCells` 与 `splitParts` 本就是同一函数的两种调用（前者等价于 padding 传 `undefined`），合并为一个；
- 只用一次值的 `DelimitedScan` interface 与单行包装 `endsInsideQuotedCell` 内联到 `scanDelimitedLine` 的返回类型与两处调用点；
- 若干注释段落**只重排折行、不删信息**（`NEGATED_OVERSEAS` 一句由「without a warning」改成等义的「silently」）。

`import-data.test.ts` 495 行：仓库里测试文件普遍超 400（`card-layout.test.ts` 1285、
`agent-conversation-store.test.ts` 464、`project-migration.test.ts` 461），
BRIEF 第 5 条写的是「**实现文件** ≤400 行」，实现文件本轮无一超限。
本轮 allowlist 只给了这一个测试文件，没有拆分目标文件可用，故不拆。

---

## 验证

```
npx vitest run src/lib/import-data.test.ts src/lib/import-headers.test.ts src/lib/binary-import.test.ts
                                → 3 files / 83 passed
npx vitest run src/lib          → 99 files / 923 passed
npx vitest run src/components src/App.test.tsx
                                → 72 files / 519 passed
npm test（全量）                 → 210 files / 1831 passed
npx tsc -p tsconfig.app.json --noEmit   → 0 error
npm run lint                    → 0 error / 5 warning（全为既有 react-refresh 提示，均在他人文件）
```

真实粘贴形态的旁路自查（`npx tsx` 临时脚本，已删）：markdown 表格（带/不带表头）、
`姓名：林舟 | 院校：… | 城市：…` 标签行、句内顿号、序号列表、`1.5,` 小数首列、
引号内逗号、连字符姓名的 CSV/tab 形态、全角分号表头、空格 em dash —— 结论全部符合预期，
其中 markdown 分隔行一条当场发现回归并修（见上）。

---

## 交付与回滚

**验收方式.** CI 跑 `npx vitest run src/lib src/components` + `tsc` + `eslint`。
人工验收：数据工作台 → 导入 → 粘贴三段：
（1）`玛丽-克莱尔 巴黎高等师范 巴黎`，应导入姓名带连字符的一人；
（2）`林舟||北京市|海外` 与一条完整的 `|` 行，应只导入完整那条，另一条出现在未识别并给出行号；
（3）markdown 表格，应导入表体、不出现叫 `---` 的学生。

**破坏性变更.** 无 API / 数据结构变更：`parseStudentText`、`parseDelimitedTable`、
`splitDelimitedLine`、`candidateFromColumns`（仍按下标读）、`ImportCandidate`、`UnparsedLine`
的签名与字段全部不变；`splitParts` 是模块私有函数，已并入 `splitCells`。
表头映射未动。可观察的行为变化三条，方向都是「原本静默错的现在报出来」：

1. 紧贴连字符的单行（`顾言-复旦大学-上海市`）从「导入」变为「未识别」——**唯一可能让用户导入数变少的一条**；
2. `、` / `|` / `；` 分隔且带空列的行从「错列导入」变为「未识别 / 缺少院校」；
3. 只含一个 `|` 或 `；` 的自由文本行（`林舟 北京大学 北京 | 备注`）现在按该分隔符切成两段 → 未识别。
   这与既有的 `，` 行为一致（逗号一直如此），未额外加护栏，理由是保持分隔符语义统一；
   若日后有真实反馈，可给 `|` 套用与 `、` 相同的「≥3 单元格」阈值，一行改动。

**回滚.** `git checkout HEAD -- src/lib/import-data.ts src/lib/import-data.test.ts` 回到 Round 16 状态。
局部回滚：只想退连字符改动，把 `FREEFORM_SEPARATOR` 换回 `/[\s、\-]+/`（会重新引入缺陷一）；
只想退分隔符升格，把 `CELL_DELIMITERS` 砍回四项，此时 `DATA_CHARACTER` 护栏与 `LIST_MARKER`
仍可安全保留。三处彼此独立。

---

## 已知遗留（未修，据实记录）

1. **无分隔符的自由文本仍无法表达空列。** `林舟  北京市` 里连续空白必然合并，
   缺口不可见，只能落到未识别。格式本身的信息缺失，与 Round 12 的记录一致。
2. **`｜`（全角竖线）没有升格为分隔符。** 旧正则也没有它，本轮不扩大面；
   OCR 路径 `parseOcrLikeText` 已先把 `｜` 换成空格。
3. **单行粘贴的缺口仍按「填充列」处理。** 只粘 `林舟||北京市` 一行时，空列在这篇里从没被填过，
   会被判为 padding 丢掉，结论仍是未识别行（方向正确），但理由是「列不存在」而非「缺口」。
   要区分得引入表头之外的先验，收益不抵复杂度（Round 12 同结论）。
4. **`1.5,北京大学,北京` 仍会把 `1.5` 当姓名。** 本轮只保证它不被 `LIST_MARKER` 误剥成 `5`；
   「首列是纯数字编号」的识别属于表头/序号列推断，不在本轮范围。
5. **`binary-import.ts` 的 `matrixToText` 走 tab 路径**，不受本轮影响；该文件在 FORBIDDEN 列表内，未碰。
