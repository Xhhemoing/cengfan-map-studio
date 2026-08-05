# 数据导入工作台与编辑浮层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有全局数据工作台中加入 XLSX 模板下载、可解释的表头/样例识别，并修复表格编辑下拉层裁剪。

**Architecture:** 继续以 `ProjectDocument.students` 为唯一数据源。纯函数负责 Excel 矩阵的表头定位、字段映射和代表值提取；`DataWorkspace` 只负责调用 XLSX、展示识别摘要并复用现有候选确认。`SearchCombobox` 通过可选 portal 模式把表格编辑浮层挂到 `document.body`，不改变普通表单的定位方式。

**Tech Stack:** React 19, TypeScript, Vitest, jsdom, Vite, `xlsx`, `lucide-react`, 现有 CSS token 和 `DataWorkspace` 组件模式。

## Global Constraints

- 保留工作区已有未提交改动，不执行 reset、checkout、clean 或覆盖用户文件。
- 不引入新的学生状态模型；导入结果必须继续进入 `confirmImportCandidates` 和现有 `ProjectDocument` 事务。
- 所有生产行为变更先有失败测试，再写最小实现。
- 当前会话不创建 commit；只验证工作区差异并汇报。
- Windows PowerShell 下直接调用 `node_modules/.bin/vitest.cmd`、`tsc.cmd`、`vite.cmd`、`eslint.cmd`，避免 Bash 包装脚本的兼容性问题。

---

### Task 1: Excel 表头识别纯函数

**Files:**
- Modify: `src/lib/binary-import.ts`
- Modify: `src/lib/binary-import.test.ts`
- Read: `src/lib/import-data.ts`, `src/lib/data-workspace.ts`

**Interfaces:**
- Consumes: `string[][]` 的 XLSX 工作表矩阵。
- Produces: `parseExcelWorkbookRows(rows)` 返回既有 `candidates`/`unparsed`，并新增 `headerRowIndex` 和 `columnMappings`；每个映射包含规范字段、原始表头和最多两个代表值。

- [ ] **Step 1: Write the failing tests**

增加两个测试：表头在前置说明行之后且列顺序打乱时，断言 `headerRowIndex`、`columnMappings`、候选记录和 `locationScope`；使用“录取学校/所在城市/学生姓名”别名时，断言代表值来自正确列。

```ts
const result = parseExcelWorkbookRows([
  ["这是填写说明"],
  ["更新时间", "2026"],
  ["所在城市", "录取学校", "学生姓名", "去向类型", "备注"],
  ["杭州市", "浙江大学", "苏禾", "中国去向", "保研"],
]);

expect(result.headerRowIndex).toBe(2);
expect(result.columnMappings).toEqual(expect.arrayContaining([
  expect.objectContaining({ field: "name", sourceHeader: "学生姓名", samples: ["苏禾"] }),
  expect.objectContaining({ field: "city", sourceHeader: "所在城市", samples: ["杭州市"] }),
]));
expect(result.candidates[0]).toMatchObject({ name: "苏禾", university: "浙江大学", city: "杭州市" });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest.cmd run src/lib/binary-import.test.ts`

Expected: FAIL because the result has no header metadata and only checks row zero.

- [ ] **Step 3: Implement the minimal parser change**

Export the field type and mapping type. Normalize header aliases, scan the first eight non-empty rows, score recognized fields, select the best row, parse required columns, optionally parse `locationScope`, and collect the first two non-empty values per mapped field. Preserve the existing text fallback and candidate line numbering.

- [ ] **Step 4: Run the focused parser tests**

Run: `node_modules/.bin/vitest.cmd run src/lib/binary-import.test.ts src/lib/import-data.test.ts`

Expected: PASS with all existing parser cases retained.

---

### Task 2: XLSX 模板下载与识别摘要

**Files:**
- Modify: `src/components/DataWorkspace.tsx`
- Modify: `src/components/DataWorkspace.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `parseExcelWorkbookRows` metadata and existing lazy `xlsx` import.
- Produces: an accessible download action and an Excel-only recognition summary before candidate review.

- [ ] **Step 1: Write the failing component tests**

Add a test that clicks `button[aria-label="下载学生数据 XLSX 模板"]`, stubs the browser download boundary, and asserts `XLSX.writeFile` receives a workbook whose first sheet starts with `学生姓名`, `录取院校`, `城市`, `去向类型` and whose second sheet contains `填写说明`.

Add a test that supplies an Excel file through `#data-excel-upload`, waits for parsing, and asserts the rendered summary contains `学生姓名`、`苏禾`、`录取学校` and `未使用` for an unmapped `备注` column.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest.cmd run src/components/DataWorkspace.test.tsx`

Expected: FAIL because there is no template action, no recognition summary state, and the parser metadata is not rendered.

- [ ] **Step 3: Implement template generation**

Add `downloadImportTemplate` in `DataWorkspace` using the existing dynamic `xlsx` import. Create `学生数据` and `填写说明` sheets with canonical headers, required flags, and representative examples. Wire a `Download` icon button next to the existing Excel dropzone and set `download`-appropriate accessible labeling.

- [ ] **Step 4: Implement recognition state and rendering**

Store the latest Excel recognition metadata separately from `reviewRows`; clear it for text/OCR/AI flows and new failed imports. Pass the parser metadata into a compact `.import-recognition` section showing source header, canonical field, and samples. Render missing required fields as a warning and unmapped headers as `未使用`.

- [ ] **Step 5: Run the focused UI tests**

Run: `node_modules/.bin/vitest.cmd run src/components/DataWorkspace.test.tsx src/lib/binary-import.test.ts`

Expected: PASS with no duplicate import action and existing editing/visibility tests intact.

---

### Task 3: Portal 下拉浮层

**Files:**
- Modify: `src/components/SearchCombobox.tsx`
- Modify: `src/components/SearchCombobox.test.tsx`
- Modify: `src/components/DataWorkspace.tsx`
- Modify: `src/components/DataWorkspace.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: existing combobox keyboard and option selection behavior.
- Produces: `portal?: boolean` on `SearchCombobox`; table edit city/province fields use `portal` while draft form remains inline.

- [ ] **Step 1: Write the failing tests**

Add a `portal` combobox test that focuses the input and asserts the listbox is a child of `document.body`, not the combobox wrapper. Add a `DataWorkspace` regression test that opens a row edit and asserts the edit city listbox has the portal class/attribute while the draft city list remains inline.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest.cmd run src/components/SearchCombobox.test.tsx src/components/DataWorkspace.test.tsx`

Expected: FAIL because the listbox is currently rendered under `.search-combobox` with absolute positioning.

- [ ] **Step 3: Implement the minimal portal positioning**

Use `createPortal` only when `portal` is true. Measure the input in a layout effect, render fixed coordinates with the input width, cap the list height to the available viewport, and recompute on scroll/resize. Keep existing delayed blur and keyboard selection behavior. Remove the portal node cleanly when closed or unmounted.

- [ ] **Step 4: Wire table editors and style the layer**

Set `portal` on the edit city/province comboboxes only. Add `.search-combobox__list--portal` with a high local editor z-index, shadow, and fixed-position compatibility; do not change `.data-table-wrap` overflow.

- [ ] **Step 5: Run the focused interaction tests**

Run: `node_modules/.bin/vitest.cmd run src/components/SearchCombobox.test.tsx src/components/DataWorkspace.test.tsx`

Expected: PASS, including ArrowDown/Enter/Escape and row editing regressions.

---

### Task 4: Verification and review

**Files:**
- Read: all changed source/tests/docs files
- Modify: only files required by verified failures

- [ ] **Step 1: Run the full Vitest suite**

Run: `node_modules/.bin/vitest.cmd run`

Expected: exit code 0 with zero failed tests.

- [ ] **Step 2: Run TypeScript and build checks**

Run: `node_modules/.bin/tsc.cmd -b` and `node_modules/.bin/vite.cmd build`

Expected: both commands exit 0.

- [ ] **Step 3: Run ESLint**

Run: `node_modules/.bin/eslint.cmd .`

Expected: exit code 0 with no new errors.

- [ ] **Step 4: Run the Impeccable detector on changed UI files**

Run: `node C:\Users\86080\.agents\skills\impeccable\scripts\detect.mjs --json src/components/DataWorkspace.tsx src/components/SearchCombobox.tsx src/styles.css`

Expected: no unresolved high-severity findings.

- [ ] **Step 5: Start the dev server and verify the user flow in a browser**

Run the repository dev server on an available port. Open the roster workbench, verify the template action exists, inspect a loaded recognition summary, open a row editor near the bottom of the scrollable table, and verify the city/province options render outside the table container without clipping. Capture a screenshot and check the browser console for errors.

- [ ] **Step 6: Request an independent code review**

Review the current worktree diff against the approved specification. Fix Critical/Important findings, then rerun the relevant verification commands. Do not commit or modify unrelated existing changes.
