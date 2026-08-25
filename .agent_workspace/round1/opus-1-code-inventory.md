# R1-O1 代码级盘点：社区 / 宣发 / 会员类 / 邻接能力

> 角色：Round 1 研究员 R1-O1。**只做代码盘点，不实现功能、不提交、不写支付代码。**
> 方法：全仓 `rg` 检索 + 逐文件阅读 + 实际执行只读脚本（`promo:check`、`promo:report --report`）。
> 仓库快照：`git status --short` 为空（工作区干净），本报告只新增本文件。

---

## 0. 一句话结论

**协作房间（角色/邀请/权限）与导入导出/AI 是真实、带测试的产品能力；「社区」和「宣发」在本仓库里几乎 100% 是 docs 与 Node 脚本，应用界面内没有任何一个社区、反馈、分享或宣发触点**——`rg 'https?://' src/**/*.tsx` 零匹配，即编辑器 UI 里连一条外链都没有。所谓「会员」在代码里完全不存在：没有用户表、没有注册登录、没有 session/JWT，唯一的服务端认证是一枚全局共享的 `WORKSPACE_API_TOKEN`。

---

## 1. 逐面盘点表

状态定义：**Implemented** = 有可运行代码且用户可达；**Partial** = 有代码但缺关键环节或不可达；**Docs-only** = 只有文档/脚本，产品无对应物；**Missing** = 无任何实现。

### 1.1 社区（Community）

| 面 | 状态 | 关键路径 | 代码事实 |
|----|------|----------|----------|
| 内置地图模板 | Implemented | `src/lib/template-store.ts:29`、`src/components/TemplatePicker.tsx` | 6 个固定 id：`original / cartoon / grain / q / scenery / regional`（`MAP_TEMPLATE_IDS`）。 |
| 自定义模板（本机） | Implemented | `src/lib/template-store.ts:28,252-277` | 存 `localStorage` key `cengfan-map-studio:custom-templates`；`sanitizeCustomTemplateRecord` 会剥离 `students` 字段防止名单泄漏。 |
| 模板导入 / 导出 / 共享 | **Missing** | — | `TemplatePicker.tsx:44-56` 只渲染「内置 + 我的模板 + 保存当前模板」三块。没有模板文件的读写入口，也没有任何跨设备传递方式。 |
| 社区模板市场 | Docs-only | `docs/宣发/国内互联网宣发总流程.md:141` | 内容日历 2026-10~11 列「模板市场雏形」，仓库无任何对应模块。且撮合/手续费按 `docs/开源与收费边界.md:44` 明确不得进本仓。 |
| 贡献指南 | Implemented（文档层） | `CONTRIBUTING.md` | 身份分流表、`good first issue` 规则、AGPL 授权声明、禁止提交支付代码（第 78 行）。 |
| Issue 模板 | Implemented | `.github/ISSUE_TEMPLATE/{bug,feature,feedback,config}.yml` | `feedback.yml` 带身份下拉 + 槽点多选 + 回访输入；`config.yml` 三条 contact_links 指向 USER_GUIDE / CONTRIBUTING / 反馈 SOP。 |
| PR 模板 | Implemented | `.github/PULL_REQUEST_TEMPLATE.md` | — |
| GitHub Discussions | Docs-only | `docs/宣发/反馈收集SOP.md:12,57`、`国内互联网宣发总流程.md:160,255` | 三处文档把 Discussions 当既有入口（周五「意见变成了什么」的主发布位），但仓库无任何 Discussions 产物，`config.yml` 的 contact_links 也没链它。开启动作只存在于文档里的 `gh repo edit --enable-discussions`。 |
| CI 门禁 | **Missing** | `.github/workflows` 不存在 | `docs/宣发复盘/验证报告-2026-08-14.md:48` 自己点名「`npm run check` 必须进 CI」，至今未落地。Issue/PR 模板收来的贡献没有任何自动校验。 |
| 应用内分享 | Partial | `src/components/ProjectMenu.tsx:126-152` | 唯一的「分享」是协作房间：复制房间码（:128）与复制一次性邀请凭证（:152）。**没有成品图分享、没有分享链接、没有社交平台按钮。** |
| 应用内社区/贡献入口 | **Missing** | — | `rg '(反馈\|feedback\|github\.com\|社区\|贡献)' src/**/*.tsx` → 无匹配。README:21/91-94 有链接，UI 里没有。 |

### 1.2 宣发（Promo）

| 面 | 状态 | 关键路径 | 代码事实 |
|----|------|----------|----------|
| `npm run promo:check` | Implemented（脚本） | `scripts/宣发流程-素材检查.mjs` | 8 组 31 项纯 `existsSync` 检查。实测输出：**必需 25 项全部通过，可选缺 6 项**，退出码恒为 0。 |
| `npm run promo:content` | Implemented（脚本） | `scripts/宣发流程-内容生成.mjs` | 支持 `xhs / xhs-video / bilibili / douyin / juejin / v2ex / zhihu` × `painpoint / result / emotion`，输出到 `docs/宣发草稿/`。模板硬编码在脚本内（:36 起）。 |
| `npm run promo:report` | **Partial（开箱即失败）** | `scripts/宣发流程-数据收集.mjs:96-99` | 依赖 `docs/宣发数据/current.json`，该目录**不存在**。实测输出「✗ 未找到当前数据文件，请先运行 --collect」，**但退出码仍是 0**——无法用作 CI 或任何自动化门禁。 |
| 宣发文档体系 | Implemented（文档层） | `docs/宣发/*`（6 篇）、`docs/私域/*`（6 篇）、`docs/KOL/*`（3 篇）、`docs/脚本库/*`（3 篇）、`docs/案例模板/*`（3 篇）、`docs/宣发草稿/配图/*`（12 张） | 体量充足；`国内互联网宣发总流程.md` 15.5 KB 是唯一权威总纲，`.agents/skills/cengfan-promo/SKILL.md:23` 明确禁止再复制并行计划。 |
| 应用内宣发触点 | **Missing** | — | `rg '(?i)(promo\|宣发\|小红书\|掘金\|v2ex\|gitee)' src/` → **零匹配**。UI 无水印链接、无二维码、无「分享到」、无引导语。 |
| `demo.html` 落地页 | **Partial（死资产）** | `/workspace/demo.html`（9.3 KB） | 独立 HTML 落地页，但：不是 Vite 入口（`vite.config.ts` 无 `rollupOptions.input` 多页配置）、不在 `public/`、`dist` 不会包含它、`server/index.ts` 的 `serveStatic` 只服务 `dist`。**执行 `npm run build && npm start` 后无法访问。** 全仓仅被 `docs/宣发执行流程-4周启动计划.md:39` 提到一次。 |
| 埋点 / 数据回流 | **Missing** | — | 全仓无 telemetry/analytics。`promo:report` 的 `demo.weeklyOpens` / `demo.exports`（`宣发流程-数据收集.mjs:56`）与总流程 §7 KPI「有效试用（导出过图）」只能人工填数。 |
| 品牌资产 | Implemented | `public/logo.png`、`public/logo.svg`、`public/qrcode-github.png`、`docs/品牌色板.md` | 二维码已由 `验证报告-2026-08-14.md:33-35` 从占位文本换成真图。但 `public/qrcode-github.png` 在应用里**未被任何组件引用**。 |

### 1.3 会员类（Membership-like）

| 面 | 状态 | 关键路径 | 代码事实 |
|----|------|----------|----------|
| 用户账号 / 注册 / 登录 | **Missing** | — | `rg '(?i)(login\|signin\|register\|account\|password\|jwt\|oauth\|会员\|订阅\|套餐)' src/` 命中项全是无关词（`fonts.ts` 的字体、`MapLayer.tsx` 的 `plan*`）。服务端无用户表、无 session、无 cookie。 |
| 服务端认证 | Partial（单一共享密钥） | `server/index.ts:106-134,402-408,463,486` | 唯一机制是 `WORKSPACE_API_TOKEN`：`hasApiToken()` 用 `timingSafeEqual` 比对 Bearer / `X-API-Key`。仅保护 `GET/PUT /api/workspace`；`/api/ai/*` 只在 `NODE_ENV=production` 且 `aiPublicAccess` 关闭时才要求。**全站一把钥匙，无法区分人。** |
| 协作房间角色 | **Implemented** | `server/collaboration.ts:9-10,189-200` | `CollaborationRole = owner \| editor \| viewer`；能力 `read \| write \| invite`；`authorize()` 判定：read 全通、write 排除 viewer、invite 仅 owner。 |
| 房间凭证 | Implemented | `server/collaboration.ts:97-109,231-240` | `accessToken` = 32 字节 base64url，服务端只存 SHA-256 hash，`timingSafeEqual` 比对；经 `X-Cengfan-Room-Token` 头传递。 |
| 邀请 | **Implemented** | `server/collaboration.ts:253-307`、`server/index.ts:571-590` | `POST /api/rooms/:id/invitations`（仅 owner），角色限 `editor\|viewer`，TTL 默认 24h（`index.ts:91`）；`join()` 命中后立即 `delete`（:287）→ **一次性凭证**。 |
| 房主治理 | Implemented | `server/collaboration.ts:441-456` | `setAccess(set-readonly \| close)`，且 `participant.id !== room.createdBy` 抛 `FORBIDDEN`（:447）。 |
| 成员生命周期 | Implemented | `server/collaboration.ts:410-439` + SSE `server/index.ts:753-813` | `refreshMember` / `leave`；`members` / `snapshot` / `closed` 三类 SSE 事件；事件流用一次性 ticket（TTL 60s，`index.ts:92,730-751`）而非把 accessToken 放进 URL。 |
| 用户身份 / 昵称 | **Missing** | `src/lib/app-constants.ts:11` | `COLLABORATION_DISPLAY_NAME = "本机协作者"` 是硬编码常量，`useCollaborationRoom.ts:249,294` 对 create/join 都传它 → **所有协作者显示同一个名字**。UI 只能退化成 `成员 ${clientId.slice(0,6)}`（`ProjectMenu.tsx:136`）。 |
| 房间持久化 | **Partial（内存态）** | `server/collaboration.ts:134-141` | `rooms = new Map()` 等全部进程内存；TTL 30 分钟（`index.ts:90`）、`maxRooms=100`、`maxSubscribers=50`。**进程重启即全部丢失**，不能承载任何跨会话的「成员关系」。 |
| 支付 / 套餐 / 结算 | **Missing（且被明令禁止）** | `docs/开源与收费边界.md:52`、`.gitignore:20-22` | `.local-commercial/`、`.local-billing/` 已被忽略。任何支付实现不得进本仓。 |

### 1.4 邻接能力（Adjacent）

| 面 | 状态 | 关键路径 | 代码事实 |
|----|------|----------|----------|
| 项目工作台 | Implemented | `src/components/ProjectWorkbench.tsx`(198 行) + `src/components/workbench/{ProjectGrid,WorkbenchHeader,ContinueEditingCard,ProjectCard}.tsx` | 新建/重命名/复制/删除/导入/导出/继续编辑；IndexedDB 经 `src/lib/project-store.ts`。 |
| 示例项目（自动播种） | Implemented | `ProjectWorkbench.tsx:69-71`、`project-store.ts:21,27-39` | 空库时自动 `store.put(createSampleProject())`，名为「示例：2026届毕业去向」。`seededRef` 只在成功后置位，失败下次重挂载会重试（:73-75 注释）。 |
| 示例数据资产 | **Partial（不可达）** | `docs/示例数据/毕业名单-脱敏.csv`(16.9 KB)、`docs/示例数据/示例项目.cengfan`(1.8 KB) | 两者都在 `docs/` 下，**不在 `public/`、未被任何组件引用**。用户在应用内无法一键加载，只能靠用户群发文件。这直接抵消总流程 §1.1 的「30 秒内看到能打开的效果」。 |
| XLSX 模板下载 | Implemented（**位置与文档不符**） | `src/components/DataWorkspace.tsx:245-248` | `XLSX.writeFile(workbook, "蹭饭图-学生数据导入模板.xlsx")` —— **前端生成**。`.agents/skills/cengfan-data-import/SKILL.md:12` 却说「模板由服务端生成，路径见 `src/server`」：既不是服务端，`src/server` 目录也不存在（实际是 `server/`）。 |
| 名单导入与表头识别 | Implemented | `src/lib/import-data.ts`(`parseDelimitedTable` / `parseStudentText`)、`src/lib/binary-import.ts`(xlsx)、`src/components/workspaces/DataUploadWorkspace.tsx`、`src/components/DataWorkspace.tsx:525`（识别摘要「代表数据」） | 有别名识别与代表数据回显。 |
| 导出 | Implemented | `src/components/workspaces/DeliveryWorkspace.tsx:110-121`、`src/lib/export-poster.ts`、`src/lib/usePosterExport.ts` | PNG（1/2/3×，可透明）、SVG、工程包；带「交付检查」警告面板与失败重试。 |
| 工程包 I/O | Implemented | `src/lib/project-package.ts`、`ProjectMenu.tsx:188-191` | `.cengfan` 导入导出。 |
| AI 助手 | **Implemented（最成熟）** | `server/ai/*`（13 个模块，**每个都有 `.test.ts`**）、`src/components/{AgentAssistant,StudioAssistantDrawer,StudioAssistantRail}.tsx`、`src/lib/agent-{session,risk,conversation-store}.ts`、`src/lib/ai-client.ts` | 4 条 AI 路由；带签名预算回执（`budget-receipt.ts`）、限流（`rate-limit.ts`）、本地兜底（`local-fallback.ts`）、可观测（`ai-observability.ts`）、补丁校验（`patch-validator.ts`）。 |
| 应用内反馈 | **Missing** | — | 见 §3.3 的重点矛盾。 |

---

## 2. 测试覆盖：已有 vs 缺失

### 已有（可直接作为 Round 3 的回归基线）

| 领域 | 测试文件 |
|------|----------|
| 协作服务端 | `server/collaboration.test.ts`、`server/index.test.ts` |
| 协作客户端 | `src/lib/collaboration-client.test.ts`、`src/lib/collaboration-operations.test.ts`、`src/lib/incremental-workspace-sync.test.ts` |
| 协作角色边界（UI 层） | `src/App.test.tsx:368` —「keeps edit actions disabled by viewer role through the shared commit boundary」 |
| 模板 | `src/lib/template-store.test.ts`、`src/lib/template-document.test.ts`、`src/lib/card-templates.test.ts` |
| 工作台与示例播种 | `src/components/ProjectWorkbench.test.tsx:37` —「seeds the sample project when the store is empty」 |
| XLSX 模板下载 | `src/components/DataWorkspace.test.tsx:95,98` |
| 导入导出 | `src/lib/{import-data,binary-import,project-package,export-poster}.test.ts` |
| AI | `server/ai/*.test.ts`（13 个）、`src/components/{AgentAssistant,StudioAssistantDrawer}.test.tsx` |
| 生产配置 | `server/production.test.ts` |

### 缺失（Round 3 若碰到这些面，需先补测试）

| 缺口 | 说明 |
|------|------|
| `scripts/宣发流程-*.mjs` **三个脚本零测试** | `scripts/` 下只有 `sync-china-{locations,universities,university-emblems}.test.ts`。`vite.config.ts:57` 的 `include` 已包含 `scripts/**/*.test.ts`，加测试无需改配置。 |
| `src/components/ProjectMenu.tsx` 无独立测试 | 196 行，承载协作全部 UI（邀请、只读、关闭、成员列表），只被 `App.test.tsx` 间接覆盖。 |
| `src/components/TemplatePicker.tsx` 无测试 | 模板面若要扩展（导入导出），当前无任何断言保护。 |
| `src/lib/useCollaborationRoom.ts` 无独立测试 | 436 行，是协作状态机核心，只有间接覆盖。 |
| `.github/workflows` 缺失 → 无 CI | 上述所有测试都不会在 PR 上自动跑。 |
| `src/App.tsx` 2466 行 | 违反 `AGENTS.md`「文件超过 400 行拆分」；任何新 UI 面接进 App 都会加剧。 |

---

## 3. Stub、死文档、「手册有但产品无钩子」

### 3.1 Stub / 半成品

1. **`promo:report` 开箱即失败且退出码为 0**（`scripts/宣发流程-数据收集.mjs:96-99`）。`docs/宣发数据/` 不存在；`--collect` 的注释自己写着「这里简化处理，实际应使用 readline 交互式输入」（:79）——即 collect 并不真的收集，只是把空模板写回磁盘。整条数据链是骨架。
2. **`demo.html` 不可构建、不可部署**（详见 §1.2）。
3. **房间纯内存**（`server/collaboration.ts:134`）：任何「成员/角色」在重启后归零，不能作为会员体系的地基。
4. **`legacyRoomIds` 兼容层**（`collaboration.ts:142,246-249,381,391`）与 `RoomStore` 上三个 `@deprecated` 重载（:497,504,507）：注释明说「HTTP routes never use it」，是纯遗留面。

### 3.2 死文档指引

| 位置 | 内容 | 事实 |
|------|------|------|
| `.agents/skills/cengfan-data-import/SKILL.md:12` | 「模板由服务端生成，路径与字段定义见 `src/server` 中的导入模块」 | 模板在 `src/components/DataWorkspace.tsx:245` 前端生成；`src/server` 目录不存在。 |
| `AGENTS.md`「结构与所有权」 | 反复写 `src/server/*` | 实际路径是 `server/*`（含 `server/ai/*`）。 |
| `scripts/宣发流程-素材检查.mjs:138` | 补齐建议「使用 `tools/brand-kit-generator`」 | `tools/` 目录不存在。 |
| `docs/宣发/国内互联网宣发总流程.md:7` | 「配套可视化：打开宣发总览 canvas（`china-promo-playbook.canvas.tsx`）」 | 全仓无此文件。 |
| `docs/宣发/good-first-issues.md:106` | 「创建完成后，把本文件里每条补上 GitHub 编号」 | 7 条候选**全部没有编号**，说明 Issue 尚未真正创建；而总流程 §5 Week 2 要求「标 5 个 good first issue」。 |

### 3.3 手册存在但产品无钩子（本轮最重要的发现）

**跨文档自相矛盾的「应用内反馈」：**

- `docs/宣发/反馈收集SOP.md:11` 谨慎写：班主任入口 =「用户群、腾讯问卷、应用内「反馈」**（若已做）**」——作者知道它没做。
- `docs/宣发/国内互联网宣发总流程.md:218` 却断言：「**入口统一**：用户群表单 / 开发者 Issue 模板 / **应用内「反馈」** 最终都归到 GitHub Issue 看板。」——当成既有入口。
- 代码事实：`rg 'https?://' src/**/*.tsx` **零匹配**，编辑器内不存在任何反馈入口。

同类「手册有、产品无」的还有：

| 手册主张 | 产品现状 |
|----------|----------|
| 总流程 §7 KPI：「Demo 周打开」「有效试用（导出过图）」 | 无埋点，`demo.weeklyOpens` / `demo.exports` 只能手填 |
| 总流程 §4：2026-10~11「模板市场雏形」 | 模板连导入导出都没有 |
| 总流程 §1.1 用户漏斗：「30 秒内看到能打开的效果 / 用户群领示例 CSV」 | 示例 CSV 在 `docs/`，应用内不可达 |
| 反馈 SOP §4 / §6：Discussions 周更与置顶帖 | 仓库无 Discussions 任何产物 |
| `docs/私域/案例投稿模板.md` + 总流程 §4「案例墙」 | 应用内无投稿、无案例展示 |
| 验证报告:48「`npm run check` 必须进 CI」 | 无 `.github/workflows` |

---

## 4. 缺口按「本仓可实现性」排序（严格排除支付）

**Tier A — 纯前端 / 纯脚本，无新架构，本仓即可完整交付**

1. **应用内反馈入口**：一个组件 + 一条常量 URL（`https://github.com/.../issues/new/choose`，README:21 已在用）。直接填掉 §3.3 的头号矛盾。
2. **示例名单/示例项目在应用内可达**：把 `docs/示例数据/毕业名单-脱敏.csv` 复制进 `public/`，在 `DataUploadWorkspace` 加「载入示例名单」。命中总流程 P0 漏斗。
3. **协作显示名可编辑**：把 `COLLABORATION_DISPLAY_NAME` 常量换成 localStorage 持久化昵称。这是「membership-like」里唯一便宜且真实的身份改进。
4. **宣发脚本退出码语义化 + 单测**：`promo:check` 有必需缺失时 exit 1；`promo:report` 无数据时 exit 1。`scripts/**/*.test.ts` 已在 vitest include 中。
5. **`ProjectMenu` / `TemplatePicker` / `useCollaborationRoom` 补测试**：无行为变更的纯保护性投入。

**Tier B — 需要设计但仍在本仓边界内**

6. **自定义模板导入 / 导出（`.json`）**：`template-store.ts:115-140` 的 `sanitizeCustomTemplateRecord` 已经是现成的、会剥离 `students` 的入站校验器，导入侧可直接复用。这是「社区模板」唯一能合规落在开源仓的部分（模板**文件格式**属开源仓，撮合与手续费按 `开源与收费边界.md:44` 不属本仓）。
7. **`.github/workflows/ci.yml`**：lint + vitest。注意 `AGENTS.md` 要求重操作走 `scripts/run-heavy.mjs`、禁止并行跑全套。
8. **修正死文档**：`AGENTS.md` 的 `src/server/*` → `server/*`；`cengfan-data-import/SKILL.md:12` 的模板生成位置；`宣发流程-素材检查.mjs:138` 的 `tools/brand-kit-generator`；总流程 §7 的 canvas 引用。
9. **`demo.html` 定性**：要么配成 Vite 多页入口/移入 `public/` 使其真能部署，要么删除。保留现状是最坏选项（见 §5）。

**Tier C — 大改造，Round 3 不宜**

10. 房间持久化（内存 → 文件/DB）。
11. 真实用户身份体系（注册/登录/跨会话成员关系）。
12. 埋点与 Demo 指标回流（涉及隐私政策与合规口径）。
13. 应用内案例投稿/案例墙（需要服务端存储 + 审核 + 脱敏保证）。

---

## 5. Round-3 候选：小、可测、用户可见

按「改动面积 × 可测性 × 用户可见性」筛出的 5 条，全部不触碰支付：

| # | 候选 | 改动面 | 可测断言 | 用户可见性 |
|---|------|--------|----------|-----------|
| R3-1 | **应用内「反馈 / 提意见」入口** | 新增 1 个小组件 + 常量；挂在 `StudioTopbar` 或 `WorkbenchHeader`（避免继续撑大 2466 行的 `App.tsx`） | 渲染断言 + `href` 指向 issue chooser + `target="_blank" rel="noopener"` | 高：编辑器里第一次出现「可以提意见」 |
| R3-2 | **「载入示例名单」按钮** | `public/` 加脱敏 CSV；`DataUploadWorkspace` 加一个按钮走既有 `parseDelimitedTable` | mock fetch → 断言学生数与字段映射；空态到有数据的状态迁移 | 高：新用户 30 秒看到效果 |
| R3-3 | **协作昵称可编辑** | 新增 `src/lib/collaboration-identity.ts`（纯函数：读取/校验/持久化/兜底）；`useCollaborationRoom` 与 `ProjectMenu` 接线 | 纯函数单测（空值、超长、非法字符、localStorage 不可用）+ 成员列表渲染出自定义名 | 中高：成员列表从「成员 a1b2c3」变成真名 |
| R3-4 | **自定义模板导出 / 导入 `.json`** | `TemplatePicker` 加两个按钮；导入复用 `sanitizeCustomTemplateRecord` | 往返测试（导出→导入→深相等）、拒绝含 `students` 的恶意文件、拒绝畸形 JSON | 中：模板可跨设备/跨人传递，为社区模板打地基 |
| R3-5 | **宣发脚本退出码 + 首个脚本测试** | `宣发流程-素材检查.mjs` / `-数据收集.mjs` 各改数行；新增 `scripts/宣发流程-素材检查.test.ts` | 缺必需项 → exit 1；全通过 → exit 0；`--report` 无数据 → exit 1 | 低（面向维护者），但让宣发脚本第一次可进 CI |

> 建议 Round 3 至少取 R3-1 + R3-2：这两条同时命中总流程 §0 的两个 P0 阻塞（「贡献入口残缺」「30 秒看到效果」），代码量最小，且互不冲突。

---

## 6. 风险：把 docs-only 的宣发当成产品特性

1. **`promo:check` 全绿是幻觉性信号。** 它只做 `existsSync`（`宣发流程-素材检查.mjs:102`），25/25 必需项通过只证明**文件在**，不证明产品有对应能力、内容未过期、或链接可达。任何人看到「✅ 检查通过」就认为社区/反馈闭环已就绪，都会判断错误。脚本末尾自己留了免责句（:143「发用户向内容前仍需确认：HTTPS Demo、用户群二维码」），但它排在总结之后，容易被略过。

2. **总流程 §6 与反馈 SOP §1 对「应用内反馈」的口径不一致。** 若 Round 3 按 §6「入口统一……最终都归到 GitHub Issue 看板」去做，会误以为只需**接线**（已有入口，只缺归集），实际是**从零新建**。范围估计会直接偏掉。

3. **「模板市场」有双重陷阱。** 一是产品侧零实现；二是它天然靠近 `docs/开源与收费边界.md:44` 的「手续费/撮合」红线。Round 3 若把它拆成任务，必须显式限定为「模板文件格式 + 导入导出」，任何上架、抽成、订单概念都不得进本仓（`.gitignore:20-22` 已预留 `.local-commercial/`、`.local-billing/`）。

4. **KPI 无数据源。** 总流程 §7 拿「Demo 周打开」「有效试用（导出过图）」当主指标，但仓库无任何埋点。把这些当作「产品已具备的度量能力」会导致复盘用手填数字自证，而 `promo:report` 生成的报告在外观上与真实数据无异。

5. **`demo.html` 会造成「Demo 已经有了」的错觉。** 它是一个像模像样的完整落地页，但 `npm run build` 不产出它、`server/index.ts` 不服务它。总流程 §0 把「没有可分享的 HTTPS Demo」列为 P0 阻塞——这条**至今成立**，而仓库里躺着的 `demo.html` 恰好会让人误判它已解决。

6. **`good-first-issues.md` 的 7 条候选没有 GitHub 编号**（该文件 :106 自己要求补编号）。这说明「开发者主 CTA 是具体 Issue」（`cengfan-promo/SKILL.md:13`）目前无法执行——投放文案要引用的 Issue URL 并不存在。把这份文档当作「已有 good first issue」会导致对外文案指向空链接。

7. **无 CI 放大以上所有风险。** 社区入口（Issue/PR 模板）已经就绪并在对外文案里被引用，但外部 PR 进来不会自动跑 lint 与 1200+ 测试。在鼓励贡献之前没有门禁，是社区侧最先会暴露的问题。

---

## 附：本报告用到的验证命令

```bash
rg -i '(login|register|account|password|jwt|oauth|会员|订阅|套餐)' src/    # 无有效命中
rg -i '(promo|宣发|小红书|掘金|v2ex|gitee)' src/                          # 零匹配
rg 'https?://' src/ -g '*.tsx'                                            # 零匹配
node scripts/宣发流程-素材检查.mjs        # 必需 25/25 通过，可选缺 6，exit 0
node scripts/宣发流程-数据收集.mjs --report  # 「未找到当前数据文件」，exit 0
ls .github/workflows                      # 不存在
ls docs/宣发数据                           # 不存在
git status --short                        # 空
```

未执行 `npm test` / `npm run lint`（本轮无代码改动，且 `AGENTS.md` 要求重操作经 `scripts/run-heavy.mjs`、勿并行跑全套校验）。
