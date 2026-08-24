MODEL_SLUG: claude-opus-5-thinking-high-fast

# R1-opus-data · 学生名单导入 + 数据工作区

分支：`cursor/agent-sota-polish-cbcd`（未提交，按要求 do not commit）

## 1. DataWorkspace 拆分（705 → 289 行）

`DataWorkspace` 仍是唯一导出的组合器，props 形状与默认值完全未变（`DataUploadWorkspace` 通过
`ComponentProps<typeof DataWorkspace>` 传参，未受影响）。

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `src/components/DataWorkspace.tsx` | 289 | 组合器：名单编辑态（草稿 / 行内编辑 / 筛选）+ 布局 |
| `src/components/data-workspace-import-panel.tsx` | 194 | 导入面板：文本域、四个识别入口、Excel 拖拽区、表头识别、候选复核 |
| `src/components/data-workspace-import-state.tsx` | 217 | `useRosterImport`：导入状态机（文本 / AI / OCR 文本 / 工作簿 / 追加替换） |
| `src/components/data-workspace-student-table.tsx` | 220 | 表格编辑器：行内编辑、省份覆盖、可见性、删除 |
| `src/components/data-workspace-draft-form.tsx` | 110 | 新增学生表单 |
| `src/components/data-workspace-fields.tsx` | 37 | 共享下拉数据源、列名文案、`ROSTER_FILE_ACCEPT` |

全部文件均在 400 行以内（AGENTS.md 要求）。

## 2. OCR 诚实性

改前：按钮写「识别 OCR 文本」，面板 meta 写「可粘贴 OCR 识别文字」，容易被读成"能识别图片"。

改后：
- 导入面板新增 `[data-import-ocr-note]` 说明：**「可粘贴 OCR 软件识别出的文字。本工具只解析文本，不读取图片；名单在图片里请先用 OCR 工具转成文字再粘贴。」**
- OCR 按钮加 `aria-label="识别粘贴的 OCR 文本"` 与 `title="解析已粘贴的 OCR 文字，不支持直接上传图片"`。
- 折叠按钮文案由「展开导入 / OCR / Excel」改为「展开导入 · 文本 / Excel」。
- 唯一的 `input[type=file]` 只接受 `.xlsx,.xls,.csv,text/csv`，**没有任何图片入口**。

测试（`DataWorkspace.test.tsx`）：
- `says in plain words that OCR only reads pasted text, never an image`
- `offers no image upload control at all, so nothing can silently do nothing`（断言文件输入数量为 1、accept 不含 `image`、无「图片识别」「上传图片」文案）
- `parses pasted OCR text locally into reviewable candidates`（粘贴 OCR 文本确实产出候选，不是空按钮）
- 原有 `keeps pasted OCR text parsing available without advertising image OCR` 保持绿。

## 3. 导入健壮性

表头识别从 `binary-import.ts` 上移到 `import-data.ts`，**文本/CSV/XLSX 三条通路共用同一套别名引擎**。

- `normalizeHeaderCell`：去 BOM、空白、下划线/连字符、中英文括号、`*`、尾部冒号与「必填/选填/可选」。
- `STUDENT_HEADER_ALIASES` 覆盖任务要求的四组：
  - 姓名 / 名字 / 学生姓名 / name / student name …
  - 去向 / 院校 / 学校 / 录取院校 / 毕业去向 / school / university …
  - 省份 / 省 / 所在省份 / province / state（新增 `province` 列）
  - 城市 / 市 / 所在城市 / city / location
  - 去向类型（与「去向」区分开，仍映射 `locationScope`）
- **一列只能被一个字段认领**：`detectHeaderColumns` 用 claim 集合，`["姓名","学校","去向","城市"]` 中「去向」不会被二次读成 university。
- `parseStudentText` 现在会识别首行表头并按列名取值（乱序表头 `城市,名字,学校,省` 可直接导入）；无表头时退回原来的位置解析，旧行为不变。
- 空单元格不再破坏列对齐（`splitCells` 保留空格子），`林舟,北京大学,北京,,` 不会把省份错位。
- BOM：整段文本与逐个单元格都会剥离 `\uFEFF`，`\uFEFF姓名,院校,城市` 正常匹配。
- 空工作表 / 只有空白单元格的工作表：返回空结果而不是假装找到表头。
- 数字单元格（学号被当成姓名等）统一 `String()` 化后再判断。
- 国际学生不要求中国省份：`candidateFromColumns` 对 `locationScope === "international"` 的行直接丢弃 province 列；`buildStudentRecords` 对海外记录不写 province、不报 `unresolved_city`。
- 重复告警更准：`buildStudentRecords` 的 `duplicate_name` 由「仅按姓名」改为「姓名 + 院校」，同名不同校不再误报（消息形如 `存在重复学生记录：林舟 · 北京大学`）。候选复核区的重复计数继续用 `data-duplicate.ts` 的姓名+院校+城市+去向类型键，两者语义一致。
- 模板「填写说明」页补充省份行与「海外去向无需填写省份」。

## 4. data-health 稳定 id

- `DataIssue` 新增 `id`，值为 `` `${kind}:${studentId}` ``（一个学生每种 kind 至多一条，天然唯一）。
- 导出 `dataIssueId(kind, studentId)` 与 `resolveDataIssueId(issue)`。
- **`id` 声明为可选**：`DataQualityPanel.test.tsx` / `GlobalDataScreen.test.tsx` / `DeliveryWorkspace.test.tsx` / `stage-overview.test.ts` 都在我的 ownership 之外并直接构造 `DataIssue` 字面量，设为必填会让这些文件类型报错。`listDataIssues` 始终填充，UI 一律走 `resolveDataIssueId`，两端都拿得到稳定 id。
- `DataQualityPanel` 行 key 改为稳定 id，并新增 `data-issue-id` 属性供定位；`DataUploadWorkspace` 的映射行 key 同步。
- 空白姓名不再让 `missingFields` 崩在 `undefined.trim()` 上，且 `studentName` 回落到「未命名学生」。
- 补的边界用例：空白姓名行、只有城市的行、海外记录（不追问中国城市/省份）、id 幂等性。
- 原有 overseas→china 用例（`clears an international location scope when an edited record is set to China`、`creates international students without reporting an unresolved China city`）保持绿，并新增「切回中国后省份输入框重新出现」。

## 5. FileDropzone 可访问性

隐藏的 `input[type=file]` 之前让整个控件**没有键盘通路**（label 不可聚焦，`:focus-within` 永远不触发）。

- label 现在带 `role="button"`、`tabIndex`（禁用/忙碌时为 `-1`）、`aria-label`（忙碌时读 busyLabel）。
- `Enter` / `Space` 打开文件选择器；其他键不响应；inactive 时完全不响应。
- 拒绝文件的提示带 `id` 并通过 `aria-describedby` 关联。
- 已存在的 `.file-dropzone:focus-within` 样式因此才真正生效，无需改 `styles.css`（该文件归 R1-fable-sota）。

## 6. 验证（failure → cause → fix → recheck）

命令：

```
npx vitest run src/lib/import-data.test.ts src/lib/student-data.test.ts src/lib/data-health.test.ts \
  src/lib/data-duplicate.test.ts src/lib/data-workspace.test.ts src/lib/binary-import.test.ts \
  src/components/DataWorkspace.test.tsx src/components/workspaces/DataUploadWorkspace.test.tsx \
  src/components/FileDropzone.test.tsx src/components/DataOverview.test.tsx
```

- 基线（改动前）：10 files / 81 tests passed。
- 最终：10 files / **123 tests passed**（+42）。
- 追加 `DataPresentationPanel.test.tsx`（扩充到 4 例）与四个下游消费方套件（DataQualityPanel / GlobalDataScreen / DeliveryWorkspace / stage-overview）一起跑：**15 files / 142 tests passed**。
- `npx tsc -p tsconfig.app.json --noEmit`：本人文件 0 错误。
- `npm run lint`：本人文件 0 error / 0 warning。

### 唯一一次失败与修复

1. **failure**：`binary import adapters > returns an empty result for an empty or blank-only sheet` —
   `expected { … } to match object { …, headerRowIndex: undefined }`。
2. **cause**：断言用了 `toMatchObject({ headerRowIndex: undefined })`，而 Vitest 的 `toMatchObject` 要求
   显式 `undefined` 的键必须**存在**；空表分支返回的对象根本不含 `headerRowIndex`（这正是期望行为）。
   是断言写法的问题，不是实现的问题。
3. **fix**：改为分别断言 `blank.candidates`、`blank.unparsed` 与 `expect(blank.headerRowIndex).toBeUndefined()`。
4. **recheck**：重跑 `npx vitest run src/lib/binary-import.test.ts` → 11 passed。

### 第二次失败与修复（自查发现）

1. **failure**：`git status` 显示 `src/components/DataPresentationPanel.test.tsx` 是 `M` 而非新增文件。
2. **cause**：我误判该测试不存在，直接整文件覆写，抹掉了原有用例
   `exposes the five supported data views`（断言呈现方式按钮组恰好 5 个 + 图钉切换回调）。
3. **fix**：从 `git show HEAD:` 取回原用例，按新的 `render()` 辅助函数重新接入，与新增 3 例并存。
4. **recheck**：`npx vitest run src/components/DataPresentationPanel.test.tsx` → 4 passed（原 1 例 + 新 3 例）。

### 不属于本人范围的失败

全量 `npx vitest run` 期间观察到两批失败，均为同轮其他代理的在途改动，**与本次改动无关**：

- `server/collaboration.test.ts` / `server/index.test.ts`（R1-gpt-server，中途已自行修复）。
- `src/components/StudioAssistantDrawer.test.tsx` 与新增的 `src/drawer-focus-debug.test.tsx`
  （R1-fable-sota；后者是一个故意 `throw` 的调试文件）。被测组件不含 FileDropzone，已确认与
  本次 `tabIndex`/`role` 改动无关。

最终全量：`Test Files 2 failed | 166 passed`，2 个失败全部落在上述抽屉文件里。

## 7. 交付与回滚

- **验收方式**：PR + CI 上述 vitest 命令；人工验收路径为「数据与素材」工作台 → 展开导入 → 粘贴/上传 → 表头识别 → 候选复核 → 追加/替换。
- **破坏性变更评估**：
  - `DataIssue.id` 为**新增可选字段**，旧调用方与旧数据不受影响。
  - `ImportCandidate.province` / `StudentInput.province` 为**新增可选字段**；不带 province 的输入产出的 `Student` 仍不含 `province` 键（已有断言 `not.toHaveProperty("province")` 覆盖）。
  - `StudentColumn` 新增 `"province"` 成员：外部只有 `DataWorkspace` 的列名映射消费，已同步；这是类型层面的扩宽，不改变导出文件格式。
  - 导出格式（xlsx 模板）只在「填写说明」页**新增两行**，数据页表头一字未动，旧模板照常可导入。
  - `duplicate_name` 的告警文案与判定口径变化（姓名 → 姓名+院校）是唯一的行为语义变更，只影响提示，不影响任何被写入的数据。
- **回滚方案**：本次改动全部集中在 `src/lib/{import-data,binary-import,student-data,data-health,data-workspace}.ts`、
  `src/components/DataWorkspace.tsx`、`src/components/data-workspace-*.tsx`、`src/components/FileDropzone.tsx`、
  `src/components/DataQualityPanel.tsx`、`src/components/workspaces/DataUploadWorkspace.tsx` 及对应测试。
  `git checkout <base> -- <上述路径> && rm src/components/data-workspace-*.tsx` 即可完整回退，
  无数据迁移、无持久化状态变更（IndexedDB 项目文档结构未改）。
