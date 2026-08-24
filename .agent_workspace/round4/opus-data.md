MODEL_SLUG: claude-opus-5-thinking-high-fast

# R4-opus-data · 网页表格粘贴、重复表头与姓名规范化

分支：`cursor/agent-sota-polish-cbcd`（**未提交**，按要求 do not commit）

## 0. 改动文件

| 文件 | 变化 |
| --- | --- |
| `src/lib/binary-import.ts` | 223 → 345 行：新增 HTML `<table>` 解析（`parseHtmlTableRows` / `parseHtmlTable` / `rowsToTabText`），行内重复表头与汇总行不再当作学生 |
| `src/lib/import-headers.ts` | 248 → 295 行：`isExactHeaderAlias`、`countExactHeaderCells`、`isSummaryRow`、`rowRestatesHeader` |
| `src/lib/import-data.ts` | 278 → 316 行：表头在前 5 行内查找（迟到表头需完整且 ≥2 列精确）、表头之前的内容与重复表头/汇总行分别处理 |
| `src/lib/name-format.ts` | 137 → 181 行：`normalizeStudentName`（多余空格、全角空格、间隔号变体、零宽字符）、`splitSurname` 按间隔号切分、模板容忍全角花括号 |
| `src/lib/student-data.ts` | 导入时写入规范化后的姓名 |
| `src/lib/data-duplicate.ts` | 36 → 46 行：重复键复用姓名规范化 + NFKC（全角字母/数字折叠） |
| `src/components/data-workspace-import-state.tsx` | +26 行：`pasteHtmlTable` |
| `src/components/data-workspace-import-panel.tsx` | +10 行：粘贴框 `onPaste` 接管、说明文案 |
| `src/components/DataWorkspace.tsx` | +1 行：透传 `onPasteHtmlTable` |
| 6 个测试文件 | +22 用例（指定命令 144 → 166） |

全部文件仍在 400 行以内（最大 `binary-import.ts` 345 行）。

## 1. 网页/在线表格粘贴（要求 1：解析 `<table>`）

**为什么需要**：从网页或浏览器里的在线表格复制整张表时，剪贴板同时带 `text/html` 与 `text/plain`
两种口味。`<textarea>` 默认只收 `text/plain`，而这一口味经常丢掉空单元格、把整行压成一串空格
（本轮测试里就固化了这种退化文本）。此前这类粘贴只能靠位置兜底，列一旦错位就静默产出错误记录。

**解析层**（`binary-import.ts`，纯函数、无 DOM 依赖）：

- `parseHtmlTableRows(html)`：无 `<table>` 时返回 `null`（调用方据此放行浏览器默认粘贴）；
  否则扫描所有 `<tr>` / `<td|th>`，得到与 xlsx 相同形状的 `string[][]`。
  - `colspan` / `rowspan` 按覆盖块填充，语义与既有 `expandMergedCells`（合并单元格）一致；
    跨行占位用 `carried` 表逐行消耗，包括「本行单元格数少于跨行列」的错位情况。
  - 单元格内 `<br>` 变空格，其余标签剥离，`&nbsp; &#x4e2d;` 等实体解码，空白折叠。
  - `<!-- -->`、`<script>`、`<style>` 先剔除，避免样式块混进单元格。
- `parseHtmlTable(html)` 直接交给 `parseExcelWorkbookRows`，因此复用同一套表头引擎：
  前 8 行找表头、别名识别、合并块补齐、缺列报告、未识别行报告。
- **不用 DOMParser**：解析结果不依赖 DOM 环境（worker/测试一致），且剪贴板 HTML 全程只被
  正则扫描、从不插入文档，不会创建任何不可信节点。代价是嵌套 `<table>` 会被拍平进外层单元格，
  这是当前可接受的退化。

**UI 接线**：粘贴框 `onPaste` 读 `clipboardData.getData("text/html")`，交给
`useRosterImport.pasteHtmlTable`；只有确实解析出表格才 `preventDefault()`——纯文本或
无表格的富文本一律走浏览器默认行为。接管时把制表符文本回填到粘贴框（原有内容不清空，追加），
并按「网页表格」来源直接产出候选与表头识别面板。

测试：`reads a table copied out of a browser, markup and entities included`、
`fills a rowspan and colspan block…`、`keeps empty cells so a sparse table stays aligned`、
`finds the header below a caption row and keeps the province off overseas rows`、
`reports no table for clipboard markup that carries none`、
`renders recognized rows as tab-separated text without dropping empty cells`，
以及组件级 `reads a table pasted from a web page instead of its flattened text` /
`leaves a plain-text paste to the browser`。

## 2. 重复表头（要求 2：first claim wins）

- **重复列名**：R1 起的「一列只被一个字段认领 + 同 rank 取最靠前」即为 first-claim-wins。
  本轮补上把「多余那一列会被明确闲置」写死的用例
  `keeps a duplicated header on its first column and leaves the copy unused`：
  `["姓名","院校","城市","姓名","城市"]` → `{name:0, university:1, city:2}`，
  文本通路 `林舟,北京大学,北京市,曾用名,旧城市` 取到 `林舟` / `北京市`，且不产生未识别行。
- **重复表头行**（把两份导出上下拼在一起的真实场景）：新增 `rowRestatesHeader`。
  某行的三个必填格若各自「是本列别名」或「与表头格文字相同」，就判定为再次出现的表头，
  静默跳过（它不是数据，不该计入未识别）。文本与 XLSX 两条通路都接了。
  用例：`skips a header row that a stacked export repeats inside the data`（含换措辞的
  `姓名/院校/城市` 重复行）、`skips a header row a stacked export repeats in the middle of the sheet`。
- **顺带**：`isSummaryRow` 把姓名列为 `合计/总计/小计/共计/汇总/总人数/total/subtotal/sum`
  的行按「汇总行」报告而不是导入成学生（合并单元格的合计行以前会凑齐三格变成一条记录）。
  用例见 `names a totals row instead of importing 合计 as a student` 与 colspan 用例的 `unparsed`。

## 3. 极稀疏表 / 表头之前的内容

- 文本通路的表头查找从「只看第一行」扩展到「前 5 行」。第一行仍保持 ≥2 列即可的旧规则；
  第 2 行及以后的行必须**映射全部必填列且至少 2 个必填格是精确别名**才被采信，
  以免把数据行误当表头（`never promotes a data line to a header just because it fills three columns`）。
- 采信迟到表头后，它之前的行按 `表头之前的内容` 报告为未识别，而不是拿位置解析硬凑记录——
  标题行「2026 届毕业去向」若被位置解析，就会凭空造出一名学生。
  用例：`finds a header below a title line and reports the skipped preamble`。
- 空单元格保持对齐：HTML 通路不丢空格（`keeps empty cells so a sparse table stays aligned`），
  `rowsToTabText` 也保留空列，避免 R3 修掉的「整行左移」以另一种形式回来。

## 4. 姓名格式边界（要求 3：多余空格、全角标点）

`normalizeStudentName`（`name-format.ts`）：零宽字符剔除 → 间隔号变体（`· ・ ･ • ‧ ∙ ⋅`）统一为 `·`
→ 空白折叠（`\s` 含全角空格与 `&nbsp;`）→ **两个汉字之间的空格视为对齐填充删除**，
拉丁词之间的空格保留（它区分姓与名）。

- `formatStudentName` 先规范化再套模板：`林  舟` → `林舟`，`王　小明` + `{surname}xx` → `王xx`。
- `splitSurname` 按间隔号优先切分：`阿依古丽・买买提` → `{surname:"阿依古丽", given:"买买提"}`，
  不再退化成「阿xx」。
- 模板容忍中文输入法打出的全角花括号：`｛surname｝xx` 等价 `{surname}xx`，
  `normalizeNameFormat` 持久化时折算成半角。
- 导入落库（`buildStudentRecords`）与重复检测（`normalizeDuplicateValue`，额外做 NFKC）
  共用同一套规范化，因此「林 舟 / 林舟」「Ｈａｒｖａｒｄ / Harvard」「･ / ・ / ·」
  归为同一条重复记录，卡片显示与查重口径一致。
  用例：`stores the cleaned spelling of a padded or dotted imported name`、
  `treats names that differ only in padding as the same duplicate record`、
  `groups records that differ only in punctuation width or middle dot`。

## 5. 海外记录仍不要求省份（要求 4）

`candidateFromColumns` 的海外分支未动。新增的 HTML 通路端到端复验：
`finds the header below a caption row and keeps the province off overseas rows` ——
即使源表填了「马萨诸塞州」，`海外` 行产出 `locationScope: "international"` 且**不带** province；
同表的中国行保留 `浙江省` 且不带 locationScope。R1–R3 的既有海外用例全部保持绿。

## 6. 不宣称图片 OCR

未改任何 OCR 文案与文件入口，未新增任何图片相关能力。新增的说明文案只谈「从网页或在线表格复制表格」，
R1 的三条断言（`只解析文本，不读取图片`、唯一 file input 的 accept 不含 `image`、无「图片识别」字样）继续绿。

## 7. 验证（failure → cause → fix → recheck）

指定命令：

```
npx vitest run src/lib/import-data.test.ts src/lib/binary-import.test.ts src/lib/student-data.test.ts \
  src/lib/data-health.test.ts src/lib/name-format.test.ts src/components/DataWorkspace.test.tsx \
  src/components/workspaces/DataUploadWorkspace.test.tsx
```

- 基线（改动前）：7 files / **144** passed。
- 最终：7 files / **166** passed（+22）。
- 扩展到本人全部相关套件（含 `data-duplicate` / `data-workspace` / `DataOverview`）：10 files / **186** passed。
- 全量 `npx vitest run`：17:09 一次为 **175 files / 1532 passed 全绿**；17:13 收尾再跑变成
  **176 files / 1534 passed + `src/App.test.tsx` 失败**，归因见 7.2。
- `npx tsc -p tsconfig.app.json --noEmit`：0 错误。
- `npx eslint src/lib src/components`：0 error；5 条 `react-refresh` warning 全在他人文件
  （`StudioMuiProvider`、`GlobalDataNavigation`、`app-initialization`），与 R3 记录一致。

### 7.1 本轮没有出现「先失败后修复」的测试

新代码提交前的每一步都在目标套件上即时复跑，未出现失败→修复的循环。为避免「用例是空断言」，
改用**反证（mutation）**给出同样强度的证据链：逐个把关键行为改坏、确认恰好是对应新用例失败、再恢复。

| 破坏点 | 失败用例 | 恢复后 |
| --- | --- | --- |
| `rowRestatesHeader` 恒返回 false | `skips a header row that a stacked export repeats inside the data`、`skips a header row a stacked export repeats in the middle of the sheet`（2 failed / 62 passed） | 64 passed |
| `normalizeStudentName` 退化为 `trim()` | 姓名/落库/查重共 5 条（5 failed / 38 passed） | 43 passed |
| HTML 解析忽略 `rowspan` | `fills a rowspan and colspan block…`（1 failed / 68 passed） | 69 passed |
| 迟到表头识别关闭 | `finds a header below a title line and reports the skipped preamble`（1 failed / 41 passed） | 42 passed |
| `betterMatch` 改成 `<=`（后列覆盖前列） | `keeps a duplicated header on its first column and leaves the copy unused` 等 3 条重复表头用例 | 全绿 |
| `pasteHtmlTable` 拿不到表格行 | `reads a table pasted from a web page instead of its flattened text` | 全绿 |

反证过程中 `leaves a plain-text paste to the browser` 始终绿，说明「不接管纯文本粘贴」这条
不是靠副作用凑出来的。

### 7.2 `src/App.test.tsx` 的失败不属于本人范围（已复现并证伪）

1. **failure**：收尾时的全量运行里 `src/App.test.tsx` 失败；单独跑该文件为 **8 failed / 108 passed**
   （协作房间控件 5 条、项目导入 `input[aria-label=…]` 取到 null 2 条、主题切换按钮取到 null 1 条）。
2. **cause 假设**：同轮另一个代理正在拆分 studio editor 外壳——`git status` 显示
   `StudioTopbarActions.tsx` / `GlobalSettingsRoute.tsx` / `use-studio-navigation.ts` 等文件
   在 17:12–17:13 之间新建，`ProjectMenu.tsx`、`ThemeToggle.tsx`、`LegacyEditorChrome.tsx` 同时在改。
   失败点全是「顶栏按钮 / 项目导入 input 查不到」，正是被搬走的那些 DOM。
3. **验证（证伪本人嫌疑）**：`git stash push` 仅推走我改的 15 个文件后重跑 `src/App.test.tsx`，
   结果**完全相同的 8 条失败**；`git stash pop` 恢复后本人 7 个套件仍是 166 passed。
   因此这些失败与本轮改动无关，属于他人在途状态。
4. **recheck**：恢复后重跑指定命令 → 7 files / 166 passed。App.tsx 在我的 FORBIDDEN 列表内，未做任何改动。

## 8. 交付与回滚

- **验收方式**：PR + CI 跑上面的指定命令。人工验收路径：
  1. 打开「数据与素材 → 展开导入」，在网页里选中一张学生名单表格复制，直接粘进文本框 →
     应立刻出现「从网页表格识别到 N 条候选」、表头识别面板与候选列表；粘贴框里是制表符文本。
  2. 同一个框里粘贴普通文字，行为与以前完全一致（不被接管）。
  3. 把两份导出上下拼成一个 xlsx 上传 → 中间那行表头不再变成一名叫「姓名」的学生；
     末尾「合计」行报告为「汇总行」。
  4. 粘贴带标题行的名单（第一行是「2026 届毕业去向」）→ 第二/三行的表头被认出来，
     标题行列在「未识别」里而不是被当成学生。
  5. 名单里写「林  舟」「阿依古丽・买买提」→ 导入后显示为「林舟」「阿依古丽·买买提」，
     与已存在的同名记录被判为重复。
- **破坏性变更与回滚**：
  - 无 API 形状变更。新增导出：`parseHtmlTableRows` / `parseHtmlTable` / `rowsToTabText`
    （`binary-import`）、`isExactHeaderAlias` / `countExactHeaderCells` / `isSummaryRow` /
    `rowRestatesHeader`（`import-headers`，并由 `import-data` 转出）、`normalizeStudentName`
    （`name-format`）。既有签名一律未变。
  - `DataWorkspaceImportPanel` 新增**必填** prop `onPasteHtmlTable`；仓库内唯一调用方
    `DataWorkspace` 已接好，外部无其他调用方。
  - 行为语义变化四处，均只影响识别与展示，不改导出格式与持久化结构：
    ① 重复表头行、汇总行不再进入名单（前者静默、后者报告）；
    ② 文本通路可在前 5 行内找表头，表头之前的内容报告为未识别而不是硬凑记录；
    ③ 导入姓名写入规范化后的拼写（空格/间隔号/零宽字符），查重口径同步；
    ④ HTML 粘贴在剪贴板确有 `<table>` 时接管。
    其中 ③ **会改变新导入记录的 `name` 字段取值**（仅去除装饰字符），已有项目数据不会被回改，
    也没有迁移脚本；如需完全保持旧字面值，回滚 `student-data.ts` 那一行即可。
  - 无 IndexedDB 结构变更、xlsx 模板未动、导出格式未动。
  - **回滚**：`git checkout <base> -- src/lib/binary-import.ts src/lib/import-headers.ts
    src/lib/import-data.ts src/lib/name-format.ts src/lib/student-data.ts src/lib/data-duplicate.ts
    src/components/DataWorkspace.tsx src/components/data-workspace-import-panel.tsx
    src/components/data-workspace-import-state.tsx src/lib/binary-import.test.ts
    src/lib/import-data.test.ts src/lib/name-format.test.ts src/lib/student-data.test.ts
    src/lib/data-health.test.ts src/components/DataWorkspace.test.tsx` 可完整回退；
    只回退粘贴功能则退前三个组件文件 + `binary-import.ts` 即可（其余互不依赖）。

## 9. 留给下一轮

- CSV 引号内换行（跨行单元格）仍未支持：`splitLines` 先按行切（R2/R3 已记录）。
- 嵌套 `<table>` 会被拍平进外层单元格；多张并列表格会被当成一张连续表读取。
- 分组表头（两行表头，第一行是跨列大类）仍未处理：目前只会取其中信息更全的一行。
- `isSummaryRow` 只看姓名列的固定词表；「小计（本科）」这类带后缀的写法还识别不到。
- 迟到表头目前只扫前 5 行文本 / 前 8 行 xlsx；更长的说明区仍会落到位置解析。
- 姓名规范化只在导入与卡片格式化处生效，历史项目里已存的姓名不会被回改，也没有一键清洗入口。
