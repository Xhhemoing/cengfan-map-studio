# AI 任务板与共享场景契约

本页更新 [初始底座计划](FOUNDATION_PLAN.md) 的 P2 进展。2026-09-30：任务板基础版、场景值级契约和整体应用边界已进入 PR #66；不是 P2 全部完成，也不表示已合并或已上线。

## 用户如何操作

自建服务在启用 `AI_AGENT_PLANNING=1` 后，新任务会显示计划、依赖、工具执行进度、最终检查和未支持项。所有修改先进入影子工程。即使选择智能模式，依赖计划也必须点击“确认应用”；应用后仍需查看工程保存状态，实际 PNG/SVG 导出在交付界面进行。

依赖计划当前整体接受或整体放弃，不允许勾选后续修改而遗漏前置步骤。普通旧模式的独立工具仍保留原有选择性应用。取消、工具失败、检查失败或达到轮次上限不会成为已应用状态。网络重试沿用原有传输恢复；服务进程重启、检查点过期和修改原始需求仍需新建任务。

完成标记来自匹配的工具回执和最终布局检查，不是对每条自然语言约束的数学证明。工具回执成功不等于已保存。未配置真实模型、未连接 Node API 的静态站不能靠前端切换获得远程规划能力。

## 共享契约所有权

- `src/lib/agent-value-schema.ts`：有限 JSON Schema 子集、无类型强转/表达式执行的递归校验。
- `src/lib/agent-scene-schemas.ts`：七个场景域的属性、有限数值、枚举和嵌套对象格式。
- `src/lib/agent-scene-contract.ts`：从 schema 导出属性清单与统一验证器。
- `server/ai/patch-validator.ts`：兼容导出，同一个验证器同时用于服务器和浏览器。
- `src/lib/agent-task-progress.ts`：有界的展示投影，剔除调用参数，不作为独立授权凭证。

新增或调整场景属性必须同时修改 schema 和回归测试。`map.scale="banana"`、负尺寸、非整数列数、非法枚举、未知嵌套键和 `cards.positions` 等受保护字段均应拒绝。现有 UI 编辑器尚未全部由 schema 自动生成；学生事实、资源来源可信性和工程兼容仍由各领域模块负责，不能声称一个 schema 覆盖了全部业务约束。

## 验收

```bash
npx vitest run src/lib/agent-scene-contract.test.ts src/lib/agent-session.plan-policy.test.ts src/components/AgentAssistant.task-plan.test.tsx server/ai/planned-agent-progress.test.ts
npx tsx scripts/ai-capabilities.ts
npm run check
```

使用虚构工程，先选择智能模式，再请求“缩小地图、紧凑卡片、检查布局、导出 PNG”：应显示未自动导出；应用前原工程不变；计划的勾选框不可拆分；确认后才修改正式工程。任务板的前置步骤可用键盘展开，状态通过 live region 通知。

自动化供应商使用 mock。真实 Jev/LLM 兼容性、跨重启持久执行、动态结果引用、有限自动重规划、完整前后差异及真实供应商成本面板仍属于 #68。撤销与保存依旧使用现有工程机制。本页不把源码测试等同于真实浏览器/外部供应商验收。

## 回滚

关闭服务端 `AI_AGENT_PLANNING` 并重启，停止旧计划并新建对话。更严格的场景值级校验同时保护旧工具通道；项目文件格式和许可证未改变。新快照仅增加可选 `applicationPolicy`，不保存任务面板的原始参数或密钥；旧快照继续可读。
