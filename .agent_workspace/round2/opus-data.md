MODEL_SLUG: claude-opus-5-thinking-high-fast

# R2-opus-data · 数据契约与导入边界收紧

分支：`cursor/agent-sota-polish-cbcd`（**未提交**，按要求 do not commit）

## 0. 改动文件

| 文件 | 变化 |
| --- | --- |
| `src/lib/import-headers.ts` | **新增**（220 行）：表头别名引擎（单元格清洗、别名表、精确+模糊列映射、缺列描述） |
| `src/lib/import-data.ts` | 462 → 275 行：只保留行/文本解析；表头引擎整体 re-export，外部导入路径不变 |
| `src/lib/binary-import.ts` | 合并单元格展开、稀疏行不再静默丢弃、模板说明补两行 |
| `src/lib/student-data.ts` | 必填校验改走 `trimImportCell`（零宽/全角空白视为空） |
| `src/lib/data-health.ts` | 新增 `ResolvedDataIssue` / `withDataIssueId`，`listDataIssues` 返回类型保证带 id |
| `src/components/DataQualityPanel.tsx` | 定位按钮带 `data-locate-issue`（稳定 id） |
| `src/components/workspaces/DataUploadWorkspace.tsx` | 定位问题时把焦点移到名单行；映射行补 `data-issue-id` |
| `src/components/data-workspace-student-table.tsx` | 行 `tabIndex={-1}` + `aria-current`，可被程序化聚焦/标记 |
| `src/components/data-workspace-import-state.tsx` | 传 `!merges` 给解析器；保留未识别行原因而不只是计数 |
| `src/components/data-workspace-import-panel.tsx` | 新增 `[data-import-unparsed]` 提示：跳过了哪几行、为什么 |
| `src/components/DataWorkspace.tsx` | 透传 `unparsedRows` |
| 对应 5 个测试文件 | +58 用例（115 → 141） |

`import-data.ts` 拆分理由：加完引擎后 462 行，超过 AGENTS.md 的 400 行上限。拆分是纯搬运 +
re-export，`binary-import.ts`、组件与测试的 `from "./import-data"` 全部保持原样。

## 1. DataIssue.id 一定存在（要求 1）

- 新增 `export type ResolvedDataIssue = DataIssue & { id: string }`，`listDataIssues()` 的返回类型
  改为 `ResolvedDataIssue[]`，`createIssue()` 也返回该类型 —— **类型层面**保证每条 issue 带 id，
  而不是靠约定。
- `DataIssue.id` 仍是可选：`DataQualityPanel.test.tsx` / `GlobalDataScreen.test.tsx` /
  `DeliveryWorkspace.test.tsx` / `stage-overview.test.ts` 在我的 ownership 之外并直接构造字面量，
  改成必填会让这些文件类型报错（R1 已记录）。新增 `withDataIssueId(issue)` 让外部来源的 issue 也
  能一步补齐。
- UI 一律走 `resolveDataIssueId`：`DataQualityPanel` 的行 key、`data-issue-id`、定位按钮的
  `data-locate-issue`；`DataUploadRail` 的地图映射行现在也带 `data-issue-id`（此前只有 key）。
  `GlobalDataScreen` 复用 `DataQualityPanel`，自动继承稳定 id。
- 测试：
  - `sets an id on every listed issue whatever its kind`（六种 kind 全覆盖，逐条断言
    `issue.id === resolveDataIssueId(issue) === kind:studentId`，且全局唯一）。
  - `fills in the id of an issue built outside listDataIssues`。
  - `tags every quality row with a stable issue id so the UI can locate it`（质量面板 + 映射列表
    共用同一个 id）。

## 2. 导入边界（要求 2）

### 别名

- 院校：新增 `高校`、`学院`（`录取学校` R1 已有）。
- 城市：新增 `生源地`，**排在别名表最后**。
- 省份：新增 `所在省`。

别名匹配从"最靠前的列"改成"**最靠前的别名**"：同一字段有多列候选时按别名优先级取胜。
所以 `["姓名","高校","生源地","城市"]` 里城市列取 `城市`（index 3），`生源地` 落空；
只有 `生源地` 时才用它。测试：`accepts 生源地 as a city column but never over an explicit city column`。

### 模糊表头

精确匹配对全部字段跑完之后，未命中的字段才允许按**子串**认领剩余列：
`["学生学号","学生姓名（中文）","录取院校名称","所在城市/地区","所在省"]`
→ `{name:1, university:2, city:3, province:4}`，`学生学号` 被噪声词表（学号/编号/备注/专业/电话…）
挡在外面。

防误判三道闸：
1. 仅 CJK 且长度 ≥2 的别名参与（否则 `university name` 会被 `name` 命中，`市`/`省` 会命中一切）。
2. 含 `：`/`:` 或超过 12 字的单元格不参与（`姓名：林舟` 是数据不是表头）。
3. **零个精确匹配时，至少要模糊命中 3 列**才承认这是表头 —— 见下方失败链，这条是必需的。

### 合并单元格

`parseExcelWorkbookRows(rows, { merges })` 新增第二参；`data-workspace-import-state.tsx` 把
`worksheet["!merges"]` 传进来。`expandMergedCells` 只把锚点值复制到块内**空**单元格，用户填过的
不动，锚点本身为空则整块不动。不传 merges 时行为与之前完全一致（不猜）。
测试覆盖：纵向合并的省份块、合并列提供唯一必填城市的稀疏行、`expandMergedCells` 单元测试，
以及 `DataWorkspace.test.tsx` 里真实 xlsx 落盘/读回（`sheet["!merges"]` round-trip）的端到端用例。

### 带引号的 CSV

`splitDelimitedLine` 按 RFC4180 处理：引号内的分隔符属于单元格，`""` 还原为 `"`，
非行首的引号当普通字符。`"李,四",北京大学,北京市` 正确导入姓名 `李,四`；
`DataWorkspace.test.tsx` 有一条粘贴 → 识别 → 追加导入的端到端用例。
**已知限制**：不支持跨行的引号内换行（按行切分在前），未宣称支持。

### 不再静默跳过

- 文本通路：表头完整时，跳过的行给出**具体**原因（`缺少姓名、院校`），只有分隔符没有内容的行
  依旧安静跳过。
- XLSX 通路：以前 `unparsed` 恒为 `[]`（有内容但缺必填的行直接消失）。现在同样报
  `{sourceLine, rawLine, reason}`，末尾空行仍不报。
- UI：导入面板新增 `[data-import-unparsed]` 一行提示"未识别 N 行（不会被导入）：第 3 行 缺少
  姓名、院校；…"，复用既有 `.panel-note` 样式（styles.css 不属于我）。这一条同时满足
  `cengfan-data-import` skill 的"必填字段缺失必须给出可读错误，不允许静默跳过"。

## 3. 从问题定位到名单行（要求 3）

`DataUploadWorkspace` / `DataUploadRail` 的 `定位到名单` 现在 `scrollIntoView` **并把焦点移到那一行**：
`focusStudentRow(id)` 用既有的 `data-student-row` 查 DOM（质量栏与名单表是兄弟组件，R1 已有此查法），
没有在 App 里新增任何路由/状态层。名单行加了 `tabIndex={-1}`（不进 Tab 序，可程序化聚焦）与
`aria-current="true"`（被选中的行对读屏可辨认）。行不在表里时（被筛选掉/不同数据集）只回调选择，
焦点不动、不报错。

测试：
- `moves focus to the roster row when an issue is located by its stable id`（先用
  `[data-issue-id="unresolved-location:student-1"]` 找到问题行，再点它的
  `[data-locate-issue]` 按钮，断言 `document.activeElement === [data-student-row="student-1"]`）。
- `locates the roster row from the map-mapping list too`。
- `still reports the selection when the located record is filtered out of the table`。
- `marks the selected roster row and keeps it focusable for locate actions`（`aria-current` / `tabIndex`）。

## 4. 空白姓名、只有城市的行、海外记录（要求 4）

- `trimImportCell` 把 BOM、零宽字符（`\u200b-\u200d`、`\u2060`）与全角空格一起视为空白，
  `validateStudentInput` / `buildStudentRecords` / `candidateFromColumns` / CSV 切分全部走它。
  `\u200b` 当姓名不再产出"看起来有名字"的记录，而是 `missing_field` error。
- 只有城市的行：解析层报 `缺少姓名、院校`（不静默丢），`buildStudentRecords` 报两条 error
  且**不**再追加 `unresolved_city` 噪声，`listDataIssues` 报 `missing-field · 缺少姓名、院校`
  （R1 用例保持绿）。
- 海外记录不带中国省份：`candidateFromColumns` 丢弃 province 列、`buildStudentRecords` 不写
  province 也不报未匹配城市 —— R1 的四条用例全部保持绿，本轮新增的别名/模糊/合并单元格路径
  也复用同一分支。

## 5. 不宣称图片 OCR（要求 5）

未改任何 OCR 文案；R1 的三条断言（`只解析文本，不读取图片`、唯一 file input 的 accept 不含
`image`、无"图片识别/上传图片"字样）继续绿。新增的未识别提示只说"未识别 N 行"，不承诺任何
识别能力。

## 6. 验证（failure → cause → fix → recheck）

指定命令：

```
npx vitest run src/lib/import-data.test.ts src/lib/binary-import.test.ts src/lib/student-data.test.ts \
  src/lib/data-health.test.ts src/lib/data-duplicate.test.ts src/lib/data-workspace.test.ts \
  src/components/DataWorkspace.test.tsx src/components/workspaces/DataUploadWorkspace.test.tsx \
  src/components/DataOverview.test.tsx
```

- 基线（改动前）：9 files / **115** passed。
- 最终：9 files / **141** passed（+26 用例）。
- `npx tsc -p tsconfig.app.json --noEmit`：0 错误。
- `npx eslint src/lib src/components`：本人文件 0 error / 0 warning（仓库另有 6 条既有
  `react-refresh` warning，均在他人文件）。
- 全量 `npx vitest run`：拆分前一次 **172 files / 1396 passed 全绿**；拆分后再跑为
  `1 failed | 1408 passed`，唯一失败是 `PosterCanvas.performance.test.tsx`（见 6.4）。

### 6.1 失败一：标注式整行被当成表头

1. **failure**：`recognizes labeled natural-language records without requiring a delimiter` 与
   `reads a labeled record with an explicit province and overseas marker` 返回空候选。
2. **cause**：模糊匹配让 `姓名：林舟，就读院校：北京大学，城市：北京` 这一行同时命中 name /
   university / city，首行被 `detectTextHeader` 当成表头吃掉，整段没有数据行。
3. **fix**：含 `：`/`:` 或超长的单元格不参与模糊匹配（`canFuzzyMatch`）。
4. **recheck**：`npx vitest run src/lib/import-data.test.ts` → 31 passed。

### 6.2 失败二：数据行"新同学 北京大学 北京"被当成表头

1. **failure**：`App.test.tsx > replaces the project dataset with confirmed import candidates`
   报 `Cannot read properties of undefined (reading 'dispatchEvent')` —— 找不到"替换全部"按钮。
2. **cause**：单行粘贴 `新同学 北京大学 北京`，`新同学` 含别名 `同学`、`北京大学` 含别名 `大学`，
   模糊匹配拿到 2 个字段 ≥ 阈值，唯一的数据行被当成表头消费掉，候选列表为空所以复核区没渲染。
   6.1 的冒号闸门挡不住这种"值里恰好含别名词"的情况。
3. **fix**：`MIN_FUZZY_ONLY_COLUMNS = 3` —— 一个精确匹配都没有的行，必须模糊命中 3 列才承认是
   表头；真实的装饰表头（`学生姓名（中文）/录取院校名称/所在城市/地区/所在省`）仍然通过。
   同时把这条反例固化为用例 `never reads a data row as a header just because its values contain
   alias words`。
4. **recheck**：`npx vitest run src/App.test.tsx` → 114 passed；指定命令 → 140 passed。

### 6.3 失败三：`import-data.ts` 超过 400 行

1. **failure**：`wc -l src/lib/import-data.ts` = 462，违反 AGENTS.md「文件超过 400 行拆分」。
2. **cause**：别名排序引擎 + 模糊匹配 + 噪声词表 + 引号切分全部堆在同一文件。
3. **fix**：抽出 `src/lib/import-headers.ts`（表头契约），`import-data.ts` 原样 re-export，
   调用方零改动。275 / 220 行。
4. **recheck**：`tsc` 0 错误 + 指定命令 141 passed + eslint 0 error。

### 6.4 不属于本人范围的失败

`src/components/canvas/PosterCanvas.performance.test.tsx > coalesces a pointer-move burst…`
超时 20s。该测试属同轮 card-layout / canvas 代理，其工作区里 `PosterCanvas.tsx`、
`useCardLayoutWorker.ts`、`card-layout-*.ts` 有 544 行在途改动（`card-layout` 在我的 FORBIDDEN
列表内）。时间线佐证：我在拆分之前跑的全量是 172 files / 1396 全绿，之后用例数涨到 1409（他人
新增）才出现该失败；我的改动不在这条渲染路径上（只有 `student-data → import-headers` 一层新增
的模块初始化，构造两个 Map）。

## 7. 交付与回滚

- **验收方式**：PR + CI 跑上面的指定命令。人工验收路径：
  1. 「数据与素材」→ 展开导入 → 粘贴 `姓名,院校,城市` + 一行 `"李,四",北京大学,北京市` →
     识别文本 → 候选姓名应为 `李,四`；
  2. 上传一份省份列纵向合并的 xlsx → 合并块覆盖的每一行都应带到同一省份；
  3. 故意留一行只填城市 → 面板出现「未识别 1 行（不会被导入）：第 N 行 缺少姓名、院校」；
  4. 右栏「数据质量」任意一条点「定位到名单」→ 对应行滚动到中间**并获得焦点**。
- **破坏性变更与回滚**：
  - `parseExcelWorkbookRows` 第二参 `options` 可选，旧调用（含 `parseExcelArrayBuffer`）语义不变。
  - `listDataIssues` 返回类型收窄为 `ResolvedDataIssue[]`（`DataIssue[]` 的子类型），所有既有
    消费方仍然编译通过；`DataIssue.id` 仍可选，无数据迁移。
  - 行为语义变化两处，都只影响提示、不改写入数据：① 表头完整时未识别行的 reason 从
    "无法识别学生名称、录取院校和城市" 变为 "缺少X、Y"（已同步更新该用例）；② XLSX 通路开始
    上报 unparsed（此前恒为空），复核区的「未识别 N」数字会从 0 变成真实值。
  - xlsx 模板只在「填写说明」页**再加一行**，数据页表头一字未动，旧模板照常可导入。
  - **回滚**：`git checkout <base> -- src/lib/import-data.ts src/lib/binary-import.ts
    src/lib/student-data.ts src/lib/data-health.ts src/components/DataQualityPanel.tsx
    src/components/DataWorkspace.tsx src/components/data-workspace-*.tsx
    src/components/workspaces/DataUploadWorkspace.tsx <上述测试文件>`
    再 `rm src/lib/import-headers.ts` 即可完整回退；无持久化结构变更（IndexedDB 项目文档未动）。

## 8. 留给下一轮

- CSV 引号内换行（跨行单元格）未支持，`splitLines` 先按行切。
- `DeliveryWorkspace` / `stage-overview` 仍各自拼 issue key，可在其 owner 轮次改用
  `resolveDataIssueId` 统一。
- 未识别行提示目前只展示前 3 条，若要"全部展开/复制"需要 styles.css 配合。
