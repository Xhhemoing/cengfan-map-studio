MODEL: claude-opus-5-thinking-high-fast

# R3-O2 完成报告：A 应用内「提意见 / 帮助」 + D-slim 恢复 XLSX 模板下载

> 角色：Round 3 实现者 R3-O2。**已实现，未 commit、未 push**（按任务要求）。
> 分支：`cursor/feature-expansion-research-c710`（未切换、未提交）。
> 工作树注意：同轮其他 agent（R3-G1 / R3-G2 / R3-F1 / R3-O1）在同一工作树内并行改动，
> 本报告的 `git diff` 引用只涵盖我拥有的文件；`App.tsx:649` 的 `getProjectName` 一行属 R3-G1，不是我的改动。

---

## 0. 交付物清单（严格落在授权文件内）

| 类型 | 路径 | 行数 | 说明 |
|------|------|------|------|
| 新增 | `src/lib/feedback-links.ts` | 148 | 纯函数：环境识别 + Issue 预填 URL 装配 + 白名单/长度兜底 |
| 新增 | `src/lib/feedback-links.test.ts` | 148 | 19 条断言，含 bug.yml 漂移守卫与零 PII 断言 |
| 新增 | `src/components/HelpFeedbackMenu.tsx` | 81 | 折叠菜单，只有外链，无 form / textarea / file / fetch |
| 新增 | `src/components/HelpFeedbackMenu.test.tsx` | 118 | 8 个用例，含「渲染出的 href 不含名单 / 工程 / 房间码」 |
| 新增 | `src/components/workspaces/DataUploadWorkspace.template-download.test.tsx` | 74 | D 的专项回归：主路径可见 + 父级仍可关掉 |
| 修改 | `src/components/workbench/WorkbenchHeader.tsx` | +2 | `workbench-actions` 内插入 `variant="workbench"` 菜单 |
| 修改 | `src/App.tsx` | +4 / −1 | ① import；② `projectActionsNode` 插入帮助菜单；③ 删 `hideTemplateDownload: true` |
| 修改 | `src/components/workspaces/DataUploadWorkspace.tsx` | −1 | 删掉 spread 之后的硬编码 `hideTemplateDownload` |
| 修改 | `src/components/workspaces/DataUploadWorkspace.test.tsx` | +3 / −2 | 把「textContent 不含 模板」换成精确选择器 |
| 修改 | `src/styles.css` | +40（追加在文件末尾） | `.help-menu*` 新类名，不改任何既有选择器 |

**未触碰**（禁区自检）：`usePosterExport` 调用处、`DeliveryWorkspace`、`stage-overview.ts`、`server/`、
`DataWorkspace.tsx`（含其 aria-live）、六阶段导航 / `WorkflowStageStepper` / `StudioTopbar`、任何支付相关内容。
帮助文案里没有出现任何阶段名（「数据与素材」「最终导出」等一律不写）。

---

## 1. A —— 应用内提意见 / 帮助

### 1.1 菜单内容

`<details className="help-menu">` + `<summary aria-label="帮助与反馈">`，弹层三段：

| 段 | 条目 | 目标 |
|----|------|------|
| 告诉我们 | 使用意见 | `…/issues/new?template=feedback.yml` |
| | 遇到问题 | `…/issues/new?template=bug.yml&env=…&where=…` |
| | 功能建议 | `…/issues/new?template=feature.yml` |
| 先自己看看 | 用户指南 | `…/blob/main/USER_GUIDE.md` |
| | 全部反馈入口 | `https://github.com/Xhhemoing/cengfan-map-studio/issues/new/choose` |
| 环境 | `Windows 10/11 + Chrome 128` + 图标按钮「复制环境信息」 | 剪贴板 |

固定告知语（写死、不可关闭）：**「只会带上系统与浏览器版本，不会上传名单或工程内容。」**

每条链接 `target="_blank" rel="noopener noreferrer"`，`aria-label` 形如
`遇到问题（GitHub，已预填系统与运行方式，新窗口打开）`。

### 1.2 零 PII 的四层强制

| 层 | 手段 | 证据 |
|----|------|------|
| 类型层 | `buildIssueUrl(kind, environment?: ClientEnvironment)`，签名里没有工程 / 学生 / 房间任何类型 | `feedback-links.ts` |
| 运行时 | 参数白名单 `["template","labels","env","where"]` + `MAX_ISSUE_URL_LENGTH = 512`，越界抛错 | `finalizeIssueUrl` |
| 数据层 | `describeClientEnvironment` 只输出枚举化的 os / browser / runtime，**完整 UA 与 host 字面量都不外传**（host 只用于分支判断） | 测试「never leaks the host itself」 |
| 测试层 | 对**渲染出来的每个 href** 断言不匹配 `/林舟\|北京大学\|students\|roster\|roomId\|room=\|token\|cengfan-project/i`，且不含 `%7B / %22 / %5B`（工程 JSON 一旦入 query 必然出现的编码字符），长度 ≤ 512 | `HelpFeedbackMenu.test.tsx` 第 4 个用例 |

### 1.3 bug.yml 预填与漂移守卫

只预填两个字段，且都对应 bug.yml 里真实存在的 `id`：

- `env`（input 系统与浏览器）← `formatEnvironmentForIssue()`，格式对齐模板 placeholder「Windows 11 + Chrome 128」。
- `where`（dropdown 运行方式）← `BUG_RUNTIME_OPTIONS` 之一。

**下拉预填靠选项文本精确匹配**，因此 `BUG_RUNTIME_OPTIONS` 四条与 `.github/ISSUE_TEMPLATE/bug.yml`
逐字相同，并由测试 `expect(yml).toContain('- ' + option)` 守住；同时断言 `id: env` / `id: where` 仍在模板中，
以及 `feedback.yml / bug.yml / feature.yml` 三个文件确实存在。任何一方改动都会让这三条测试红。

`feedback` 与 `feature` 模板**没有** env/where 字段，因此即使传入 environment 也不附加参数（多余参数只会被 GitHub 忽略并拉长 URL）。

### 1.4 无障碍与「不做的事」

- `summary` 的可访问名为 `帮助与反馈`（任务硬要求）。
- 复制按钮为图标按钮，可访问名走 `aria-label` + `title`（与 `ProjectMenu` 的「复制房间码」同一范式）。
- **没有任何 aria-live**（本轮推迟）：`HelpFeedbackMenu.test.tsx` 里有一条
  `expect(container.querySelector("[aria-live]")).toBeNull()` 把这条约束钉死，防止后续顺手加回来。
- 组件不接收 `project` / `students` / `roomId` 任何 props，只有 `environment` / `variant` / `onCopyEnvironment` 三项。

---

## 2. D-slim —— 恢复数据阶段「下载 XLSX 模板」

按钮被**两处**同时关掉，只改一处不会出现：

1. `src/App.tsx` 传 `dataWorkspaceProps={{ …, hideTemplateDownload: true }}`；
2. `src/components/workspaces/DataUploadWorkspace.tsx` 在 `{...dataWorkspaceProps}` **之后**硬写无值
   `hideTemplateDownload`（等价 `true`），会覆盖任何父级传值。

两处都删。`DataWorkspace` 的 `hideTemplateDownload?: boolean` prop **保留不动**——`GlobalSettingsScreen` 仍在消费它，
且在途 PR #11 把该按钮下沉到子组件后仍把它作为必填 prop 透传，删 prop 会硬冲突。

新增 `DataUploadWorkspace.template-download.test.tsx` 两条：

- 主路径展开导入后按钮可见且文案为「下载 XLSX 模板」；
- 父级显式传 `hideTemplateDownload: true` 时按钮消失——**这条才是「硬编码覆盖已被删除」的直接证据**，
  只测「按钮出现」无法区分「删了覆盖」与「把覆盖改成了 false」。

---

## 3. 验证证据链（failure → cause → fix → recheck）

### 3.1 A-1：`feedback-links` 模块不存在（预期的先失败）

- **failure**：`npx vitest run src/lib/feedback-links.test.ts` → `Failed to resolve import "./feedback-links"`，`Tests no tests`。
- **cause**：先写测试、实现尚未落地。
- **fix**：新增 `src/lib/feedback-links.ts`。
- **recheck**：同一命令 → `Tests 16 passed | 3 failed`（进入下一条）。

### 3.2 A-2：jsdom 下 `import.meta.url` 不是 file scheme

- **failure**：同一命令 3 条红。
  `TypeError: The URL must be of scheme file`（`readFileSync(new URL("../../.github/…", import.meta.url))`）
  与 `ENOENT: no such file or directory, open '/.github/ISSUE_TEMPLATE/feedback.yml'`。
- **cause**：vitest 的 jsdom 环境里模块通过 Vite 以 http URL 提供，`import.meta.url` 形如 `http://localhost/src/lib/…`，
  相对解析后既不是 file URL，也把仓库根解析成了 `/`。**不是模板文件缺失**（`ls .github/ISSUE_TEMPLATE/` 四个文件俱在）。
- **fix**：改用 `resolve(process.cwd(), ".github/ISSUE_TEMPLATE", fileName)`（vitest root = 仓库根），
  并把 helper 从 `readBugTemplate()` 泛化为 `readIssueTemplate(fileName)`。
- **recheck**：`npx vitest run src/lib/feedback-links.test.ts` → **19 passed**。

### 3.3 A-3：组件先失败

- **failure**：`npx vitest run src/components/HelpFeedbackMenu.test.tsx` → 解析不到 `./HelpFeedbackMenu`，`no tests`。
- **cause**：先写测试。
- **fix**：新增 `src/components/HelpFeedbackMenu.tsx`。
- **recheck**：同一命令 → **8 passed**。

### 3.4 A-4（真回归）：帮助菜单的「复制环境信息」抢走了工作台的「复制」

- **failure**：`npx vitest run … src/components/ProjectWorkbench.test.tsx` →
  `ProjectWorkbench > duplicates a project`：`AssertionError: expected false to be true`
  （`projects.some((p) => p.name.includes("副本"))`）。
- **cause**：该用例用 `Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("复制"))` 定位
  项目卡片菜单里的「复制」。我把帮助菜单插进了 `WorkbenchHeader`，其中带可见文字的
  `<button>复制环境信息</button>` 在 DOM 顺序上**排在项目卡片之前**，于是 `find` 命中了我的按钮，
  点击后只写了剪贴板、没有复制项目。`ProjectWorkbench.test.tsx` 不在我的授权文件内，必须从我这边规避。
- **fix**：把复制控件改成图标按钮（`<Copy size={15} />`，可访问名走 `aria-label` + `title`，与
  `ProjectMenu` 的「复制房间码」一致），按钮 `textContent` 变为空串，不再参与文本查找；
  并在 `HelpFeedbackMenu.test.tsx` 补两条断言（`textContent.trim() === ""`、`title === "复制环境信息"`）钉住该形状。
- **recheck**：`npx vitest run src/components/HelpFeedbackMenu.test.tsx src/components/ProjectWorkbench.test.tsx` → **23 passed**。

### 3.5 D-1：反转断言前先证明它是有效的

- **failure（人为构造，验证断言承重）**：把 `hideTemplateDownload` 临时加回 `DataUploadWorkspace.tsx` 后
  `npx vitest run src/components/workspaces/DataUploadWorkspace.test.tsx src/components/workspaces/DataUploadWorkspace.template-download.test.tsx`
  → **2 failed**（`shows the XLSX template download on the data stage import path`、
  `is the upload data workbench and excludes templates and map expression controls`，均为 `expected null not to be null`）。
- **cause**：子组件在 spread 之后硬写的 prop 覆盖父级传值——即「只改 App 不生效」这条结论的可执行证据。
- **fix**：删除该行（App 侧的 `hideTemplateDownload: true` 同步删除）。
- **recheck**：同一命令 → **9 passed**。

### 3.6 A-5：类型错误

- **failure**：`npx tsc --noEmit -p tsconfig.app.json` →
  `src/components/HelpFeedbackMenu.test.tsx(102,46): error TS2493: Tuple type '[]' of length '0' has no element at index '0'.`
- **cause**：`vi.fn(() => Promise.resolve())` 推断出零参签名，`writeText.mock.calls[0]?.[0]` 索引越界。
- **fix**：`vi.fn((_text: string) => Promise.resolve())`，并去掉多余的 `as unknown as string`。
- **recheck**：`npx tsc --noEmit -p tsconfig.app.json | grep -iE "HelpFeedback|feedback-links|DataUploadWorkspace|WorkbenchHeader|App.tsx"` → **无输出**。
  （同次运行里 `ProjectMenu.identity.test.tsx` / `collaboration-identity.test.ts` / `TemplatePicker.tsx` 仍有报错，
  属同工作树内 R3-F1、R3-O1 未完成的文件，不在我的授权范围，未触碰。）

### 3.7 终检

```
npx vitest run src/lib/feedback-links.test.ts \
  src/components/HelpFeedbackMenu.test.tsx \
  src/components/workspaces/DataUploadWorkspace.test.tsx
→ Test Files 3 passed (3) / Tests 34 passed (34)

npx vitest run src/lib/feedback-links.test.ts src/components/HelpFeedbackMenu.test.tsx \
  src/components/workspaces/DataUploadWorkspace.test.tsx \
  src/components/workspaces/DataUploadWorkspace.template-download.test.tsx \
  src/components/ProjectWorkbench.test.tsx src/components/DataWorkspace.test.tsx src/App.test.tsx
→ Test Files 7 passed (7) / Tests 196 passed (196)

npx eslint <本轮 9 个文件> → 无输出（0 error / 0 warning）
```

`npm test` / `npm run lint` 全量**未跑**：同工作树内其他 agent 的在建文件当前会红（见 §3.6），
全量结果无法归因到本轮改动；本轮以目标文件 + 全部受影响调用点（App / ProjectWorkbench / DataWorkspace）为验证边界。

说明：终检输出里的 `Not implemented: navigation to another Document` 是 jsdom 对
`DataWorkspace.test.tsx` 既有 XLSX 下载用例（`a[download].click()`）的告警，与本轮无关——
单独跑 `src/App.test.tsx` 该告警出现 0 次，单独跑 `src/components/DataWorkspace.test.tsx` 出现 1 次，两个套件均通过。

---

## 4. 交付方式与回滚

### 4.1 验收方式（AGENTS.md 交付纪律：本地绿 + 口述不算证据）

| 项 | 合入前必须提供 |
|----|----------------|
| A | ① 顶栏与工作台各一张展开菜单的截图；② PR 描述里**贴出「遇到问题」链接的完整 URL 原文**供审阅者肉眼确认无 PII；③ 真机点开一次，确认 GitHub 表单里「运行方式」下拉**确实被选中**（预填靠文本匹配，只有真机能证明没漂移）。 |
| D | ① 数据阶段展开导入后按钮可见的截图；② 下载到的 xlsx 用 Excel/WPS 打开，两个 sheet（`学生数据` 四列表头 / `填写说明`）的截图。 |

### 4.2 回滚

| 层 | 动作 | 影响 |
|----|------|------|
| A-L0（最快） | 删 `App.tsx` 的 `<ToolbarGroup label="帮助与反馈">` 三行 + `WorkbenchHeader.tsx` 一行 | 入口立即不可达，库与测试保留 |
| A-L1 | 再删两个新组件/库文件与两个测试、`styles.css` 末尾 `.help-menu*` 段 | 完全消失 |
| D | `DataUploadWorkspace.tsx` 加回 `hideTemplateDownload`、`App.tsx` 加回 `hideTemplateDownload: true`，并把 `DataUploadWorkspace.test.tsx` 的两条断言改回 | 回到隐藏态 |

**均非破坏性变更**：不改 `ProjectDocument` / `.cengfan` 工程包 / 协作 API 形状 / localStorage schema /
IndexedDB 结构，不新增服务端路由，不产生任何持久化数据，因此**不需要数据迁移**。
D 是纯恢复既有能力（下载链路 `createImportTemplateSheets` 与其单测一直都在，只是入口被关）。

### 4.3 合并顺序提示

- `src/App.tsx` 是热点（#5/#6/#9/#10/#11 都在改）。本轮只碰 3 个 hunk（import、`projectActionsNode`、`:1670` 删一个键），
  但每次 rebase 后必须重跑 `src/App.test.tsx`。
- `DataUploadWorkspace.test.tsx` 被 #9/#10/#11 同时改。合并时**以「按钮必须存在」为准**，
  不要被任一 PR 的旧断言把 `not.toBeNull()` 覆盖回 `toBeNull()`。
- `WorkbenchHeader.tsx` 当前无在途 PR 触碰，冲突面为零。
- 若 #11 落地（把导入区拆到 `data-workspace-import-panel.tsx`），D 的两行删除与
  `aria-label="下载学生数据 XLSX 模板"` 选择器均保持有效。

---

## 5. 本轮明确没做（留给后续）

- `DataWorkspace` 的 aria-live 常驻 region（D2）——按任务要求推迟，且已在组件测试中用
  `[aria-live]` 为 null 的断言把「帮助菜单不偷跑 live region」这条边界锁住。
- `USER_GUIDE.md` FAQ 表头修正（C-1，属 R3-F2）、CHANGELOG 条目（G，属 R3-F2）。
- 导出文件名（F）、空名单健康（H）、协作昵称（E）、模板交换格式（B）——分属其他 agent。
