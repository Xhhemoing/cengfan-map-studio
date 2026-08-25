MODEL_SLUG: claude-opus-5-thinking-high-fast

# R3-opus-data · 导入与数据质量的剩余边界

分支：`cursor/agent-sota-polish-cbcd`（**未提交**，按要求 do not commit）

## 0. 改动文件

| 文件 | 变化 |
| --- | --- |
| `src/components/DataWorkspace.tsx` | 290 → 325 行：被筛选挡住的选中记录会播报并提供「清空筛选并显示」 |
| `src/components/data-workspace-fields.tsx` | 37 → 55 行：`focusStudentRow` 上移为共享助手（名单行 DOM 契约的唯一实现） |
| `src/components/workspaces/DataUploadWorkspace.tsx` | 294 → 287 行：改用共享 `focusStudentRow`，删除本地副本 |
| `src/lib/import-headers.ts` | 220 → 248 行：`/` 等分隔符纳入归一化、新增别名、新增 `EXACT_ONLY_ALIASES` 闸门 |
| `src/lib/import-data.ts` | `splitLines` 不再吃掉行首制表符（稀疏行列错位修复） |
| 4 个测试文件 | +10 用例（141 → 151） |

全部文件仍在 400 行以内。

## 1. 质量问题定位到被筛选掉的行（要求 1）

R2 的 `定位到名单` 在行被筛选掉时只回调选择、焦点不动 —— 用户看到的是「按钮点了没反应」。

筛选状态归 `DataWorkspace` 所有（本地 `filter`），质量栏是它的兄弟组件，所以**播报放在筛选的拥有者里**，
不需要新的路由/状态层，也没碰 `App.tsx`：

- `selectionHiddenByFilter`：选中 id 存在于 `students`、但不在 `filteredStudents` 里、且筛选词非空时，
  在筛选框和名单表之间渲染一行 `role="status"` 的提示
  `[data-filtered-selection="<studentId>"]`：「「林舟」不在当前筛选「浙江」的结果里，名单表没有显示这一行。」
- 提示自带 `[data-reveal-filtered-selection]` 按钮「清空筛选并显示」：`flushSync(() => setFilter(""))`
  之后再 `focusStudentRow(id)` —— 先把清空筛选后的那一帧刷到 DOM，焦点才不会落到还不存在的行上。
- 记录根本不在这份名单里（换了数据集）时不播报，行为与 R2 一致：只回调选择，焦点不动。
- `focusStudentRow` 从 `DataUploadWorkspace` 上移到 `data-workspace-fields.tsx`（该文件不导出组件，
  不会新增 `react-refresh` 警告），两个调用方共用同一份 `data-student-row` 查法，多接一个 `root` 参数
  以便把查询限定在名单面板内。

测试（4 条，其中 2 条端到端）：

- `announces a selected record the filter is hiding and reveals it on request`：筛选前无提示 → 输入「浙江」
  后 `student-1` 行消失且提示出现（含姓名与筛选词）→ 点「清空筛选并显示」→ 筛选框清空、行回到表里、
  `document.activeElement` 就是该行、提示消失。
- `keeps quiet when the filter still shows the selected record`：筛选词命中选中记录时不播报。
- `says the located row is hidden by the roster filter and brings it back`（`DataUploadWorkspace.test.tsx`）：
  新增 `LocateHarness` 模拟 App 壳持有 `selectedStudentId`，先筛选掉 `student-1`，再点质量栏
  `[data-locate-issue="unresolved-location:student-1"]`，断言提示出现 → 点恢复 → 行获得焦点。
- R2 的 `still reports the selection when the located record is filtered out of the table` 保持绿。

**反证**：`git stash push src/components/DataWorkspace.tsx` 后重跑，正是这 2 条新用例失败
（`2 failed | 55 passed`），恢复后全绿 —— 用例不是空断言。

## 2. 别名扩充与防抢列（要求 2）

### 归一化增加 `/ ／ \ 、 · .`

真实表头里最常见的两种写法此前完全没被识别，现在直接命中既有别名：
`省/直辖市` → `省直辖市`（province 已有别名）、`国内/海外` → `国内海外`（locationScope 已有别名）。
测试 `reads slash-separated headers because the slash is dropped like other decoration`。

### 新别名

| 字段 | 新增 |
| --- | --- |
| university | `工作单位`、`就业单位`、`单位`、`institution` |
| city | `所在市`、`目的地` |
| locationScope | `国内国外`、`境内境外`、`是否出国` |

就业类去向（`工作单位`）与「去向」同属 university 字段，与 R1 起就把 `去向` 当院校列的口径一致。

### 防抢列：`EXACT_ONLY_ALIASES`

`单位` / `工作单位` / `就业单位` / `目的地` 描述的范围比列本身大，若参与**子串**匹配，
`单位所在城市` 会被 university 抢走（fuzzy 阶段 university 在 city 之前）。因此新增一张
「只允许整格精确相等」的别名表，把这些词从 `FUZZY_HEADER_ALIASES` 里摘出去。R2 的 `生源地`
未动（它的子串路径已被 `城市` 以更高优先级覆盖）。

另外两道既有闸门继续生效：别名优先级（`录取院校` 排在 `工作单位` 前）与
「零精确匹配时至少模糊命中 3 列」。

测试 `maps an employer destination without letting 单位 claim a city column`：
`["姓名","工作单位","城市"]`、`["姓名","单位","所在市"]` 正常映射；
`["姓名","录取院校","单位所在城市"]` 与 `["姓名","录取院校","目的地城市"]` 的第三列归 city；
`["姓名","工作单位","录取院校","城市"]` 的 university 取 `录取院校`（index 2）。

## 3. 超宽表 / 重名表头（要求 3）

R1 的「一列只能被一个字段认领 + 同 rank 取最靠前」此前没有重名表头与超宽表的直接用例，现补：

- `gives a repeated header name to the first column that claims it`：
  `["姓名","姓名","院校","城市"]` → `{name:0, university:2, city:3}`，两列同名时第一列胜出；
  文本通路 `林舟,曾用名,北京大学,北京市` 取到的姓名是 `林舟`。
- `maps a very wide sheet by header instead of by position`：200 列噪声表头，学生列散落在
  3 / 97 / 150 / 151，按表头精确命中，不受位置影响。
- `keeps the first of two identically named columns on a very wide sheet`（XLSX 通路）：
  120 列、第 2 列与第 60 列都叫「城市」，`columnMappings` 的 city 落在 index 2，导入值为 `杭州市`。

## 4. 海外记录仍不要求省份（要求 4）

`candidateFromColumns` 的分支未动。新用例
`recognizes the overseas-or-not wordings and keeps the province optional there`
用新表头 `是否出国` 走一遍：`出国` 行产出 `locationScope: "international"` 且**不带** province
（即使源表填了 `马萨诸塞州`），`境内` 行保留 `浙江省` 且不带 locationScope。
R1/R2 的四条海外用例保持绿。

## 5. 不宣称图片 OCR

未改任何 OCR 文案与文件入口。R1 的三条断言（`只解析文本，不读取图片`、唯一 file input 的 accept
不含 `image`、无「图片识别/上传图片」字样）继续绿；本轮新增的提示只谈筛选与名单行，不承诺识别能力。

## 6. 验证（failure → cause → fix → recheck）

指定命令：

```
npx vitest run src/lib/import-data.test.ts src/lib/binary-import.test.ts src/lib/student-data.test.ts \
  src/lib/data-health.test.ts src/lib/data-duplicate.test.ts src/lib/data-workspace.test.ts \
  src/components/DataWorkspace.test.tsx src/components/workspaces/DataUploadWorkspace.test.tsx \
  src/components/DataOverview.test.tsx
```

- 基线（改动前）：9 files / **141** passed。
- 最终：9 files / **151** passed（+10）。
- 全量 `npx vitest run`：**174 files / 1452 passed 全绿**（含同轮其他代理的在途改动）；
  收尾时再跑一次为 **1483 passed 全绿**（用例数增长来自他人新增）。中间有一次出现
  `StudioAssistantRail.test.tsx` 等 2 条失败，是他人保存到一半的文件被同一次运行读到，
  下一次运行即恢复；本人 9 个套件在全过程中始终 151 passed。
- `npx eslint src/lib src/components`：0 error；5 条 `react-refresh` warning 全部在他人文件
  （`StudioMuiProvider`、`GlobalDataNavigation`、`app-initialization`）。
- `npx tsc -p tsconfig.app.json --noEmit`：本人文件 0 错误，见 6.3。

### 6.1 失败一：超宽表用例读不到省份（真实 bug）

1. **failure**：`maps a very wide sheet by header instead of by position` 断言 province 缺失 ——
   候选里只有 name/university/city。
2. **cause**：`splitLines` 对每行做 `line.trim()`。该行前 3 个单元格为空，制表符分隔时**行首制表符
   就是空的前导列**，被 trim 掉之后整行左移 3 位，按表头索引读取全部错位、`candidateFromColumns`
   返回 null，于是落到位置解析兜底（`splitParts` 会丢掉空单元格），凑出了一条**没有省份**的候选 ——
   数据被悄悄改写而不是报错。更坏的形态是错位后仍能凑齐三个必填格：那会把院校名当成学生姓名导入。
   这是从 Excel 复制「首列留空」区域粘贴时的真实数据损坏，不是用例写错。
3. **fix**：`line.replace(/^[^\S\t]+|\s+$/g, "")` —— 行首只去空格/全角空格，保留制表符；行尾照旧全去
   （尾部空列本来就无意义）。
4. **recheck**：`npx vitest run src/lib/import-data.test.ts src/lib/binary-import.test.ts` → 51 passed；
   并把「错位后仍能凑齐」这一更坏形态固化为独立用例
   `keeps an empty leading column of a tab-separated row aligned`
   （`学号\t姓名\t院校\t城市\t省份` + `\t林舟\t北京大学\t北京市\t北京市`，错位时 name 会读成
   `北京大学`）。反证：`git stash push src/lib/import-data.ts` 后这两条用例双双失败，恢复后 37 passed。

### 6.2 失败二：effect 里 setState 触发 lint error

1. **failure**：`npx eslint` 报 `react-hooks/set-state-in-effect`（`DataWorkspace.tsx:115`）—— 我最初用
   「pendingRevealId 状态 + useEffect 里聚焦并清空该状态」把焦点推迟到清空筛选后的那一帧。
2. **cause**：effect 里同步 `setState` 会引发级联渲染，React 19 的 hooks 规则直接判 error；
   而且这条链路本来就不需要状态 —— 它是一次性的事件后续动作，不是与外部系统同步。
3. **fix**：删掉状态与 effect，改为事件处理器里 `flushSync(() => setFilter(""))` 后立即
   `focusStudentRow(id, rosterRef.current ?? document)`，语义更直白且焦点时机确定。
4. **recheck**：`npx eslint src/lib src/components` → 0 error；两条播报用例仍绿，且未出现
   React 的 flushSync 警告（`--reporter=verbose` 下 grep `warn|error|flushSync` 无输出）。

### 6.3 不属于本人范围的失败

`npx tsc -p tsconfig.app.json --noEmit` 期间观察到两批错误，均来自同轮其他代理的在途改动，
本人文件（`import-*`、`binary-import`、`student-data`、`data-*`、`DataWorkspace*`、`DataUpload*`、
`DataQualityPanel`、`DataOverview`）0 错误：

- `src/lib/card-layout.ts(105): Cannot find name 'CardLayoutStatus'`（`git diff` 显示该文件有 112 行在途
  新增，`card-layout` 在我的 FORBIDDEN 列表内）。
- 稍后一次运行变成 `src/lib/studio-editor-helpers.ts` 的 4 条未使用导入错误（同样是他人在途编辑，
  错误集合随他们的保存而变化）。

全量 vitest 全绿，说明这些是纯类型层面的在途状态。

## 7. 交付与回滚

- **验收方式**：PR + CI 跑上面的指定命令。人工验收路径：
  1. 「数据与素材」→ 名单筛选框输入一个**不匹配某条问题记录**的词 → 右栏「数据质量」点该记录的
     「定位到名单」→ 名单区出现「…不在当前筛选…的结果里」提示 → 点「清空筛选并显示」→
     该行回到表内并获得焦点（键盘可继续操作）。
  2. 上传表头写成 `省/直辖市`、`国内/海外`、`工作单位` 的 xlsx → 三列都应被正确识别。
  3. 从 Excel 复制首列留空的区域粘贴 → 各列不再整体左移。
- **破坏性变更与回滚**：
  - 无 API 形状变更：`focusStudentRow` 只是换了导出位置（原本是模块私有函数），
    `normalizeHeaderCell` / `detectHeaderColumns` / `parseStudentText` 签名不变。
  - 行为语义变化三处，都只影响识别结果、不改导出格式与持久化：
    ① 含 `/ 、 · .` 的表头现在会被归一化后匹配（此前多数落空，属净增识别）；
    ② 新增 university/city/locationScope 别名（`单位` 系与 `目的地` 仅整格精确匹配）；
    ③ 行首制表符不再被吞（此前是错列，属修复）。
    以上没有任何一条会让**原本能识别的表头**变得不能识别，指定命令与全量测试均可佐证。
  - 无数据迁移、无 IndexedDB 结构变更、xlsx 模板未动。
  - **回滚**：`git checkout <base> -- src/lib/import-headers.ts src/lib/import-data.ts
    src/components/DataWorkspace.tsx src/components/data-workspace-fields.tsx
    src/components/workspaces/DataUploadWorkspace.tsx src/lib/import-data.test.ts
    src/lib/binary-import.test.ts src/components/DataWorkspace.test.tsx
    src/components/workspaces/DataUploadWorkspace.test.tsx` 即可完整回退。

## 8. 留给下一轮

- CSV 引号内换行（跨行单元格）仍未支持：`splitLines` 先按行切（R2 已记录）。
- 隐藏记录（`visibility: false`）目前仍会在表里渲染，因此不需要播报；若以后名单表改成「隐藏即不渲染」，
  播报条件要同步加上 visibility 分支。
- `DeliveryWorkspace` / `stage-overview` 仍各自拼 issue key，可在其 owner 轮次改用 `resolveDataIssueId`。
- 表头识别只在文本通路的**第一行**、XLSX 通路的**前 8 行**里找；多表头（分组表头两行）尚未处理。
