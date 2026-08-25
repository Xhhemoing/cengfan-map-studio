MODEL: claude-fable-5-thinking-xhigh

# Cycle 2 · Round 1 — 文档漂移修复报告（Doc 项）

范围：只改文档，未提交/未推送，未触碰 README、CONTRIBUTING、宣发脚本、`src/`、支付相关内容。工作树中另有 `src/` 改动（D2/F2/H2/B2/P2 并行实现包），非本任务产生，未触碰。

## 修复清单与证据

### 1. AGENTS.md — `src/server` → `server/`（3 处）

- 第 3 行：`内嵌 API(\`src/server\`)` → `内嵌 API(\`server/\`)`
- 第 8 行：`\`src/server/*\` Node API` → `\`server/*\` Node API`
- 第 9 行：`数据流问题定位 \`src/lib\` 与 \`src/server\`` → `…与 \`server/\``

**证据**：`ls /workspace/src/server` 无此目录；`ls /workspace/server` 存在且包含 `index.ts`、`collaboration.ts`、`production.ts`、`ai/`（28 个文件，含 `agent-loop.ts`、`tool-registry.ts` 等）。

### 2. .agents/skills/cengfan-data-import/SKILL.md — 模板由前端生成，非 `src/server`（2 处）

- §1 模板下载：原文「模板由服务端生成,路径与字段定义见 `src/server` 中的导入模块」→ 改为「模板由前端本地生成,零网络:字段定义在 `src/lib/binary-import.ts` 的 `createImportTemplateSheets()`,下载入口在 `src/components/DataWorkspace.tsx`」。
- §2 表头智能识别：删去「(或 `src/server`)」，明确列映射在 `src/lib`（如 `binary-import.ts`）。

**证据**：`src/lib/binary-import.ts:24` 定义 `export function createImportTemplateSheets()`；`src/components/DataWorkspace.tsx:13,241-244` 导入并调用它，用 `XLSX.utils.book_append_sheet` 在浏览器端拼装「学生数据 / 填写说明」两个 sheet。服务端 `server/` 全目录 grep `template|xlsx` 无模板生成代码（`server/ai/llm-client.ts` 里的 `templateId` 是工程摘要字段，与 xlsx 模板无关）。CHANGELOG 0.1.0 也记载该功能为「本地生成、零网络」。

### 3. DEVELOPER.md — 协作 / AI 路径改为根级 `server/`（4 处）

- §三 项目结构图：`server/` 从 `src/` 树内移出，改列为仓库根目录条目（与 `scripts/`、`docs/`、`public/` 并列）。
- §四.4：`协作（src/server/collaboration.ts）` → `协作（server/collaboration.ts）`。
- §四.5：`AI 助手（src/server/ai/）` → `AI 助手（server/ai/）`。
- §六 扩展 AI 指令：`src/server/ai/whitelist.ts` → `server/ai/tool-registry.ts` 的 `AGENT_TOOLS`。

**证据**：`server/collaboration.ts`、`server/ai/` 均在仓库根目录（见第 1 条 ls 证据）。`whitelist.ts` 在全仓不存在；AI 指令白名单实际载体是 `server/ai/tool-registry.ts:22` 的 `export const AGENT_TOOLS: ToolDefinition[]`（`inspect_project`、`describe_capability`、`check_health` 等工具定义）。

### 4. function.md — React 19 + `/admin` 访问统计标注已移除（7 处）

- §8.1 技术栈表：`React 18` → `React 19`；同行「分发主应用/管理页」→「分发主应用/原型页」。
  - 证据：`package.json:36` `"react": "^19.2.8"`；`src/main.tsx:40` 的 pathname 分发仅剩 `/prototype`，全 `src/` grep `/admin` 零匹配。
- §8.1 存储行：后端 `.data/` 内容由「访问日志、工作区快照」改为「工作区快照、AI 运行状态」。
  - 证据：`server/index.ts:357` 写 `workspace.json`，`server/index.ts:1030` 写 `ai-runtime-state.json`；无任何 `visits.json` 写入代码。
- §8.1 页面行：`/admin` 独立管理后台描述改为「原 `/admin` 独立管理后台已移除」。
- §4 功能迁移映射表：`/admin` 行「新归属」改为「已移除」，理由更新。
- §8.4「管理后台」小节：标题标注（已移除），三条能力描述（`/admin` 页面、`/api/admin/visits`、`.data/visits.json`）合并为一条移除说明。
- §8.5 后端 API 表：删除 `GET /api/admin/visits` 一行。
- §8.7 边界：末条改为「访问统计功能已移除：主站与公开 API 均不提供访问统计」。

**证据（/admin 已删）**：`server/` 全目录大小写不敏感 grep `admin|visits|ADMIN` 零匹配；`server/index.ts` 路由分发（401-989 行）仅有 `/api/live`、`/api/ready`、`/api/health`、`/api/workspace`、`/api/rooms*`、`/api/ai/*`，无 admin 路由。

### 5. DEPLOY-SERVER.md — 删除 `GET /api/admin/visits` 文档（2 处）

- §二.3「管理后台(可选)」：整节（`ADMIN_USERNAME`/`ADMIN_PASSWORD` env 配置块 + `/admin` 页面 + `GET /api/admin/visits`）改为「管理后台(已移除)」一段说明：接口与页面已从代码库删除，服务端不再读取 `ADMIN_*`，历史 `admin.env` 可安全删除。
- §三 备份注释：`# 备份数据(房间/访问统计/工作区/回执)` → `# 备份数据(工作区快照/AI 回执状态;协作房间仅存内存,不落盘)`。

**证据**：同第 4 条——服务端零 admin/visits 代码、零 `ADMIN_*` 环境变量读取；`.data/` 实际只含 `workspace.json` 与 `ai-runtime-state.json`；协作房间为进程内内存（本文档 §四 与 function.md §8.4 均已如此描述）。

### 6. CHANGELOG.md — Unreleased 记录本次文档纠偏

- `## [Unreleased]` 下新增「### 修复」条目，概述上述五个文件的纠偏内容，标注「不涉及代码行为」。

## 验证

- `git status --short` 确认本任务只改动 6 个允许文件（另有并行任务的 `src/` 改动，未触碰）；FORBIDDEN 文件（README、CONTRIBUTING、宣发脚本、`src/`、支付）零改动。
- 修复后全仓 `*.md` grep `src/server`：仅剩 `.agent_workspace/` 历史审计文件（按规不改）。
- `function.md` grep `/admin|visits|React 18`：仅剩三处「已移除」标注文本，无存活功能描述。
- 未执行 commit/push（按任务要求）。

## 回滚方案

纯文档改动，`git checkout -- AGENTS.md CHANGELOG.md DEPLOY-SERVER.md DEVELOPER.md function.md .agents/skills/cengfan-data-import/SKILL.md` 即可整体还原，无数据/导出格式/API 形状影响。
