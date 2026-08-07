# 数据与素材工作台（数据阶段并入素材库）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「上传数据」阶段改名为「数据与素材」，在数据工作台右侧栏以「数据质量 | 素材库」页签提供素材上传、简单处理（自动抠图/删除）、画布背景与省份素材设置，复用现有 AssetPanel 与已接线的素材回调。

**Architecture:** 数据主表区不变；右侧 aside 改为页签容器（数据质量·地图映射 / 素材库），素材库页签直接复用 `AssetPanel`，其省份选择由工作台本地 state 驱动。数据阶段顶部流程标签与工作台标题同步改名为「数据与素材」。

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Lucide, plain CSS in `src/styles.css`。

## Global Constraints

- 不改动 `ProjectDocument` 数据模型、事务、撤销/重做、导入导出、AI 影子预览与确认应用行为。
- 数据主表区（DataWorkspace）行为与布局保持不变；右侧栏从单一质量面板变为页签容器，不改数据表逻辑。
- `AssetPanel` 组件本身不改（除非发现必须的最小 bug）；素材库接线复用 App.tsx 已存在的 `mapStyleAssetPanelProps` 回调集合。
- 保留所有既有 input id、label htmlFor、ARIA 语义与回调契约；新增页签必须使用正确的 `tablist`/`tab`/`tabpanel` 语义与键盘箭头支持。
- 阶段标签改动必须同步更新所有断言旧文案「上传数据」/「上传数据工作台」的测试；不保留陈旧文案。
- 素材库完整接线：上传图片、上传省份贴图、自动抠图、删除素材、画布背景（onApplyBackground）、省份外观（onApplyProvinceAppearance/onResetProvinceAppearance/onApplyProvinceThemes/onPatchProvinceTextureUniformSize）、资源包导入导出、通用图片"添加到画布"（onCreateDecoration）。
- 不做计划外重构；不新增 UI 框架；不修改经典皮肤；不新增 Playwright 截图工具。

---

## Task 1: 阶段标签与工作台文案改名为「数据与素材」

**Files:**
- Modify: `src/lib/workflow-stages.ts`
- Modify: `src/lib/workflow-stages.test.ts`
- Modify: `src/components/WorkflowStageStepper.test.tsx`
- Modify: `src/components/workspaces/DataUploadWorkspace.tsx`（仅标题文案）
- Modify: `src/components/workspaces/DataUploadWorkspace.test.tsx`（旧断言文案）
- Modify: `src/App.test.tsx`（旧断言文案）

**Interfaces:**
- Consumes: `WORKFLOW_STAGES`（`src/lib/workflow-stages.ts:20`），`DataUploadWorkspace` 标题区。
- Produces: 阶段 `data` 的 `label: "数据与素材"`、`description: "导入名单并准备地图素材"`；工作台 `aria-label="数据与素材工作台"`；标题 `<strong>数据与素材</strong>`、副标题「导入、筛选、校验、地图映射与素材」。

- [ ] **Step 1: 更新文案源**

在 `src/lib/workflow-stages.ts` 将 data 阶段改为：

```ts
{ id: "data", label: "数据与素材", description: "导入名单并准备地图素材" },
```

在 `src/components/workspaces/DataUploadWorkspace.tsx` 中：

```tsx
<main className="data-upload-workspace data-upload-workspace--expanded" aria-label="数据与素材工作台">
```

标题区改为：

```tsx
<div className="data-upload-workspace__title">
  <strong>数据与素材</strong>
  <span>导入、筛选、校验、地图映射与素材</span>
</div>
```

- [ ] **Step 2: 更新旧文案测试断言**

逐处把「上传数据」→「数据与素材」、「上传数据工作台」→「数据与素材工作台」。明确位置：

- `src/lib/workflow-stages.test.ts:29` → `"数据与素材"`
- `src/components/WorkflowStageStepper.test.tsx:38` → `"数据与素材"`
- `src/components/workspaces/DataUploadWorkspace.test.tsx:52` → `'main[aria-label="数据与素材工作台"]'`
- `src/App.test.tsx` 全部旧文案：
  - `:76` `click(workflowStage(container, "数据与素材"))`
  - `:825,:839,:843,:852,:873,:965,:974,:1027` `'main[aria-label="数据与素材工作台"]'`
  - `:968` `aria-label` 断言 → `"数据与素材"`
  - `:1018` `"2数据与素材"`（若该断言是 `aria-label` 含序号，按实际格式保留序号前缀）
  - `:1026` `'[aria-label="数据与素材"]'`
  - `:1333` `click(workflowStage(container, "数据与素材"))`

- [ ] **Step 3: 运行旧断言相关测试验证通过**

Run:

```bash
npx vitest run src/lib/workflow-stages.test.ts src/components/WorkflowStageStepper.test.tsx src/components/workspaces/DataUploadWorkspace.test.tsx src/App.test.tsx
```

Expected: PASS（App.test.tsx 可能较长，耐心等待）。

- [ ] **Step 4: 检查是否有遗漏引用**

Run:

```bash
rg -n "上传数据" src
```

Expected: 无输出（`.md` 文档不要求改）。

## Task 2: 数据工作台右侧页签「数据质量 | 素材库」

**Files:**
- Modify: `src/components/workspaces/DataUploadWorkspace.tsx`
- Modify: `src/styles.css`
- Modify: `src/components/workspaces/DataUploadWorkspace.test.tsx`

**Interfaces:**
- Consumes: 现有 `data-upload-workspace__data` 主表区、`data-upload-workspace__quality` 质量面板内容。
- Produces: 右侧 `aside.data-upload-workspace__rail`，内含 `div.data-upload-workspace__rail-tabs`（两个 `role="tab"`：`数据质量`、`素材库`）与两个 `role="tabpanel"`；质量内容移至「数据质量」tabpanel，`AssetPanel` 放入「素材库」tabpanel。

- [ ] **Step 1: 写失败测试（页签结构与默认页签）**

在 `src/components/workspaces/DataUploadWorkspace.test.tsx` 增加：

```tsx
it("switches the right rail between quality and asset library tabs", () => {
  const { container } = renderWorkspace(); // 复用现有 renderWorkspace，传 assetPanelProps

  const tabs = container.querySelector('.data-upload-workspace__rail-tabs[role="tablist"]');
  expect(tabs).not.toBeNull();
  const qualityTab = container.querySelector('[role="tab"][aria-controls="data-rail-quality"]');
  const assetsTab = container.querySelector('[role="tab"][aria-controls="data-rail-assets"]');
  expect(qualityTab?.textContent).toContain("数据质量");
  expect(assetsTab?.textContent).toContain("素材库");
  expect(qualityTab?.getAttribute("aria-selected")).toBe("true");
  // 默认显示质量，素材库面板未渲染
  expect(container.querySelector('#data-rail-assets')).toBeNull();
  expect(container.querySelector('#data-rail-quality')).not.toBeNull();
  // 切到素材库
  flushSync(() => assetsTab?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(container.querySelector('[role="tab"][aria-controls="data-rail-assets"]')?.getAttribute("aria-selected")).toBe("true");
  expect(container.querySelector('#data-rail-assets .asset-panel')).not.toBeNull();
  expect(container.querySelector('#data-rail-quality')).toBeNull();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npx vitest run src/components/workspaces/DataUploadWorkspace.test.tsx
```

Expected: FAIL（rail/tab 结构尚不存在）。

- [ ] **Step 3: 实现页签容器**

在 `DataUploadWorkspace.tsx`：
- 顶部 `import { useState, type ComponentProps } from "react"`（已有 useState）。
- 新增 state：`const [railTab, setRailTab] = useState<"quality" | "assets">("quality");`
- 将现有 `<aside className="data-upload-workspace__quality">...</aside>` 替换为：

```tsx
<aside className="data-upload-workspace__rail" aria-label="数据工作台侧栏">
  <div className="data-upload-workspace__rail-tabs" role="tablist" aria-label="数据侧栏">
    <button
      type="button"
      role="tab"
      id="data-rail-quality-tab"
      aria-selected={railTab === "quality"}
      aria-controls="data-rail-quality"
      onClick={() => setRailTab("quality")}
    >
      数据质量
    </button>
    <button
      type="button"
      role="tab"
      id="data-rail-assets-tab"
      aria-selected={railTab === "assets"}
      aria-controls="data-rail-assets"
      onClick={() => setRailTab("assets")}
    >
      素材库
    </button>
  </div>
  {railTab === "quality" ? (
    <section
      className="data-upload-workspace__quality"
      id="data-rail-quality"
      role="tabpanel"
      aria-labelledby="data-rail-quality-tab"
    >
      {/* 原 aside 内全部内容原样保留 */}
    </section>
  ) : (
    <section
      className="data-upload-workspace__assets"
      id="data-rail-assets"
      role="tabpanel"
      aria-labelledby="data-rail-assets-tab"
    >
      <AssetPanel {...assetPanelProps} selectedProvince={assetProvince} selectedProvinceStyle={project.map.provinceStyles?.[assetProvince]} onCreateDecoration={onCreateDecoration} onSelectProvince={setAssetProvince} />
    </section>
  )}
</aside>
```

其中 Task 3 定义 `assetPanelProps`、`onCreateDecoration`、`assetProvince`。为让 Task 2 独立可测，Task 2 先声明 props 接口（见 Task 3 Interfaces），Task 2 实现时即可让测试通过（测试通过不依赖 Task 3 的回调细节）。

- [ ] **Step 4: 键盘支持**

在 rail 页签上增加 ArrowLeft/ArrowRight 支持（复用 StudioAssistantRail 模式）：

```tsx
const onRailTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const next = railTab === "quality" ? "assets" : "quality";
  setRailTab(next);
  document.getElementById(next === "quality" ? "data-rail-quality-tab" : "data-rail-assets-tab")?.focus();
};
```

将 `onKeyDown={onRailTabKeyDown}` 加到两个 tab 按钮。

- [ ] **Step 5: 运行测试验证通过**

Run:

```bash
npx vitest run src/components/workspaces/DataUploadWorkspace.test.tsx
```

Expected: PASS。

## Task 3: 素材库接线（props 扩展 + App 传参）

**Files:**
- Modify: `src/components/workspaces/DataUploadWorkspace.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/workspaces/DataUploadWorkspace.test.tsx`

**Interfaces:**
- Consumes: `mapStyleAssetPanelProps`（`src/App.tsx:1679`，类型 `ContentAssetPanelProps` = `ComponentProps<typeof AssetPanel>`）；App.tsx 现有 `addUserAsset`/`replaceUserAsset`/`deleteUserAsset`/`exportResourcePack`/`importResourcePack`/`commitProject`/`applyTransaction`/`createId`/`createDecorationElement`/`setSelection`/`commitProjectTransaction`。
- Produces:
  - `DataUploadWorkspace` 新增 props：

```ts
export type DataAssetPanelProps = Omit<
  ComponentProps<typeof AssetPanel>,
  "selectedProvince" | "selectedProvinceStyle" | "onCreateDecoration"
>;
```

```ts
assetPanelProps: DataAssetPanelProps;
onCreateDecoration: NonNullable<ComponentProps<typeof AssetPanel>["onCreateDecoration"]>;
```

  - 内部 state：`const [assetProvince, setAssetProvince] = useState("");`
  - App.tsx 中 `<DataUploadWorkspace>` 新增 `assetPanelProps={mapStyleAssetPanelProps}` 与 `onCreateDecoration={...}`（创建装饰实例并写入 `assetElements`，与 legacy 编辑器 `App.tsx:2498-2517` 一致）。

- [ ] **Step 1: 写接线失败测试**

在 `src/components/workspaces/DataUploadWorkspace.test.tsx` 增加（覆盖"素材库可操作"）：

```tsx
it("lets the asset tab create a canvas decoration from an uploaded image", () => {
  const onCreateDecoration = vi.fn();
  const { container } = renderWorkspace({ onCreateDecoration, assetPanelProps: { onApplyBackground: vi.fn() } });
  // 打开素材库页签
  flushSync(() => container.querySelector('[role="tab"][aria-controls="data-rail-assets"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(container.querySelector('#data-rail-assets .asset-panel')).not.toBeNull();
  // 省份选择器受控联动
  const provinceSelect = container.querySelector("#asset-province") as HTMLSelectElement;
  expect(provinceSelect).not.toBeNull();
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  flushSync(() => {
    setter?.call(provinceSelect, "北京市");
    provinceSelect.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(container.querySelector("#asset-province-upload")).not.toBeNull();
});
```

（`renderWorkspace` 需要扩展为接收 overrides 并传 `assetPanelProps` 与 `onCreateDecoration`；无 `onCreateDecoration` 默认时用 `vi.fn()`。）

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npx vitest run src/components/workspaces/DataUploadWorkspace.test.tsx
```

Expected: FAIL（props 尚不存在或 tab 未接线）。

- [ ] **Step 3: 实现 DataUploadWorkspace props**

- 顶部导入：`import { AssetPanel } from "../AssetPanel";`、`import type { StudioAsset } from "../../lib/assets";`（如需要类型标注）。
- 函数签名新增 `assetPanelProps, onCreateDecoration`，并解构。
- 在组件内声明 `const [assetProvince, setAssetProvince] = useState("");`
- Task 2 的素材库 tabpanel 内 AssetPanel 渲染已写好（见 Task 2 Step 3）。

- [ ] **Step 4: App.tsx 传参**

在 `src/App.tsx` 的 `<DataUploadWorkspace ...>`（约 1898 行）新增：

```tsx
assetPanelProps={mapStyleAssetPanelProps}
onCreateDecoration={(asset) => {
  const element = createDecorationElement(asset, {
    x: project.canvas.width - 180,
    y: project.canvas.height - 180,
  });
  commitProject(
    applyTransaction(project, {
      id: createId("tx-decoration"),
      label: `添加装饰：${asset.label}`,
      source: "manual",
      apply: (current) => ({
        ...current,
        assetElements: [...current.assetElements, element],
      }),
    }),
  );
  setSelection({ type: "asset", id: element.id });
}}
```

确认 `createDecorationElement` 已在 App.tsx 导入（legacy 编辑器已在用）。若未导入则补导入 `from "./lib/asset-elements"`（路径以 legacy 编辑器实际导入为准）。

- [ ] **Step 5: 运行接线测试**

Run:

```bash
npx vitest run src/components/workspaces/DataUploadWorkspace.test.tsx src/components/AssetPanel.test.tsx
```

Expected: PASS。

- [ ] **Step 6: 类型检查**

Run:

```bash
npx tsc -p tsconfig.app.json --noEmit
```

Expected: exit 0。

## Task 4: 右侧栏样式适配（页签容器 + Atelier）

**Files:**
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: 现有 `.data-upload-workspace--expanded .data-upload-workspace__body`、`__quality`、`__data` 规则（约 175-265 行）与 Atelier 段 token（`--atelier-*`）。
- Produces: `.data-upload-workspace__rail`、`__rail-tabs`、`[role="tab"]`、`__assets`（素材库 tabpanel）规则；Atelier 皮肤下页签使用紧凑圆角与中性纸感；≤760px 时 rail 单列堆叠、页签仍 44px 可点。

- [ ] **Step 1: 在 expanded 上下文中把 rail 纳入布局**

现有：

```css
.data-upload-workspace--expanded .data-upload-workspace__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(280px, 22vw, 336px);
  min-height: 0;
  gap: 0;
  max-width: none;
  margin: 0;
  overflow: hidden;
}
```

保持不变（rail 顶替原 aside 位置）。新增：

```css
.data-upload-workspace__rail {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  background: var(--editor-surface-muted);
  border-left: 1px solid var(--editor-line);
}
.data-upload-workspace__rail-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 8px 8px 6px;
  background: var(--editor-surface);
  border-bottom: 1px solid var(--editor-line);
}
.data-upload-workspace__rail-tabs [role="tab"] {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  color: var(--editor-ink-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}
.data-upload-workspace__rail-tabs [role="tab"]:hover { color: var(--editor-ink); background: var(--editor-surface-muted); }
.data-upload-workspace__rail-tabs [role="tab"][aria-selected="true"] {
  color: #1c4d43;
  background: var(--editor-accent-soft, #e8f1eb);
  border-color: transparent;
}
.data-upload-workspace__rail [role="tabpanel"] {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 12px;
}
.data-upload-workspace__assets { display: grid; align-content: start; gap: 10px; }
```

注意：现有 `--expanded .data-upload-workspace__quality` 规则（padding/border/背景）仍然作用于质量 tabpanel；若与新 rail 冲突，调整为 rail 提供边框、tabpanel 只负责内边距与滚动。保持 `.data-upload-workspace__quality .data-quality-list` 等子选择器可用。

- [ ] **Step 2: Atelier 段覆盖**

在 Atelier 规则块末尾追加：

```css
.app-shell[data-editor-skin="atelier"] .data-upload-workspace__rail { background: var(--editor-surface); border-left-color: var(--editor-line); }
.app-shell[data-editor-skin="atelier"] .data-upload-workspace__rail-tabs {
  gap: var(--atelier-space-1, 4px);
  padding: var(--atelier-space-2, 8px) var(--atelier-space-2, 8px) 6px;
  background: var(--editor-surface);
  border-bottom-color: var(--editor-line);
}
.app-shell[data-editor-skin="atelier"] .data-upload-workspace__rail-tabs [role="tab"] {
  min-height: 30px;
  border-radius: var(--atelier-radius-control, 7px);
}
.app-shell[data-editor-skin="atelier"] .data-upload-workspace__rail-tabs [role="tab"][aria-selected="true"] {
  color: #1c4d43;
  background: var(--editor-accent-soft);
  box-shadow: none;
}
```

- [ ] **Step 3: 响应式**

在现有 `@media (max-width: 900px)`（约 283 行）与 `@media (max-width: 560px)` 中补充 rail 适配：

```css
@media (max-width: 900px) {
  .data-upload-workspace--expanded .data-upload-workspace__body { grid-template-columns: 1fr; overflow: visible; }
  .data-upload-workspace__rail { border-left: 0; border-top: 1px solid var(--editor-line); }
  .data-upload-workspace__rail [role="tabpanel"] { overflow: visible; }
}
@media (max-width: 560px) {
  .data-upload-workspace__rail-tabs [role="tab"] { min-height: 44px; }
}
```

（若 900px 规则已存在，合并进既有块，避免重复声明。）

- [ ] **Step 4: 验证构建**

Run:

```bash
npx tsc -p tsconfig.app.json --noEmit
npm run lint
```

Expected: 均通过。

## Task 5: 集成验证与回归

**Files:**
- 无生产代码改动；若发现必须的测试修正才改对应测试。

**Interfaces:**
- Consumes: Task 1-4 结果。

- [ ] **Step 1: 全量目标测试**

Run:

```bash
npx vitest run src/App.test.tsx src/components/workspaces/DataUploadWorkspace.test.tsx src/components/workspaces/DataUploadWorkspace.test.tsx src/components/AssetPanel.test.tsx src/components/StudioAssistantRail.test.tsx src/components/inspector/InspectorPanel.test.tsx src/components/inspector/MapInspector.test.tsx src/components/inspector/CardsInspector.test.tsx src/components/workspaces/MapStyleWorkspace.test.tsx src/components/workspaces/ContentLayoutWorkspace.test.tsx src/components/workspaces/DisplayFrameWorkspace.test.tsx src/lib/workflow-stages.test.ts src/components/WorkflowStageStepper.test.tsx
```

Expected: PASS。任何失败按 failure → root cause → minimal fix → rerun 处理并记录。

- [ ] **Step 2: 静态与生产检查**

Run:

```bash
npx tsc -p tsconfig.app.json --noEmit
npm run lint
npm run build
git diff --check
```

Expected: 均通过（仅保留既有 chunk-size 警告）。

- [ ] **Step 3: Impeccable 检测**

Run:

```bash
node "C:/Users/86080/.agents/skills/impeccable/scripts/detect.mjs" --json src/styles.css src/components/workspaces/DataUploadWorkspace.tsx src/components/AssetPanel.tsx src/components/StudioAssistantRail.tsx
```

Expected: `[]`，或全部可执行项修复后为 `[]`。

- [ ] **Step 4: 差异范围检查**

Run:

```bash
git diff --stat -- src/lib/workflow-stages.ts src/components/workspaces/DataUploadWorkspace.tsx src/components/workspaces/DataUploadWorkspace.test.tsx src/App.tsx src/App.test.tsx src/styles.css
```

确认只包含本计划文件与必要测试改动；不引入无关回退；未新增未跟踪工具/截图文件。

## Plan Self-Review

- **Spec 覆盖**：Task 1 改名；Task 2 页签结构与键盘语义；Task 3 素材库完整接线（含"添加到画布"）；Task 4 样式与响应式；Task 5 回归验证。用户需求"数据上传界面增加素材库上传和简单处理、直接设置地图背景与省份素材、改名数据与素材"全部覆盖。
- **占位符扫描**：无 TBD/TODO；每步有具体代码或命令。
- **类型一致性**：`DataAssetPanelProps` 基于 `ComponentProps<typeof AssetPanel>`；`assetPanelProps` 传 `mapStyleAssetPanelProps`（`ContentAssetPanelProps` 与 `ComponentProps<typeof AssetPanel>` 等价）；`onCreateDecoration` 类型与 AssetPanel 一致；`assetProvince`/`setAssetProvince` 在 Task 2/3 中同名同型。
- **接线确认**：`mapStyleAssetPanelProps` 已含 `onApplyBackground`/`onApplyProvinceAppearance`/`onApplyProvinceThemes`/`onResetProvinceAppearance`/`onPatchProvinceTextureUniformSize`/`onAddUserAsset`/`onReplaceUserAsset`/`onDeleteUserAsset`/`onExportResourcePack`/`onImportResourcePack`/`assetUsageById`；缺少的 `onSelectProvince`/`selectedProvince`/`selectedProvinceStyle`/`onCreateDecoration` 由 Task 2/3 补齐。
