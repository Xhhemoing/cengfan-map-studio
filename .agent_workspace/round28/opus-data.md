MODEL_SLUG: claude-opus-5-thinking-high-fast

# R28 opus-data — 小冒号 ﹕ (U+FE55) 作为单元格分隔符

## 结论

`CELL_DELIMITERS` 现在同时认识 `：`(U+FF1A) 与其 CJK 小型变体 `﹕`(U+FE55)，两单元格阈值（不走 `、`/`﹑` 的三单元格规则）。`src/lib/import-data.ts` 仍为 400 行。

## 改动文件

- `src/lib/import-data.ts`（+3 / −3，行数不变）
  - `CELL_DELIMITERS` 在 `"："` 之后插入 `"﹕"`：`["\t", ",", "，", ";", "；", "﹔", "|", "｜", "／", "：", "﹕", "、", "﹑"]`。
  - 阈值无需改动：`detectDelimiter` 的三单元格规则由 `/^[、﹑]$/` 限定，`﹕` 自动落入默认的两单元格分支。
  - 为保住 400 行上限，只压缩注释不删行为：数组上方的一行注释把 “The small forms ﹔ and ﹑ … stand for ； and 、” 改写为更短的 “The small forms ﹔ ﹕ ﹑ … stand for ； ： 、”；`detectDelimiter` 上方块注释末行由 “`﹔` included — a semicolon separates, it never enumerates — needs only a second cell.” 改为 “`﹔` and `﹕` included — a semicolon and a colon separate, never enumerate — needs a second cell.”（仍是同一行，注释块行数不变）。
  - 未新增 ASCII `:`（数组注释里原有的 “the ASCII : of a time or a URL” 是既有文本）、未新增 `·`、未改 `LIST_MARKER`。

- `src/lib/import-data.test.ts`（+55），4 个用例追加在既有 `describe("fullwidth colon separated rows")` 内，镜像 `：` 与 `﹔` 两套：
  1. `splits a row typed with the small colon a CJK-width paste ships` — `林舟﹕北京大学﹕北京市` 解析为完整候选。
  2. `reads a roster headed by the small colon and names the gap of its empty 院校 cell` — 表头 `姓名﹕院校﹕城市﹕去向类型`；苏禾/周晴（`海外` → `locationScope: international`）入库，`林舟﹕﹕北京市﹕` 报 `缺少院校`（第 4 行）。
  3. `reads a ﹕-separated roster without a header and reports its gap` — 无表头时空院校列报 `无法识别学生名称、录取院校和城市`。
  4. `keeps a ﹕ inside one cell from splitting a row another delimiter already divides` — 逗号表头下 `波士顿﹕剑桥` 保持为一个城市单元格，不再拆列。

## 验证

- `npx vitest run src/lib/import-data.test.ts` → 84 passed（改动前 80）。
- `wc -l src/lib/import-data.ts` → **400**（≤400）。
- 回归面：`npx vitest run src/lib/binary-import.test.ts src/lib/import-data.test.ts src/lib/import-headers.test.ts` → 3 files / 128 tests passed（`binary-import.ts` 复用同一分隔符检测）。
- `npx eslint src/lib/import-data.ts src/lib/import-data.test.ts` → 无告警。

## 证据链（failure → cause → fix → recheck）

本轮无测试/lint 失败。唯一预判风险是行数上限：`import-data.ts` 起始即 400 行，直接为 `﹕` 补注释会溢出（failure 预判）；原因是块注释末行与数组上方单行注释都要提及新符号（cause）；处理方式是就地改写这两行注释而非新增行、行为代码只在数组里加一个元素（fix）；`wc -l` 复核仍为 400、目标测试 84 passed（recheck）。

## 交付与回滚

- 验收方式：CI 上 `npx vitest run src/lib/import-data.test.ts` 与 `wc -l src/lib/import-data.ts`；人工验收可在导入框粘贴 `姓名﹕院校﹕城市` 表头名单。
- 兼容性：纯放宽解析（此前 `﹕` 行整体无法识别，落在 unparsed），不改导出格式与 API 形状。
- 回滚：从 `CELL_DELIMITERS` 移除 `"﹕"` 并删掉这 4 个用例即可，无数据迁移。
- 未执行 git 提交/推送（按本轮规则）。
