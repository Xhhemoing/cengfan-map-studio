MODEL: gpt-5.6-sol-xhigh-fast
# Round 1 探针报告（R1-G1）

探查日期：2026-08-24（UTC）  
范围：只读检查与命令探针；未实现产品功能，未提交、未推送，未添加支付。

## 1. `scripts/`、npm scripts 与 `promo:check`

### `scripts/` 清单

共 17 个文件：

1. `build.mjs`
2. `dev.mjs`
3. `perf-layout-bench.ts`
4. `process-emblems.py`
5. `run-heavy.mjs`
6. `run-heavy.sh`
7. `start.mjs`
8. `sync-china-locations.mjs`
9. `sync-china-locations.test.ts`
10. `sync-china-universities.mjs`
11. `sync-china-universities.test.ts`
12. `sync-china-university-emblems.mjs`
13. `sync-china-university-emblems.test.ts`
14. `verify-oprl-layout.ts`
15. `宣发流程-内容生成.mjs`
16. `宣发流程-数据收集.mjs`
17. `宣发流程-素材检查.mjs`

### npm scripts

`package.json` 共定义 18 个命令：

| 命令 | 实际脚本 |
|---|---|
| `dev` | `node scripts/dev.mjs` |
| `dev:web` | `vite` |
| `dev:ai` | `tsx server/index.ts` |
| `build` | `node scripts/build.mjs` |
| `start` | `node scripts/start.mjs` |
| `test` | `node scripts/run-heavy.mjs vitest run` |
| `test:watch` | `vitest` |
| `lint` | `node scripts/run-heavy.mjs eslint .` |
| `security:audit` | `node scripts/run-heavy.mjs npm audit --registry=https://registry.npmjs.org` |
| `perf:layout` | `tsx scripts/perf-layout-bench.ts` |
| `data:sync:china-locations` | `node scripts/sync-china-locations.mjs` |
| `data:sync:china-universities` | `node scripts/sync-china-universities.mjs` |
| `preview` | `npm run start` |
| `check` | `npm run lint && npm run security:audit` |
| `data:sync:china-university-emblems` | `node scripts/sync-china-university-emblems.mjs` |
| `promo:check` | `node scripts/宣发流程-素材检查.mjs` |
| `promo:content` | `node scripts/宣发流程-内容生成.mjs` |
| `promo:report` | `node scripts/宣发流程-数据收集.mjs --report` |

### `npm run promo:check`

- 命令：`npm run promo:check`
- 退出码：`0`
- 结果：25/25 项必需素材存在；6 项可选素材缺失。
- 缺失项：
  - `public/fonts/`
  - `docs/案例模板/普高文科-55人.md`
  - `docs/案例模板/职高-80人.md`
  - `docs/示例数据/毕业名单-脱敏.xlsx`
  - `public/qrcode-demo.png`
  - `public/qrcode-group.png`
- 该脚本只使用 Node 内置模块；虽然 `node_modules/` 不存在，仍可正常执行。
- 需注意：退出码 `0` 只表示“必需项齐全”。脚本把上述 6 项标为可选，因此不会因它们缺失而失败。
- 本次没有命令失败，故没有 failure→cause→fix→recheck 链；素材检查的缺项是成功输出中的告警，不是失败。

## 2. `server/index.ts` API 路由清单

### 运行状态

| 方法 | 路径 | 作用 |
|---|---|---|
| `GET` | `/api/live` | 存活探针 |
| `GET` | `/api/ready` | 配置、持久化、停机状态就绪探针 |
| `GET` | `/api/health` | AI provider/model/限额与持久化概况 |

### 认证与工作区

`server/index.ts` 没有 `/api/auth/login`、注册、刷新或退出路由。认证是端点级 token 校验：

- 接受 `Authorization: Bearer <token>` 或 `X-API-Key: <token>`。
- `GET /api/workspace`：读取服务端工作区快照；必须通过 `WORKSPACE_API_TOKEN`。
- `PUT /api/workspace`：原子写入工作区快照；必须通过 `WORKSPACE_API_TOKEN`。
- 未配置工作区 token 时，工作区 API 返回 `503 WORKSPACE_API_DISABLED`，而不是匿名开放。
- 生产环境中，当 `AI_PUBLIC_ACCESS` 未开启且配置了工作区 token 时，AI 的 `POST` 路由也要求该 token。

### 协作

| 方法 | 路径 | 作用 |
|---|---|---|
| `POST` | `/api/rooms` | 创建房间 |
| `GET` | `/api/rooms/:id` | 读取房间 |
| `POST` | `/api/rooms/:id/invitations` | 创建 editor/viewer 邀请 |
| `POST` | `/api/rooms/:id/join` | 使用邀请加入 |
| `POST` | `/api/rooms/:id/transactions` | 提交快照或增量操作 |
| `POST` | `/api/rooms/:id/members` | 成员心跳/刷新 |
| `POST` | `/api/rooms/:id/leave` | 离开房间 |
| `POST` | `/api/rooms/:id/access` | owner 设置只读或关闭 |
| `GET` | `/api/rooms/:id/operations?afterVersion=N` | 拉取增量操作 |
| `POST` | `/api/rooms/:id/events-ticket` | 签发一次性 SSE ticket |
| `GET` | `/api/rooms/:id/events?ticket=...` | SSE 房间事件流 |

除创建与邀请加入外，房间端点主要使用 `X-Cengfan-Room-Token`；SSE 使用短时、一次性 ticket。房间创建另有独立限流。

### AI

| 方法 | 路径 | 作用 |
|---|---|---|
| `POST` | `/api/ai/agent` | 多轮 agent/tool loop，带预算回执 |
| `POST` | `/api/ai/parse-data` | 解析学生数据 |
| `POST` | `/api/ai/propose-edits` | 生成编辑建议 |
| `POST` | `/api/ai/explain` | 单轮解释 |

所有 AI `POST` 端点有请求体上限、请求 ID、限流与统一错误结构；`agent` 和其他 AI 路由使用独立限流窗口。

### 导入/导出结论

- `server/index.ts` 中没有 `/api/import` 或 `/api/export`，也没有服务端 Excel/CSV、PNG/SVG、`.cengfan` 导入导出端点。
- 服务端最接近“导入/导出”的能力是 `GET/PUT /api/workspace`，它只持久化完整 `cengfan-workspace` v1 JSON 快照。
- README 所述 Excel/CSV 导入及 PNG/SVG/`.cengfan` 导出是前端能力，不应被描述成该文件中的服务端 API。

## 3. 测试与源码计数、关注领域覆盖

计数口径：递归统计 `src/`、`server/`、`scripts/` 下 `.ts/.tsx/.js/.jsx/.mjs/.cjs/.py/.sh`；`*.test.*` 或 `*.spec.*` 计为测试，其余计为源码。

| 目录 | 源码文件 | 测试文件 | 合计 |
|---|---:|---:|---:|
| `src/` | 159 | 143 | 302 |
| `server/` | 18 | 18 | 36 |
| `scripts/` | 14 | 3 | 17 |
| 总计 | **191** | **164** | **355** |

这是文件数，不是测试用例数或覆盖率百分比；本次未安装依赖，也未运行 Vitest。

领域覆盖：

- 宣发/promo：测试文件内容和文件名关键词命中 `0`。三个宣发脚本没有对应测试文件。
- 社区/用户群/开发者群/反馈流程：关键词命中 `0`；当前主要是 Markdown/SOP，没有自动化校验。
- 协作：关键词初筛命中 `9` 个测试文件。直接覆盖核心行为的至少有：
  - `server/collaboration.test.ts`：房间、角色、邀请、版本冲突、增量操作、订阅、容量与过期。
  - `server/index.test.ts`：房间 HTTP 路由、token、SSE、成员、只读/关闭、回填。
  - `src/lib/collaboration-client.test.ts`：客户端 API、重试、确认、事件。
  - `src/lib/collaboration-operations.test.ts`：diff/apply/rebase、冲突和原型污染防护。
- 邻接覆盖还出现在 `src/App.test.tsx`、`StudioAssistantRail.test.tsx`、`project-package.test.ts`、`server/styles.test.ts`；`StudioAssistantDrawer.integration.test.tsx` 只有协作状态/回调 fixture，不能视为独立协作行为测试。

## 4. 两个案例模板是否存在

- `docs/案例模板/普高文科-55人.md`：**不存在**。
- `docs/案例模板/职高-80人.md`：**不存在**。

`docs/案例模板/` 当前只有：

- `985-附属中学.md`
- `普通高中-68人.md`
- `国际部-12人.md`

因此 `docs/宣发/good-first-issues.md` 对这两个文件的缺失判断仍然准确。

## 5. Gitee 镜像文档与 README 对照

- `docs/宣发/Gitee镜像清单.md` 仍是“如何创建镜像”的操作清单，地址使用 `https://gitee.com/<用户名>/...` 占位符，没有登记真实镜像 URL。
- 该文档要求镜像建好后在 README 顶部增加 Gitee 徽章和国内克隆命令。
- `README.md` 目前只有一句“国内克隆若 GitHub 不稳定，见 Gitee 镜像清单”，没有 Gitee 徽章、真实 Gitee 地址或 Gitee clone 命令。
- `git remote -v` 只显示 GitHub `origin`，没有 `gitee` remote。
- 结论：仓库内没有可验证的已建 Gitee 镜像证据，README 尚未达到镜像清单描述的“双链”完成标准。此结论不等同于证明站外绝对不存在某个未登记镜像。

## 6. GitHub Discussions

- 文档确实多处提及 Discussions：
  - `DEVELOPER.md`
  - `docs/宣发/反馈收集SOP.md`
  - `docs/宣发/国内互联网宣发总流程.md`
- 总流程明确把“开启 GitHub Discussions，并置顶征求意见”列为未完成任务，也给出 `gh repo edit ... --enable-discussions`。
- 只读 GitHub API 探针返回：`"has_discussions": false`。
- 结论：**文档提到且计划使用 Discussions，但仓库当前确实未启用。**
- 同一次 API 探针显示 description 和 7 个 topics 已存在；`good-first-issues.md` 中“description/topics 为空”的候选项已经过时。

## 7. `.env.example` 支付/计费泄漏检查

- 未发现 `billing`、Stripe、支付宝、微信支付、payment、price、plan、subscription、支付、账单、套餐等支付/计费变量。
- 未发现硬编码密钥；API key/secret 项均为空。
- `AI_BUDGET_RECEIPT_SECRET` 是 AI agent 的 token/round 预算回执签名密钥，对应服务端防回放与预算连续性，不是产品收费或支付配置。
- `AI_API_KEY` 等上游模型密钥可能产生模型调用成本，但不构成仓库中的用户计费/支付功能。
- 结论：未见 billing leak，且没有新增支付。

## 8. `public/` 与 `demo.html`

### `public/`

实际文件汇总：

- `public/emblems/`：2,903 个 `.webp`，合计 42,753,648 bytes。
- `public/logo.png`：5,360 bytes。
- `public/logo.svg`：886 bytes。
- `public/qrcode-github.png`：623 bytes。

合计 2,906 个文件。`promo:check` 检查的是 `logo.png`，所以其 “Logo（PNG/SVG）” 项通过；缺失的 Demo/用户群二维码尚未出现。

### `demo.html`

页面宣称/展示的能力：

- Excel/CSV 导入、自动匹配省份、智能布局、PNG/SVG 导出。
- 校徽/字体/贴图与卡片模板。
- editor/viewer 邀请的协作编辑。
- AGPL-3.0 开源说明。
- 脱敏 CSV、`.cengfan`、两个案例文档下载。
- 开发启动、构建和启动命令。

实际页面性质：

- `script-tags=0`，没有 JavaScript，也没有嵌入编辑器；它是静态介绍/下载页，不是可操作产品 Demo。
- 除 `dist/` 外，检查到的仓库内相对链接均存在。
- `dist/` 当前不存在；页面已注明需要先 `npm run build`。因此这不是应提交的源文件缺口，但未经构建时“打开 dist/index.html”链接不可用。
- 页面没有 HTTPS Demo URL，也没有真实 Gitee 镜像 URL；唯一外部仓库链接是 GitHub。

## 9. 已执行命令与退出码

| 命令 | 退出码 | 关键输出 |
|---|---:|---|
| `pwd && ls -la && ls -la .agent_workspace && ls -la .agent_workspace/round1` | 0 | 仓库及报告目录存在 |
| `ls -la scripts && npm run` | 0 | 17 个脚本文件、18 个 npm scripts |
| `npm run promo:check` | 0 | 25/25 必需项，6 个可选缺项 |
| `test -d node_modules` 与 setup 状态检查 | 0 | `node_modules` 不存在；异步安装状态码为 0 |
| Node 递归源码/测试计数（含 `.py/.sh`） | 0 | 191 源码、164 测试 |
| Node 测试关键词分类 | 0 | promo 0、community 0、collab 初筛 9 |
| `test -e` 两个案例文件；`git remote -v` | 0 | 两文件均缺失；只有 GitHub origin |
| `gh api repos/Xhhemoing/cengfan-map-studio --jq ...` | 0 | Discussions=false；description/topics 已配置 |
| Node `demo.html` href/script 检查 | 0 | 无 script；`dist/` 缺失；其他相对链接存在 |
| Node `public/` 目录汇总 | 0 | 2,903 校徽 + 3 个顶层静态文件 |
| `git status --short --untracked-files=all`（写报告前） | 0 | 空输出，仓库工作树无改动 |

## 10. Easy wins 排名

以下排序优先考虑“脚本/文档已经明确期待、文件确实缺失、外部依赖少”：

1. **补 `docs/案例模板/普高文科-55人.md`**：素材检查和 good-first-issues 都已有明确文件名、参考结构与合规约束。
2. **补 `docs/案例模板/职高-80人.md`**：同上，任务边界清楚，且总流程 Week 7–8 明确要求补“普高文科、职高”案例。
3. **补 `docs/示例数据/毕业名单-脱敏.xlsx`**：素材检查已期待该路径，现有 CSV 可作为数据来源；仍需遵循导入模板与脱敏校验流程。
4. **补 `public/qrcode-demo.png`**：文件缺失，但必须先有稳定 HTTPS Demo URL，否则二维码会立即过期或指向无效入口。
5. **补 `public/qrcode-group.png`**：文件缺失，但依赖真实用户群及二维码更新策略。
6. **补 `public/fonts/`**：脚本期待但涉及中文字体授权，不能仅下载任意字体后提交，故不是优先的低风险 win。

与缺文件并列的重要配置/文档落差：

- 开启 GitHub Discussions：设置层面的直接缺口，当前 API 已证实关闭。
- Gitee 双链：应先建立并登记真实镜像，再按清单补 README 徽章和 clone 命令。
- 不应把生成目录 `dist/` 当作待提交 easy win；真正缺的是可分享的 HTTPS Demo 部署。
