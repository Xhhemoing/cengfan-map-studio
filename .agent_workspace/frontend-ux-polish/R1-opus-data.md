[Model: claude-opus-5-thinking-high-fast]
round: R1
role: implement
scope: 名单导入 / DataWorkspace / 数据质量（提案 only，未落盘业务代码）

---

## done

只读扫描 + 基线验证，产出 6 条可直接落地的 unified diff 草稿（P0×3 / P1×3）与 1 条 ASK。

扫过的实现：`src/components/DataWorkspace.tsx`、`DataOverview.tsx`、`DataImportConsent.tsx`、`DataMessageRegions.tsx`、`FileDropzone.tsx`、`src/components/workspaces/DataUploadWorkspace.tsx`、`src/lib/import-data.ts`、`src/lib/binary-import.ts`、`src/lib/import-message.ts`、`src/lib/data-health.ts`、`src/lib/student-data.ts`、`src/lib/search-catalog.ts`、`src/styles.css`（导入/名单段）。

扫过的测试：`DataWorkspace.{test,import-recognition,import-fidelity,live-regions,roster-actions}.tsx`、`FileDropzone.test.tsx`、`DataOverview.test.tsx`、`DataImportConsent.test.tsx`、`workspaces/DataUploadWorkspace.{test,template-download}.tsx`、`lib/import-data.test.ts`、`lib/import-message.test.ts`、`server/styles.test.ts`、`data-workspace-test-harness.tsx`。

## 本轮四条命题的结论（先回答问题，再给 diff）

| 命题 | 结论 |
|---|---|
| 模板下载入口是否置顶 | **否**。按钮在 `import-box` 的 `.file-import-row` 里、且排在「导入 Excel」拖放区**之后**，整块受 `showImport` 折叠控制。名单阶段 `compactRosterControls=true` → `showImport` 初值 `false`，用户必须先点「展开导入 / OCR / Excel」才看得见模板。`DataUploadWorkspace.template-download.test.tsx` 的 `expandImport()` 前置动作即是这一事实的现成证据。违反 `docs/产品/市场化与实用化优化.md` §4 P1「导入页置顶「下载 Excel 模板」」。→ **P0-1** |
| 失败文案是否大白话 | **部分不是，且有一条路由缺陷**。`isImportFailureMessage()` 按关键词 `失败/没有/请先/不能为空/校验问题/无法` 判定，而「文件过大，Excel / CSV 最大支持 25 MB」和「解析超时，文件可能已损坏」**一个关键词都不含**，被判为成功，进 `role="status"`(polite) 而非 `role="alert"`。读屏用户在最需要被打断的两种阻断上反而只拿到轻声播报。→ **P1-4** |
| 表头识别失败 UX | **只报术语，不给修法**。缺必填列时全表进 `unparsed`，面板里只有一行 `缺少必填列：城市`，`.import-recognition__warning` 在 `src/styles.css` 里**完全没有样式**（整个 `.import-recognition__*` / `.import-unparsed__*` 命名空间只有第 338 行一条 grid-column 覆盖），顶部消息仍是通用的「没有从 Excel（…）识别到可导入数据」。用户不知道「城市」这一列该怎么补、也不知道 `所在城市` 同样认得。→ **P0-3** |
| 粘贴「姓名 学校 省份」 | **入口在、语义不在**。`textarea` + 「识别文本 / 智能识别 / OCR / 一键识别并导入」四个按钮都在，但 `parseStudentText()` → `toCandidate()` 把第 3 个字段**固定当城市**，`resolveCity("浙江省")` 在 `cityResolutionIndex`（只收城市名、别名、简称与「省+市」复合）里查不到 → `status: "unresolved"`，这一行进名单但落不到地图上，且没有任何「你填的像省份」的提示。按 brief 要求列为 **ASK**，不作本轮 P0。 |

## 无障碍两条（本轮最硬的发现）

- **`FileDropzone` 键盘完全不可达。** `<input type="file" hidden>` → `display:none` → 不可聚焦；`<label>` 本身也不可聚焦。`src/styles.css:635` 已经写了 `.file-dropzone:focus-within { outline… }`，说明原意就是要能聚焦，只是被 `hidden` 废掉了。同仓已有正确范式：`WorkbenchHeader.tsx:25` 的 `.workbench-file-input`（`position:absolute; 1px; clip-path: inset(50%)`）。`FileDropzone` 有 6 处调用方（Excel 导入、素材上传、地图图片、省份贴图、画布背景、字体），一处修复全部受益。→ **P0-2**
- **名单表格键盘不可达。** `<tr onClick>` / `onDoubleClick` 没有 `tabIndex`、没有 `onKeyDown`，选中行与进入编辑都只能用鼠标；也没有 `aria-current` 表达当前选中行。违反 `frontUI2.md` §10.1「Enter/Space 激活」与 §10.2「打开全屏名单后，焦点进入搜索或首个错误」。→ **P1-6**

---

## tests（本轮只读跑过，全绿，作为改动前基线）

```
npx vitest run src/components/DataWorkspace.test.tsx \
  src/components/DataWorkspace.import-recognition.test.tsx \
  src/components/DataWorkspace.import-fidelity.test.tsx \
  src/components/DataWorkspace.live-regions.test.tsx \
  src/components/DataWorkspace.roster-actions.test.tsx \
  src/components/FileDropzone.test.tsx \
  src/components/DataOverview.test.tsx \
  src/components/DataImportConsent.test.tsx \
  src/components/workspaces/DataUploadWorkspace.test.tsx \
  src/components/workspaces/DataUploadWorkspace.template-download.test.tsx \
  src/lib/import-data.test.ts src/lib/import-message.test.ts
→ Test Files 12 passed (12) / Tests 97 passed (97) / 4.53s

npm run lint
→ ✖ 5 problems (0 errors, 5 warnings)（既有：DataImportConsent 与 ReferenceCardVisual 的 react-refresh、DataWorkspace:238 exhaustive-deps）
```

完整输出留档：`/opt/cursor/artifacts/r1-opus-data-baseline.log`。

**验证纪律（failure → cause → fix → recheck）**：第一次录制证据时给 vitest 加了 `--reporter=basic`，报 `Failed to load custom Reporter from basic`。根因是 Vitest 4 已移除 `basic` 内置 reporter，参数被当成自定义 reporter 模块路径去 resolve。修法是去掉该参数（本来就不需要），复跑同一条命令 → 12 files / 97 tests 全绿。另：首跑 lint 曾多报一条 `src/lib/zz-probe.test.ts` 的「冗余 eslint-disable」，该文件是未纳入 git 的临时探针，复跑时已不存在，两次的 `0 errors` 结论一致。

落地方必须复跑这两条并保持 `0 errors`、97 → 97+新增 全绿。

**测试草稿的 import 前置**：下文各条的测试草稿用了 `data-workspace-test-harness.tsx` 里现成的 `renderWorkspace` / `dropFile` / `fileWithBytes` / `workbookBytes` / `settle`，但 `DataWorkspace.import-recognition.test.tsx` 与 `DataWorkspace.roster-actions.test.tsx` 目前只 import 了 `render / click / changeInput / getInput / students`。落地时按需补 import，不要新造 helper。

---

# P0

## P0-1 · 模板下载置顶、常驻，不再被折叠面板挡住

**根因**：模板按钮生存在 `showImport &&` 之内，且在 `.file-import-row` 的第二格。名单阶段默认折叠，等于「先下载模板」这条最省事的路径默认不可见。

```diff
--- a/src/components/DataWorkspace.tsx
+++ b/src/components/DataWorkspace.tsx
@@
       <div className="import-box">
+        {!hideTemplateDownload && (
+          // 「先下载模板照着填」是最省事的一条路，不能藏在折叠面板里：
+          // 名单阶段 compactRosterControls 让导入区默认收起，模板入口必须活在收起之外。
+          <div className="import-box__template">
+            <CompactButton
+              variant="secondary"
+              aria-label="下载学生数据 XLSX 模板"
+              icon={<Download size={16} aria-hidden />}
+              onClick={() => { void downloadImportTemplate(); }}
+            >
+              下载 XLSX 模板
+            </CompactButton>
+            <span className="import-box__template-hint">没有现成表格？下载模板照着填，再上传最省事。</span>
+          </div>
+        )}
         <button
           type="button"
           className="wide-button secondary import-toggle"
           aria-label={showImport ? "收起导入名单" : "展开导入名单"}
           aria-expanded={showImport}
           onClick={() => setShowImport((current) => !current)}
         >
           {showImport ? "收起导入" : "展开导入 / OCR / Excel"}
         </button>
@@
             <div className="file-import-row">
               <FileDropzone
                 id="data-excel-upload"
                 label="导入 Excel"
                 hint="XLSX / CSV · 最大 25 MB"
                 accept=".xlsx,.xls,.csv"
                 variant="secondary"
                 icon={<FileUp size={16} aria-hidden />}
                 onFile={(file) => { void handleExcelFile(file); }}
               />
-              {!hideTemplateDownload && <CompactButton
-                variant="secondary"
-                aria-label="下载学生数据 XLSX 模板"
-                icon={<Download size={16} aria-hidden />}
-                onClick={() => { void downloadImportTemplate(); }}
-              >
-                下载 XLSX 模板
-              </CompactButton>}
             </div>
```

```diff
--- a/src/styles.css
+++ b/src/styles.css
@@
-.file-import-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
+.file-import-row { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin-top: 8px; }
+.import-box__template { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
+.import-box__template-hint { color: #7a8b99; font-size: 11px; line-height: 1.4; }
 .data-workspace .file-import-row .wide-button { font-size: 11px; }
@@
 .data-upload-workspace--expanded .import-box > :not(.import-toggle) { margin-top: 8px; }
+.data-upload-workspace--expanded .import-box > .import-box__template:first-child { margin-top: 0; }
```

**兼容性**：`aria-label="下载学生数据 XLSX 模板"` 原样保留 → `DataWorkspace.import-recognition.test.tsx`、`live-regions.test.tsx`、`DataUploadWorkspace.template-download.test.tsx` 三处选择器不动即可通过（`template-download` 里的 `expandImport()` 变成多余但无害，建议顺手删掉那一行以固化「不展开也能下载」）。`hideTemplateDownload=true` 分支行为不变。`.file-import-row` 只此一处使用；`server/styles.test.ts` 未断言该选择器。

**Given/When/Then**

- Given 名单阶段刚打开、导入区处于折叠态（`compactRosterControls`，未点「展开导入 / OCR / Excel」），
  When 用户扫视导入区，
  Then「下载 XLSX 模板」按钮与「下载模板照着填」提示语可见可点，点击后 `role="status"` 播报「已下载学生数据导入模板」。
- Given 调用方传 `hideTemplateDownload`，
  When 渲染，
  Then 页面上不存在任何 `aria-label="下载学生数据 XLSX 模板"` 的按钮（展开与否都不存在）。

**新增测试草稿**（追加到 `workspaces/DataUploadWorkspace.template-download.test.tsx`）

```tsx
  it("keeps the template download reachable before the import section is expanded", () => {
    const container = render();
    // 不调用 expandImport：模板入口必须活在折叠之外
    expect(container.querySelector<HTMLButtonElement>(TEMPLATE_BUTTON)).not.toBeNull();
    expect(container.querySelector('button[aria-label="展开导入名单"]')).not.toBeNull();
  });
```

---

## P0-2 · `FileDropzone` 恢复键盘可达（`hidden` → 可聚焦的视觉隐藏）

**根因**：`hidden` 属性让 `<input type="file">` 退出焦点序与无障碍树，`label` 又不可聚焦，整个控件只能用鼠标点/拖。现有 `:focus-within` 样式因此永远不触发。

```diff
--- a/src/components/FileDropzone.tsx
+++ b/src/components/FileDropzone.tsx
@@
         <input
           ref={inputRef}
           id={inputId}
           type="file"
           accept={accept}
-          hidden
+          // 用视觉隐藏而不是 hidden：hidden 会把 input 踢出焦点序，
+          // 整个拖放区就只剩鼠标可用，:focus-within 的焦点环也永远不会亮。
+          className="file-dropzone__input"
           disabled={inactive}
           onChange={(event) => {
             emitFile(event.target.files?.[0]);
             clearInput();
           }}
         />
```

```diff
--- a/src/styles.css
+++ b/src/styles.css
@@
 .file-dropzone {
   display: flex;
+  position: relative;
   align-items: center;
   gap: 10px;
@@
 .file-dropzone:focus-within {
   outline: 2px solid #7db5a9;
   outline-offset: 2px;
 }
+.file-dropzone__input {
+  position: absolute;
+  width: 1px;
+  height: 1px;
+  padding: 0;
+  margin: -1px;
+  overflow: hidden;
+  clip-path: inset(50%);
+  white-space: nowrap;
+  border: 0;
+}
```

**兼容性**：与 `WorkbenchHeader.tsx` 的 `.workbench-file-input` 同一范式。`FileDropzone.test.tsx` 现有四例（drop 接收、accept 拒绝、change 后清空 `value`、disabled）均不依赖 `hidden`。可及面覆盖 6 个调用方（`DataWorkspace`、`AssetPanel`、`MapInspector`、`CanvasInspector`、`ProvinceInspector`、`TypographyPanel`）。副作用（正向）：input 回到无障碍树后，读屏会用 `label` 的「导入 Excel / XLSX / CSV · 最大 25 MB」作为可访问名，原先 `hidden` 时这段文字对 AT 是不可见的。

**Given/When/Then**

- Given 名单导入区展开、焦点在「识别 OCR 文本」上，
  When 用户按 Tab，
  Then 焦点落到「导入 Excel」的 file input 上，`.file-dropzone` 因 `:focus-within` 显示焦点环；按 Enter/Space 打开系统选文件对话框。
- Given `disabled`/`busy`，
  When 用户 Tab，
  Then input 因 `disabled` 被跳过，焦点不会停在一个点不动的控件上。

**新增测试草稿**（追加到 `FileDropzone.test.tsx`）

```tsx
  it("keeps the file input focusable so the dropzone is reachable by keyboard", () => {
    const { container } = renderDropzone();
    const input = container.querySelector<HTMLInputElement>("#test-upload")!;

    expect(input.hidden).toBe(false);
    expect(input.className).toContain("file-dropzone__input");
    input.focus();
    expect(document.activeElement).toBe(input);
    expect(container.querySelector("[data-file-dropzone]")!.contains(document.activeElement)).toBe(true);
  });
```

---

## P0-3 · 表头识别失败说大白话：缺哪一列、怎么补、认哪些写法

**根因**：缺必填列时用户拿到两句术语（「没有从 Excel 识别到可导入数据」＋「缺少必填列：城市」），既不知道 `所在城市` 也认，也没有一步可点的修法。

```diff
--- a/src/lib/binary-import.ts
+++ b/src/lib/binary-import.ts
@@
-function describeColumns(fields: readonly StudentColumn[]): string {
+/** 面板与提示里点名列时统一走这里，标签口径与 XLSX 模板表头一致。 */
+export function describeStudentColumns(fields: readonly StudentColumn[]): string {
   return fields.map((field) => STUDENT_COLUMN_LABELS[field]).join("、");
 }
+
+/**
+ * 缺列提示里回显「还认得哪些写法」。只列中文别名：
+ * 英文表头对班委没有参考价值，列出来反而把提示撑长。
+ */
+export function describeHeaderAliases(field: StudentColumn): string {
+  return HEADER_ALIASES[field].filter((alias) => /[\u4e00-\u9fa5]/.test(alias)).join(" / ");
+}
@@
-    const reason = `${MISSING_HEADER_COLUMNS_REASON}：${describeColumns(metadata.missingRequiredFields)}`;
+    const reason = `${MISSING_HEADER_COLUMNS_REASON}：${describeStudentColumns(metadata.missingRequiredFields)}`;
@@
-      unparsed.push({ sourceLine, rawLine, reason: `${MISSING_ROW_FIELDS_REASON}：${describeColumns(missing)}` });
+      unparsed.push({ sourceLine, rawLine, reason: `${MISSING_ROW_FIELDS_REASON}：${describeStudentColumns(missing)}` });
```

```diff
--- a/src/components/DataWorkspace.tsx
+++ b/src/components/DataWorkspace.tsx
@@
 import {
   createImportTemplateSheets,
+  describeHeaderAliases,
+  describeStudentColumns,
   isCsvFile,
   parseOcrLikeText,
   STUDENT_COLUMN_LABELS,
   type ExcelImportResult,
 } from "../lib/binary-import";
@@
     const droppedNote = unparsed.length ? `，另有 ${unparsed.length} 行未识别` : "";
+    const missingColumns = recognition?.missingRequiredFields ?? [];
     if (candidates.length === 0) {
-      setMessage(`没有从${sourceLabel}识别到可导入数据${droppedNote}${note}`);
+      // 缺列是整表读空里最常见也最好修的一种，直接点名缺哪一列，
+      // 别让人从「未识别」四个字里猜自己的表哪儿不对。
+      setMessage(missingColumns.length > 0
+        ? `这张表里没有「${describeStudentColumns(missingColumns)}」这一列，所以一个人都没导进来。补上这一列，或下载模板照着填再上传。`
+        : `没有从${sourceLabel}识别到可导入数据${droppedNote}${note}`);
       setReviewRows([]);
       return;
     }
@@
           {excelRecognition.unmappedHeaders.length > 0 && (
-            <p className="import-recognition__note">未使用：{excelRecognition.unmappedHeaders.join("、")}</p>
+            <p className="import-recognition__note">这些列没用上：{excelRecognition.unmappedHeaders.join("、")}</p>
           )}
           {excelRecognition.missingRequiredFields.length > 0 && (
-            <p className="import-recognition__warning">缺少必填列：{excelRecognition.missingRequiredFields.map((field) => STUDENT_COLUMN_LABELS[field]).join("、")}</p>
+            <div className="import-recognition__warning">
+              <p className="import-recognition__warning-title">
+                这张表里没有「{describeStudentColumns(excelRecognition.missingRequiredFields)}」这一列，所以一个人都没导进来。
+              </p>
+              <ul className="import-recognition__warning-fixes">
+                {excelRecognition.missingRequiredFields.map((field) => (
+                  <li key={field}>
+                    把某一列的表头改成「{STUDENT_COLUMN_LABELS[field]}」就行；写成 {describeHeaderAliases(field)} 也认得。
+                  </li>
+                ))}
+              </ul>
+              {!hideTemplateDownload && (
+                <CompactButton
+                  variant="secondary"
+                  aria-label="下载 XLSX 模板重新整理表格"
+                  icon={<Download size={14} aria-hidden />}
+                  onClick={() => { void downloadImportTemplate(); }}
+                >
+                  下载模板重新整理
+                </CompactButton>
+              )}
+            </div>
           )}
```

```diff
--- a/src/styles.css
+++ b/src/styles.css
@@
 .data-upload-workspace--expanded .import-recognition,
 .data-upload-workspace--expanded .import-review { grid-column: 1 / -1; order: 4; }
+/* 识别面板此前只有 grid-column 覆盖，正文一直是浏览器默认样式。 */
+.import-recognition__note { margin: 6px 0 0; color: #7a8b99; font-size: 11px; line-height: 1.5; }
+.import-recognition__warning { display: grid; gap: 6px; margin-top: 8px; padding: 10px; color: #9c4a3c; background: #fdf3ef; border: 1px solid #e9c9bd; border-radius: 6px; }
+.import-recognition__warning-title { margin: 0; font-size: 12px; font-weight: 700; line-height: 1.5; }
+.import-recognition__warning-fixes { margin: 0; padding-left: 18px; font-size: 11px; line-height: 1.6; }
+.import-recognition__warning .compact-button { justify-self: start; }
```

**兼容性**：`import-recognition.test.tsx` 只断言 `.import-recognition` 里含「学生姓名 / 苏禾 / 录取学校 / 未使用」——**「未使用」这四个字被本 diff 改成了「这些列没用上」**，同步把该断言改成 `toContain("没用上")`（这是本轮唯一一处必须同步修改的既有断言，落地时不要漏）。新消息含关键词「没有」→ 仍正确路由到 `role="alert"`。第二个模板按钮用了区分性的 `aria-label`，不会撞上 `querySelector('button[aria-label="下载学生数据 XLSX 模板"]')`。

**Given/When/Then**

- Given 一张表头为「学生姓名 / 录取院校 / 备注」（缺城市列）的 xlsx，
  When 用户拖进「导入 Excel」，
  Then `role="alert"` 播报「这张表里没有「城市」这一列，所以一个人都没导进来。补上这一列，或下载模板照着填再上传。」，识别面板出现红底块，写明「把某一列的表头改成「城市」就行；写成 城市 / 所在城市 / 目的地城市 也认得。」，并给出「下载模板重新整理」按钮。
- Given 同一张表，
  When 用户点「下载模板重新整理」，
  Then 触发与顶部模板入口相同的 `downloadImportTemplate()`，`role="status"` 播报「已下载学生数据导入模板」。

**新增测试草稿**

```tsx
// src/components/DataWorkspace.import-recognition.test.tsx
  it("explains a missing required column in plain language and offers the template", async () => {
    const container = renderWorkspace();
    dropFile(container, fileWithBytes("缺城市.xlsx", () => workbookBytes([
      { name: "学生数据", rows: [["学生姓名", "录取院校", "备注"], ["苏禾", "浙江大学", "保研"]] },
    ])));
    await settle();

    const warning = container.querySelector(".import-recognition__warning")!;
    expect(warning.textContent).toContain("没有「城市」这一列");
    expect(warning.textContent).toContain("所在城市");
    expect(container.querySelector('[role="alert"]')!.textContent).toContain("一个人都没导进来");
    expect(warning.querySelector('button[aria-label="下载 XLSX 模板重新整理表格"]')).not.toBeNull();
  });
```

```ts
// src/lib/binary-import.adapters.test.ts
  it("lists only the Chinese header aliases for the missing-column hint", () => {
    expect(describeHeaderAliases("city")).toBe("城市 / 所在城市 / 目的地城市");
    expect(describeStudentColumns(["name", "city"])).toBe("学生姓名、城市");
  });
```

---

# P1

## P1-4 · 两条阻断消息进 `role="alert"`，并改成人话

**根因**：`isImportFailureMessage()` 的关键词表漏掉了体积超限与解析超时这两类，两条最需要打断的消息落进了 polite 区。

```diff
--- a/src/lib/import-message.ts
+++ b/src/lib/import-message.ts
@@
-const FAILURE_MARKERS = ["失败", "没有", "请先", "不能为空", "校验问题", "无法"] as const;
+const FAILURE_MARKERS = [
+  "失败", "没有", "请先", "不能为空", "校验问题", "无法",
+  // 体积超限与解析超时同样是阻断：漏了这几个词，最该打断人的两条消息只会被轻声念过去。
+  "过大", "超时", "损坏", "不支持",
+] as const;
```

```diff
--- a/src/components/DataWorkspace.tsx
+++ b/src/components/DataWorkspace.tsx
@@
         deadlineTimer = setTimeout(() => {
           terminateWorkbookWorker(worker);
-          rejectOnce(new Error("解析超时，文件可能已损坏"));
+          rejectOnce(new Error("解析超时：等了 30 秒还没读完，这个文件可能已损坏。用 Excel / WPS 重新另存一份 .xlsx 再试。"));
         }, WORKBOOK_PARSE_DEADLINE_MS);
@@
     if (file.size > MAX_WORKBOOK_FILE_BYTES) {
-      setMessage("文件过大，Excel / CSV 最大支持 25 MB");
+      setMessage("文件过大：Excel / CSV 最多 25 MB。删掉表里无关的工作表和图片后另存一份，再上传。");
       return;
     }
```

**兼容性**：`import-message.test.ts` 只覆盖既有关键词，新增词不影响；需确认没有成功消息含新词——现有成功消息为「已下载…」「已新增…」「已更新…」「已追加/替换 N 条…，跳过 N 行」「从…识别到 N 条候选」，均不含 `过大/超时/损坏/不支持`。

**注**：关键词判定本身是脆弱设计（`import-message.ts` 的文件注释也承认这是「按文案关键词」）。真正的结构性修法是让 `setMessage` 带上 `severity`，但那要动 ~15 处调用点，超出「前端小功能」范围 → 记入 `next`。

**Given/When/Then**

- Given 一个 30 MB 的 xlsx，
  When 用户拖进导入区，
  Then `role="alert"` 播报「文件过大：Excel / CSV 最多 25 MB。删掉表里无关的工作表和图片后另存一份，再上传。」，`role="status"` 保持为空。
- Given 一个 30 秒内解析不完的工作簿，
  When 超时触发，
  Then `role="alert"` 播报含「可能已损坏」与「重新另存一份 .xlsx」的说明，worker 被销毁。

**新增测试草稿**

```ts
// src/lib/import-message.test.ts
  it("treats size and timeout rejections as failures", () => {
    expect(isImportFailureMessage("文件过大：Excel / CSV 最多 25 MB。")).toBe(true);
    expect(isImportFailureMessage("解析超时：等了 30 秒还没读完")).toBe(true);
    expect(isImportFailureMessage("已追加 3 条学生数据，跳过 1 行")).toBe(false);
  });
```

```tsx
// src/components/DataWorkspace.live-regions.test.tsx
  it("routes an oversized workbook to the alert region", async () => {
    const container = renderWorkspace();
    const big = fileWithBytes("超大名单.xlsx", async () => new ArrayBuffer(0));
    Object.defineProperty(big, "size", { value: 26 * 1024 * 1024 });
    dropFile(container, big);
    await settle();

    expect(container.querySelector('[role="alert"]')!.textContent).toContain("文件过大");
    expect(container.querySelector('[role="status"].data-message')!.textContent).toBe("");
  });
```

---

## P1-5 · 空名单 / 筛选无结果 / 全部隐藏 / 未匹配城市：把静默状态说出来

**根因**：`filteredStudents.length === 0` 时 `<tbody>` 直接渲染空，用户看到一张只有表头的空表；全部隐藏时地图为空但界面只有一个「隐藏 N」数字；未匹配城市只有计数、没有后果与修法。

```diff
--- a/src/components/DataWorkspace.tsx
+++ b/src/components/DataWorkspace.tsx
@@
   const visibleCount = useMemo(
     () => filteredStudents.filter((student) => student.visibility !== false).length,
     [filteredStudents],
   );
+  /** 摘要里的可见/隐藏跟着筛选走；这里要的是整份名单的口径，所以单独算一次。 */
+  const allHidden = useMemo(
+    () => students.length > 0 && students.every((student) => student.visibility === false),
+    [students],
+  );
@@
         {unresolvedCount > 0 && (
           <div className="data-summary__warning">
             <strong>{unresolvedCount}</strong>
             <span>未匹配城市</span>
           </div>
         )}
       </div>
 
+      {/* 刻意不加 role="status"：这是常驻说明而非播报，且 live-regions 测试锁死了页面上只有一个 role="status"。 */}
+      {allHidden && (
+        <p className="data-summary__note">
+          全部 {students.length} 条都被隐藏了，地图上现在一个人都没有。
+          <CompactButton variant="ghost" aria-label="恢复显示全部学生" onClick={() => onSetStudentsVisibility(true)}>
+            全部显示
+          </CompactButton>
+        </p>
+      )}
+      {!allHidden && unresolvedCount > 0 && (
+        <p className="data-summary__note">
+          有 {unresolvedCount} 人的城市没对上，这些人暂时落不到地图上；在下方名单「省份 / 去向」列点 ✎ 手动指定省份即可。
+        </p>
+      )}
+
       <section className="data-workspace__new-student">
@@
           <tbody>
+            {filteredStudents.length === 0 && (
+              <tr className="student-table__empty">
+                <td colSpan={5}>
+                  {students.length === 0
+                    ? "还没有学生。上面「下载 XLSX 模板」照着填完再上传，或者直接粘贴「姓名 学校 城市」，一行一个人。"
+                    : `没有匹配「${filter.trim()}」的记录。`}
+                  {students.length > 0 && (
+                    <CompactButton variant="ghost" onClick={() => setFilter("")}>清空筛选</CompactButton>
+                  )}
+                </td>
+              </tr>
+            )}
             {filteredStudents.map((student) => {
```

```diff
--- a/src/styles.css
+++ b/src/styles.css
@@
 .data-summary__warning strong { color: #c95c49; }
+.data-summary__note { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0; padding: 8px 10px; color: #7a5a2f; background: #fdf6ea; border: 1px solid #e6d3ae; border-radius: 6px; font-size: 11px; line-height: 1.5; }
+.student-table__empty td { padding: 20px 12px; color: #7a8b99; text-align: center; white-space: normal; }
+.student-table__empty td .compact-button { margin-left: 8px; }
```

**兼容性**：空态行放在 `map()` **之前**、不改 `map()` 缩进，diff 保持在 ~14 行；`data-summary__note` 不带 `role`，`live-regions.test.tsx:26` 的「页面只有一个 `role="status"`」断言不受影响；「恢复显示全部学生」用区分性 `aria-label`，不与 `.student-actions` 里的「全部显示」撞选择器。名单阶段 grid 需确认 `.data-summary__note` 的 `grid-column`——`.workspace--data` / `.data-upload-workspace--expanded` 两套布局未给它列跨度，落地时如出现半宽换行，补一条 `grid-column: 1 / -1;`。

**Given/When/Then**

- Given 空工程（`students=[]`），
  When 打开名单，
  Then 表格里出现一行提示，指向「下载 XLSX 模板」与「粘贴「姓名 学校 城市」，一行一个人」，而不是只有表头的空表。
- Given 名单 2 人，筛选框输入「火星」，
  When 无命中，
  Then 表格里出现「没有匹配「火星」的记录。」＋「清空筛选」，点击后恢复全量。
- Given 名单 3 人全部隐藏，
  When 渲染，
  Then 出现「全部 3 条都被隐藏了，地图上现在一个人都没有。」＋「全部显示」，点击调用 `onSetStudentsVisibility(true)` 一次。
- Given 名单里 2 人城市为「自定义火星城」，
  When 渲染，
  Then 出现「有 2 人的城市没对上……点 ✎ 手动指定省份即可。」。

**新增测试草稿**（追加到 `DataWorkspace.roster-actions.test.tsx`）

```tsx
  it("guides the user when the roster is empty or filtered to nothing", () => {
    const empty = renderWorkspace({ students: [] });
    expect(empty.querySelector(".student-table__empty")!.textContent).toContain("下载 XLSX 模板");

    const filtered = renderWorkspace();
    changeInput(getInput(filtered, "筛选学生"), "火星");
    expect(filtered.querySelector(".student-table__empty")!.textContent).toContain("没有匹配「火星」的记录");
    click(filtered.querySelector<HTMLButtonElement>(".student-table__empty .compact-button")!);
    expect(filtered.querySelector(".student-table__empty")).toBeNull();
  });

  it("warns that an all-hidden roster leaves the map empty", () => {
    const onSetStudentsVisibility = vi.fn();
    const container = renderWorkspace({
      students: [{ ...students[0]!, visibility: false }],
      onSetStudentsVisibility,
    });

    expect(container.textContent).toContain("地图上现在一个人都没有");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="恢复显示全部学生"]')!);
    expect(onSetStudentsVisibility).toHaveBeenCalledWith(true);
  });
```

---

## P1-6 · 名单表格键盘可达（roving tabindex + Enter 选中 + F2 编辑）

**根因**：行选中与进入编辑都挂在 `onClick` / `onDoubleClick` 上，没有键盘等价物。直接给每行加 `tabIndex={0}` 会让 60 人名单产生 60 个 Tab 停靠点，所以用 roving tabindex：只有选中行（未选中时为首行）进 Tab 序，行间用方向键走。

```diff
--- a/src/components/DataWorkspace.tsx
+++ b/src/components/DataWorkspace.tsx
@@
-import { useEffect, useMemo, useRef, useState } from "react";
+import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
@@
   const isCurrentImport = (generation: number): boolean => importGenerationRef.current === generation;
+
+  /**
+   * 行内的输入框和按钮自己处理按键，只有焦点停在行本身时才走名单级快捷键：
+   * 方向键换行、Enter/Space 选中、F2 进入行内编辑（对齐表格类控件的通用约定）。
+   */
+  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, student: Student) => {
+    if (event.target !== event.currentTarget) return;
+    const moveTo = (sibling: Element | null) => {
+      if (!(sibling instanceof HTMLElement)) return;
+      event.preventDefault();
+      sibling.focus();
+    };
+    if (event.key === "ArrowDown") return moveTo(event.currentTarget.nextElementSibling);
+    if (event.key === "ArrowUp") return moveTo(event.currentTarget.previousElementSibling);
+    if (event.key === "Enter" || event.key === " ") {
+      event.preventDefault();
+      onSelectStudent(student.id);
+      return;
+    }
+    if (event.key === "F2") {
+      event.preventDefault();
+      startEditing(student);
+    }
+  };
@@
-            {filteredStudents.map((student) => {
+            {filteredStudents.map((student, rowIndex) => {
               const isEditing = editingStudentId === student.id;
               const isVisible = student.visibility !== false;
               const location = resolveStudentLocation(student);
               const selectRow = () => onSelectStudent(student.id);
+              // 名单可能上百行：只让选中行（未选中时为首行）占 Tab 序，其余用方向键到达。
+              const isTabStop = selectedStudentId ? selectedStudentId === student.id : rowIndex === 0;
               return (
                 <tr
                   key={student.id}
                   data-student-row={student.id}
                   data-editing={isEditing || undefined}
                   className={`${isVisible ? "" : "is-hidden"} ${selectedStudentId === student.id ? "is-selected" : ""}`}
+                  tabIndex={isTabStop ? 0 : -1}
+                  aria-current={selectedStudentId === student.id || undefined}
                   onClick={selectRow}
                   onDoubleClick={() => startEditing(student)}
+                  onKeyDown={(event) => handleRowKeyDown(event, student)}
                 >
```

```diff
--- a/src/styles.css
+++ b/src/styles.css
@@
 .student-table td { max-width: 260px; padding: 9px 10px; overflow: hidden; border-bottom: 1px solid #edf1f3; text-overflow: ellipsis; white-space: nowrap; }
+.student-table tbody tr:focus-visible { outline: 2px solid #d05a45; outline-offset: -2px; }
```

**兼容性**：`.student-table__empty` 行（P1-5）没有 `tabIndex`，且只在无数据行时出现，不会成为方向键落点。`aria-current` 是全局 ARIA 属性，`<tr>` 上合法；不引入 `role="grid"`，避免连带要求 `role="row"/"gridcell"`。既有的 `click`/`dblclick` 测试不变。

**Given/When/Then**

- Given 名单有 3 行、未选中任何行，
  When 用户 Tab 进表格，
  Then 焦点落在第 1 行且有可见焦点环；按 ArrowDown 焦点移到第 2 行，ArrowUp 回到第 1 行；Tab 一次即离开表格（不是 3 次）。
- Given 焦点在第 2 行，
  When 按 Enter，
  Then 触发 `onSelectStudent(第2行 id)`，该行 `aria-current="true"`，并成为唯一的 `tabIndex=0` 行。
- Given 焦点在某一行，
  When 按 F2，
  Then 该行进入行内编辑（与双击等价），出现 `input[aria-label="编辑学生名称"]`。
- Given 焦点在行内的「删除 林舟」按钮上，
  When 按 Enter，
  Then 走按钮自身语义（弹删除确认），**不**触发行选中。

**新增测试草稿**（追加到 `DataWorkspace.roster-actions.test.tsx`）

```tsx
  function pressKey(element: Element, key: string) {
    flushSync(() => element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
  }

  it("keeps the roster table reachable and operable by keyboard", () => {
    const onSelectStudent = vi.fn();
    const container = renderWorkspace({
      students: [students[0]!, { id: "student-2", name: "苏禾", university: "浙江大学", city: "杭州市", visibility: true }],
      onSelectStudent,
    });
    const rows = container.querySelectorAll<HTMLTableRowElement>("tbody tr");

    // 未选中时只有首行占 Tab 序
    expect(rows[0]!.tabIndex).toBe(0);
    expect(rows[1]!.tabIndex).toBe(-1);

    rows[0]!.focus();
    pressKey(rows[0]!, "ArrowDown");
    expect(document.activeElement).toBe(rows[1]);

    pressKey(rows[1]!, "Enter");
    expect(onSelectStudent).toHaveBeenCalledWith("student-2");

    pressKey(rows[1]!, "F2");
    expect(container.querySelector('input[aria-label="编辑学生名称"]')).not.toBeNull();
  });
```

---

# p2（本轮不做，登记）

1. **`data-summary` 的可见/隐藏口径与总记录不一致**：`visibleCount` / `unresolvedCount` 基于 `filteredStudents`，而「总记录」用 `students.length`。筛选后会出现「总记录 2 · 可见 1 · 隐藏 1」但实际 0 条隐藏。要么三个数都跟筛选走并在标题里写明「（筛选后）」，要么都用全量。属于口径决策，不宜在 UX 打磨轮里顺手改。
2. **`DataOverview` 空工程时说「数据状态良好，可以继续编辑」**：`total=0` 时所有告警计数为 0，落进 ready 分支。空名单不是「状态良好」，应单列「还没有名单」文案。
3. **`FileDropzone` 的拒绝原因没有回流到名单消息区**：`onReject` 在 `DataWorkspace` 未传，「文件格式不支持」只出现在拖放区内部的局部 `role="status"`，与导入主消息区各说各话。接上 `onReject={setMessage}` 即可（「不支持」已在 P1-4 加进失败词表）。
4. **`import-unparsed` 命名空间同样零样式**：`.import-unparsed__list` / `__row` 目前是浏览器默认 `<ul>`，与 `.import-recognition` 同一批遗漏，建议与 P0-3 的样式一并补齐或单列一条。
5. **`useAiUploadConsent` / `AiUploadConsentDialog` 已实现但未接线**：`DataImportConsent.tsx` 的出境同意闸门只被自己的测试引用，`DataWorkspace.prepareAiImport()` / `importDirectly()` 仍直接调用 `requestAiParse` 把粘贴原文（含学生姓名）送出。这是**隐私面**而非 UX 面的缺口，超出本轮 scope，但优先级高于本文任何一条 P2，建议单开一路。

# ask（产品方向，不作本轮 P0）

**粘贴「姓名 学校 省份」**。`docs/产品/市场化与实用化优化.md` §4 P1 第 2 条与 §6「粘贴文本导入 | 待做」指向同一件事。现状：粘贴入口存在，但 `toCandidate()` 把第 3 个字段固定当城市，省份写法（「林舟 北京大学 浙江」）会得到一条 `unresolved` 记录，静默落不到地图上。

两条可选路线，需要产品定：

- **A（窄）**：只在 `resolveStudentLocation` 之外加一层「第 3 字段像省份」的识别——`resolveProvinceName()` 命中且 `resolveCity()` 未命中时，把该值写进 `province` 而非 `city`，并在候选评审里标注「按省份处理」。改动集中在 `src/lib/import-data.ts` + `src/lib/student-data.ts`，但会改变「粘贴同一段文本」的既有结果，属于**行为破坏性变更**，需要回滚方案与导出口径确认。
- **B（宽）**：给粘贴区一个显式的「第三列是：城市 / 省份」切换，不猜。零破坏性，但多一个控件，与 `frontUI2.md` §5.1「空工程只显示三种起点」的克制原则有张力。

我的倾向是 B（不猜用户意图），但这属于产品方向，按 brief 要求列 ASK 不列 P0。

---

## assumptions

- 本轮只出提案，不 `git apply`、不改 `src/` `server/` `package.json`；diff 以 `origin/main` @ `60e63fc` 之上的 `cursor/frontend-ux-polish-05ab` 工作树为基准，行号与上下文取自当前文件内容。
- 「模板下载置顶」按 `docs/产品/市场化与实用化优化.md` §4 P1 字面理解为「不必展开折叠区即可见，且排在上传入口之前」，不理解为「置于整个名单工作台最顶端」。
- 六条 P0/P1 之间无冲突，可分六个提交独立落地；P0-3 与 P1-4 都改导入文案，若同轮落地按 P0-3 → P1-4 顺序，避免关键词表与文案两头改。
- 未跑 `npm run dev` 做视觉核对（只读轮次），CSS 草稿按既有配色变量与相邻规则的写法对齐，落地时需目视确认名单阶段两套 grid 下的换行表现。

## do_not_touch

- `src/` `server/` `package.json`（本轮）；支付 / 套餐 / 模板手续费结算（`docs/开源与收费边界.md`）。
- 不整页重写 `DataWorkspace.tsx`，不动信息架构与五阶段壳；`AGENTS.md`「文件超过 400 行拆分」对本文件（865 行）成立，但拆分属结构轮次，不塞进 UX 打磨轮。
- 不动 `DataMessageRegions` 的双 live region 结构与 `.data-message:empty` 收起规则（有专门测试锁定）。
- 不动 `parseStudentText` 的既有三字段语义（见 ASK）。

## next

1. 派单落地 P0-1 → P0-2 → P0-3，每条一个提交、附对应新增测试，落地后复跑本文「tests」段两条命令。
2. P1-4 / P1-5 / P1-6 第二批。P1-6 落地后建议顺手核对 `frontUI2.md` §10.2「打开全屏名单后，焦点进入搜索或首个错误」——本轮只解决了「能用键盘操作表格」，没解决「进入名单阶段时焦点该落在哪」。
3. 结构性跟进（不在本轮）：`setMessage` 带 `severity` 取代 `import-message.ts` 的关键词判定；`useAiUploadConsent` 接线到 `DataWorkspace` 的两条 AI 上送路径（见 p2-5）。
4. 产品侧回答 ASK 的 A/B 选型后，再决定「粘贴文本导入」是否进下一轮。
