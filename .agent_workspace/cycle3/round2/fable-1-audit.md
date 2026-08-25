# C3R2-F1 · Cycle 3 Round 1 落地交叉核验

MODEL: claude-fable-5-thinking-xhigh

审计基准：HEAD = `4aa8f89`（feat(cycle3): import alerts, package filenames, help changelog, dead CSS），即 Round 1 合入后的状态。审计时工作区已有 Round 2 并行代理的**未提交**改动（`USER_GUIDE.md`、`ProjectWorkbench.tsx/.test.tsx`、`project-package.ts/.test.ts`、`styles.css`、新增 `src/App.export-busy.test.ts`），以下逐条区分「HEAD 已落地」与「工作树进行中」。本审计未改任何产品代码/CSS/测试/CHANGELOG，未 commit/push。

## 结论一览

| 项 | 判定 | 一句话 |
|----|------|--------|
| D3 | ✅ 落地 | 双常驻 live region + 关键词路由均在源码 |
| F3 | ✅ 落地 | `usePosterExport` 走 `buildExportFileName({kind:"project"})`，`.json` 后缀，parse/accept 零改动 |
| A3 | ✅ 落地 | `CHANGELOG_URL`/`APP_VERSION` 手抄常量，无 package.json import，Issue URL 无工程数据 |
| CSS | ✅ 落地（附残留记录） | `workflow-workspaces.css` 与 `server/styles.test.ts` 零残留；**HEAD 的 `src/styles.css` 有 5 处分组选择器残留**（属 Round 2 CSS2/O1，未由本审计改动） |
| P3 | ✅ 落地 | App.tsx 两处按钮均 `exportState === "exporting"`；DeliveryRail 本就是此条件，不算缺陷 |
| Doc | ✅ 落地 | Unreleased 已是「已落地」措辞；昵称 20；0.1.0 纠偏指向 Unreleased |
| regional | ✅ 约束成立 | 三处内置选择器均为五模板列表，regional 仅在读取路径校验 |

## D3 · 导入失败常驻 alert —— 落地 ✅

- `src/lib/import-message.ts:7`：`FAILURE_MARKERS = ["失败", "没有", "请先", "不能为空", "校验问题", "无法"]`；`:9-11` 纯函数 `isImportFailureMessage`。与判定要点一致。
- `src/components/DataWorkspace.tsx:20` import 该函数；`:578-585` 两个**常驻**区域：`:579` `role="status" aria-live="polite"`（替换摘要 + 非失败消息，`:580-581`），`:583` `role="alert" aria-live="assertive"`（失败消息，`:584`）。两个 div 无条件渲染，不随消息卸载。
- `src/styles.css:461` `.data-message--alert` 红色系规则；`:463` `.data-message:empty` 用 clip-path 视觉隐藏（非 `display:none`），按类名同时覆盖两个区域——「区域不随消息卸载、空态留在读屏树」成立。
- 测试随 Round 1 提交：`src/lib/import-message.test.ts`（+40 行）、`src/components/DataWorkspace.test.tsx`（+57 行），见 `4aa8f89` stat。
- **关键词覆盖抽查**：逐条核对 `DataWorkspace.tsx` 全部 18 处 `setMessage`——失败路径（`:165/:249/:260/:268/:283/:297/:305/:323/:341/:346` 及 `:225`）均命中关键词；成功路径（`已…` 开头、`从…识别到 N 条候选`）均不命中。唯一边缘：`:193` 的回退串「请填写学生姓名、就读院校和城市」不含关键词，但它只在 `result.issues` 为空且学生被丢弃时才用——而 `src/lib/student-data.ts:34-56` 保证缺字段必产 `…不能为空` issue（`issues[0].message` 命中「不能为空」），故该回退实际不可达，属防御性死分支。**观察项，非缺陷**。

## F3 · 工程包文件名 —— 落地 ✅

- `src/lib/usePosterExport.ts:119-124`：`buildExportFileName({ projectName: getProjectName?.(), kind: "project", date: pack.exportedAt.slice(0, 10) })`，文件名日期与包内 `exportedAt` 同源；`:124` `downloadProjectPackage(pack, fileName)`、`:126` `setLastExportFileName(fileName)`。
- `src/lib/export-filename.ts:43-46`：`kind === "project"` 分支产出 `` `${baseName}-工程包-${date}.json` ``——`.json` 后缀锁定。
- **parse/accept 未改**：`git show 4aa8f89 -- src/lib/project-package.ts` 为空 diff（Round 1 未触碰该文件）；HEAD 的 `src/lib/project-package.ts:172` `parseProjectPackage`、`:214` `PROJECT_PACKAGE_FILE_ACCEPT = "application/json,.json,.cengfan"` 原样。历史 `cengfan-project-*.json` / `.cengfan` 导入路径不受影响。
- 测试随 Round 1 提交：`export-filename.test.ts` +25 行、新增 `usePosterExport.test.tsx` +72 行。

## A3 · 帮助菜单 CHANGELOG 链接与版本号 —— 落地 ✅

- `src/lib/feedback-links.ts:12`：`CHANGELOG_URL = \`${REPO_URL}/blob/main/CHANGELOG.md\``（纯路径，无 query/hash）；`:14-18`：`APP_VERSION = "0.1.0"` 字符串字面量，注释写明手抄取舍。**全文件无 `import ... package.json`**（"package.json" 仅出现在注释里）；与 `package.json:3` 的 `"version": "0.1.0"` 一致。
- **Issue URL 仍无工程数据**：`buildIssueUrl`（`feedback-links.ts:146-154`）只设 `template` + bug 场景的 `env`/`where`；`finalizeIssueUrl`（`:129-140`）按 `ISSUE_URL_ALLOWED_PARAMS`（`:41`，template/labels/env/where）白名单 + 512 长度兜底。`APP_VERSION` 全仓不进任何 URL 构造，只在 JSX 渲染。
- `src/components/HelpFeedbackMenu.tsx:7-8` import 两常量；`:69` `<HelpLink href={CHANGELOG_URL} label="更新日志" hint="GitHub" />`；`:79` `<small>版本 v{APP_VERSION}</small>` 位于 `.help-menu__environment` 内。
- 测试随 Round 1 提交：`feedback-links.test.ts` +29、`HelpFeedbackMenu.test.tsx` +26。

## CSS · `.template-workspace*` 清理 —— 落地 ✅，styles.css 残留已记录

- `src/components/workflow-workspaces.css`：`rg 'template-workspace'` 零命中（Round 1 删 44 行，见 `4aa8f89` stat）。
- `server/styles.test.ts`：零命中，断言已同步改写（`4aa8f89` 中 13 行改动），`vitest run server/styles.test.ts` 由 Round 1 报告记录 12 passed。
- **HEAD 的 `src/styles.css` 确有残留**（`git grep template-workspace HEAD -- src`），共 5 处分组选择器成员：
  - `HEAD:src/styles.css:2485` `.app-shell[data-editor-skin="atelier"] .template-workspace__catalog-heading h2,`
  - `HEAD:src/styles.css:2554` `.studio-stage-shell .template-workspace,`
  - `HEAD:src/styles.css:2860`（900px 媒体查询内）同上
  - `HEAD:src/styles.css:2881` `.app-shell[data-editor-skin="atelier"] .studio-stage-shell .template-workspace,`
  - `HEAD:src/styles.css:2894`（媒体查询内）同上
  这正是 Round 2 简报 CSS2 行点名的残留。**遵指令本审计未改**；工作树中该 5 行已被并行 CSS2 代理删除（未提交 diff 恰为 5 处 `-` 行，均为逗号分组中间成员，删除不影响同组其它工作区类），报告见 `round2/opus-1-css.md`。
- 注意一处检索工具盲区：内置 Grep 工具对 `src/styles.css` 的超长行未报命中，`git grep`/`rg` 才查出——后续审计勿只依赖单一检索。

## P3 · 导出 PNG 任意导出中禁用 —— 落地 ✅

- `src/App.tsx:2021-2022`（顶栏工具组「导出」）：`disabled={posterExport.exportState === "exporting"}`，文案 `exportingPng || exportState === "exporting" ? "导出中..." : "导出 PNG"`。
- `src/App.tsx:2286`（工作流交付操作组）：同一 disabled 条件与文案逻辑。
- `DeliveryRail`（`src/components/workspaces/DeliveryWorkspace.tsx:85` 定义，`App.tsx:1770` 使用）：`:122-124` PNG/SVG/工程包三个按钮均 `disabled={exportState === "exporting"}`，`:121` 容器 `aria-busy`。**本就是此条件，按判定要点不算缺陷**。`DeliveryWorkspace` 主体（`:135-150`）只渲染预览，无导出按钮。
- 缺口（见下节）：HEAD 无针对「顶栏 PNG 在 exportState 导出中禁用」的自动化测试——Round 1 P3 报告只跑了既有 `App.test.tsx`。

## Doc · CHANGELOG —— 落地 ✅

`CHANGELOG.md` 在工作树未被修改，以下全部在 HEAD：

- **Unreleased 已是「已落地」措辞**：`:19` 工程包文件名「编辑器内导出工程包**现为**『项目名-工程包-日期.json』」；`:20` 帮助菜单「**新增**『更新日志』链接……显示当前版本号」；`:25` D3「失败 / 阻断消息**改走**常驻 `role="alert"`」；`:27` P3「顶栏『导出 PNG』在 SVG 或工程包导出进行中**也会禁用**」。Round 1 报告里的「进行中/尚未合入」小节已按其「给合并者」约定在合入时转正，无漂移。`:19` 措辞刻意限定「编辑器内」，与工作台导出尚未对齐（F3b）的事实相符，无虚报。
- **昵称 20**：`:38`「不超过 20 字符」= `src/lib/collaboration-identity.ts:11` `MAX_DISPLAY_NAME_LENGTH = 20`（`:19` 按码点截断）。
- **0.1.0 帮助纠偏指向 Unreleased**：`:36`「（纠偏：本版本的帮助菜单尚无更新日志链接与版本号显示；两者已在后续周期补齐，见上方 Unreleased。）」，env 描述为「操作系统 / 浏览器 / 运行方式」，无「应用版本」。`:39` 保留 0.1.0 快照口径「工程包文件名保持 `cengfan-project-日期.json`」——作为历史版本描述正确，与 `:19` 的 Unreleased 变更记录互补，非矛盾。

## regional 历史只读 —— 约束成立 ✅

- 三处内置模板选择器均为 `["original", "cartoon", "grain", "q", "scenery"]`，不含 regional：`src/App.tsx:1634`、`:1843`、`:2106`（`:2105` `aria-label="内置整体模板"` 的 template-grid）。
- `src/lib/project-data.ts:20-21`：注释明示「`regional` remains readable for historical projects but is not shown as a new built-in preset」，类型联合保留 regional。
- `src/lib/template-store.ts:29` `MAP_TEMPLATE_IDS` 含 regional，但仅用于 `isMapTemplateId`（`:31-33`）解析校验（读取路径），不产出任何选择器 UI。

## 剩余缺口

### 仍在范围内（Round 2 简报已分派，状态按「HEAD 缺口 → 工作树进展」记）

1. **F3b（工作台文件名未对齐）**：HEAD 的 `src/components/ProjectWorkbench.tsx:166` 仍为 `` downloadProjectPackage(project.pack, `${project.name}-${project.updatedAt.slice(0, 10)}.json`) ``；HEAD 的 `project-package.ts` `downloadProjectPackage` 默认名仍为 `cengfan-project-*.json`。工作树中并行代理已改（`project-package.ts` 默认名改走 `buildExportFileName({kind:"project", date:...})`，`ProjectWorkbench.tsx/.test.tsx`、`project-package.test.ts` 同步修改，未提交），报告见 `round2/opus-2-f3b.md`。
2. **CSS2（styles.css 残留）**：上文 5 处 HEAD 残留；工作树已删（未提交）。`server/styles.test.ts` 无需改（该文件对这 5 个分组选择器无断言，工作树也未动它）。
3. **Docs（USER_GUIDE 漂移）**：HEAD 的 `USER_GUIDE.md` 无「帮助→更新日志」入口说明，也未写新工程包文件名（仅 `:14/:18` 提到工程包）。工作树中并行代理已改（未提交），报告见 `round2/fable-2-docs.md`。
4. **Tests（P3 回归缺测试）**：HEAD 无覆盖「顶栏导出 PNG 在 `exportState==="exporting"` 禁用」的用例；工作树新增未跟踪的 `src/App.export-busy.test.ts`（并行 Tests 代理），报告见 `round2/gpt-1-tests.md`。
5. **Leaks（支付/PII 复扫）**：属并行代理的报告任务（`round2/gpt-2-leaks.md`）。本审计顺带抽查与六项相关的面：`CHANGELOG_URL` 无参数、`buildIssueUrl` 白名单未松动、导出文件名仅含清洗后的项目名（`sanitizeExportBaseName` 40 字符上限 + 非法字符剔除）、`APP_VERSION` 不进 URL——未见新增泄漏面。

### 观察项（不构成缺陷，无需本轮动作）

- `DataWorkspace.tsx:193` 的不可达回退文案不含失败关键词（详见 D3 节）。若未来 `confirmImportCandidates` 行为变化使其可达，会误路由到 polite 区域——可在触碰该函数时顺带处理。
- 内置 Grep 工具对 `src/styles.css` 超长行漏报（详见 CSS 节），审计方法论层面的提醒。

### 明确禁区（本轮及后续不得做，复核仍守住）

- promo:lint、公开 Demo、CI、印刷尺寸——未发现任何越界改动。
- **支付**：全仓无支付/套餐/sku 实现进入（符合 `docs/开源与收费边界.md` 第 4 节强制项）。
- 改房间协议让他人昵称实时可见——`CHANGELOG.md:38` 仍如实标注「他人昵称暂不可见，属已知差距」，协议未动。
- 把 `regional` 加回内置选择器——见上节，三处选择器均未加。

## 审计方法与边界

- 证据来源：`git show 4aa8f89`（Round 1 提交范围与 diff）、`git grep ... HEAD`（区分 HEAD 与工作树）、`rg` 全文检索、逐文件读源码；未运行测试（判定要点均为静态可证，且并行代理正在改测试文件，避免踩踏）。
- 本审计仅新增本报告一个文件；未改产品代码/CSS/测试/CHANGELOG，未 git commit/push。
