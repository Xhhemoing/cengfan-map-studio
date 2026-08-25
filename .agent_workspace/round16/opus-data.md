# Round 16 — opus-data:workbook rawLine 保留空单元格

改动文件:`src/lib/binary-import.ts`、`src/lib/binary-import.test.ts`(仅此两个)。未改 `html-table-parse.ts`。未做任何 git 操作。

## 问题

`parseExcelWorkbookRows` 里逐行构造上报用的 `rawLine`:

```ts
const rawLine = row.filter(Boolean).join("\t");
```

`filter(Boolean)` 把行内**所有**空单元格删掉,后面的列整体左移一格。这个字符串会写进两处结果:
`unparsed[].rawLine`(未识别面板/AI 客户端载荷)与 `candidateFromColumns(...)` 生成的
`ImportCandidate.rawLine`。

后果举例:表头 `学生姓名 / 录取院校 / 城市`,数据行 `林舟 / (空) / 北京市` 因缺院校无法导入,
被引用回给用户时却是 `林舟\t北京市` —— 读起来像"林舟 考上 北京市",恰好把导致这一行报错的那个
缺口藏了起来。同理 `["   ", "浙江大学", "杭州市"]`(缺姓名)原本被引用成 `浙江大学\t杭州市`,
看上去像"浙江大学同学去了杭州市"。

同文件里另外两处已经是对的:`matrixToText`(自由文本兜底)和 `rowsToTabText`(粘贴框回填)都用
`row.join("\t").replace(/\t+$/, "")`,并在注释里写明"丢空格会把后面的列左移"。第 168 行是这一
规则的唯一漏网点,`import-data.ts` 文本路径也一直是把原始行原样带走(测试里存在
`rawLine: "林舟,,北京市"`、`",,杭州市"` 这类断言)。也就是说这是 workbook 路径与文本路径不一致。

## rawLine 是否会被再次解析

全仓检索 `rawLine` 的消费者(`src/`、`server/`):

- `src/components/data-workspace-import-panel.tsx`:未识别面板只渲染 `第 N 行 + reason`,不渲染 `rawLine`。
- `src/lib/ai-client.ts`、`server/ai/llm-client.ts`:只是把 `rawLine` 作为形状字段透传/回填。
- 其余命中都是构造点或同名局部变量(`poster-guest-layout.ts` 里的 `rawLine` 与本流程无关)。

结论:**目前没有任何代码把 `rawLine` 再切分回列**,解析完全走 `candidateFromColumns(row, ...)`
按下标读 `row`。所以这次改动对解析结果零影响。但按任务要求,即便"只用于展示"也要让它诚实:它是
未识别面板/AI 载荷里代表"这一行原样"的唯一字符串,一旦被人眼读或被下游按 tab 切分,左移的列就是
错的。改成保留空位后,`rawLine.split("\t")` 能还原原始列位置,这也在测试里断言了。

## 改法

抽出与既有两处共用的辅助函数,消除第三份重复实现:

```ts
function rowToTabLine(row: string[]): string {
  return row.join("\t").replace(/\t+$/, "");
}
```

`matrixToText`、`rowsToTabText`、第 168 行的 `rawLine` 统一走它。语义:行内空位保留为空字段,
只裁掉行尾的连续 tab(所以整行空白仍是空字符串,尾部空备注列也不会拖一串 tab)。
`candidateFromColumns(row, header.mapping, sourceLine, rawLine)` 的入参 `row` 未动,仍按下标读列。

## 测试

`src/lib/binary-import.test.ts`:

- 新增「keeps an empty middle cell in the reported line while reading columns by index」——
  4 列表头 + `["林舟", "", "北京市", ""]`(**中间空单元格**,即任务要求的用例)。断言三件事:
  同表另一行仍按下标 index 2 读出 `城市: 杭州市`;该行上报为
  `{ sourceLine: 3, rawLine: "林舟\t\t北京市", reason: "缺少院校" }`(行尾空备注被裁掉);
  `rawLine.split("\t")` 还原成 `["林舟", "", "北京市"]`。
- 新增「keeps interior gaps in an imported row's rawLine so it still maps back to the sheet」——
  成功导入的候选行(省份列为空)其 `rawLine` 为 `苏禾\t\t杭州市\t浙江大学`,覆盖
  `ImportCandidate.rawLine` 这条分支。
- 更新既有「skips rows that leave a required cell blank…」:缺姓名行的 `rawLine` 从
  `"浙江大学\t杭州市"` 变为 `"\t浙江大学\t杭州市"`(前导空位保留);缺城市行
  `"缺城市\t浙江大学"` 不变(尾部空位仍被裁),注释写明了这两种处理的区别。

未受影响并已复跑的既有断言:`binary-import.test.ts:48` 的 `"北京\t清华大学\t陈宁"`(尾部空列),
`html-table-parse.test.ts:49` 的 `"合计\t合计\t2 人"`(colspan 补出的尾部空列)、`:168-169` 的
嵌套表格两行 —— 都只有尾部空位,裁剪后与原值一致,故未改 `html-table-parse.test.ts`。

## 验证链(failure → cause → fix → recheck)

1. **failure**:改完 `rowToTabLine` 后跑 `npx vitest run src/lib/binary-import.test.ts` 之前先做静态推演,
   预判「skips rows that leave a required cell blank」会失败 —— 该行首列是 `"   "`,经
   `normalizeMatrix`/`trimImportCell` 变成 `""`,旧断言写的是被 `filter(Boolean)` 删掉后的
   `"浙江大学\t杭州市"`。
2. **cause**:该断言锁定的正是被修掉的错误行为(前导空位被吞),属于"测试固化了 bug",不是回归。
3. **fix**:把期望值更新为保留前导空位的 `"\t浙江大学\t杭州市"`,并补注释解释"前导空位保留 / 尾部空位裁掉"。
4. **recheck**:重跑同一批检查全绿。

命令与结果:

- `npx vitest run src/lib/binary-import.test.ts src/lib/html-table-parse.test.ts src/lib/import-data.test.ts src/lib/import-headers.test.ts` → 4 files / **91 passed**。
- `npx tsc --noEmit` → 无输出(clean)。
- `npm test`(全量,`scripts/run-heavy.mjs vitest run`)→ 206 files / **1802 passed**。
  注:工作区内有其他 agent 并行改动(`card-layout-pack`、`server/static-files`、`ci.yml`、
  新增 `card-layout-scratch.test.ts`),故总数高于 Round 15 记录的 1796;本改动自身只增 2 个用例。
- `npx eslint src/lib/binary-import.ts src/lib/binary-import.test.ts` → 干净。
- 收尾修了一处注释措辞不准(把示例说成"缺城市",实为"缺院校")后**重跑**
  `npx vitest run src/lib/binary-import.test.ts src/lib/html-table-parse.test.ts` → 35 passed,eslint 干净。

行数:`binary-import.ts` 222 行、`binary-import.test.ts` 342 行,均 ≤400。

## 交付与回滚

- **验收方式**:CI 跑 `npm test` + `npm run lint`;人工验收可导入一张中间列留空的 xlsx/粘贴 HTML 表格,
  确认未识别面板对应行的原始文本仍保留空列(面板当前只显示行号与原因,`rawLine` 通过 AI 载荷与
  结果对象对外可见)。
- **形状变更**:无。`ImportCandidate` / `UnparsedLine` 字段与 API 形状不变,只是 `rawLine` 的取值
  更忠实于原表。`candidates` / `unparsed` 的行数、`reason` 文案均未变化。
- **回滚方案**:把第 173 行改回 `const rawLine = row.filter(Boolean).join("\t");`,并回退
  `binary-import.test.ts` 中新增的两个用例与那一处期望值更新即可;`rowToTabLine` 可保留
  (`matrixToText`/`rowsToTabText` 的行为与抽取前逐字等价)。无数据迁移、无持久化影响。
