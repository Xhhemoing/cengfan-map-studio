MODEL: claude-opus-5-thinking-high-fast

# R2-O1 文件级实现规格：A 提意见/帮助入口 · B 社区模板独立格式 · E 协作昵称与角色标签

> 角色：Round 2 设计者 R2-O1。**本轮只写规格，不改产品代码、不提交、不推送。**
> 依据快照：`cursor/feature-expansion-research-c710` @ `0507d71`（工作区仅 `.agent_workspace/PROGRESS.md` 有改动）。
> 所有行号引用均来自本轮实际阅读的源码，不是从 Round 1 报告转抄。
> 硬边界：不出现任何价格 / SKU / 套餐 / 订单 / 手续费结算字段；不新增服务端 API；不改六阶段导航。

---

## 0. 三件事的落点总览

| 项 | 新增文件 | 修改文件（行级锚点） | UI 挂载点 | 是否动 API |
|----|----------|----------------------|-----------|-----------|
| A 提意见/帮助 | `src/lib/feedback-links.ts`、`src/components/HelpFeedbackMenu.tsx` + 2 个测试 | `src/App.tsx`（+1 import，+1 常量，+2 处插槽）、`src/components/workbench/WorkbenchHeader.tsx`（+1 节点）、`src/styles.css` | 编辑器顶栏 `topbar-actions`（`ToolbarGroup label="帮助与反馈"`）+ 工作台 `WorkbenchHeader.workbench-actions` | 否 |
| B 模板交换格式 | `src/lib/template-package.ts`、`src/lib/template-exchange-actions.ts`、`src/components/TemplateExchange.tsx` + 4 个测试 | `src/lib/template-store.ts`（导出 2 个既有内部函数）、`src/components/TemplatePicker.tsx`（+1 可选插槽）、`src/components/GlobalSettingsScreen.tsx`（+2 可选 props）、`src/App.tsx`（+2 handler）、`src/styles.css` | **全局设置 → 数据 → 「数据展示」子页 → TemplatePicker 之下**（`GlobalSettingsScreen.tsx:299-307`） | 否 |
| E 协作昵称+角色 | `src/lib/collaboration-identity.ts`、`src/components/collaboration/DisplayNameInput.tsx`、`src/components/collaboration/RoomRoster.tsx` + 4 个测试 | `src/lib/app-constants.ts:11`（迁走常量）、`src/lib/useCollaborationRoom.ts:14,249,294`、`src/components/ProjectMenu.tsx:130-141`、`src/App.tsx`（+1 state，+3 props）、`src/styles.css` | 项目菜单 → 「在线协作」浮层内（`ProjectMenu.tsx:118-174`） | **否**（服务端 `displayName` 字段与 `participants` 投影已存在） |

三项互不重叠：A 只碰顶栏动作区与工作台头，B 只碰模板面，E 只碰协作浮层。**均不触碰** `WorkflowStageStepper` / `WorkflowStepper` / `StudioTopbar.workflowNav` / `STAGE_METADATA`，因此与开放 PR #9、#10（工作流入口重排）无语义冲突，只在 `App.tsx` 顶栏动作区有极小的 rebase 摩擦（见 §5）。

`src/App.tsx` 当前 2467 行。本规格三项合计向 App 注入 **约 22 行**（全部是 props 传递与两行 handler 包装），所有真实逻辑都落在新的 `src/lib/*` 纯函数与新的小组件里。

---

## A —— 应用内「提意见 / 帮助」跳转入口（零 PII）

### A.1 现状事实（本轮复核）

- `rg 'https?://' src/ -g '*.tsx'` 仍为零匹配：编辑器 UI 内不存在任何外链。
- Issue 模板已就绪：`bug.yml`（labels `bug`）、`feature.yml`（labels `enhancement`）、`feedback.yml`（labels `user-feedback`）、`config.yml`（三条 contact_links）。
- 仓库 URL 在 `README.md:21,58,93` 与 `config.yml` 中一致为 `https://github.com/Xhhemoing/cengfan-map-studio`。
- 顶栏有两处：`StudioLayoutTemplate` → `StudioTopbar`（`App.tsx:1906-1922` 主路径）与 legacy content 阶段的裸 `<header className="topbar">`（`App.tsx:1929-1988`）。两者共用 `projectExportActions`（`App.tsx:1407-1445`）。
- `eslint.config.mjs:32` 开启 `react-refresh/only-export-components`（warn）：**新组件文件只导出组件**，常量与纯函数必须放 `src/lib/`。

### A.2 新增：`src/lib/feedback-links.ts`（纯函数，无 DOM 依赖）

```ts
/** 仓库常量：与 README.md / .github/ISSUE_TEMPLATE/config.yml 保持同一 URL。 */
export const REPO_URL = "https://github.com/Xhhemoing/cengfan-map-studio";
export const USER_GUIDE_URL = `${REPO_URL}/blob/main/USER_GUIDE.md`;
export const CONTRIBUTING_URL = `${REPO_URL}/blob/main/CONTRIBUTING.md`;
export const ISSUE_CHOOSER_URL = `${REPO_URL}/issues/new/choose`;

export type IssueKind = "feedback" | "bug" | "feature";

/**
 * bug.yml 的「运行方式」下拉选项字面量。
 * GitHub Issue Form 预填下拉靠**选项文本**匹配，任何一字之差都会静默失效，
 * 因此这里的四条必须与 .github/ISSUE_TEMPLATE/bug.yml 完全一致（有漂移测试守卫）。
 */
export const BUG_RUNTIME_OPTIONS = [
  "浏览器打开公网 / Demo",
  "本机 npm run dev",
  "本机 npm run build && npm run start",
  "不清楚",
] as const;
export type BugRuntime = (typeof BUG_RUNTIME_OPTIONS)[number];

export interface ClientEnvironment {
  /** 例如「Windows 11」「macOS」「Android」；识别不出时为「未知系统」。 */
  os: string;
  /** 例如「Chrome 128」；识别不出时为「未知浏览器」。 */
  browser: string;
  /** 必为 BUG_RUNTIME_OPTIONS 之一。 */
  runtime: BugRuntime;
}

/**
 * 只从 userAgent 与 host 推断**粗粒度**环境，不读取任何工程数据、房间码、
 * localStorage、路径或查询串。host 只用于判断 5173/localhost → 本机 dev。
 */
export function describeClientEnvironment(input: {
  userAgent: string;
  hostname: string;
  port: string;
}): ClientEnvironment;

/** 「Windows 11 + Chrome 128」——填进 bug.yml 的 `env` 输入框。 */
export function formatEnvironmentForIssue(env: ClientEnvironment): string;

/**
 * 组装 Issue 预填 URL。**只接受 ClientEnvironment**，类型上无法传入 ProjectDocument。
 * 允许出现的查询参数白名单：template / labels / env / where。
 */
export function buildIssueUrl(kind: IssueKind, env?: ClientEnvironment): string;

/** URL 白名单校验，供实现与测试共用（导出以便测试直接断言）。 */
export const ISSUE_URL_ALLOWED_PARAMS = ["template", "labels", "env", "where"] as const;
```

实现约束：

1. `describeClientEnvironment` 的 UA 解析只做**枚举匹配**（`Windows NT 10.0` → `Windows 10/11`、`Mac OS X` → `macOS`、`Android`、`iPhone|iPad` → `iOS`、`Linux`），浏览器只取 `Edg|Chrome|Firefox|Safari` + 主版本号。不回传完整 UA 串，避免把指纹级信息塞进 URL。
2. `runtime` 判定：`hostname` ∈ {`localhost`,`127.0.0.1`,`::1`} 且 `port === "5173"` → `本机 npm run dev`；同 host 且 `port === "8787"` 或空 → `本机 npm run build && npm run start`；其他 host → `浏览器打开公网 / Demo`；解析异常 → `不清楚`。
3. `buildIssueUrl("feedback")` 与 `("feature")` **不带** env/where（这两个模板没有对应字段 id，传了只会被忽略且拉长 URL）。只有 `("bug", env)` 会带 `env` 与 `where`。
4. 所有参数用 `URLSearchParams` 编码；函数末尾自检：若最终 URL 长度 > 512 或出现白名单外的参数，抛 `Error("issue url contains unexpected parameters")`（防止未来有人顺手把项目信息塞进来）。

### A.3 新增：`src/components/HelpFeedbackMenu.tsx`

结构完全对齐既有 `ProjectMenu` 的 `<details className="project-menu">` 折叠范式（`ProjectMenu.tsx:85-89`），无新交互模型：

```tsx
export function HelpFeedbackMenu({
  environment,
  variant = "studio",
  onCopyEnvironment,
}: {
  /** 由调用方注入，便于测试；默认在组件内用 describeClientEnvironment(window) 计算。 */
  environment?: ClientEnvironment;
  variant?: "studio" | "workbench";
  /** 可选：复制成功后的回执（studio 内接 setStatusMessage）。 */
  onCopyEnvironment?: (text: string) => void;
}): JSX.Element;
```

渲染内容（全部为 `<a>` 跳转，**没有任何 `<form>`、`<textarea>`、上传或 fetch**）：

| 顺序 | 文案 | 目标 |
|------|------|------|
| 1 | 提交使用意见（GitHub，新窗口打开） | `buildIssueUrl("feedback")` |
| 2 | 报告问题 · 已预填系统与运行方式（GitHub，新窗口打开） | `buildIssueUrl("bug", environment)` |
| 3 | 提功能建议（GitHub，新窗口打开） | `buildIssueUrl("feature")` |
| 4 | 用户指南 | `USER_GUIDE_URL` |
| 5 | 贡献指南 | `CONTRIBUTING_URL` |

- 每条 `target="_blank" rel="noopener noreferrer"`。
- 底部一行小字展示 `formatEnvironmentForIssue(environment)` + 一个「复制环境信息」按钮（`navigator.clipboard?.writeText`，与 `ProjectMenu.tsx:128` 复制房间码同写法，含 `?.` 兜底）。用途：GitHub Issue Form 对 checkboxes 类字段不支持预填，用户可粘贴。
- 底部固定提示语（写死，不可关闭）：**「只会带上系统与浏览器版本，不会上传名单或工程内容。」**
- `summary` 的 `aria-label="打开帮助与反馈"`；`variant="workbench"` 时 className 追加 `help-menu--workbench`，仅影响定位样式。

### A.4 修改点（行级）

**`src/App.tsx`**

1. import 区（`App.tsx:47` 附近，`ProjectMenu` 之后）加 `import { HelpFeedbackMenu } from "./components/HelpFeedbackMenu";`
2. 在 `projectExportActions`（:1407-1445）之后新增：

```tsx
const helpActions = (
  <ToolbarGroup label="帮助与反馈">
    <HelpFeedbackMenu onCopyEnvironment={() => setStatusMessage("已复制环境信息")} />
  </ToolbarGroup>
);
```

3. `projectActionsNode`（:1527-1536）在 `{projectExportActions}` 之后插入 `{helpActions}`。
4. legacy content 顶栏（:1980 `{projectExportActions}` 之后）插入 `{helpActions}`。

净增 6 行。**不改 `StudioTopbar.tsx`**：`projectActions` 是既有插槽（`StudioTopbar.tsx:10,40`），不需要新 props，因此与任何顶栏重排 PR 的冲突面仅为这两处插入。

**`src/components/workbench/WorkbenchHeader.tsx`**（当前 27 行）

在 `.workbench-actions`（:16-24）的「导入」按钮之前插入 `<HelpFeedbackMenu variant="workbench" />`。该组件不需要新 props，因此 `ProjectWorkbench.tsx:189` 的调用点**零改动**——新用户在工作台首屏就能看到入口。

**`src/styles.css`**：新增 `.help-menu`（复用 `.project-menu` 的 `details/summary` 视觉）、`.help-menu__popover`、`.help-menu--workbench` 定位覆写。不改既有选择器。

### A.5 零 PII 的强制手段（不是靠自觉）

| 层 | 手段 |
|----|------|
| 类型层 | `buildIssueUrl(kind, env?: ClientEnvironment)`，签名里没有任何工程/学生/房间类型可传 |
| 运行时 | 参数白名单 + URL 长度上限 512，越界抛错 |
| 组件层 | `HelpFeedbackMenu` 不接收 `project` / `students` / `roomId` 任何 props（测试断言其 props 类型只有三项） |
| 测试层 | 见 §A.6 第 3、4 条 |
| 文案层 | 弹层底部固定告知语，与 `README` 的「名单默认留在本地」口径一致 |

### A.6 测试

**`src/lib/feedback-links.test.ts`**

1. `describeClientEnvironment` 三条 UA 样本（Win/Chrome、macOS/Safari、Android/Edge）→ 断言 `os`/`browser` 字面量；空 UA → `未知系统 · 未知浏览器` 且不抛。
2. runtime 判定四分支：`localhost:5173` → `本机 npm run dev`；`localhost:8787` → `本机 npm run build && npm run start`；`demo.example.com:""` → `浏览器打开公网 / Demo`。
3. **参数白名单**：`new URL(buildIssueUrl("bug", env)).searchParams` 的 key 集合 ⊆ `ISSUE_URL_ALLOWED_PARAMS`；`buildIssueUrl("feedback")` 不含 `env`/`where`。
4. **零 PII**：对三种 kind 的 URL 断言 `not.toMatch(/students|林舟|北京大学|room|token|project/i)`，且 `url.length <= 512`。
5. **模板漂移守卫**：`readFileSync(".github/ISSUE_TEMPLATE/bug.yml","utf8")` 中逐条 `expect(yml).toContain(option)` 覆盖 `BUG_RUNTIME_OPTIONS` 四项；同理断言 `template=bug.yml` / `feedback.yml` / `feature.yml` 三个文件存在。（vitest 跑在 Node + jsdom，`node:fs` 可用；`vite.config.ts:57` 的 include 已覆盖 `src/**/*.test.ts`。）

**`src/components/HelpFeedbackMenu.test.tsx`**（沿用 `StudioTopbar.test.tsx:1-40` 的 `createRoot` + `flushSync` 范式，不引入 testing-library）

1. 渲染 5 条 `<a>`，逐条断言 `target === "_blank"` 且 `rel` 同时包含 `noopener` 与 `noreferrer`。
2. `summary[aria-label="打开帮助与反馈"]` 存在且唯一。
3. **零上传**：`container.querySelector("form")`、`querySelector("textarea")`、`querySelector('input[type="file"]')` 均为 `null`。
4. 「复制环境信息」点击后，stub 的 `navigator.clipboard.writeText` 收到的字符串 `=== formatEnvironmentForIssue(env)`，且该串不含 `/` 与 `?`（即不是 URL、不含 host）。
5. 固定告知语文本存在（防止后续被删）。

---

## B —— 社区模板独立文件格式 `.cengfan-template` + 导入/导出

### B.1 现状事实（本轮复核）

- `CustomTemplateRecord`（`template-store.ts:13-21`）= `{ id, name, baseTemplateId, scope, document, scene?, createdAt }`。
- `stripStudentData`（:43-52）递归删 `students` 键；`isTemplateDocument`（:54-113）做 22 项结构校验；`sanitizeCustomTemplateRecord`（:115-140）= strip + 校验 + `normalizeScene`。**三者当前都是模块私有**。
- 模板只能藏在 `.cengfan` 工程包里传播（`project-package.ts:18,207` 的 `customTemplates` 字段，入站复用 `loadCustomTemplates` 适配器，:31-37）。
- `TemplatePicker` 有三个挂载点：`DataPresentationPanel.tsx:45`、`WorkflowGuide.tsx:194`、`GlobalSettingsScreen.tsx:300`。其中 `GlobalDataScreen` 与 `WorkflowGuide` 在 `App.tsx` 中**没有生产引用**（Round 1 已核实），因此**用户实际能到达的只有 `GlobalSettingsScreen`**。
- 自定义模板上限 20，实现在 `App.tsx:1177` 的 `.slice(0, 20)`；**当前没有删除模板的 UI**。
- `fileMatchesAccept`（`file-accept.ts:8`）按最后一个 `.` 取扩展名，`abc.cengfan-template` → `.cengfan-template`，与 `.cengfan` 不互相误命中。

### B.2 扩展名与容器决策

采用 **`.cengfan-template`（内容为 UTF-8 JSON）**，理由：

1. 与既有 `.cengfan` 同族可辨识，但后缀串不同，浏览器 `accept` 的后缀匹配（`endsWith`）与仓内 `fileMatchesAccept` 都不会互相命中，**不需要改 `PROJECT_PACKAGE_FILE_ACCEPT`**（`project-package.ts:213`）。
2. 误投时报错清晰：把工程包投进模板入口 → `NOT_TEMPLATE_PACK`；把模板投进工程入口 → `restoreProjectPackage`（:184）已有的「不是蹭饭图工程包」。
3. 不引入 zip/二进制：模板体积主要来自内联 `imageSrc` / `regionalAssets[].src` 的 data URL，JSON 已足够，且能让 `.cengfan-template` 保持可 diff、可在 Issue 里贴片段——这对「社区模板征集」是刚需。

MIME 一律用 `application/json;charset=utf-8`（与 `downloadProjectPackage`，`project-package.ts:220` 一致）。

### B.3 JSON Schema（v1）

```jsonc
{
  "kind": "cengfan-template-pack",     // 常量，唯一识别符
  "version": 1,                        // 整数，当前仅接受 1
  "exportedAt": "2026-08-24T10:00:00.000Z",
  "generator": "cengfan-map-studio",   // 常量，便于社区侧识别来源
  "meta": {
    "title": "卡通开学墙",              // 1..60 字，缺省取 template.name
    "author": "",                       // 0..24 字，取 E 的本地昵称，可为空；仅署名，不是账号
    "license": "AGPL-3.0-only",         // 常量；模板随程序走 AGPL（docs/开源与收费边界.md §3）
    "note": ""                          // 0..200 字，作者留言（用途/适配班级规模等）
  },
  "template": {
    "name": "卡通开学墙",                // 1..60 字
    "baseTemplateId": "cartoon",        // original|cartoon|grain|q|scenery|regional
    "scope": "visual",                  // visual|layout
    "document": { /* TemplateDocument，见 src/lib/template-document.ts:88-100 */ },
    "scene": { /* 可选 SceneDocument */ }
  }
}
```

**明确不存在也不接受的字段**（硬边界，实现里是拒收清单而非注释）：`price`、`amount`、`currency`、`sku`、`listed`、`order`、`orderId`、`coupon`、`payment`、`vip`、`plan`、`套餐`、`手续费`、`价格`、`结算`。

设计说明：

- `template` **不携带 `id` 与 `createdAt`**。导入时用 `createId("custom")` 重新铸 id、`new Date().toISOString()` 重铸时间，避免跨设备 id 撞车导致「导入后覆盖了别人的模板」。
- `meta.author` 只是**署名字符串**，不做校验、不做唯一性、不与任何账号关联（`PRODUCT.md` 禁止宣称账号级身份）。
- `document` / `scene` 直接复用现有类型，**不新造并行模型**，因此 `applyCustomTemplateToProject`（:279-354）无需任何改动。

### B.4 新增：`src/lib/template-package.ts`

```ts
export const TEMPLATE_PACK_KIND = "cengfan-template-pack";
export const TEMPLATE_PACK_VERSION = 1 as const;
export const SUPPORTED_TEMPLATE_PACK_VERSIONS = [1] as const;
export const TEMPLATE_PACK_FILE_EXTENSION = ".cengfan-template";
export const TEMPLATE_PACK_FILE_ACCEPT = "application/json,.cengfan-template";
/** 导入硬上限；超过直接拒绝，避免把 20MB 背景图塞进 localStorage 打爆配额。 */
export const MAX_TEMPLATE_PACK_BYTES = 8 * 1024 * 1024;
/** 导出软阈值；超过只在状态区提示「文件较大，微信/QQ 传输可能被压缩」。 */
export const LARGE_TEMPLATE_PACK_BYTES = 2 * 1024 * 1024;

export type TemplatePackErrorCode =
  | "INVALID_JSON"
  | "NOT_TEMPLATE_PACK"
  | "UNSUPPORTED_VERSION"
  | "TEMPLATE_INVALID"
  | "COMMERCIAL_FIELD_REJECTED"
  | "STUDENT_DATA_DETECTED"
  | "FILE_TOO_LARGE";

export class TemplatePackError extends Error {
  constructor(public readonly code: TemplatePackErrorCode, message: string);
}

export interface TemplatePackMeta {
  title: string;
  author: string;
  license: "AGPL-3.0-only";
  note: string;
}

export interface TemplatePack {
  kind: typeof TEMPLATE_PACK_KIND;
  version: typeof TEMPLATE_PACK_VERSION;
  exportedAt: string;
  generator: "cengfan-map-studio";
  meta: TemplatePackMeta;
  template: {
    name: string;
    baseTemplateId: MapTemplateId;
    scope: TemplateSaveScope;
    document: TemplateDocument;
    scene?: SceneDocument;
  };
}

/** 导出：record → pack。内部先跑 sanitizeCustomTemplateRecord，失败抛 TEMPLATE_INVALID。 */
export function createTemplatePack(input: {
  record: CustomTemplateRecord;
  author?: string;
  note?: string;
  now?: Date;
}): TemplatePack;

/** 序列化并做出站双闸（学生数据 + 商业字段），返回可直接写进 Blob 的字符串。 */
export function serializeTemplatePack(pack: TemplatePack): string;

/** 入站：raw → CustomTemplateRecord（已重铸 id/createdAt，已过 sanitize）。 */
export function parseTemplatePack(raw: string, options?: { now?: Date }): {
  record: CustomTemplateRecord;
  meta: TemplatePackMeta;
};

/** 供 UI 直接用：校验大小 → 读文本 → parseTemplatePack。 */
export function readTemplatePackFile(file: File): Promise<{
  record: CustomTemplateRecord;
  meta: TemplatePackMeta;
}>;

/** 文件名：`${安全化标题}-${YYYY-MM-DD}.cengfan-template`，标题里的 / \ : * ? " < > | 替换为 -。 */
export function templatePackFilename(pack: TemplatePack): string;

/** 商业字段扫描（递归键名，大小写不敏感，同时匹配中文词）。导出与导入都调用。 */
export function assertNoCommercialFields(value: unknown): void;
```

### B.5 `stripStudentData` 在导出与导入两侧的强制执行

**导出侧（三闸）**

1. `createTemplatePack` 第一步即 `sanitizeCustomTemplateRecord(input.record)`（复用 `template-store.ts:115` 的**同一实现**，不复制逻辑）。返回 `null` → 抛 `TEMPLATE_INVALID`。该函数内部第一行就是 `stripStudentData(value)`（:116），递归删除任意深度的 `students` 键。
2. 只把 sanitize 后的 `{ name, baseTemplateId, scope, document, scene }` 拷进 pack，**逐字段白名单赋值**，不做 `...record` 展开——即使未来 record 上多出脏字段也带不出去。
3. `serializeTemplatePack` 在 `JSON.stringify` **之后**做出站体检：
   ```ts
   const json = `${JSON.stringify(pack, null, 2)}\n`;
   if (/"students"\s*:/.test(json)) throw new TemplatePackError("STUDENT_DATA_DETECTED", "导出被中止：模板中检测到名单字段");
   assertNoCommercialFields(pack);
   return json;
   ```
   这一闸是「即使前两闸被将来的重构绕过也会炸」的兜底，且发生在 `Blob` 构造之前，**用户永远拿不到含名单的文件**。

**导入侧（四闸）**

1. `readTemplatePackFile`：`file.size > MAX_TEMPLATE_PACK_BYTES` → `FILE_TOO_LARGE`（在 `file.text()` 之前，避免大文件先进内存）。
2. `parseTemplatePack`：`JSON.parse` 失败 → `INVALID_JSON`；`kind !== TEMPLATE_PACK_KIND` → `NOT_TEMPLATE_PACK`；`version` 不在 `SUPPORTED_TEMPLATE_PACK_VERSIONS` → `UNSUPPORTED_VERSION`（消息含「该文件由更新版本的蹭饭图导出，请升级后再导入」）。
3. `assertNoCommercialFields(parsed)` → `COMMERCIAL_FIELD_REJECTED`。
4. 组装候选 record 后**再跑一次** `sanitizeCustomTemplateRecord`：
   ```ts
   const candidate = {
     id: createId("custom"),
     name: normalizeTemplateName(parsed.template?.name),
     baseTemplateId: parsed.template?.baseTemplateId,
     scope: parsed.template?.scope,
     document: parsed.template?.document,
     scene: parsed.template?.scene,
     createdAt: (options?.now ?? new Date()).toISOString(),
   };
   const record = sanitizeCustomTemplateRecord(candidate);
   if (!record) throw new TemplatePackError("TEMPLATE_INVALID", "模板文件结构不完整，无法导入");
   ```
   这一步同时完成：删 `students`（任意深度，包括恶意手写在 `document.students` / `scene.textElements[0].students` 的）、22 项 `TemplateDocument` 结构校验、`baseTemplateId` 白名单校验、`normalizeScene` 规整。

**因此 `students` 不可能进也不可能出，且两侧走的是同一个已被 4 条既有测试覆盖的 sanitizer**（`template-store.test.ts:83,110`）。

**`src/lib/template-store.ts` 的唯一改动**：给 `stripStudentData`（:43）与 `sanitizeCustomTemplateRecord`（:115）加 `export`。不改任何行为，既有测试全部保持绿。

### B.6 新增：`src/lib/template-exchange-actions.ts`（让 App 只写两行）

```ts
/** 生成下载：内部完成 createTemplatePack → serialize → Blob → a.click() → revoke。 */
export function downloadTemplatePack(input: {
  record: CustomTemplateRecord;
  author?: string;
  note?: string;
}): { filename: string; bytes: number };

/** 合并进「我的模板」，沿用 App.tsx:1177 的 20 上限语义（新的在前，超出丢最旧）。 */
export function mergeImportedTemplate(
  existing: CustomTemplateRecord[],
  imported: CustomTemplateRecord,
  limit = 20,
): { next: CustomTemplateRecord[]; dropped: number };

/** 错误码 → 面向班委的中文提示（不暴露栈，不暴露文件内容）。 */
export function describeTemplatePackError(error: unknown): string;
```

上限策略选择「丢最旧」而非「拒绝导入」，因为当前**没有删除模板的 UI**（`GlobalSettingsScreen.tsx:300` / `App.tsx:2090` 都只有应用按钮），拒绝导入会让用户彻底卡死。`dropped > 0` 时必须在状态区明说「已达 20 个上限，最旧的 1 个模板已被移除」。

### B.7 UI 挂载：为什么选 GlobalSettingsScreen，不选 TemplatePicker 自身

`TemplatePicker` 被三处引用，其中两处（`WorkflowGuide`、`GlobalDataScreen`）是当前无生产引用的组件。如果把导入导出按钮直接写进 `TemplatePicker`，会在这三处同时长出来，且 `WorkflowGuide.test.tsx:51` / `DataPresentationPanel.test.tsx:28` / `GlobalDataScreen.test.tsx:48` 三个既有测试的快照面都会变。

改为**可选插槽**，默认不渲染：

```tsx
// src/components/TemplatePicker.tsx（新增 1 个可选 prop + 1 行渲染）
export function TemplatePicker({
  /* ...既有 6 个 props 不变... */
  exchange,
}: {
  /* ... */
  /** 模板文件交换区（导入/导出）。不传则完全不渲染，既有三处调用点无需改动。 */
  exchange?: ReactNode;
}) {
  /* ...既有结构不变... */
  return (
    <div className="template-picker">
      {/* ...内置模板 / 我的模板 / 保存当前整体模板（:54-56）... */}
      {exchange}
    </div>
  );
}
```

`GlobalSettingsScreen.tsx` 新增两个**可选** props（不传则行为与现在完全一致）：

```ts
onExportCustomTemplate?: (templateId: string) => void;
onImportTemplateFile?: (file: File) => void;
```

在 :300-307 的 `<TemplatePicker>` 上加：

```tsx
exchange={onExportCustomTemplate && onImportTemplateFile
  ? <TemplateExchange
      customTemplates={customTemplates}
      onExport={onExportCustomTemplate}
      onImportFile={onImportTemplateFile}
    />
  : undefined}
```

用户路径：顶栏项目菜单外的「打开全局视觉设置」/ 助手栏设置入口 → 全局设置 → 数据 → 「数据展示」子页 → 模板区。**该面板是独立弹层，与六阶段导航（`WorkflowStageStepper`）不在同一层，不抢阶段焦点，也不改变阶段进度语义。**

### B.8 新增：`src/components/TemplateExchange.tsx`

```tsx
export function TemplateExchange({
  customTemplates,
  onExport,
  onImportFile,
  status,
}: {
  customTemplates: Array<{ id: string; name: string; scope: "visual" | "layout" }>;
  onExport: (templateId: string) => void;
  onImportFile: (file: File) => void;
  /** 导入/导出回执文本；由 App 侧写入，组件只负责放进 aria-live 区。 */
  status?: string;
}): JSX.Element;
```

- 「导出模板文件」：`customTemplates.length === 0` 时 `disabled` 且渲染说明文本「先用上方『保存当前整体模板』存一个，再导出给别人」——**禁用原因用文字给出，不靠灰色**。多于 1 个时先渲染一个 `<select aria-label="选择要导出的模板">`。
- 「导入模板文件」：`<label>` 包 `<input type="file" accept={TEMPLATE_PACK_FILE_ACCEPT} aria-label="导入模板文件">`，与 `ProjectMenu.tsx:189-191` 的写法一致；`onChange` 后清空 `value`（对齐 `ProjectWorkbench.tsx:177`），使同名文件可重复导入。
- 状态区：`<p className="template-exchange__status" role="status" aria-live="polite">{status}</p>`。成功文案「已导入模板：卡通开学墙（作者：小林）」；失败文案统一前缀「导入失败：」。
- 固定说明一行：「模板文件只含版式与配色，不含任何学生名单。」

### B.9 App 接线（净增约 10 行）

```tsx
const [templateExchangeStatus, setTemplateExchangeStatus] = useState("");

const exportCustomTemplateFile = (templateId: string) => {
  const record = customTemplates.find((item) => item.id === templateId);
  if (!record) return;
  try {
    const { filename, bytes } = downloadTemplatePack({ record, author: collaborationDisplayName });
    setTemplateExchangeStatus(bytes > LARGE_TEMPLATE_PACK_BYTES
      ? `已导出 ${filename}；文件较大，用聊天软件发送时请选「作为文件发送」`
      : `已导出 ${filename}`);
  } catch (error) {
    setTemplateExchangeStatus(`导出失败：${describeTemplatePackError(error)}`);
  }
};

const importCustomTemplateFile = async (file: File) => {
  try {
    const { record, meta } = await readTemplatePackFile(file);
    const { next, dropped } = mergeImportedTemplate(customTemplates, record);
    setCustomTemplates(next);
    setTemplateExchangeStatus(
      `已导入模板：${record.name}${meta.author ? `（作者：${meta.author}）` : ""}`
      + (dropped > 0 ? `；已达 20 个上限，最旧的 ${dropped} 个已移除` : ""),
    );
  } catch (error) {
    setTemplateExchangeStatus(`导入失败：${describeTemplatePackError(error)}`);
  }
};
```

`author` 直接复用 E 的本地昵称（见 §E），两项之间的唯一耦合点；若 E 未落地则传 `undefined`，格式里 `author` 为空串，不影响任何校验。

`setCustomTemplates` 之后既有的持久化链路自动生效：`App.tsx:462` 更新 `latestWorkspaceRef` → `:473` 触发 `workspaceSync`，模板照常写回 localStorage 与工程包，**不需要任何新的持久化代码**。

### B.10 测试

**`src/lib/template-package.test.ts`**

| # | 断言 |
|---|------|
| 1 | round-trip：`createTemplatePack` → `serializeTemplatePack` → `parseTemplatePack`，`record.document` 与源 `record.document` 深相等；`record.id !== 源 id`；`record.createdAt` 为注入的 `now` |
| 2 | **导出剥离名单**：构造脏 record（顶层 `students`、`document.students`、`scene.textElements[0].students` 三处同时塞人名）→ 序列化字符串 `not.toContain('"students"')` 且 `not.toContain("林舟")` |
| 3 | **导入剥离名单**：手写含 `students` 的合法 pack JSON → `parseTemplatePack` 后 `JSON.stringify(record)` 不含 `students` 与人名 |
| 4 | 出站兜底闸：mock 一个能绕过 sanitize 的 pack（直接构造对象后 `Object.assign(pack.template.document, { students: [...] })`）→ `serializeTemplatePack` 抛 `STUDENT_DATA_DETECTED` |
| 5 | 商业字段双向拒收：pack 里带 `meta.price` / `template.sku` / `meta.手续费` → 导出与导入各抛 `COMMERCIAL_FIELD_REJECTED` |
| 6 | `kind` 错 → `NOT_TEMPLATE_PACK`；`version: 2` → `UNSUPPORTED_VERSION`；非 JSON → `INVALID_JSON`；`document` 缺 `canvas` → `TEMPLATE_INVALID` |
| 7 | 交叉格式：把 `serializeProjectPackage(createProjectPackage(...))` 的输出喂给 `parseTemplatePack` → `NOT_TEMPLATE_PACK` |
| 8 | 文件名：标题含 `/` `:` 时被替换为 `-`，后缀为 `.cengfan-template` |
| 9 | `readTemplatePackFile`：`{ size: 9 * 1024 * 1024 }` 的 File stub → `FILE_TOO_LARGE`，且 `file.text` **未被调用**（`vi.fn()` 断言 0 次） |

**`src/lib/template-exchange-actions.test.ts`**

1. `mergeImportedTemplate`：已有 19 个 → `next.length === 20`、`dropped === 0`；已有 20 个 → `next.length === 20`、`dropped === 1`、`next[0]` 是导入项、被丢的是原 `existing[19]`。
2. `describeTemplatePackError` 对 7 个错误码各返回不含 `Error:`、不含堆栈、不含文件内容的中文串；对非 `TemplatePackError` 返回兜底文案。

**`src/lib/project-package.test.ts`（追加 1 条）**：`.cengfan-template` 内容喂给 `parseProjectPackage` → 抛「不是蹭饭图工程包」。守住反向误投。

**`src/components/TemplateExchange.test.tsx`**

1. `customTemplates = []` → 导出按钮 `disabled === true` 且**存在解释文本**（断言 `textContent` 含「先用上方」），不是只有灰色。
2. `accept` 属性含 `.cengfan-template`。
3. 触发 `change` 事件后 `onImportFile` 收到该 File；随后 `input.value === ""`。
4. `status` 容器 `role="status"` 且 `aria-live="polite"`。
5. 固定说明「不含任何学生名单」存在。

**`src/components/TemplatePicker.test.tsx`（新建，同时补上 Round 1 指出的零测试空白）**

1. 不传 `exchange` → `container.querySelector(".template-exchange")` 为 `null`（保证 `WorkflowGuide` / `DataPresentationPanel` 视觉不变）。
2. 传入 `exchange` → 渲染在 `.workflow-save-template` **之后**（`compareDocumentPosition` 断言）。
3. 既有行为回归：点击内置模板触发 `onApplyTemplate(id)`；`customTemplates.length === 0` 时不渲染 `.workflow-custom-templates`。

### B.11 回滚方案（新文件格式属破坏性变更，按 `AGENTS.md` 交付纪律记录）

| 层级 | 操作 | 影响 |
|------|------|------|
| L0 隐藏 UI（最快，1 行） | 在 `GlobalSettingsScreen.tsx` 去掉 `exchange={...}` 传参 | 功能立即不可达；库代码与测试保留；**已导出的文件仍能在旧版本外部保存，不丢数据** |
| L1 撤 App 接线（约 12 行） | 移除 `App.tsx` 的两个 handler 与两个 props | 同上，且 `customTemplates` 状态链路回到改动前 |
| L2 完全回滚 | `git revert` 该提交：删除 4 个新文件 + 4 个测试，还原 `template-store.ts` 的两个 `export`、`TemplatePicker` 的 `exchange` prop、`GlobalSettingsScreen` 的两个可选 props | `.cengfan-template` 文件变为无法打开 |

**数据安全性论证**：该格式是**纯附加**的第二条出口。

- 不改 `PROJECT_PACKAGE_VERSION`（仍为 2）、不改 `.cengfan` 结构、不改 `CUSTOM_TEMPLATES_KEY` 的 localStorage schema、不改 `CustomTemplateRecord` 类型、不新增服务端字段。
- 因此回滚后**没有任何既有数据变得不可读**：模板依旧存在于 localStorage 与工程包里。唯一损失是已分发出去的 `.cengfan-template` 文件暂时无处导入——补救路径是让对方改用 `.cengfan` 工程包（模板本就随工程包走，`project-package.ts:18`）。
- 前向兼容：导出恒写 `version: 1`；未来 v2 必须保持 `kind` 不变并在 v1 读取器里落到 `UNSUPPORTED_VERSION` 的明确文案，禁止「尽力解析」。

---

## E —— 协作本地 displayName + 角色文字标签（API 零改动）

### E.1 现状事实（本轮复核，含一个 Round 1 未点出的关键点）

- `COLLABORATION_DISPLAY_NAME = "本机协作者"`（`app-constants.ts:11`），被 `useCollaborationRoom.ts:14` 引入，用于 `createRoom`（:249）与 `joinRoom`（:294）。**全仓仅此一处使用。**
- 服务端**早就支持**每人不同的 `displayName`：`RoomCreator.displayName`（`server/collaboration.ts:62`）、`RoomJoinRequest.displayName`（:68）、`RoomParticipant.displayName`（:14），且 `join` 会把它写进 `accessRecords`（:289-294）。
- **关键点**：`GET /api/rooms/:id` 的 `roomProjection`（`server/index.ts:517-521`）已经返回 `participants: listParticipants(...)`，即**全房间参与者的 displayName**。客户端 `useCollaborationRoom.ts:302` 已经把它存进 `roomParticipants`——**数据早就在前端手里，只是 UI 从没消费**。
- 反面事实：SSE 的 `members` 事件与 `RoomMember` 类型（`collaboration-client.ts:11-16`）**只有 `clientId/role/joinedAt/lastSeenAt`，没有 displayName**。因此 `ProjectMenu.tsx:136` 才只能退化成 `成员 ${clientId.slice(0,6)}`。
- 因此本项的正确形态：**用 `roomParticipants`（有名字）去 join `roomMembers`（有角色与在场状态），两者按 `participant.id === member.clientId` 对齐**。这条路径**完全不需要改服务端、不需要改 SSE 协议、不需要额外请求**。

### E.2 新增：`src/lib/collaboration-identity.ts`

```ts
export const COLLABORATION_DISPLAY_NAME_KEY = "cengfan-map-studio:collaboration-display-name";
export const DEFAULT_COLLABORATION_DISPLAY_NAME = "本机协作者";
export const MAX_DISPLAY_NAME_LENGTH = 24;

/** 去首尾空白、折叠连续空白、剥控制字符与换行、截断 24 字；空串回落默认名。 */
export function normalizeDisplayName(raw: string | null | undefined): string;

/** localStorage 读取；抛异常（隐私模式/配额）时回落默认名，绝不抛出。 */
export function loadDisplayName(storage?: Storage): string;

/** localStorage 写入；失败静默（对齐 theme.ts:26-31 的既有范式）。 */
export function saveDisplayName(name: string, storage?: Storage): void;

export interface RoleDescription {
  /** 角色名，用于文字标签：创建者 / 编辑者 / 仅查看。 */
  label: string;
  /** 能力说明，用于 aria-label 与 title：可编辑并邀请 / 可编辑 / 不可修改。 */
  capability: string;
}
export function describeRole(role: CollaborationRole | null): RoleDescription;

export interface RosterEntry {
  clientId: string;
  displayName: string;
  role: CollaborationRole;
  isSelf: boolean;
  /** 无 participant 记录时为 true，UI 用「成员 ab12cd」占位并解释原因。 */
  isAnonymous: boolean;
  joinedAt: string;
  lastSeenAt: string;
}

/**
 * 把 members（角色/在场）与 participants（昵称）对齐成一份可渲染名册。
 * 排序：owner → editor → viewer，同角色按 joinedAt 升序；自己恒排第一。
 */
export function mergeRoomRoster(input: {
  members: RoomMember[];
  participants: RoomParticipant[];
  ownClientId: string;
  ownDisplayName: string;
}): RosterEntry[];
```

`normalizeDisplayName` 的具体规则（要写进测试）：`\p{C}` 类控制字符与 `\r\n\t` 一律删除；连续空白折叠为一个半角空格；`trim` 后按**码点**（`Array.from`）截断到 24，避免把 emoji/汉字切半；结果为空 → `DEFAULT_COLLABORATION_DISPLAY_NAME`。

### E.3 修改：常量迁移与 hook 接线

**`src/lib/app-constants.ts:11`**：删除 `COLLABORATION_DISPLAY_NAME`（全仓唯一引用点在 hook 里，一并改）。理由：身份相关常量与 `describeRole`/`normalizeDisplayName` 同模块更内聚，且 `app-constants.ts` 的文件注释自述是「App shell 常量」，昵称不属于 shell。

**`src/lib/useCollaborationRoom.ts`**

1. `:14` 的 import 改为 `import { DEFAULT_COLLABORATION_DISPLAY_NAME } from "./collaboration-identity";`
2. `UseCollaborationRoomOptions`（:49-55）新增：
   ```ts
   /** 房间内显示名（本地偏好，不是账号）。缺省用 DEFAULT_COLLABORATION_DISPLAY_NAME。 */
   displayName?: string;
   ```
3. hook 体内：`const displayName = normalizeDisplayName(options.displayName);`（`normalizeDisplayName` 对 `undefined` 已回落默认名）。
4. `:249` `createRoom({ clientId, displayName })`、`:294` `joinRoom({ ..., displayName })` 改用该变量。
5. `:255` 创建房间时的 `setRoomParticipants([{ id: access.participantId, displayName: access.displayName, role: access.role }])` 保持不变——服务端会把我们传的名字原样回传（`server/collaboration.ts:232-238`）。
6. `UseCollaborationRoomResult` 不变（`roomParticipants` 已在 :61 导出）。

**已知限制（必须写进 PR 描述，不许含糊）**：房主在别人加入后**看不到对方昵称**，因为 SSE 的 `members` 事件不带 displayName，而 `participants` 只在 `fetchRoom` 时取一次。此时房主侧该成员的 `isAnonymous === true`，UI 显示「成员 ab12cd」并附小字「（对方昵称需重新进入房间后可见）」。
修复该限制需要服务端把 displayName 并入 members 广播 = **API 形状变更，明确不在本项范围内**。另一条「members 事件后重新 `fetchRoom`」的路子被否决：`roomProjection` 会 `...room` 带上整个 `snapshot`（整包工程），每次有人进出都拉一次全量快照，代价不可接受。

### E.4 新增组件（两个都很小，均放 `src/components/collaboration/`）

**`DisplayNameInput.tsx`**

```tsx
export function DisplayNameInput({
  value,
  connected,
  onChange,
}: {
  value: string;
  /** 已在房间内时禁用：昵称在创建/加入时随请求发出，改名需重新进房。 */
  connected: boolean;
  onChange: (next: string) => void;
}): JSX.Element;
```

- `<label htmlFor="collaboration-display-name">房间内昵称</label>` + `<input id maxLength={24} disabled={connected}>`。
- `connected === true` 时在输入框下渲染文字说明「已在房间内，断开后可修改昵称」——**禁用理由用文字讲明，不靠灰色**。
- `onChange` 传出的是**原始输入**（保持受控输入体验），归一化在 App 的 setter 与 hook 入口各做一次。
- 小字提示「只保存在这台电脑，不是账号」（呼应 `PRODUCT.md` 禁止宣称账号身份）。

**`RoomRoster.tsx`**

```tsx
export function RoomRoster({ entries }: { entries: RosterEntry[] }): JSX.Element;
```

渲染（对照替换 `ProjectMenu.tsx:131-141` 的现有 `<ul>`）：

```tsx
<ul className="collaboration-members" aria-label="房间成员">
  {entries.map((entry) => {
    const role = describeRole(entry.role);
    return (
      <li
        key={entry.clientId}
        data-member-role={entry.role}
        aria-label={`${entry.displayName}，${role.label}，${role.capability}`}
      >
        {entry.role === "owner" && <span aria-hidden="true">👑</span>}
        <span className="collaboration-members__name">
          {entry.isSelf ? `${entry.displayName}（我）` : entry.displayName}
        </span>
        <span className="collaboration-members__role">{role.label}</span>
        {entry.isAnonymous && <small>（对方昵称需重新进入房间后可见）</small>}
      </li>
    );
  })}
</ul>
```

保留既有 `.collaboration-members` 类名与 `data-member-role` 属性（`styles.css:153` 已有样式），只增补 `.collaboration-members__role` 的文字徽标样式。

### E.5 修改：`src/components/ProjectMenu.tsx`

props 新增三项（`ProjectMenuProps`，:13-47）：

```ts
participants: RoomParticipant[];
displayName: string;
onDisplayNameChange: (next: string) => void;
```

渲染改动，全部在「在线协作」浮层（:118-174）内：

1. `:130` 的角色摘要行改为使用 `describeRole(roomRole).label`，并把「正在确认权限」保留为 `roomRole === null` 分支。
2. `:131-141` 的 `<ul>` 整段替换为 `<RoomRoster entries={mergeRoomRoster({ members, participants, ownClientId, ownDisplayName: displayName })} />`。
3. 未连接分支（:161-172）在「创建房间」按钮**之前**插入 `<DisplayNameInput value={displayName} connected={false} onChange={onDisplayNameChange} />`。
4. 已连接分支在房间码下方插入 `<DisplayNameInput value={displayName} connected onChange={onDisplayNameChange} />`（只读态，让用户知道自己现在叫什么）。
5. `:142` 的「模式：已关闭 / 只读 / 可编辑」保留——它已经是文字表达，不改。

`ProjectMenu` 当前 196 行，改后约 205 行，仍远低于 400 行阈值，**不拆分**。

### E.6 修改：`src/App.tsx`（净增约 6 行）

```tsx
const [collaborationDisplayName, setCollaborationDisplayName] = useState(() =>
  typeof window === "undefined" ? DEFAULT_COLLABORATION_DISPLAY_NAME : loadDisplayName());
```

- `useCollaborationRoom({ ... })`（:550-560）加一行 `displayName: collaborationDisplayName,`
- `<ProjectMenu>`（:1409-1443）加三行：
  ```tsx
  participants={collaboration.roomParticipants}
  displayName={collaborationDisplayName}
  onDisplayNameChange={(next) => { setCollaborationDisplayName(next); saveDisplayName(normalizeDisplayName(next)); }}
  ```

注意：state 保存**原始输入**（否则用户打字时空格会被吞），localStorage 保存**归一化结果**，hook 入口再归一化一次。三处一致性由 `normalizeDisplayName` 的幂等性保证（测试第 1 条）。

### E.7 无障碍：角色不靠颜色

| 通道 | 手段 |
|------|------|
| 文字 | 每个成员行都有 `创建者` / `编辑者` / `仅查看` 文字徽标，不是仅有色块或仅有 👑 |
| 语义 | `li` 的 `aria-label` 形如「林舟，创建者，可编辑并邀请」，屏幕阅读器一次读全 |
| 装饰 | 👑 emoji 加 `aria-hidden="true"`（现状 `ProjectMenu.tsx:135` 的裸 emoji 会被朗读成「王冠」，属回归修复） |
| 结构 | `data-member-role` 保留供样式与测试使用，但**任何信息都不只由它承载** |
| 禁用态 | `DisplayNameInput` 的 `disabled` 必定伴随可见文字解释 |
| 状态 | 既有 `data-collaboration-status` + `collaborationMessage` 文本组合保持不变（本就是双通道） |

这直接兑现 `PRODUCT.md` 的 "Role and synchronization status must not be communicated by color alone"。

### E.8 测试

**`src/lib/collaboration-identity.test.ts`**

1. `normalizeDisplayName`：`"  小 林  "` → `"小 林"`；`"a\nb"` → `"ab"`（控制字符删除后无空白残留）；30 个汉字 → 24 个码点；`"👩‍🏫班主任"` 不被截成半个 emoji；`""` / `null` / `undefined` → 默认名；**幂等**：`f(f(x)) === f(x)`。
2. `loadDisplayName`：storage `getItem` 抛异常 → 返回默认名且不抛；存了 `"  "` → 默认名。
3. `saveDisplayName`：`setItem` 抛异常 → 不抛出（对齐 `theme.test.ts` 已有范式）。
4. `describeRole`：三角色 + `null` 的 `label`/`capability` 字面量；断言三个 `label` 两两不同（防止将来复制粘贴出同名）。
5. `mergeRoomRoster`：
   - participants 命中 → 用昵称，`isAnonymous === false`；
   - members 里有、participants 里没有 → `displayName === "成员 ab12cd"`、`isAnonymous === true`；
   - 自己恒排第一且 `isSelf === true`，即使自己是 viewer；
   - 排序：owner → editor → viewer，同角色按 `joinedAt` 升序；
   - `participants` 为空数组（房主刚建房）→ 仅自己一条且用本地昵称，不出现 `undefined`。

**`src/components/collaboration/RoomRoster.test.tsx`**

1. 三个角色各一行 → `textContent` 分别含「创建者」「编辑者」「仅查看」。
2. **不靠颜色**：断言每个 `li` 同时具备 `data-member-role` **且** `.collaboration-members__role` 的文字内容非空。
3. 👑 的宿主元素 `getAttribute("aria-hidden") === "true"`。
4. `li.getAttribute("aria-label")` === `"林舟，创建者，可编辑并邀请"`。
5. `isAnonymous` 行渲染出解释小字。

**`src/components/collaboration/DisplayNameInput.test.tsx`**

1. `maxLength === 24`。
2. `connected` → `input.disabled === true` **且**容器 `textContent` 含「断开后可修改昵称」。
3. 输入触发 `onChange` 收到原始字符串。
4. `<label>` 的 `htmlFor` 与 `input.id` 一致（可点击标签聚焦）。

**`src/components/ProjectMenu.test.tsx`（新建，补 Round 1 指出的空白）**

1. `roomId === null` → 渲染昵称输入（可编辑）与「创建房间」；不渲染成员名册。
2. `roomId` 有值 + owner → 渲染名册、渲染邀请按钮两枚（编辑者/查看者）。
3. `roomRole === "viewer"` → **不渲染**任何邀请按钮，且渲染「当前仅查看，无法修改此工程」。
4. `members` 有 2 人、`participants` 只覆盖 1 人 → 名册两行，其中一行为匿名占位。
5. 昵称输入触发 `onDisplayNameChange`。

**`src/lib/useCollaborationRoom.test.tsx`（新建，可选但强烈建议）**：mock `fetch`，断言 `POST /api/rooms` 的 body 里 `displayName` 等于传入昵称（而非硬编码常量）；不传 `displayName` 时等于 `本机协作者`（向后兼容回归）。

### E.9 回滚

- 无格式、无协议、无持久化 schema 变更；`localStorage` 只多一个键 `cengfan-map-studio:collaboration-display-name`，删除该键即回到默认名。
- 回滚 = `git revert`：恢复 `app-constants.ts:11` 的常量与 `useCollaborationRoom.ts` 的三处引用，删除新组件与 `ProjectMenu` 的三个 props。房间协议与服务端**从未改动**，正在进行的房间不受影响。
- 分级：若只想撤 UI 保留能力，把 `ProjectMenu` 的 `<DisplayNameInput>` 摘掉即可，hook 仍会用 localStorage 里的昵称（或默认名）。

---

## 5. 与开放 PR 的冲突面

| 开放 PR | 触及面 | 本规格冲突风险 | 缓解 |
|---------|--------|----------------|------|
| #9 / #10 工作流入口重排与 UX | `WorkflowStageStepper` / 顶栏布局 | **低**：A 只在 `projectActionsNode`（:1527）与 legacy 顶栏（:1980）各插一行，不改 `StudioTopbar` props、不改 `workflowNav` | 若 #9 先合，A 的两处插入点按新结构对齐；`helpActions` 常量本身不变 |
| #6 窄屏侧栏 | `styles.css` 响应式 | 低：A/B/E 各自新增独立类名，不改既有选择器 | 新样式统一写在 `styles.css` 末尾的新段落，减少 hunk 交叉 |
| #3 印刷尺寸 / 案例模板 | `DeliveryWorkspace`、案例文档 | 无 | 本规格不碰交付阶段 |
| #5 顺序 CI | `.github/workflows` | 无（正向）：新增 13 个测试文件会被 CI 直接接住 | 建议 Round 3 在 #5 合入后再提，让新测试第一时间进门禁 |
| #7 公开 Demo | 部署/构建 | 无 | A 的链接是静态外链，纯静态托管下同样可用 |
| #8 仓库清理 | `demo.html`、游离文件 | 无 | 本规格不移动任何既有文件 |

唯一需要主动协调的是 **`src/App.tsx` 的顶栏区**：A（2 处插入）与 E（4 行 props）都落在 :1407-1443 与 :1527-1536 附近。建议 Round 3 **A 与 E 放同一个提交序列的相邻两步**，避免两次独立 rebase 撞同一 hunk。

---

## 6. Round 3 执行顺序（先写失败测试，再实现）

每一步都遵循 `AGENTS.md` 的 failure → cause → fix → recheck，单步验证命令为 `npx vitest run <目标文件>`，全项完成后再跑一次 `npm test` 与 `npm run lint`（`scripts/run-heavy.mjs`，不并行）。

| 步 | 动作 | 先落的失败测试 | 验证命令 |
|----|------|----------------|----------|
| 1 | A 纯函数 | `src/lib/feedback-links.test.ts`（含 bug.yml 漂移守卫） | `npx vitest run src/lib/feedback-links.test.ts` |
| 2 | A 组件 + 两处顶栏 + WorkbenchHeader | `src/components/HelpFeedbackMenu.test.tsx` | `npx vitest run src/components/HelpFeedbackMenu.test.tsx src/components/ProjectWorkbench.test.tsx` |
| 3 | E 身份纯函数 | `src/lib/collaboration-identity.test.ts` | `npx vitest run src/lib/collaboration-identity.test.ts` |
| 4 | E 两个组件 | `RoomRoster.test.tsx` / `DisplayNameInput.test.tsx` | `npx vitest run src/components/collaboration` |
| 5 | E hook + ProjectMenu + App 接线 | `src/components/ProjectMenu.test.tsx`、`src/lib/useCollaborationRoom.test.tsx` | `npx vitest run src/components/ProjectMenu.test.tsx src/lib/useCollaborationRoom.test.tsx src/App.test.tsx` |
| 6 | B 格式库（`export` 两个 sanitizer + `template-package.ts`） | `src/lib/template-package.test.ts` | `npx vitest run src/lib/template-package.test.ts src/lib/template-store.test.ts` |
| 7 | B 动作库 + 反向误投断言 | `template-exchange-actions.test.ts`、`project-package.test.ts` 追加条 | `npx vitest run src/lib/template-exchange-actions.test.ts src/lib/project-package.test.ts` |
| 8 | B 组件 + 插槽 + App 接线 | `TemplateExchange.test.tsx`、`TemplatePicker.test.tsx` | `npx vitest run src/components/TemplateExchange.test.tsx src/components/TemplatePicker.test.tsx src/components/GlobalSettingsScreen.test.tsx` |
| 9 | 全量回归 | — | `npm test` 然后 `npm run lint` |

**动工前必须先跑一次基线**（`npm test`）并记录已存在的失败（Round 1 提到 `map-content-bounds` ×3、`App.test` ×1 的历史失败尚未复核），否则无法区分新旧失败。

### 交付方式（`AGENTS.md` 交付纪律）

- A：PR 内附「点开顶栏帮助 → 报告问题」的截图，并在描述里贴出实际生成的 URL 全文，供审阅者肉眼确认无 PII。
- B：PR 内附一次真实往返（导出 → 换浏览器 profile 导入）的记录，并贴出导出文件的 `head -20`；描述中必须包含 §B.11 的三级回滚表。
- E：PR 内附两窗口（房主 + 受邀）的成员名册截图，并说明 §E.3 的房主侧匿名限制；明确声明「服务端未改动」。

---

## 7. 三项共同的边界自检（合入前逐条打勾）

1. `rg -i '(price|sku|listed|order|coupon|payment|vip|套餐|手续费|结算)' src/lib/template-package.ts src/lib/feedback-links.ts src/lib/collaboration-identity.ts` —— 只应命中 `assertNoCommercialFields` 的**拒收清单**，不得有任何字段定义。
2. `rg 'students' src/lib/template-package.ts` —— 只应命中出站正则兜底与注释。
3. `git diff --stat server/` —— **必须为空**（三项均不改服务端）。
4. `git diff --stat src/App.tsx` —— 净增应 ≤ 25 行；超出说明逻辑漏进了 App，需退回 `src/lib`。
5. `rg 'displayName' src/lib/app-constants.ts` —— 应为空（常量已迁走）。
6. 新组件文件不得导出组件以外的东西（`react-refresh/only-export-components`）。
