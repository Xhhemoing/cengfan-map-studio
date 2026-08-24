# Round 19 — R19-opus-data

MODEL_SLUG: claude-opus-5-thinking-high-fast
分支：`cursor/agent-sota-polish-cbcd`（未 commit、未 stash、未 push、未新建分支）

补上 Round 18 自己点名留下的缺口：无表头**空白分隔**粘贴 `1 林舟 北京大学 北京市` 里，
前导纯数字（序号 / 学号）仍占着 `姓名` 位次，整行左移一格且 `unparsed` 为空。Round 18 的
跨行列统计只作用在**有分隔符**的粘贴上，空格分隔行压根没有「列」可统计，所以那一轮的修复
够不着这里。四步链（failure → cause → fix → recheck）见下。

---

## 改动文件

| 文件 | 行数 | 改动 |
| --- | --- | --- |
| `src/lib/import-data.ts` | **400**（改前 400，+13/−13，净 0） | `splitCells` 的无分隔符分支新增前导序号丢弃；`scanDelimitedLine` 两处单语句 `if` 折成本文件既有的单行大括号写法腾出 8 行 |
| `src/lib/import-data.test.ts` | 612（+54） | 新增 describe「a 序号 leading a whitespace-separated line」5 条用例 |

`html-table-parse.ts`、`binary-import.ts` 一字未动（也未在测试里 import）。

**400 行硬约束的腾行**（加 8 行必须删 8 行，逐条可核）：`scanDelimitedLine` 里
`if (char === '"' && ...) { … }` 与 `if (char === delimiter) { … }` 两个各 5 行的块，
折成两行单行大括号形式——与本文件 `usableColumnsByDelimiter` 里
`if (!named.has(delimiter)) { filled.set(…); named.set(…); }` 同一写法，语义逐字不变，
没有删掉任何注释或文档。

---

## 缺陷：空格分隔行的前导序号被读成姓名

### failure（复现，改前）

```ts
parseStudentText("1 林舟 北京大学 北京市\n2 苏禾 浙江大学 杭州市")
// → { name: "1", university: "林舟", city: "北京大学" } ×2，unparsed: []

parseStudentText("20260001 林舟 北京大学 北京市 中国去向\n20260002 周晴 哈佛大学 波士顿 海外")
// → { name: "20260001", university: "林舟", city: "北京大学" }，去向类型 读到 "北京市"
```

三列俱全、`unparsed` 一行不报——和 Round 18 修掉的分隔符版本是同一种「看起来完整所以没人
发现」的静默错列，只是入口换成了从 Word / 微信 / PDF 里直接粘出来的空格对齐名单。

### cause（根因）

按位读取 `toCandidate` 认前四段是 `姓名/院校/城市/去向类型`，段来自
`splitCells(text, detectDelimiter(text), usable)`。

* `1 林舟 北京大学 北京市` 里没有任何 `CELL_DELIMITERS` 成员，`detectDelimiter` 返回 `null`；
* `LIST_MARKER`（`^\d+[.、)]\s*(?=\D)`）要求数字后面跟 `.` / `、` / `)`，「数字 + 纯空格」
  这种写法不在其内；
* 于是走 `FREEFORM_SEPARATOR` 分支，原样交出 4 段，`"1"` 落在第 0 段。

Round 18 的 `usableColumnsByDelimiter` 之所以救不了：它按 delimiter 分组统计列，
`detectDelimiter` 为 `null` 的行**直接 `continue`**，空白行根本没进统计。

### fix（最小修复）

只改 `splitCells` 的无分隔符分支：

```ts
const parts = content.split(FREEFORM_SEPARATOR).map(trimImportCell).filter(Boolean);
const numbered = usable && parts.length > REQUIRED_STUDENT_COLUMNS.length && SERIAL_CELL.test(parts[0]!);
return numbered ? parts.slice(1) : parts;
```

三条护栏，都是有意为之：

1. **只在按位路径生效。** `usable` 这个第三参**只有** `parseStudentText` 的按位回退那一处
   传（`detectTextHeader`、表头行读取都不传），所以「按表头下标读」的路径一格都没动。
   这正是任务里点名不能碰的 tab/CSV 表头映射：`序号 姓名 院校 城市` + `1 林舟 北京大学 北京市`
   的表头行与数据行仍然同为 4 段、下标对齐（新增用例第 4 条锁住）。
2. **不够分就不丢。** `parts.length > 3`（`REQUIRED_STUDENT_COLUMNS.length`），
   `001 北京大学 北京市` 只有 3 段，`001` 就当姓名——与分隔符版本同一条判据、同一个理由：
   匿名化名单宁可原样导入也不猜（新增用例第 3 条）。
3. **不碰 `LIST_MARKER`。** 任务明令，也是 Round 18 报告里写下的刀口：把它放宽成
   `^\d+[.、)]?\s+` 会连制表符一起吃掉，`1\t林舟\t北京大学\t北京市` 剥成 3 格而表头行
   `学号\t姓名\t…` 不剥，直接造出一处更严重的表头错列。本轮的判定发生在**切分之后**、
   只针对 `delimiter === null` 的 token 列表，制表符行走的是另一条分支，一个字符都没经手
   （新增用例第 5 条用带内部空格的 `林舟 舟` 专门钉住：制表符仍是唯一的切分依据）。

判据复用既有的 `SERIAL_CELL`（`^\d+(?:\.\d+)?$`），与分隔符路径同一把尺子，也顺带覆盖
Excel 未格式化日期留下的小数序列值。

`splitCells` 的分支顺序从「先 `!delimiter` 早返回」翻成「先 `delimiter`」，纯粹是为了让
自由文本分支能占三行；有分隔符那一支逐字未改。

### recheck（同一条检查重跑）

```
npx vitest run src/lib/import-data.test.ts src/lib/import-headers.test.ts
→ 2 files / 74 tests passed
npx vitest run binary-import / html-table-parse / student-data / data-workspace / data-health / import-panel
→ 6 files / 93 tests passed
npx tsc -p tsconfig.app.json --noEmit → 0
npx eslint src/lib/import-data.ts src/lib/import-data.test.ts → 0
wc -l src/lib/import-data.ts → 400
```

**新增用例确实咬得住**（防止「写完就绿」的假验证）：把修复条件临时改成
`const numbered = false && …` 重跑，`import-data.test.ts` 恰好 **2 failed / 50 passed**，
失败的正是两条丢序号的用例（收到 `{ name: "20260001", university: "林舟", city: "北京大学" }`），
另外 3 条护栏用例改前改后都绿——说明它们锁的是「不许变」的行为。改回后 52 条全绿。

未跑全量 `npm test`：工作区里另外 5 个 agent 正在同一分支并行改各自文件，全量结果无法归因；
本轮按任务要求做的是定向验证 + 全部下游 import 消费方的测试。

### 新增用例（5 条）

`import-data.test.ts` — describe「a 序号 leading a whitespace-separated line」：

1. `1 林舟 北京大学 北京市` 两行都按 `姓名/院校/城市` 导入，且 `rawLine` 仍保留序号
   （用户回看时对得上源行）；
2. 学号版 + 第五段 `去向类型` 丢序号后仍对齐（`海外` → `international`，`中国去向` 不误判）；
3. `001 北京大学 北京市` 保持原样（只有 3 段，数字可能就是姓名）；
4. `序号 姓名 院校 城市` 有表头时仍走表头映射（本轮不许碰的路径）；
5. `1\t林舟 舟\t北京大学\t北京市` 仍按制表符切，序号列由 Round 18 的跨行统计丢掉，
   姓名保留内部空格——证明没有拿 `LIST_MARKER`（或任何空白规则）去吃制表符。

---

## 交付方式与回滚

* **验收**：CI 跑 `npm test` + `npm run lint`；人工验收路径 = 导入面板粘贴
  `1 林舟 北京大学 北京市`，改前得到姓名「1」、院校「林舟」，改后得到姓名「林舟」、
  院校「北京大学」、城市「北京市」。
* **破坏性**：无导出格式 / API 形状变更。行为变更仅一处——**无表头且无分隔符**的粘贴中，
  前导纯数字段不再占 `姓名` 位次（段数 > 3 时）。改前该段产出的必然是错误记录，
  不存在依赖它的正确用法。
* **回滚**：把 `splitCells` 里 `const numbered = …` / `return numbered ? …` 两行换回
  `return parts;` 即可，其余代码无需改动（`scanDelimitedLine` 的折行与行为无关，可留可去）。

## 未做的事

未 commit、未 stash、未 push、未建分支（按要求）；未碰 allowlist 外任何文件。
工作区里 `card-layout-pack*`、`StudioMuiProvider.tsx`、`GlobalDataNavigation.tsx`、
`LegacyEditorChrome*`、`StudioTopbarActions.tsx`、`app-initialization*`、`server/*` 的改动
是本轮**其他 agent** 留下的，我一字未动。
