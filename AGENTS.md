# 蹭饭地图工作室 — 仓库指南

面向毕业班去向地图编辑器:React + Vite 前端、内嵌 API(`server/`)、AI 助手(`server/ai`)。改动聚焦在拥有该行为的模块内。

## 结构与所有权

- `src/App.tsx` 编辑器画布、`src/components/ProjectWorkbench.tsx` 项目工作台、`src/components/*` 组件、`src/lib/*` 工具与 AI 客户端(含 IndexedDB 项目存储)、`src/data/*` 静态数据。
- `server/*` Node API(认证、协作、AI agent 循环、导入导出)。
- 前端视觉问题优先定位 `App.tsx` 与对应组件;数据流问题定位 `src/lib` 与 `server/`。

## 构建、测试与开发

- `npm run dev` 同时启动 Vite(5173)与 API(8787);`npm run dev:ai` 仅 API。
- `npm test` 全量 Vitest;`npm run lint` ESLint。重操作经 `scripts/run-heavy.mjs`,勿并行跑全套校验。
- 开发时可只跑目标测试:`npx vitest run <file>` 或 `npx vitest run -t "<pattern>"`。

## AI 能力与复杂任务

- 先读 [AI 底座计划与验收边界](docs/ai/FOUNDATION_PLAN.md)。使用 `npx tsx scripts/ai-capabilities.ts` 查询机器可读能力，追加 `--human` 供人类阅读；不要凭工具名猜测能力。
- `tool-registry.ts` 声明工具，`capability-catalog.ts` 提供发现与计划参数校验，`task-plan.ts` 校验依赖和回执；正式浏览器执行与确认仍归 `src/lib/agent-session.ts`。
- 新复杂规划默认关闭。Jev 只选择已就绪步骤，不得授予权限、改事实或调用目录外动作；密钥仅限服务端。所有生产调用经过 `createAgentLoopBackend`，不要直接调用旧的本地关键词函数。
- 工具返回成功、任务验证成功、预览已应用、工程已保存、文件已导出是不同状态；不得混用。失败、取消、预算耗尽和检查点失效不能描述为完整成功。
- 内存检查点绑定任务 ID，但还不是持久恢复或工程版本绑定。跨重启恢复、完整任务面板和自动重规划仍在后续阶段；不得把它们写成已完成。

## 编码与 UI 风格

- TypeScript + React。组件 `PascalCase`,变量/函数 `camelCase`,文件名 `kebab-case`。
- 地图与布局逻辑在 `src/lib` 纯函数中可测;`App.tsx` 只做组合。文件超过 400 行拆分。
- 保持既有交互状态与可访问性。

## 验证与交付纪律

- **验证纪律(failure → cause → fix → recheck):** 任何测试/类型/构建检查失败,先复现并给出根因假设,再最小修复,最后重跑同一检查;禁止仅重试而侥幸通过。完成报告记录四步证据链。
- **交付纪律:** 面向用户的改动合入前说明验收方式(PR/CI/手动验证);破坏性变更(数据、导出格式、API 形状)必须记录回滚方案。本地测试通过 + agent 口头完成不是交付证据。

## 导入导出规范

涉及学生数据导入/导出时,使用 `.agents/skills/cengfan-data-import/SKILL.md` 中的模板下载、表头智能识别与校验流程。

涉及国内宣发、投放文案、用户/开发者意见收集时,使用 `.agents/skills/cengfan-promo/SKILL.md`，总流程在 `docs/宣发/国内互联网宣发总流程.md`。

许可证为 AGPL-3.0-only。支付、套餐、模板手续费结算不得进入本仓库，见 `docs/开源与收费边界.md`。
