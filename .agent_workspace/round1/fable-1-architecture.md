MODEL: claude-fable-5-thinking-xhigh

# Round 1 · R1-F1 架构/产品审计：社区 · 宣发 · 会员机制与非核心编辑器产品面

> 调研范围：`/workspace` 全仓。仅调研，不实现产品功能。所有结论均标注文件路径证据。
> 时间背景：2026-08 下旬（毕业季刚过的淡季 + 开学季蓄水期），主战场为 2027-03～07（见 `docs/宣发/国内互联网宣发总流程.md` §4）。

---

## 1. 现状地图（What exists today）

### 1.1 社区 / 反馈（Community & Feedback）

| 能力 | 状态 | 证据 |
|------|------|------|
| GitHub Issue 模板（Bug / 功能建议 / 使用意见三套 + 分流链接） | 已就绪，质量高：含身份下拉、场景下拉、脱敏警告 | `.github/ISSUE_TEMPLATE/bug.yml`、`feature.yml`、`feedback.yml`、`config.yml` |
| PR 模板（含「不提交真实名单 / 不提交支付」检查项） | 已就绪 | `.github/PULL_REQUEST_TEMPLATE.md` |
| 贡献指南（身份分流表；文档/模板/脱敏数据均算贡献；AGPL 授权声明） | 已就绪 | `CONTRIBUTING.md` |
| 反馈闭环 SOP（48h SLA、周五「意见→改动」、征求意见置顶帖模板、问卷字段） | 文档就绪，**执行依赖人工** | `docs/宣发/反馈收集SOP.md` |
| good first issue 候选清单（7 条，多为文档类，尚未建到 GitHub） | 文档就绪，未落地为真实 Issue | `docs/宣发/good-first-issues.md`（文末自述"创建完成后补编号"） |
| 私域运营手册（用户群/开发者群拆分、需求收集表、案例投稿、每周推送、毕业季 checklist） | 6 份文档全齐（`npm run promo:check` 全部列为必需项且存在） | `docs/私域/*.md`、`scripts/宣发流程-素材检查.mjs` |
| **应用内反馈入口** | **不存在**。SOP 中写"应用内『反馈』（若已做）"，代码中无任何反馈组件 | `docs/宣发/反馈收集SOP.md` §1；对 `src/components` 全量检索 `反馈|feedback` 无命中 |
| GitHub Discussions / 仓库 description / topics | 仓外运营动作，宣发总流程列为 P0 阻塞；2026-08-14 验证报告确认 description 仍为空 | `docs/宣发/国内互联网宣发总流程.md` §0/§8；`docs/宣发复盘/验证报告-2026-08-14.md` |

### 1.2 宣发（Promo）

| 能力 | 状态 | 证据 |
|------|------|------|
| 总流程（双漏斗、渠道矩阵、淡季 8 周计划、现实 KPI、合规条款） | 完整且已按 2026-08 淡季校准 | `docs/宣发/国内互联网宣发总流程.md` |
| 投放文案（开发者社区 V2EX/掘金；用户侧小红书/知乎/视频号，开学季口径） | 可直接复制，占位符待替换（`DEMO_URL`、Gitee 地址） | `docs/宣发/投放文案-开发者社区.md`、`投放文案-用户侧.md` |
| 宣发工具链（素材检查 / 内容生成 / 数据收集三个 npm 脚本） | 可运行；**数据收集为纯手工维护 JSON**，未接 GitHub API | `package.json`（`promo:check/content/report`）、`scripts/宣发流程-*.mjs`（`数据收集.mjs` 头注明"需手动维护或对接 API"） |
| agent 技能封装 | 就绪（触发词、硬规则、任务分发表） | `.agents/skills/cengfan-promo/SKILL.md` |
| 静态营销落地页 | 存在一个独立 `demo.html`（266 行纯静态页），**未接入构建或部署流程**，与 Vite 入口 `index.html` 无关联 | `/workspace/demo.html`、`index.html`、`scripts/build.mjs` |
| 可分享 HTTPS Demo | **不存在**（宣发总流程列为第一 P0 阻塞）。现网 `121.5.16.236:8787` 无 HTTPS、AI key 已耗尽，仅可内测 | `docs/宣发/国内互联网宣发总流程.md` §0、`DEPLOY-SERVER.md` |
| Gitee 镜像 | 文档就绪、镜像未建（清单中占位符 `<用户名>` 未替换） | `docs/宣发/Gitee镜像清单.md` |
| KOL / 脚本库 / 案例模板 | KOL 三件套齐；脚本库 3×3 齐；案例模板 3/5（普高文科、职高缺，已列为 good first issue） | `docs/KOL/`、`docs/脚本库/`、`docs/案例模板/`、`scripts/宣发流程-素材检查.mjs` |
| README 作为「打开即看到样例」的展示面 | 最近一次提交 `897a2a6` 已重做：成品图、示例文件表、3 分钟上手 | `README.md`、git log |

### 1.3 会员机制类（Membership-like，本仓定义 = 非付费角色）

| 能力 | 状态 | 证据 |
|------|------|------|
| 协作房间角色 `owner / editor / viewer` + 能力模型 `read / write / invite` | **已实现且带鉴权**：token 哈希比对（timingSafeEqual）、一次性邀请凭证（24h TTL）、只读切换、关闭房间、成员进出与 lastSeenAt | `server/collaboration.ts`（`CollaborationRole`、`authorize`、`createInvitation`、`setAccess`）；客户端 `src/lib/collaboration-client.ts`、`src/lib/useCollaborationRoom.ts` |
| 参与者显示名 | 有 `displayName` 字段，但前端使用常量 `COLLABORATION_DISPLAY_NAME`，用户不可自定义 | `src/lib/app-constants.ts`、`useCollaborationRoom.ts` 头注 |
| 本地偏好（皮肤 atelier/classic） | 已实现，localStorage 键 `cengfan-map-studio:ui-skin`，是「个人偏好不入项目数据」的既有范式 | `src/lib/theme.ts`、`src/components/SkinSelector.tsx`；`PRODUCT.md`（"Interface skin choice is a per-user preference"） |
| 账号系统 / 身份提供方 | **明确不存在**，且产品文档禁止在实现前宣称账号级身份 | `PRODUCT.md`（"No separate account system… must not claim account-level identity until it is implemented"） |
| 贡献者激励（Tier 1/2/3、核心贡献者角色、证书） | **纯运营口径，无任何代码**；开发者群手册明言"不要发空头证书 PDF 除非真的做了文件" | `docs/私域/用户群运营手册.md` §四、`docs/私域/开发者群运营手册.md` |
| 付费会员 / 套餐 / SKU | **零痕迹**（正确状态）。全仓无支付 SDK、无商户号、无套餐代码 | 政策见 `docs/开源与收费边界.md` §4 |

### 1.4 模板（Templates）

| 能力 | 状态 | 证据 |
|------|------|------|
| 内置地图模板（original/cartoon/grain/q/scenery/regional 六个 id） | 已实现 | `src/lib/template-store.ts`（`MAP_TEMPLATE_IDS`） |
| 自定义模板（视觉/布局两种 scope，最多 20 个，localStorage 持久化） | 已实现；保存时递归剥离 `students` 字段（`stripStudentData`）——**隐私处理已内建** | `src/lib/template-store.ts`、`src/lib/template-document.ts` |
| 卡片模板 | 已实现，贡献路径写在开发者指南 | `src/lib/card-templates.ts`、`DEVELOPER.md` §六 |
| 模板随工程包/工作区保存 | 已实现（工程包 v2 可含自定义模板） | `src/lib/project-package.ts`、`function.md` §8.3 |
| **模板作为独立文件的导入/导出（社区交换格式）** | **不存在**。模板只能藏在工程包里传播，没有独立序列化、作者署名元数据、导入校验 | `src/lib/template-store.ts` 通篇无独立文件序列化；`docs/开源与收费边界.md` §3 明确"开源仓可以有：模板文件格式、内置/示例模板、贡献模板的文档" |
| 「模板市场雏形」 | 宣发日历将其列为 2026-10～11 的产品配套目标，尚无任何实现 | `docs/宣发/国内互联网宣发总流程.md` §4 |

### 1.5 协作（Collaboration）

- 服务端：内存房间存储，100 房上限 / 50 订阅 / 30min TTL / 256 条操作历史；快照 + 路径级增量操作 + 无重叠自动 rebase + 同路径 409 冲突（`server/collaboration.ts`、`server/index.ts` 常量区）。
- 客户端：SSE 订阅（一次性 events-ticket）、断线 backfill、成员/只读/关闭事件（`src/lib/collaboration-client.ts`、`useCollaborationRoom.ts`、`collaboration-operations.ts`）。
- 边界：进程内内存，重启即失；无持久化、无跨实例（`DEPLOY-SERVER.md` §四、`function.md` §8.7）。宣发日历把「稳定 Demo、协作房间」放到 2027-05～07 毕业季才要求。

### 1.6 Demo / 对外可见面

- 仓库内：README 样例展示 + 内置示例项目 + 脱敏 CSV + `.cengfan` 示例包（`README.md`、`docs/示例数据/`）。
- 仓库外：无 HTTPS Demo（P0 阻塞）；生产服务器裸 8787（`DEPLOY-SERVER.md`）。
- `demo.html`：一个游离的静态落地页，未被 `scripts/build.mjs` 或任何部署流程引用，定位不明。

### 1.7 其他非核心编辑器产品面 + 文档漂移（审计发现）

- **AI agent 平台**：完整的服务端子系统（限流、预算回执、观测、状态持久化，`server/ai/` 28 个文件），是本仓最重的非编辑器资产。
- **数据同步脚本**：省市/高校/校徽同步（`scripts/sync-china-*.mjs`）。
- **健康探针**：`/api/live`、`/api/ready`、`/api/health`（`server/index.ts:426-439`）。
- **⚠ 文档漂移 1（已用 git 证实）**：`function.md` §8.4/§8.5 与 `DEPLOY-SERVER.md` §三.3 仍记载 `/admin` 访问统计后台与 `GET /api/admin/visits`，但该功能已在提交 `95af5c0`（"refactor: remove admin visits panel and its server endpoints"）中整体移除，当前 `server/index.ts` 检索 `admin|visits` 零命中。
- **⚠ 文档漂移 2**：`AGENTS.md` 与 `.agents/skills/cengfan-data-import/SKILL.md` 均写 `src/server/*`，实际服务端目录是根级 `server/*`。
- **⚠ 文档漂移 3**：`function.md` §8.1 写 "React 18"，`package.json` 实为 React 19（`DEVELOPER.md` 口径正确）。
- **⚠ 游离产物**：仓库根目录的 `蹭饭图-学生数据导入模板.xlsx`（17.8KB 二进制）与 `graphify-out/`、`.hermes.md`、`frontUI2.md` 归属不清。

---

## 2. 仓内 vs 仓外边界（What MUST stay out）

依据 `docs/开源与收费边界.md`（本仓唯一权威政策）：

### 永远不进本仓（§4 强制条款）

- 支付、套餐、订单、兑换码、**模板手续费结算**的任何实现代码。
- 微信支付 / 支付宝 SDK、商户号、密钥（连 `.env.example` 都不许写占位）。
- 触发词审查义务：发现 `微信支付`、`预支付`、`sku`、`套餐价格` 等实现进 PR，直接拒绝并指向该文档（PR 模板已有对应检查项）。
- 业务边界：学校统付、年级打包授权、印刷厂业务、把导出按钮做成付费锁（§2 表格"不做"列）。

### 允许且鼓励进本仓（§3 + 本审计推导）

- **模板文件格式、内置/示例模板、贡献模板的文档**（§3 原文明示）——这是"社区模板"在开源侧的全部合法形态。
- 模板元数据中的**作者署名 / 许可声明字段**：属于格式而非结算，可为未来仓外商业层留接口，但仓内不得出现价格、结算、上架状态等字段。
- 非付费角色：协作房间角色（已有）、贡献者致谢（README/Changelog）、本地偏好。
- 政策文档本身、宣发文档、私域手册、AGPL 合规文案。

### 灰区判定（本审计给出的操作性结论）

| 事项 | 判定 | 理由 |
|------|------|------|
| 模板元数据含 `author` / `license` 字段 | 仓内可做 | 是格式定义，不涉结算 |
| 模板元数据含 `price` / `sku` / `listed` 字段 | **仓外** | 直接踩 §4 触发词 |
| 「贡献者证书」海报模板（用编辑器自产 SVG/PNG） | 仓内可做 | 是内容模板 + 运营承诺兑现（开发者群手册要求"真的做了文件"才发） |
| 访问统计重建 | 谨慎，默认不做 | 已被 `95af5c0` 主动移除；重建需先补隐私论证 |
| 应用内反馈入口若**收集并上传**数据 | 仓外或需重新设计 | 名单默认本地是 README 对外承诺；跳转式（打开 GitHub Issue / 问卷 URL）则仓内安全 |

---

## 3. 机会清单（P0 / P1 / P2）

> 效率描述用技术侵入度（涉及哪些模块、是否动数据格式/API），不用日历时间。

### P0 —— 直接解除宣发漏斗阻塞（8 月淡季的"产品必须完成"项）

**P0-1 静态 Demo 构建模式（API 缺失时优雅降级）**
- 用户任务：班主任/班委点开一个 HTTPS 链接，30 秒内看到能编辑、能导出的示例图（用户漏斗第一跳，`docs/宣发/国内互联网宣发总流程.md` §1.1）。
- 为什么是现在：宣发总流程 §0 把"没有可分享的 HTTPS Demo"列为第一 P0 阻塞，且明示替代路径"临时用 Cloudflare Pages 静态预览"；淡季 Week 5-6 规则是"Demo 仍不可分享则停止加用户投放"。
- 技术侵入度：中低。核心是让纯静态托管（GitHub Pages / Cloudflare Pages）下应用可用——协作（`useCollaborationRoom.ts`）与 AI（`src/lib/ai-client.ts`）在 `/api/health` 不可达时隐藏入口而非报错；构建脚本（`scripts/build.mjs`）增加一个静态目标或环境开关；示例项目已内置（README 证实首次打开自动生成），无需新数据。不动 `ProjectDocument`、不动 API 形状。
- 风险：需回归验证降级路径不影响 `npm run dev` 全功能形态；导出链路已被 2026-08-14 验证报告证实真实可用。
- AGPL/隐私：正向。纯静态 = 名单 100% 留在浏览器，与 README 隐私承诺一致；部署未修改版本无 AGPL 附加义务。

**P0-2 应用内「反馈」入口（跳转式，零数据收集）**
- 用户任务：用户在卡住的那一刻能一键到达正确反馈入口（Issue 模板 / 用户问卷），并自动带上系统/浏览器/运行方式等 Issue 模板必填项。
- 为什么是现在：反馈 SOP 的入口设计已经预留了"应用内『反馈』（若已做）"（`docs/宣发/反馈收集SOP.md` §1）；淡季 KPI 考核"有回复的意见"数量而非 Star；三套 Issue 模板已就绪只缺流量入口。
- 技术侵入度：低。一个入口组件（挂 `StudioTopbar.tsx` 或 `ProjectMenu.tsx`）+ 拼 GitHub Issue 预填 URL（`labels`、`template`、body 参数）+ 用户/开发者分流（复用 `CONTRIBUTING.md` 分流表逻辑）。零后端、零存储。
- 风险：极低。唯一注意点是预填信息只含环境元数据，绝不含项目数据。
- AGPL/隐私：无影响（不上传任何内容，用户在 GitHub 页面自行提交）。

**P0-3 文档漂移修复（function.md / AGENTS.md / DEPLOY-SERVER.md 对齐代码）**
- 用户任务：开发者漏斗第二跳是"5 分钟跑起来"，过时文档（不存在的 `/admin`、错误的 `src/server` 路径、React 18）会在 V2EX/掘金冷启动（Week 2 计划）时直接消耗信任。
- 技术侵入度：纯文档。修 `function.md` §8.1/§8.4/§8.5、`AGENTS.md` 结构段、`.agents/skills/cengfan-data-import/SKILL.md`、`DEPLOY-SERVER.md` §三.3；顺手处置游离的 `demo.html` 定位（要么纳入静态 Demo 方案，要么标注废弃）。
- 风险：无。AGPL/隐私：无。

### P1 —— 开学季与 10-11 月模板征集的产品配套

**P1-1 模板独立导入/导出（`.cengfan-template` 交换格式）**
- 用户任务：班委 A 做的"卡通开学墙"样式，班委 B 一个文件导入即用——这是"社区模板"在不碰结算前提下的最小可行形态，也是 10-11 月"模板征集 / 模板市场雏形"（宣发日历 §4）的前置能力。
- 技术侵入度：中。`src/lib/template-document.ts` 已有 `TemplateDocument` 模型与 `mergeTemplateDocuments`；`template-store.ts` 已有校验（`isTemplateDocument`）与学生数据剥离（`stripStudentData`）。需新增：独立文件序列化/反序列化（对齐 `project-package.ts` 的版本化模式）、导入时格式与配额（20 个上限）校验、`TemplatePicker.tsx` / `ProjectMenu.tsx` 的导入导出入口、元数据字段（`author` 昵称、可选 `license`——不含任何价格字段）。
- 风险：中。新增一种对外文件格式属于破坏性变更类别，按 `AGENTS.md` 交付纪律需记录版本号与回滚方案（格式加 `version` 字段 + 拒绝未知版本即可控）。
- AGPL/隐私：模板与程序同走 AGPL（`docs/开源与收费边界.md` §3）；导出前强制走 `stripStudentData` 且需回归测试证明无名单泄漏。**边界纪律：格式里永远不出现价格/结算字段。**

**P1-2 协作参与者身份体验（自定义显示名 + 角色可视化）**
- 用户任务：受邀班委进房间后知道"我是谁、我是什么角色、房里还有谁"——这就是本仓语境下"会员机制"的正确形态。
- 为什么是现在：`PRODUCT.md` 明确要求"explicit participant roles so invited collaborators can access the same project appropriately"，且"Role and synchronization status must not be communicated by color alone"（无障碍要求）；服务端角色/成员/lastSeenAt 数据已全部就位（`server/collaboration.ts`），纯粹是前端没消费完。
- 技术侵入度：中低。前端为主：把 `COLLABORATION_DISPLAY_NAME` 常量（`src/lib/app-constants.ts`）改为本地偏好（复用 `theme.ts` 的 localStorage 模式）；成员列表 UI 消费 `useCollaborationRoom.ts` 已返回的 `roomMembers` / `roomRole` / `roomParticipants`；角色徽标用文字+图形双通道。服务端 API 无需改动。
- 风险：低。注意不得宣称账号身份（`PRODUCT.md` 明令），显示名只是房间内昵称。
- AGPL/隐私：昵称留在本地偏好与房间内存态（30min TTL 自动消失），无持久化风险。

**P1-3 示例包一键打开 + 新手引导入口**
- 用户任务：从小红书"评论扣 1"拿到示例包的用户，打开产品即被引到示例项目与五阶段路径（宣发日历 2026-09 行明确要求"示例包一键打开、新手引导"）。
- 技术侵入度：低到中。工作台已自动生成示例项目（`README.md`）；缺的是 URL 直达（如 `?open=sample`，`src/lib/app-initialization.tsx` / `local-workspace-entry.ts`）与 `WorkflowGuide.tsx` 的首访引导态。
- 风险：低。AGPL/隐私：无。

**P1-4 `promo:report` 对接 GitHub API 自动抓取**
- 用户任务：维护者周日复盘（宣发日历"日常节奏"）不再手填 Star/Issue/PR 数。
- 技术侵入度：低。`scripts/宣发流程-数据收集.mjs` 头注已自述"需手动维护或对接 API"；数据结构 `github: { star, fork, issue, pr, discussion }` 已定义好，加一个 fetch GitHub REST（匿名限流即够）填充即可。小红书等平台数据保持手填。
- 风险：低（脚本类，不进应用运行时）。AGPL/隐私：无。

### P2 —— 蓄水期之后再议

- **P2-1 贡献者证书海报模板**：用编辑器自身能力做一个"贡献者证书"内容模板（兑现 `docs/私域/开发者群运营手册.md`"真的做了文件"与宣发日历 2027-05"贡献者证书"）。侵入度低（一个内置模板 + 文档），但在有 ≥3 名外部贡献者（8 周 KPI 目标）之前是空转。
- **P2-2 案例墙静态页**：脱敏案例集合的展示页（配合 2027-05 "案例墙"）。依赖真实案例积累（当前为 0，见验证报告"无真实案例"），先靠 `docs/私域/案例投稿模板.md` 收料。
- **P2-3 协作房间持久化**：内存态是宣发文案里主动坦白的取舍（掘金沸点原文"协作房间目前是内存 30 分钟过期——这个取舍你们怎么看？"）——正确姿势是先拿它收意见，2027 毕业季前再决定是否做 `.data/` 落盘。侵入度高（动 `server/collaboration.ts` 存储层 + 生命周期语义）。
- **P2-4 访问统计重建**：默认**不做**。`95af5c0` 已整体移除；若 Demo 上线后确需打开量数据，优先用托管平台自带统计（Cloudflare/Pages Analytics），不往仓里加采集代码。
- **P2-5 Gitee 镜像与仓库元数据**：高价值但属仓外运营动作（`gh repo edit`、Gitee 建仓），仓内只剩"README 补 Gitee 徽章"这个已登记的 good first issue（`docs/宣发/good-first-issues.md` §6），留给外部贡献者。

---

## 4. 明确拒绝的付费会员实现 + 开源替代

### 4.1 拒绝清单（提案即拒，指向 `docs/开源与收费边界.md`）

| 拒绝项 | 拒绝理由 |
|--------|----------|
| 付费会员等级（Pro/VIP）、订阅、席位授权 | §4：套餐/订单不准出现在本仓；且 AGPL 禁止用许可费限制用户按协议使用程序（§3 括注） |
| 导出加水印、去水印付费；导出按钮付费锁 | §2 表格明令"不做：把导出按钮做成开源仓里的付费锁" |
| 模板付费上架、手续费结算、抽成逻辑 | §3：手续费是"以后的本地商业层"，是资源与撮合，永不进本仓 |
| 兑换码 / 邀请码换权益 | §4 触发词类别；且会污染现有一次性邀请凭证（`server/collaboration.ts` 的 invitation 是访问控制，不是权益发放） |
| AI 额度按套餐售卖的仓内实现 | §2 只允许"以后：云端便利、AI 额度等班费/个人付"在**仓外**做；仓内已有的预算/限流（`server/ai/budget-receipt.ts`、`rate-limit.ts`）是资源保护，不得改造成计费 |
| 学校统付 / 年级打包 / 印刷套餐 | §2 业务边界 |

### 4.2 开源替代（每一项拒绝都有仓内合法对应物）

| 付费会员想满足的诉求 | 开源替代 | 依托 |
|----------------------|----------|------|
| 身份与地位感 | 房间角色 owner/editor/viewer（已有）+ P1-2 的角色可视化与自定义昵称 | `server/collaboration.ts` |
| 被认可 | README/Changelog 点名致谢（文档/模板贡献与代码同权）+ P2-1 贡献者证书海报模板（真文件，非空头 PDF） | `CONTRIBUTING.md`、`docs/宣发/反馈收集SOP.md` §4、`docs/私域/开发者群运营手册.md` |
| 个性化专属感 | 本地偏好范式（皮肤已示范；显示名可跟进），偏好永不入项目数据 | `src/lib/theme.ts`、`PRODUCT.md` |
| 高级模板获取 | 社区模板交换格式（P1-1）+ 内置/示例模板全免费；未来手续费只发生在仓外撮合层，格式仓内保持中立 | `docs/开源与收费边界.md` §3 |
| 优先支持 | 运营承诺而非代码：48h SLA、种子用户 Tier 运营 | `docs/宣发/反馈收集SOP.md` §3、`docs/私域/用户群运营手册.md` §四 |

---

## 5. Round 3 推荐落地项（3–5 个，均不触边界）

按"解除宣发阻塞 > 开学季配套 > 模板季铺垫"排序：

1. **静态 Demo 模式 + API 缺失优雅降级**（P0-1）。验收：纯静态托管下打开示例项目→编辑→导出 PNG 全链路可用，协作/AI 入口隐藏且无控制台报错；`npm run dev` 全功能形态回归通过。
2. **应用内反馈入口（跳转式）**（P0-2）。验收：从编辑器一键到达对应 Issue 模板且环境字段预填正确；grep 证明无任何项目数据进入 URL。
3. **模板独立导入/导出**（P1-1）。验收：导出文件经 `stripStudentData` 回归测试证明零名单泄漏；带版本号可拒绝未知版本；格式定义中不存在任何价格/结算字段（可加 lint 级检查）；记录格式版本与回滚方案（交付纪律要求）。
4. **协作参与者显示名 + 角色可视化**（P1-2）。验收：角色以文字+图形双通道展示（无障碍条款）；服务端 API 零改动；不宣称账号身份。
5. **文档漂移修复 + promo:report GitHub 自动抓取**（P0-3 + P1-4，合并为一个轻量项）。验收：`function.md`/`AGENTS.md`/`DEPLOY-SERVER.md` 与代码一致；`npm run promo:report` 能自动填充 GitHub 区块。

落地纪律（全部继承自 `AGENTS.md`）：每项先写失败回归再实现；`npx vitest run <目标文件>` + `npm run lint`；破坏性变更（P1-1 的新文件格式）必须记录回滚方案；完成报告带 failure→cause→fix→recheck 证据链。

---

## 6. 开放问题 / 未知项

1. **Demo 托管的最终形态**：静态优先（Cloudflare Pages，零后端）还是给现网加 Caddy + 备案域名？两者宣发总流程 §0 都点名了。备案状态、域名归属是仓外事实，本仓只能把"静态可用"做出来兜底。微信内跳转要求备案域名（§3 平台细则），这决定用户侧主 CTA 何时能从"评论扣 1"升级为直链。
2. **`/admin` 移除后的运营数据缺口**：KPI 表要求"可分享 Demo 打开次数/周"（§7），当前无任何采集手段。用托管平台统计能否满足？是否接受"淡季 KPI 该项记为无数据"？需要维护者决策，不建议仓内重建采集。
3. **模板交换格式的元数据范围**：`author` 昵称之外，是否要 `sourceUrl`/`license` 字段？署名与 AGPL 衍生关系（模板是数据还是程序衍生物）值得在格式设计时写一段政策注释，避免未来仓外商业层解释权模糊。
4. **`demo.html` 的归属**：营销页草稿？静态 Demo 的壳？当前无引用。Round 3 若做 P0-1，应决定纳入或删除。
5. **游离产物清理权限**：根目录 `蹭饭图-学生数据导入模板.xlsx`、`graphify-out/`、`frontUI2.md`、`.hermes.md` 是否可归档/移动？涉及其他工作流的引用（data-import skill 提到模板下载"由服务端生成"，但 `server/` 中未见 xlsx 模板生成模块——该 skill 描述与代码的对应关系本身待核实）。
6. **协作房间与 Demo 的关系**：静态 Demo 必然无协作；宣发文案（V2EX 第 3 问）已把"静态 Demo 最低保留哪些功能"作为征求意见项——建议 Round 3 实现时保持功能开关粒度与该问题一致，方便用真实反馈校准。
7. **预存在的测试失败**：2026-08-14 验证报告记录 4 个预存在失败（`map-content-bounds` ×3、`App.test` ×1）；当前是否已修复未验证（本轮为只读调研未跑全量测试）。Round 3 动工前应先跑一次基线，避免把旧失败误归因于新改动。
