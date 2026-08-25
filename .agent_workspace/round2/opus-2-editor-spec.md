# R2-O2：编辑器面 D / F / H 文件级实施规格（含 C·G 的文档落点）

> 角色：Round 2 设计者 R2-O2（只出规格，不实现、不提交）
> 基线：分支 `cursor/feature-expansion-research-c710`，HEAD `0507d71`（工作树含 Round 1 归档）
> 已读源码：`src/App.tsx`、`src/components/DataWorkspace.tsx`、`src/components/workspaces/DataUploadWorkspace.tsx`、`src/components/workspaces/DeliveryWorkspace.tsx`、`src/lib/usePosterExport.ts`、`src/lib/export-poster.ts`、`src/lib/stage-overview.ts`、`src/lib/project-store.ts`、`src/lib/project-package.ts`、`src/components/ProjectWorkbench.tsx`、`src/components/workbench/{ProjectGrid,WorkbenchHeader}.tsx`、`src/components/StageOverviewPanel.tsx`、`src/lib/binary-import.ts` 及对应测试
> 已读在途 PR 的实际 diff：#3 / #9 / #10 / #11（用 `gh pr diff` 取真实改动，冲突矩阵见 §6）
> 本轮范围：**D**（数据阶段 XLSX 模板下载 + 导入消息 aria-live）、**F**（导出文件名含项目名与倍率 + 成功结果条）、**H**（工作台「重新载入示例」+ 空名单不再判健康）；**C / G 只写与编辑器文档相邻的那部分**（CHANGELOG 落点、能力漂移文案）。
> 明确不做：印刷尺寸预设与 mm/dpi 口径（PR #3 拥有）、公开 Demo（PR #7）、支付/套餐/结算、服务端契约变更。

---

## 0. 一页结论

三项改动都落在**已有组件的既有插槽**上，没有新增页面、没有新增依赖、不动画布与布局算法，四个新纯函数/分支全部可单测：

| ID | 一句话 | 新增纯函数 | 触及生产文件 | 触及测试文件 |
|----|--------|-----------|-------------|-------------|
| D | 数据阶段恢复「下载 XLSX 模板」；导入/导出消息进常驻 live region | 无（只删开关 + 加 a11y 属性） | 3 | 2 |
| F | 导出文件名 `班级名-2x.png`；成功后渲染结果条 | `src/lib/export-filename.ts` | 4 | 3（其中 2 个新建） |
| H | 工作台空态可「载入示例项目」；`total === 0` 不再报「名单数据健康」 | `stage-overview.ts` 新分支 | 3 | 2 |

**最大的坑（必须先知道）：**

1. **D 的真正阻断点不在 `App.tsx`。** Round 1 报告只指出 `src/App.tsx:1668` 的 `hideTemplateDownload: true`，但 `src/components/workspaces/DataUploadWorkspace.tsx:128` 在 `{...dataWorkspaceProps}` **之后**硬写了一个无值 `hideTemplateDownload`（等价 `true`），它会覆盖任何外部传入。只改 App 那一行**不会**让按钮出现。两处都要改。
2. **D 会打破一条现存的「否定断言」。** `src/components/workspaces/DataUploadWorkspace.test.tsx:94` 断言 `container.textContent` 不含「模板」；按钮文案是「下载 XLSX 模板」，恢复后这条必然红。这是预期中的断言更新，不是回归——但必须换成更精确的选择器断言（§2.3）。
3. **F 的项目名不在 `project` 里。** `ProjectDocument` 无 name 字段；名字只活在 `src/App.tsx:252` 的 `projectNameRef`（非响应式，`:514` 赋值）。所以是传 **getter** 而不是传值（§3.2 给了理由与备选）。
4. **H 与 PR #3 在 `ProjectGrid.tsx` 同一段空态 JSX 上正面相撞**（#3 改的正是那句 `<p>` 文案）。规避手法见 §6。

---

## 1. 优先级与「先失败测试」顺序

按「阻断用户主路径的程度 ÷ 冲突面」排：

| 序 | 项 | 先写的失败测试 | 再改的生产代码 |
|----|----|---------------|---------------|
| 1 | D1 模板下载 | `DataUploadWorkspace.test.tsx` 把 `toBeNull()` 反转 → 红 | `DataUploadWorkspace.tsx:128`、`App.tsx:1668` |
| 2 | D2 aria-live | `DataWorkspace.test.tsx` 新增 live region 断言 → 红 | `DataWorkspace.tsx:577-578`、`styles.css` |
| 3 | H1 空名单 | `stage-overview.test.ts` 新增 `total: 0` 用例 → 红 | `stage-overview.ts` `dataCards` |
| 4 | H2 载入示例 | `ProjectWorkbench.test.tsx` 新增删空后点按钮用例 → 红 | `ProjectGrid.tsx`、`ProjectWorkbench.tsx` |
| 5 | F1 文件名 | `export-filename.test.ts`（新建，模块不存在即红） | 新建 `src/lib/export-filename.ts` |
| 6 | F2 hook 接线 | `usePosterExport.test.tsx`（新建，mock `./export-poster`） | `usePosterExport.ts` |
| 7 | F3 结果条 | `DeliveryWorkspace.test.tsx` 新增 success 用例 → 红 | `DeliveryWorkspace.tsx`、`App.tsx`、`workflow-workspaces.css` |
| 8 | C/G 文档 | 无测试（文档层） | `CHANGELOG.md`（新建）、`USER_GUIDE.md:82` |

D 与 H 可以各自独立成 PR；F 的 1→2→3 必须同一 PR（类型互相依赖）。建议 3 个 PR：`feat(data): …`、`feat(export): …`、`feat(workbench): …`，各自带 CHANGELOG 条目。

---

## 2. D — 恢复数据阶段 XLSX 模板下载 + 导入消息 aria-live

### 2.1 现状事实（带行号）

```504:511:src/components/DataWorkspace.tsx
              {!hideTemplateDownload && <CompactButton
                variant="secondary"
                aria-label="下载学生数据 XLSX 模板"
                icon={<Download size={16} aria-hidden />}
                onClick={() => { void downloadImportTemplate(); }}
              >
                下载 XLSX 模板
              </CompactButton>}
```

```125:132:src/components/workspaces/DataUploadWorkspace.tsx
          <DataWorkspace
            {...dataWorkspaceProps}
            hideDataExpression
            hideTemplateDownload
            compactRosterControls
            selectedStudentId={dataWorkspaceProps.selectedStudentId}
            onSelectStudent={handleSelectStudent}
          />
```

```1668:1668:src/App.tsx
              dataWorkspaceProps={{ ...dataWorkspaceProps, hideDataExpression: true, hideTemplateDownload: true }}
```

按钮实现 `downloadImportTemplate`（`DataWorkspace.tsx:238-250`）动态 `import("xlsx")`，写两个 sheet：`学生数据`（表头 `学生姓名/录取院校/城市/去向类型`）与 `填写说明`，数据源是 `createImportTemplateSheets()`（`src/lib/binary-import.ts:24-39`，已有单测 `binary-import.test.ts:86`）。**下载链路本身是好的，唯一问题是入口在主路径被关掉。**

### 2.2 生产代码改动（精确到 prop）

| # | 文件 | 改法 |
|---|------|------|
| D1-a | `src/components/workspaces/DataUploadWorkspace.tsx:128` | **删除**第 128 行整行 `hideTemplateDownload`。保留 `hideDataExpression` 与 `compactRosterControls` 不动 |
| D1-b | `src/App.tsx:1668` | 改为 `dataWorkspaceProps={{ ...dataWorkspaceProps, hideDataExpression: true }}`，删掉 `hideTemplateDownload: true` |
| D1-c | `src/components/DataWorkspace.tsx:75,93,504` | **不动。** 保留 `hideTemplateDownload?: boolean`（默认 `false`）这个 prop |

**为什么保留 prop 而不是删掉它**：① `src/components/GlobalSettingsScreen.tsx:286` 仍是它的另一个消费路径，删 prop 会连带改一个本轮不该碰的 353 行组件；② PR #11 已经把这个按钮下沉到新文件 `src/components/data-workspace-import-panel.tsx` 并**继续透传 `hideTemplateDownload`**（`hideTemplateDownload: boolean` 成为该子组件的必填 prop），删 prop 会与 #11 硬冲突。删开关不删 prop，是与 #11 同时成立的唯一写法。

**#11 落地后的等价改动**：`DataWorkspace.tsx` 里 `hideTemplateDownload={hideTemplateDownload}` 的透传保持不变，D1-a / D1-b 两处仍然是同样的两行删除；`aria-label="下载学生数据 XLSX 模板"` 在 #11 中未改，所有测试选择器继续有效。

### 2.3 aria-live（D2）

现状（无任何 role）：

```577:578:src/components/DataWorkspace.tsx
      {replaceConfirmation && <p className="panel-note data-message">替换摘要：当前 {replaceConfirmation.currentCount} 条，新 {replaceConfirmation.nextCount} 条</p>}
      {message && <p className="panel-note data-message">{message}</p>}
```

改为**一个常驻的 live region 容器**，内部两条消息按原样条件渲染：

```tsx
      <div className="data-message-live" role="status" aria-live="polite" aria-atomic="true">
        {replaceConfirmation && <p className="panel-note data-message">替换摘要：当前 {replaceConfirmation.currentCount} 条，新 {replaceConfirmation.nextCount} 条</p>}
        {message && <p className="panel-note data-message">{message}</p>}
      </div>
```

三条设计约束，缺一条这个 a11y 改动就是假的：

1. **容器必须常驻**（不写 `{message && <div …>}`）。屏幕阅读器只播报「已存在的 live region 内部发生的变化」；region 与内容同时插入 DOM 时，NVDA / VoiceOver 经常不播。这是本条改动的全部技术含量。
2. **只设一个 region**，不要给两个 `<p>` 各挂一个 `role="status"`。两个 polite region 同时变化会互相打断（替换导入时两条同时出现）。`aria-atomic="true"` 保证整块重播。
3. **失败消息也走 polite，不升级成 `role="alert"`**。`setMessage` 同一个状态位既承载成功（`已导入 N 条`）也承载失败（`Excel 解析失败`、`模板下载失败`），拆 assertive 需要给 message 加 tone 字段——那属于 G5「表头映射可纠正」的范围，本轮不做。交付阶段的真·错误已有 `role="alert"`（`DeliveryWorkspace.tsx:110`），口径不冲突。

**CSS**：`src/styles.css:460` 已有 `.data-message { padding: 8px 10px; … }`。新增紧邻的一行，避免空 region 撑出 8px 空白：

```css
.data-message-live:empty { display: none; }
```

栅格注意：`src/styles.css:397` 有 `.workspace--data .import-review, .workspace--data .data-message { grid-column: 1 / -1; order: 4; }`。包一层 `div` 会让 `.data-message` 不再是 grid 直接子元素，该规则对它失效。**同步把选择器里的 `.data-message` 换成 `.data-message-live`**，否则数据阶段消息的跨列/排序会退化。这是本条唯一的视觉回归风险点，手动验收时要看一眼消息块是否仍占满整行、位置是否仍在导入区之后。

### 2.4 测试文件与断言

**`src/components/workspaces/DataUploadWorkspace.test.tsx`**（改 2 条断言，第一个用例 `is the upload data workbench …`）：

```ts
    // :94 旧断言（会因按钮文案「下载 XLSX 模板」而红）——换成精确选择器
-   expect(container.textContent).not.toContain("模板");
+   expect(container.querySelector(".template-picker")).toBeNull();   // 整体模板选择器仍不在数据阶段
+   expect(container.textContent).not.toContain("整体模板");
    // :96 旧断言反转
-   expect(container.querySelector('button[aria-label="下载学生数据 XLSX 模板"]')).toBeNull();
+   expect(container.querySelector('button[aria-label="下载学生数据 XLSX 模板"]')).not.toBeNull();
```

`.template-picker` 与标题「整体模板」来自 `src/components/TemplatePicker.tsx:30-31`，是原断言真正想守住的东西（数据阶段不出现模板选择器），换选择器后语义更准而不是更松。

**注意**：`下载 XLSX 模板` 按钮在导入区折叠时不渲染（`DataWorkspace.tsx:475` 的 `showImport` 分支）。该用例在 `:91` 已经点开了「展开导入名单」，所以断言位置（:96）在展开之后，成立。**不要**把断言挪到点击之前。

**`src/components/DataWorkspace.test.tsx`**（新增 1 个用例；已有的 `offers a canonical XLSX template download action`（:77-99）不改）：

```ts
  it("announces import results in a persistent polite live region", async () => {
    const container = render(<DataWorkspace {...baseProps} />);
    const region = container.querySelector('[role="status"].data-message-live');
    expect(region).not.toBeNull();                 // 未产生任何消息时 region 已在 DOM 中
    expect(region?.getAttribute("aria-live")).toBe("polite");
    expect(region?.getAttribute("aria-atomic")).toBe("true");
    expect(region?.textContent).toBe("");

    click(container.querySelector<HTMLButtonElement>('button[aria-label="下载学生数据 XLSX 模板"]')!);
    await vi.waitFor(() => {
      flushSync(() => {});
      expect(container.querySelector('[role="status"].data-message-live')?.textContent)
        .toContain("已下载学生数据导入模板");
    });
    // region 是同一个节点，没有被卸载重建
    expect(container.querySelector('[role="status"].data-message-live')).toBe(region);
  });
```

最后一条 `toBe(region)` 是本用例的核心：它是「常驻 region」这个 a11y 语义唯一可自动化的证据。

### 2.5 手动验收（无法自动化的部分）

1. `npm run dev` → 数据与素材阶段 → 展开导入 → 点「下载 XLSX 模板」→ 用 Excel/WPS 打开，确认两个 sheet：`学生数据`（4 列表头）与 `填写说明`（含「去向类型留空时按中国去向处理」）。
2. 开 VoiceOver（macOS `Cmd+F5`）或 NVDA，重复上一步，确认「已下载学生数据导入模板」被读出；再拖一个 Excel 进去，确认「已导入 N 条」被读出。
3. 看消息块是否仍横跨整行、位置在导入区之后（§2.3 的栅格风险）。

### 2.6 回滚

- D1：`git revert` 或还原两行（`DataUploadWorkspace.tsx` 加回 `hideTemplateDownload`、`App.tsx` 加回 `hideTemplateDownload: true`），零数据影响、零存储影响。
- D2：还原 `<div>` 包裹 + 两条 CSS。**注意回滚 CSS 时要把 `styles.css:397` 的选择器改回 `.data-message`**，否则回滚会留下一个只改了一半的栅格规则。

---

## 3. F — 导出文件名含项目名/倍率 + 成功结果条

### 3.1 新纯函数：`src/lib/export-filename.ts`（新建）

放 `src/lib` 而不是放 hook 里，有一个硬理由：`usePosterExport.ts:15` 已经 `import type { DeliveryExportState } from "../components/workspaces/DeliveryWorkspace"`；如果把 `PosterExportKind` 定义在 hook 里再让 `DeliveryWorkspace` 反向引用，就形成 lib↔component 双向依赖。共享类型必须落在 `src/lib`。

```ts
/** 导出文件名生成：把项目名/倍率变成安全、可分辨的下载文件名。纯函数，无 DOM。 */
export type PosterExportKind = "png" | "svg" | "project";

export interface ExportFileNameInput {
  /** 工程名（来自工作台 StoredProject.name），可空。 */
  projectName?: string | null;
  kind: PosterExportKind;
  /** 仅 png 使用；非有限数、<= 0 按 1 处理。 */
  scale?: number;
  /** 仅 project 使用，YYYY-MM-DD；由调用方注入以便可测。 */
  date?: string;
}

export const DEFAULT_EXPORT_BASE_NAME = "我的毕业去向图";
export const MAX_EXPORT_BASE_LENGTH = 40;

export function sanitizeExportBaseName(raw: string | null | undefined): string;
export function buildExportFileName(input: ExportFileNameInput): string;
```

**`sanitizeExportBaseName` 规则（按顺序执行，顺序本身要测）：**

| 步 | 规则 | 理由 |
|----|------|------|
| 1 | 去控制字符 `[\u0000-\u001f\u007f]` | 会破坏 `a[download]` |
| 2 | 删除 `\ / : * ? " < > \|` | Windows/macOS 非法路径字符；用删除而非替换成 `-`，避免「高三/3班」变成两个连字符 |
| 3 | 连续空白折叠为单个半角空格，首尾 trim | 中文班名常带全角空格 |
| 4 | 去首尾的 `.` 与 `-` | 首点＝隐藏文件；尾点＝Windows 非法 |
| 5 | 按**码点**（`Array.from`）截断到 40，截断后再 trim | 避免把 emoji/生僻字截半成乱码 |
| 6 | 结果为空 → `DEFAULT_EXPORT_BASE_NAME` | |
| 7 | 命中 Windows 保留名（`CON PRN AUX NUL COM1-9 LPT1-9`，大小写不敏感）→ `DEFAULT_EXPORT_BASE_NAME` | 回落比加前缀更可测、更少歧义 |

**`buildExportFileName` 规则：**

| kind | 输出 | 说明 |
|------|------|------|
| `png` | `${base}.png`（scale 归一为 1 时）/ `${base}-${scale}x.png`（scale ≠ 1） | UI 只给 1/2/3（`DeliveryWorkspace.tsx:112`）；非整数用 `String(scale)` 原样拼 |
| `svg` | `${base}.svg` | **SVG 不带倍率**：矢量无倍率语义，`exportSvg` 也从不读 `pngScale`。写死这条并在测试里锁住，防后人「补齐」出一个骗人的 `-2x.svg` |
| `project` | `${base}-工程包-${date}.json` | 扩展名保持 `.json`，与 `PROJECT_PACKAGE_FILE_ACCEPT`（`project-package.ts:213` = `"application/json,.json,.cengfan"`）一致；`date` 缺省取 `new Date().toISOString().slice(0, 10)` |

### 3.2 `src/lib/usePosterExport.ts` 改动

**新增 option（1 个）：**

```ts
export interface UsePosterExportOptions {
  // …既有字段不动…
  /** 读取当前工程名。用 getter 而非值：App 的项目名只存在非响应式的 projectNameRef 上。 */
  getProjectName?: () => string | null | undefined;
}
```

**为什么是 getter**：`src/App.tsx:252` 的 `projectNameRef` 在 `:514` 的异步加载回调里赋值，ref 变更不触发 re-render。传值会拿到加载完成前的 `null` 并把它焊死在闭包里（首次导出得到 `我的毕业去向图.png`，看起来"偶发"）。getter 在点击时求值，永远是最新的。备选方案（`useState` 存 projectName 并在 `:514`、`:277` 同步）需要动 App 的持久化路径，收益一样、风险更大，不采用。

**新增返回值（1 个）：**

```ts
export interface PosterExportOutcome {
  kind: PosterExportKind;
  fileName: string;
}

export interface UsePosterExportResult {
  // …既有字段不动…
  /** 最近一次成功导出的结果；开始新一次导出时清空。 */
  lastExport?: PosterExportOutcome;
}
```

**三处导出函数的改法（保持既有 try/catch 与状态机形状不变）：**

| 位置 | 改动 |
|------|------|
| `exportSvg`（:61-78） | `:63` 后加 `setLastExport(undefined)`；`:69` 的 `downloadText(source, "我的毕业去向图.svg", …)` 换成先算 `const fileName = buildExportFileName({ projectName: getProjectName?.(), kind: "svg" })` 再传入；`:70-71` 后 `setLastExport({ kind: "svg", fileName })`，status 文案改 `SVG 已导出：${fileName}` |
| `exportPng`（:131-157） | `:134` 后 `setLastExport(undefined)`；`:146` 的 `downloadDataUrl(dataUrl, "我的毕业去向图.png")` 换成 `buildExportFileName({ projectName: getProjectName?.(), kind: "png", scale: pngScale })`；成功后 `setLastExport({ kind: "png", fileName })`，status 文案改 `PNG 已导出：${fileName}` |
| `exportProjectPackage`（:85-110） | **P2，可延后。** 若做：`downloadProjectPackage(pack, buildExportFileName({ projectName: getProjectName?.(), kind: "project" }))`（`project-package.ts:219` 第二参已存在，默认 `cengfan-project-YYYY-MM-DD.json`）。这是一处**面向用户的文件名变更**，独立记回滚（§3.6） |

`retryLastExport`（:159-163）不改：`lastExportRef` 是「上次尝试的类型」，`lastExport` 是「上次成功的结果」，两者语义不同，不要合并。

清空时机统一为「每次导出开始」，这样 `exporting` 态不会残留上一次的文件名，结果条也就不会在新一次导出进行中显示旧文件名。

### 3.3 `src/components/workspaces/DeliveryWorkspace.tsx` 改动

**Props 新增 1 个可选字段**（`DeliveryRailProps = Omit<DeliveryWorkspaceProps, "posterRef" | "userFonts">`，自动继承，无需改 Omit 列表）：

```ts
import type { PosterExportKind } from "../../lib/export-filename";

export interface DeliveryWorkspaceProps {
  // …既有字段不动…
  /** 最近一次成功导出的结果，用于成功结果条。 */
  exportResult?: { kind: PosterExportKind; fileName: string };
}
```

**渲染位置**：插在 `delivery-workspace__controls`（:111）与 `delivery-workspace__actions`（:117）之间——紧贴导出按钮，符合 `frontUI2.md:637-643`「成功后保留上下文 + 轻量结果条」；放在 error 块（:110）旁边则会让成功/失败两种态在视觉上争同一位置。

```tsx
      {exportState === "success" && exportResult && (
        <div className="delivery-workspace__result" role="status" aria-live="polite">
          <CheckCircle2 size={15} aria-hidden />
          <span>已导出 {exportResult.fileName}</span>
          <button type="button" aria-label="再次导出" onClick={onRetry}>
            <RotateCcw size={15} aria-hidden /> 再次导出
          </button>
        </div>
      )}
```

`CheckCircle2` / `RotateCcw` 都已在 `:1` 导入，无新 import（除类型）。

**a11y 口径**：错误块用 `role="alert"`（assertive，已存在），成功条用 `role="status"`（polite）。两者互斥渲染（`exportState` 单状态机），不会同屏抢播。「再次导出」复用 `onRetry`，与错误态的「重试」同一回调、不同 `aria-label`，测试可分辨。

**CSS**（`src/components/workflow-workspaces.css`，紧跟 `:73` 的 `.delivery-workspace__error`）：

```css
.delivery-workspace__result { display: flex; align-items: center; gap: 7px; padding: 10px 12px; color: #1f5c3d; background: #f2faf5; border: 1px solid #b6ddc6; border-radius: 7px; font-size: 12px; }
.delivery-workspace__result span { flex: 1; overflow-wrap: anywhere; }
```

`overflow-wrap: anywhere` 是必要的：40 字项目名 + `-2x.png` 在窄侧栏会溢出。窄屏（`:102` 的 media query）不需要额外规则，flex 会自然换行。

### 3.4 `src/App.tsx` 接线（2 处）

```tsx
// :635-651 —— usePosterExport 调用，新增一行
  const posterExport = usePosterExport({
    posterRef,
    project,
    …
    reportStatus: setStatusMessage,
    getProjectName: () => projectNameRef.current,
  });

// :1754-1773 —— DeliveryRail，新增一行（DeliveryWorkspace :1776 不需要，它只渲染画布）
              exportState={posterExport.exportState}
              exportError={posterExport.exportError}
+             exportResult={posterExport.lastExport}
```

### 3.5 测试文件与断言

**新建 `src/lib/export-filename.test.ts`**（表驱动，本项的主力测试）：

```ts
describe("buildExportFileName", () => {
  it.each([
    [{ projectName: "高三3班", kind: "png", scale: 1 }, "高三3班.png"],
    [{ projectName: "高三3班", kind: "png", scale: 2 }, "高三3班-2x.png"],
    [{ projectName: "高三3班", kind: "png", scale: 3 }, "高三3班-3x.png"],
    [{ projectName: "高三3班", kind: "svg", scale: 2 }, "高三3班.svg"],          // SVG 不带倍率
    [{ projectName: "", kind: "png", scale: 2 }, "我的毕业去向图-2x.png"],
    [{ projectName: null, kind: "svg" }, "我的毕业去向图.svg"],
    [{ projectName: "   ", kind: "png" }, "我的毕业去向图.png"],
    [{ projectName: "2026/届 一班", kind: "png" }, "2026届 一班.png"],           // 删非法字符、折叠空白
    [{ projectName: "a:b*c?d\"e<f>g|h", kind: "svg" }, "abcdefgh.svg"],
    [{ projectName: ".隐藏名.", kind: "svg" }, "隐藏名.svg"],
    [{ projectName: "CON", kind: "png" }, "我的毕业去向图.png"],                  // Windows 保留名
    [{ projectName: "示例：2026届毕业去向", kind: "project", date: "2026-08-24" }, "示例：2026届毕业去向-工程包-2026-08-24.json"],
  ])("%o → %s", (input, expected) => {
    expect(buildExportFileName(input as ExportFileNameInput)).toBe(expected);
  });

  it("truncates by code point, never mid-emoji", () => {
    const name = "班".repeat(60);
    const out = buildExportFileName({ projectName: name, kind: "png", scale: 2 });
    expect(Array.from(out.replace("-2x.png", ""))).toHaveLength(MAX_EXPORT_BASE_LENGTH);
  });

  it("treats invalid scales as 1x", () => {
    for (const scale of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(buildExportFileName({ projectName: "甲", kind: "png", scale })).toBe("甲.png");
    }
  });

  it("never emits path separators", () => {
    expect(buildExportFileName({ projectName: "../../etc/passwd", kind: "png" })).not.toContain("/");
  });
});
```

注意 `：` 是全角冒号（U+FF1A），**不在**删除名单里——`示例：2026届毕业去向` 是 `project-store.ts:21` 的真实示例项目名，它必须原样保留，否则示例工程一导出就改名。这条用例就是守这个的。

**新建 `src/lib/usePosterExport.test.tsx`**（仓库目前没有 hook 测试先例；用 `createRoot + flushSync` 的既有范式，见 `DeliveryWorkspace.test.tsx:17-49`）：

```tsx
vi.mock("./export-poster", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./export-poster")>()),
  downloadText: vi.fn(),
  downloadDataUrl: vi.fn(),
  serializePosterSvg: vi.fn(() => "<svg/>"),
  svgToPngDataUrl: vi.fn(async () => "data:image/png;base64,AA=="),
}));

it("names the SVG after the project", () => { /* 点击 exportSvg → expect(downloadText).toHaveBeenCalledWith("<svg/>", "高三3班.svg", expect.any(String)) */ });
it("puts the PNG scale into the filename", async () => { /* setPngScale(2) → expect(downloadDataUrl).toHaveBeenCalledWith(expect.any(String), "高三3班-2x.png") */ });
it("exposes lastExport only after success and clears it on the next attempt", () => { /* error 路径断言 lastExport === undefined */ });
it("falls back to the default name when getProjectName returns null", () => {});
```

宿主组件写法：一个 `function Harness({ onReady })`，把 hook 返回值透过 ref 暴露给用例；`posterRef` 用 `document.createElementNS(SVG_NS, "svg")` 填充。

**`src/components/workspaces/DeliveryWorkspace.test.tsx`** 新增 1 个用例：

```tsx
  it("shows the export result bar with the file name and re-exports on demand", () => {
    const onRetry = vi.fn();
    const container = renderWorkspace({
      exportState: "success",
      exportResult: { kind: "png", fileName: "高三3班-2x.png" },
      onRetry,
    });
    const bar = container.querySelector('[role="status"].delivery-workspace__result');
    expect(bar?.textContent).toContain("已导出 高三3班-2x.png");
    expect(container.querySelector('[role="alert"]')).toBeNull();          // 成功不走 alert
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="PNG 导出倍率"]')?.value).toBe("2"); // 保留上下文
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="再次导出"]')?.click());
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("hides the result bar while a new export is running", () => {
    const container = renderWorkspace({ exportState: "exporting", exportResult: undefined });
    expect(container.querySelector(".delivery-workspace__result")).toBeNull();
  });
```

既有的 3 个用例（:59/:76/:92）都不需要改：`exportResult` 是可选 prop，`renderWorkspace` 的 `shared` 对象不传即为 `undefined`。

### 3.6 文案红线（这是 C 在 F 上的落点）

结果条与 status 文案**只允许**出现文件名与「已导出 / 再次导出」。禁止出现：`打印`、`印刷`、`PDF`、`mm`、`dpi`、`A3`、`A4`、`展板`。理由有两条且都是硬的：① 产品没有 PDF 导出，Round 1 已把「宣称导出 PDF」列为合规残留；② 物理尺寸口径归 PR #3（`src/lib/print-size.ts` + `describeExportPrintHint`），本轮碰它就是重复实现。

### 3.7 回滚

| 层 | 回滚动作 | 影响面 |
|----|---------|--------|
| F1 纯函数 | 删 `src/lib/export-filename.ts` + 测试 | 无外部状态 |
| F2 hook | 还原 3 处 `downloadX(...)` 的字面量文件名、删 `lastExport` state 与 `getProjectName` option | 无持久化、无格式变更 |
| F3 UI | 删结果条 JSX + 2 条 CSS + `exportResult` prop + App 的一行 | 无 |
| F-P2 工程包改名 | **单独记**：改名后导出的包文件名从 `cengfan-project-YYYY-MM-DD.json` 变为 `<项目名>-工程包-YYYY-MM-DD.json`。**包内容与格式零变化**，`parseProjectPackage` 只看内容不看文件名，`projectPackageDisplayName`（`project-package.ts:215`）会把新名字作为导入后的项目名（这正是期望行为）。回滚＝改回默认参数，历史文件继续可导入 | 仅文件名 |

**破坏性变更登记**（AGENTS.md 交付纪律要求）：F 改变了 PNG/SVG 的默认下载文件名。下游影响只有「用户下载目录里的文件名」与「用户自己写的脚本按 `我的毕业去向图.png` 匹配」——仓库内 `rg "我的毕业去向图"` 只命中 `usePosterExport.ts:69` 与 `:146` 两处生产代码，**无测试、无文档、无脚本依赖该名字**，回滚成本＝还原两个字面量。

---

## 4. H — 工作台「重新载入示例」+ 空名单不再判健康

### 4.1 H1：`src/lib/stage-overview.ts` 的 `dataCards`

现状最后的兜底分支在 `total === 0` 时输出「0 人 · 无缺失、无重复、全部可定位」＝一个绿色的「健康」空项目，而同屏的 `WorkflowStageStepper` 由 `workflow-progress.ts` 判为 `empty`（未开始）。两个面板互相打脸。

**改法：在函数最前面加前置分支**（`dataCards` 开头，`const cards: StageOverviewCard[] = []` 之后、`if (h.missingRequired > 0)` 之前）：

```ts
  if (h.total === 0) {
    return [{
      id: "data-empty",
      question: "先导入名单",
      status: "还没有学生数据 · 可粘贴名单、上传 Excel 或手动添加",
      severity: "info",
    }];
  }
```

四个决定及其理由：

- **放函数最前面，不放 `cards.length === 0` 分支里。** 语义上「没有数据」优先于「没有问题」；工程上这能避开 PR #10（它改的正是 `cards.length === 0` 里的 `data-clean` 那 5 行，见 §6），两个 hunk 相距 ~12 行，git 三行上下文可自动合并。
- **`severity: "info"` 而不是 `"warning"`。** 空项目是正常起点不是错误；关键点是**不能是 `"ok"`**（`ok` 才是「健康」那颗绿点，`StageOverviewPanel.tsx:63` 的 `--ok` 圆点）。测试要断言的是 `not.toBe("ok")`，而不是等于某个具体值。
- **不给 `action`。** 这张卡只在数据阶段渲染，导入控件就在同屏右侧；给 `{ kind: "stage", stage: "data" }` 会让卡片变成一个点了没反应的 `<button>`（`StageOverviewPanel.tsx:69-79`），是比没有按钮更差的 a11y。
- **status 文案对齐 `frontUI2.md:328-342` 的三个起点**（粘贴 / Excel / 手动），但**不在这里放格式示例行**（`张三 浙江大学 杭州`）——那属于数据阶段空态 UI，是 G18 的另一半，本轮不做。

**P2（可选，同 PR 或延后）：** `exportCards` 在 `total === 0` 时同样会说「导出检查通过 · 数据、排版、资源均无问题」。若一并修，在 `exportCards`（:181）的 `const cards` 之后加：

```ts
  if (input.dataHealth.total === 0) {
    cards.push({ id: "export-empty", question: "还没有名单", status: "导出前先在「数据与素材」导入学生数据", severity: "warning", action: { kind: "stage", stage: "data" } });
  }
```

这里给 `action` 是对的：导出阶段跳数据阶段是真实导航（`App.tsx:1474-1477` 已支持 `kind: "stage"`）。P2 与 P1 分开提交，便于单独回滚。

### 4.2 H1 测试：`src/lib/stage-overview.test.ts`

新增用例（放在 `:48` 的 healthy roster 用例**之后**，形成「空 vs 健康」对照）：

```ts
  it("does not call an empty roster healthy", () => {
    const health: DataHealthSummary = { total: 0, visible: 0, hidden: 0, international: 0, unresolved: 0, missingRequired: 0, duplicate: 0 };
    const cards = deriveStageOverviewCards(makeInput({ stage: "data", dataHealth: health }));
    expect(cards.map((c) => c.id)).toEqual(["data-empty"]);
    expect(cards[0].severity).not.toBe("ok");
    expect(cards[0].status).toContain("Excel");
    expect(cards.some((c) => c.id === "data-clean")).toBe(false);
    expect(cards[0].action).toBeUndefined();      // 无动作，渲染为 div 而非死按钮
  });
```

**不会破坏的既有断言（已逐条核对）：**

- `stage-overview.test.ts:48-53`「healthy roster」用 `total: 10` → 走不到新分支。
- `:95-99`「caps every stage」用 `total: 20` → 不受影响。
- `:39-46`、`:55-93`、`:102-116` 都显式传了非零 total 或用的是 map/content/export 阶段。
- `makeInput` 的**默认** `dataHealth.total` 是 0（`:28`），但默认 `stage` 是 `"data"` 的用例都显式覆盖了 `dataHealth`；用默认 health 的用例（`:104` 的 `stage: "export"`、`:112` 的 `stage: "content"`）不走 `dataCards`。**若做 P2，`:104` 的 export 用例会多出一张 `export-empty` 卡**——它只断言 `model.cards.length > 0`，仍然通过；`:78-93` 的 export 用例显式断言了 3 张卡的存在性而非长度，也通过。
- `src/components/StudioAssistantRail.test.tsx:34-38` 与 `src/components/StudioAssistantDrawer.integration.test.tsx:48` 里出现的 `data-clean` / 「0 人 · …健康」是**内联 fixture**，不经过 `deriveStageOverviewCards`，因此不会红。但 integration 那条 fixture 现在是一条会误导后人的过时文案，**建议顺手改成 `data-empty` 的新文案**（非阻塞，改了也不影响该用例的断言目标）。

### 4.3 H2：工作台「载入示例项目」

**现状**：`ProjectWorkbench.tsx:62-81` 只在 store 为空且本次挂载未播种过时自动播种一次（`seededRef`）。用户删光项目后，当前挂载内不会重新播种，空态（`ProjectGrid.tsx:25-30`）只有一句「点击『新建项目』或『导入』」，没有零门槛试用路径。

**改动 1 — `src/components/ProjectWorkbench.tsx`**，在 `createProject`（:112-120）旁新增：

```tsx
  const loadSampleProject = async () => {
    try {
      const sample = createSampleProject();
      await store.put(sample);
      seededRef.current = true;      // 手动载入等价于已播种，避免下次挂载再自动塞一份
      setError("");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? `载入示例项目失败：${reason.message}` : "载入示例项目失败");
    }
  };
```

`createSampleProject` 已在 `:2` 导入，无新 import。**不导航**（不调 `openProject`）：让用户看到卡片出现在列表里，与「新建项目」的直接进编辑器区分开——新建是「我要开工」，载入示例是「我先看看」。

**改动 2 — `ProjectGrid` 传参**（`:195` 的调用处）：

```tsx
        onLoadSample={() => void loadSampleProject()}
```

**改动 3 — `src/components/workbench/ProjectGrid.tsx`**：props 增 `onLoadSample: () => void`（**必填**，只有一个调用点，可选会诱发「忘了传就悄悄没按钮」），空态分支（:25-30）加按钮：

```tsx
      <div className="workbench-empty">
        <span className="workbench-empty__mark" aria-hidden="true"><MapPinned size={22} /></span>
        <strong>还没有项目</strong>
        <p>点击「新建项目」或「导入」开始制作毕业去向图。</p>
        <button type="button" className="secondary-button" aria-label="载入示例项目" onClick={onLoadSample}>
          载入示例项目
        </button>
      </div>
```

**只放空态，不放 header。** `WorkbenchHeader` 只有「导入 / 新建项目」两个动作，塞第三个会稀释主 CTA；而「重新载入示例」的触发场景恰好只有「删光了」。加载态分支（:19-24）与错误态（`hasError`）都不渲染此按钮——加载中点它会和播种 IIFE 打架，有错误时应先看横幅。

按钮不带图标（`MapPinned` 已被空态的 mark 占用，再引入 lucide 图标只为一个按钮不划算）。

### 4.4 H2 测试：`src/components/ProjectWorkbench.test.tsx`

新增用例（放在「deletes a project after confirmation」之后，复用它的删除路径造出空态）：

```tsx
  it("reloads the sample project from the empty state after everything is deleted", async () => {
    const store = createMemoryProjectStore();
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.textContent).toContain("示例：2026届毕业去向"));

    container.querySelector<HTMLButtonElement>('[aria-label="项目菜单"]')?.click();
    await vi.waitFor(() => expect(container.textContent).toContain("删除"));
    vi.stubGlobal("confirm", vi.fn(() => true));
    Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("删除"))?.click();
    await vi.waitFor(() => expect(container.querySelector(".workbench-empty")).not.toBeNull());

    const load = container.querySelector<HTMLButtonElement>('button[aria-label="载入示例项目"]');
    expect(load).not.toBeNull();
    load!.click();
    await vi.waitFor(async () => {
      expect(await store.list()).toHaveLength(1);
      expect(container.textContent).toContain("示例：2026届毕业去向");
    });
  });

  it("does not offer the sample action while loading or after a store error", async () => {
    const store = createMemoryProjectStore();
    const failingStore = { ...store, put: () => Promise.reject(new Error("配额不足")) };
    const { container } = renderWorkbench(failingStore);
    await vi.waitFor(() => expect(container.querySelector(".workbench-error")).not.toBeNull());
    expect(container.querySelector('button[aria-label="载入示例项目"]')).toBeNull();
  });
```

第一个用例必须**在同一次挂载内**删除再载入：重新挂载会触发 `:62-81` 的自动播种，测不出手动入口。第二个用例复用了 `:195-207` 已验证的失败 store 范式（`hasError` 时不渲染空态，`ProjectGrid.tsx:25` 的 `!hasError` 条件）。

`ProjectGrid` 没有独立测试文件，覆盖率由 `ProjectWorkbench.test.tsx` 承担——与仓库现状一致，不新建 `ProjectGrid.test.tsx`。

### 4.5 H 回滚

- H1：删 `dataCards` 的前置分支（+ P2 的 `export-empty`）与对应测试。纯派生层，无存储、无契约。
- H2：删按钮 + prop + `loadSampleProject`。已经载入的示例项目是普通 `StoredProject`，用户自行删除即可；**不需要**数据迁移。

---

## 5. C / G 中与编辑器文档相邻的部分

任务限定「C/G 只做触及编辑器文档的部分：CHANGELOG 落点；不要发明印刷尺寸」。以下是全部落点。

### 5.1 G — CHANGELOG 放哪、写什么

**落点：仓库根 `CHANGELOG.md`。** 这不是设计选择，是既有约定：`DEVELOPER.md:152` 的发布流程第一步已经写着「更新 `CHANGELOG.md`」，而文件不存在（`rg CHANGELOG` 全仓只有这一处命中）。放 `docs/` 下会让这条已发布的开发者文档继续指向空气，也不符合 GitHub 对根 `CHANGELOG.md` 的自动识别。

**格式**：Keep a Changelog 1.1 结构 + 中文条目 + 语义化版本；当前 `package.json` 是 `0.1.0`，本轮三项进 `## [未发布]`。

```markdown
# 更新日志

本项目的所有重要变更都记录在此文件。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

### 新增
- 交付阶段导出成功后显示结果条，包含文件名与「再次导出」。（#PR）
- 项目工作台空态新增「载入示例项目」，删光项目后可重新取回示例。（#PR）

### 变更
- PNG / SVG 导出文件名改为「项目名 + 倍率」，例如 `高三3班-2x.png`；旧文件名为固定的 `我的毕业去向图.png`。（#PR）
- 「本阶段」总览在名单为空时提示「先导入名单」，不再显示「名单数据健康」。（#PR）

### 修复
- 数据与素材阶段恢复「下载 XLSX 模板」按钮（此前被 `hideTemplateDownload` 隐藏）。（#PR）
- 名单导入 / 模板下载的结果消息进入常驻 `role="status"` 区域，屏幕阅读器可感知。（#PR）
```

**边界**：CHANGELOG 用于「点名致谢」这一非付费会员替代机制（Round 1 §会员合法形态）时，只写贡献者 GitHub 用户名，**不写**任何付费/会员/等级/赞助层级字样（`docs/开源与收费边界.md:52`）。贡献者名录文件、致谢规则文档属于 G 的其余部分，本轮不写。

**冲突提示**：PR #8 大范围重写文档（含 `DEVELOPER.md`、`CONTRIBUTING.md`、`README.md`、`USER_GUIDE.md`），但其 diff 中 `rg CHANGELOG` 零命中 → 新建根 `CHANGELOG.md` 与 #8 **无文件级冲突**。

### 5.2 C — 只修 D/F/H 直接牵动的能力漂移文案

| # | 位置 | 现状 | 改为 | 归属 |
|---|------|------|------|------|
| C-1 | `USER_GUIDE.md:81-82` | 「Q: Excel 导入失败？A: 检查字段名是否为「姓名」「去向」「省份」，或使用 CSV 格式。」 | 「A: 在「数据与素材」阶段点「下载 XLSX 模板」，按模板的**学生姓名 / 录取院校 / 城市 / 去向类型**四列填写；也支持 CSV。」 | D（**必做**） |
| C-2 | `USER_GUIDE.md:111`「导出 3 种风格供投票」 | 与「三次导出互相覆盖」的现实矛盾 | F 落地后自然成立（文件名带项目名）；若同一项目连导三种风格仍会同名，**在 FAQ 补一句「导出前改一次项目名即可区分」**，不要承诺自动编号 | F（建议） |
| C-3 | F 的结果条 / status 文案 | — | 禁用词见 §3.6 | F（**必做**） |
| C-4 | `src/components/StudioAssistantDrawer.integration.test.tsx:48` fixture 的「0 人 · 无缺失、无重复、全部可定位」 | 过时文案标本 | 同步成 `data-empty` 的新文案 | H（可选） |

C-1 的字段名错得很具体：模板真实表头来自 `binary-import.ts:24-39` 的 `学生姓名 / 录取院校 / 城市 / 去向类型`，而指南写的「姓名/去向/省份」中只有「姓名」在别名表（`binary-import.ts:43+` 的 `HEADER_ALIASES`）里命中。**用户照着 FAQ 填必然导入失败**——这是把 D 做完整必须一起改的一行。

**不做**（属 C 的其余部分，Round 3 另议）：`promo:lint` 脚本、案例模板「本科率 85%」、KOL「+500 Star」、`#985` 话术、宣发文档里的「导出 PDF / 世界地图」。它们不触及编辑器代码或编辑器文档。

**不做**（属 PR #3）：任何 mm / dpi / A3 / A4 / 展板尺寸口径。PR #3 已实现 `src/lib/print-size.ts`、`describeExportPrintHint()` 并向 `CANVAS_SIZE_PRESETS` 加了 `a3-150 / a2-150 / board-90x60` 三个预设。本规格**不发明任何印刷尺寸数字**。

---

## 6. 与在途 PR 的冲突矩阵（基于真实 diff，不是推测）

| 本轮文件 | 冲突 PR | PR 实际改了什么 | 冲突级别 | 规避 / 合并手法 |
|---------|---------|----------------|---------|----------------|
| `src/lib/stage-overview.ts` | **#10** | 在 `dataCards` 的 `cards.length === 0` 分支把 `data-clean` 改成 5 行对象并加 `action: { kind: "stage", stage: "map" }`；另给 map/frame/content 加「下一步」卡 | **中** | H1 的新分支放**函数最开头**（§4.1），与 #10 的 hunk 相距 ~12 行，三行上下文可自动合并。若 #10 先合，H1 无需改写；若 H1 先合，#10 的 `data-clean` 改动仍然只在「有数据且无问题」时生效，语义不打架 |
| `src/lib/stage-overview.test.ts` | **#10** | 同文件加了「下一步」相关用例 | 低 | 新用例追加在 `:53` 之后，与 #10 追加的位置不同 |
| `src/components/workspaces/DeliveryWorkspace.tsx` | **#3** | 在 `导出设置` section（:113 之后）插一个 `<span data-export-print-size>` + 顶部 import `describeExportPrintHint` | **中** | F 的结果条插在 `</section>`（:116）**之后**、`导出操作`（:117）之前，与 #3 的插入点隔一行。两者都改 import 块 → 预期一次小的 import 冲突，手工合并即可 |
| `src/components/workspaces/DeliveryWorkspace.test.tsx` | **#3 / #10** | #3 加印刷提示断言 | 低 | 新用例追加在文件末尾 |
| `src/components/workbench/ProjectGrid.tsx` | **#3** | **改的正是空态那句 `<p>` 文案**（改成「做毕业去向、开学合影或校庆班级图」） | **高（同行）** | H2 只**追加**按钮行、不碰 `<p>`。若 #3 先合，直接在新文案下方加按钮；若 H2 先合，#3 的单行改动仍可 apply。**任何一方都不要顺手改对方那一行** |
| `src/components/ProjectWorkbench.tsx` / `.test.tsx` | **#7** | 公开 Demo 改这两个文件（base path / 演示态） | 中 | H2 的改动集中在 `createProject` 附近与 `<ProjectGrid>` 调用行；#7 主要动导入与路径逻辑。预期可合，合并后需重跑 `ProjectWorkbench.test.tsx` 全文件 |
| `src/components/workspaces/DataUploadWorkspace.tsx` | **#9 / #10 / #11** | #11 只改 import 与 `MappingIssueRow` 的 key（`resolveDataIssueId`）；#9/#10 改 stage 元数据与该组件的其他部分 | 低 | D1-a 删的是 `:128` 单行，三个 PR 均未触及该行 |
| `src/components/workspaces/DataUploadWorkspace.test.tsx` | **#9 / #10 / #11** | 三者都改该测试 | **中** | D 改的是第一个用例里的 `:94` / `:96` 两行。合并时以「按钮必须存在」为准，不要被任一 PR 的旧断言覆盖回 `toBeNull()` |
| `src/components/DataWorkspace.tsx` | **#11** | 把导入区拆到 `data-workspace-import-panel.tsx`（按钮随之搬家，`hideTemplateDownload` 作为必填 prop 透传）；`data-message` 两行**保持原位不变** | 中 | D2 的 live region 改的正是 #11 未动的那两行 → 可合。D1 因为保留了 prop（§2.2）而与 #11 天然兼容 |
| `src/App.tsx` | **#5 / #6 / #9 / #10 / #11** | 五个 PR 都在改 App | **高（文件级）** | 本轮对 App 只有 3 行：`:1668` 删一个键、`:650` 之后加一行 `getProjectName`、`:1764`（`exportError` 之后）加一行 `exportResult`。行级冲突概率低，但**每次 rebase 后必须重跑 `src/App.test.tsx`** |
| `src/styles.css` | **#3 / #6 / #11** | 三者都改 | 中 | D2 只动 `:397` 一处选择器 + 新增 1 行；F 的样式放 `workflow-workspaces.css`（只有 #10 轻改）以避开 `styles.css` 的热点 |
| `CHANGELOG.md`（新建） | **#8** | #8 重写大量文档但零 CHANGELOG 命中 | 无 | — |
| `USER_GUIDE.md` | **#3 / #7 / #8 / #10** | 四个 PR 都改 | 中 | C-1 只改 `:82` 一行答案，尽量最后合 |

**建议合并顺序**（若可协调）：#11（大重构）→ #3 → 本轮 D → 本轮 H → 本轮 F。若不可协调，就按 §1 的顺序独立开 PR，每个 PR rebase 后跑一次全量。

---

## 7. 验证与交付纪律

### 7.1 命令（AGENTS.md：重操作走 `scripts/run-heavy.mjs`，不要并行开多套全量）

```bash
# 开发中：只跑目标文件
npx vitest run src/lib/export-filename.test.ts
npx vitest run src/lib/usePosterExport.test.tsx
npx vitest run src/lib/stage-overview.test.ts
npx vitest run src/components/DataWorkspace.test.tsx
npx vitest run src/components/workspaces/DataUploadWorkspace.test.tsx
npx vitest run src/components/workspaces/DeliveryWorkspace.test.tsx
npx vitest run src/components/ProjectWorkbench.test.tsx

# 合入前（串行，一次一个）
npm test
npm run lint
```

`src/App.test.tsx` 在 D 与 F 合入前也要单独跑一次：它有 4 条导出失败路径用例（`:185-251`），虽然只断言错误态与配置保留、不断言文件名，但 F 改了 hook 的状态清空时机。

### 7.2 每个 PR 的完成报告必须给出四步证据链

按 AGENTS.md「failure → cause → fix → recheck」，每条失败都要写：① 失败命令与失败断言原文；② 根因假设（例如「`DataUploadWorkspace.tsx:128` 的硬编码 prop 覆盖了 spread 传入值」）；③ 最小修复的 diff 行；④ **重跑同一条命令**的通过输出。禁止「重试一次就过了」。

### 7.3 交付方式（面向用户的改动必须写清）

| 项 | 验收方式 |
|----|---------|
| D | PR 描述附「数据阶段截图（按钮可见）」+ 下载到的 xlsx 两个 sheet 截图 + 一次屏幕阅读器验证记录（§2.5） |
| F | PR 描述附三次连续导出的文件名列表（1x / 2x / SVG）+ 结果条截图 |
| H | PR 描述附「删光后空态截图」与「点击后卡片出现截图」+ 空项目的「本阶段」总览截图（不再是绿色「健康」） |

本地测试通过 + agent 口述完成**不算**交付证据（AGENTS.md 明文）。

### 7.4 破坏性变更与回滚一览

| 变更 | 是否破坏性 | 回滚 |
|------|-----------|------|
| D1 恢复按钮 | 否（纯恢复） | 还原两行 |
| D2 live region | 否；但 `styles.css:397` 选择器改名需一起回滚 | 还原 JSX + 2 处 CSS |
| F PNG/SVG 文件名 | **是（轻）**：用户下载文件名变化；仓库内无任何测试/文档/脚本依赖旧名 | 还原两个字面量 |
| F-P2 工程包文件名 | **是（轻）**：仅文件名，包格式与 `parseProjectPackage` 零变化，旧包继续可导入 | 还原 `downloadProjectPackage` 的第二参 |
| F 结果条 | 否 | 删 JSX + CSS + prop |
| H1 空名单卡 | 否（派生层） | 删分支 |
| H2 载入示例 | 否；产生的是普通项目记录 | 删按钮与 handler，已生成的项目用户自删 |
| G CHANGELOG | 否 | 删文件 |

**没有任何一项触及**：`project-package` / `resource-pack` 版本、协作 API 形状、`ProjectDocument` 结构、IndexedDB store 结构、`card-layout` / `connector-geometry` / `PosterCanvas`。因此不需要数据迁移方案。

---

## 8. 本轮明确不做（防止 Round 3 越界）

- 印刷尺寸预设、mm/dpi 换算、A3/A4/展板文案 → PR #3。
- 公开 Demo / Pages / base path → PR #7。
- 顺序 CI 门禁 → PR #5；仓库大清理与死代码删除（`WorkflowGuide`、`GlobalDataScreen`）→ PR #8 / Round 1 的 #8 项。
- 六阶段导航重排与工作台 UX 大改 → PR #9 / #10。
- 数据阶段空态的三起点 UI 与格式示例行（`frontUI2.md:336-340`）→ 与 #10 高度重叠，本轮只做 `stage-overview` 的判定口径。
- Excel 表头手工映射纠正（G5）、协作昵称（G12）、社区模板包（G14）、应用内反馈入口（G1）→ Round 2 其他代理 / Round 3。
- 支付、套餐、订单、兑换码、VIP、模板手续费结算、导出付费锁 → `docs/开源与收费边界.md:52` 永久禁止。
- 世界地图、PDF 导出 → 产品不具备该能力，代码与文案都不得暗示。
