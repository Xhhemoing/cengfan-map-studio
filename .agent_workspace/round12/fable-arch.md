MODEL_SLUG: claude-fable-5-thinking-xhigh

# Round 12 — fable-arch：把栈式 HTML 表解析拆出 binary-import

改动文件（仅允许清单内）：

- `src/lib/html-table-parse.ts`（新建，199 行）：HTML 剪贴板 flavour 的 tokenizer + 表栈遍历器整体迁入——`TAG_ATTRIBUTES`/`TABLE_TOKEN`、`decodeHtmlEntities`、`htmlCellText`、`readSpan`、`TableFrame`、`isGridTable`、`closeTable`、`parseHtmlTableRows`。
- `src/lib/binary-import.ts`（400 → 208 行）：删除上述块，改为 `import { parseHtmlTableRows } from "./html-table-parse"` 并原名再导出；`parseHtmlTable`、`rowsToTabText`、`parseOcrLikeText` 与整个 Excel 表头引擎留在原处。
- `src/lib/binary-import.test.ts`（495 → 290 行）：`pasted html tables` describe 整体迁出；新增 1 条再导出恒等测试。
- `src/lib/html-table-parse.test.ts`（新建，220 行）：承接迁出的 14 条用例。

## 语义零变更的证据

拆分是逐字搬运，不是重写，用 diff 锁死：

1. `git show HEAD:src/lib/binary-import.ts | sed -n '192,378p'` 与新模块第 13–199 行 `diff` → **完全一致**（唯一差异在块外：迁走的 9 行模块级注释改述了一句"由 binary-import 再导出"，以及新增 `trimImportCell` 的 import——它是该块对 import-data 的唯一依赖）。
2. `git show HEAD:src/lib/binary-import.test.ts | sed -n '280,495p'` 与新测试文件第 5–220 行 `diff` → **完全一致**（14 条用例逐字保留：嵌套表提升 vs 折叠、colspan/rowspan 补齐、缺省闭合标签、属性内 `>`、双表并列等全部原样）。

嵌套表 promotion vs flatten、colspan/rowspan、表头引擎、`matrixToText` 的 `filter(Boolean)` 行为均未触碰（后者归 R12-opus-data）。

## 调用点与再导出

- 组件侧唯一调用点 `src/components/data-workspace-import-state.tsx` 从 `../lib/binary-import` 引 `parseHtmlTableRows`，导入路径不变即生效；`data-workspace-import-panel.tsx` / `data-workspace-fields.tsx` 只引类型，不受影响。
- 要求的 import-path 测试：`binary-import.test.ts` 新增「re-exports the html table parser extracted into html-table-parse」——`expect(parseHtmlTableRows).toBe(extractedParseHtmlTableRows)` 恒等断言（同一函数对象，非行为近似），外加一条经再导出路径跑通 `parseHtmlTable` 的最小烟测。
- 测试文件为何也要拆：`binary-import.test.ts` 原本就 495 行、超 400 上限，本轮既然要动它，顺同一条拆分线把 HTML 用例迁到新模块的测试文件，行为断言直接指向被拆出的实现。

## 验证（failure → cause → fix → recheck）

本轮首跑即绿，无红灯循环；唯一一次修正发生在跑测试之前：恒等测试初稿附带了一条对无表头单列表格 fallback 输出的臆测断言（`parseStudentText` 自由文本路径的 `unparsed` 形状未经核实），在执行前替换为已被迁出用例覆盖过的确定形状。证据链：

1. `npx vitest run src/lib/binary-import.test.ts src/lib/html-table-parse.test.ts` → **2 文件 32/32 通过**（原 31 条 + 新恒等测试）。
2. `npx tsc -p tsconfig.app.json --noEmit` → 通过（0 错误）。
3. `npx eslint` 四个改动文件 → 通过（0 问题）。
4. 消费方回归：`npx vitest run src/components/workspaces/DataUploadWorkspace.test.tsx src/lib/data-workspace.test.ts` → **27/27 通过**（在 R12-opus-data 并行改动 import-data.ts 的当前工作区状态下跑通）。
5. 行数纪律：`wc -l` = 208 / 199 / 290 / 220，四个文件全部 ≤400；binary-import 从满格 400 降到 208，后续轮次有改动空间。

## 回滚方案

无数据、导出格式或 API 形状变更（`parseHtmlTableRows` 签名、返回矩阵、`ExcelImportResult` 均原样）。回滚 = 还原两个改动文件并删除两个新文件：`git checkout <base> -- src/lib/binary-import.ts src/lib/binary-import.test.ts && rm src/lib/html-table-parse.ts src/lib/html-table-parse.test.ts`。

## 遗留说明

- `parseHtmlTable`（组合器：HTML 矩阵 → Excel 表头引擎）留在 binary-import，属"binary-ish 格式统一入口"职责；tokenizer 层不再感知学生表头语义，仅依赖 `trimImportCell`。
- 工作区存在其他并行未提交改动（`import-data.*`、`layout-health.*`、`connector-geometry.*`、`content-layout-objects.*`、`DataUploadWorkspace.*`、`server/*`、`USER_GUIDE.md` 等），均非本人所改，未触碰。
