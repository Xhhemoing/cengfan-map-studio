# AI 底座：人能审阅，模型能理解，代码能验证

审查日期：2026-09-30。基线：`0f636bd939c9041f7fa6137c78dc06e25dc8eb7d`。跟踪：[#65](https://github.com/Xhhemoing/cengfan-map-studio/issues/65)。本轮是默认关闭的实验性 P0/P1，不是完整自动驾驶或已上线声明。

## 结论与保留项

不要重写 React/Vite 编辑器，也不要让模型控制 DOM 或直接写正式工程。保留 `AgentSession` 的影子工程、风险分级、选择性落地事务、撤销、取消和签名预算回执。新增能力目录、受限依赖计划、成功回执推进以及最终健康检查。LLM 负责理解和拆解，代码拥有工具白名单与状态推进权；Jev 只可选择已经就绪的步骤，置信度不能授予权限。

审查发现：原有多步能力主要依赖 system prompt；`runLocalAgentTurn` 把任意 tool 消息当作完成依据；能力定义在浏览器与服务端存在重复。此次在生产路由的所有本地兜底出口增加证据检查，避免失败后再次猜测关键词写入。旧函数本身保留兼容，新调用方必须经过 `createAgentLoopBackend`。

## 分阶段计划与验收

| 阶段 | 实施项 | 验收与边界 |
| --- | --- | --- |
| P0，本轮 | 从工具注册生成版本化能力目录、字段白名单、风险/执行说明；JSON 与人类文本查询入口 | 目录与注册同源，明确没有导出/发布/发送/代码执行工具；不是完整值级 JSON Schema |
| P1，本轮 | 至多 12 步的类型化 DAG；拒绝环、未知依赖、无序写入、未知工具和受保护字段；先读工程再规划 | 自动化覆盖成功/失败/缺失回执；一次只执行一个计划步骤；所有写步骤明确排序 |
| P1，本轮 | 主/备 LLM 规划；可选 Jev 就绪选择；内存检查点、取消、预算和最终健康检查 | 模型失败不接第二套写入器；Jev 超时/错误/低置信度确定性回退；计划失效不盲目重放 |
| P2，未完成 | 人类任务板：原始需求、子任务、进度、阻塞、前后差异、成本、确认、重试与撤销 | 对齐 #54/#55/#56；键盘与屏幕阅读器可操作；显示“预览/已应用/已保存/已导出”的不同状态 |
| P2，未完成 | 浏览器和服务端共享完整命令/值级 schema；持久检查点、工程版本绑定、幂等恢复 | 刷新/断网/重启可恢复；并发编辑冲突不能覆盖；目前不承诺这些能力 |
| P3，未完成 | 合成场景评测、真实供应商兼容测试、小流量启用与回滚演练 | 任务完成率、事实误改率、错误完成率、恢复率、P95 延迟和成本均用实测，不引用厂商宣传代替结果 |

## 实际执行链

`用户指令 → inspect_project(画布/地图/卡片) → LLM submit_task_plan → 代码校验 DAG/工具/参数 → 就绪步骤选择 → 原有浏览器影子工具 → 匹配成功回执 → 下一步 → check_health → 人工检查并应用`

执行完成不是保存成功。`check_health` 的 `ok:true` 仅表示检查工具运行；还必须 `issues=[]` 且 `issueCount` 为 0（或未提供）才返回验证成功。现有布局有问题时，新模式会停止并要求局部修复，不假装已经修好，也暂不自动重规划。

V1 参数是固定 JSON，不支持变量、插值或动态引用上一工具的结果。缺少事实、对象 ID 或素材的子任务应进入 `unsupported`，交回人类。模型把所有用户要求正确拆出的能力仍需评测，DAG 通过不代表意图理解必然正确。

## 人与 AI 的维护入口

```bash
npx tsx scripts/ai-capabilities.ts             # 机器可读 JSON，无网络、无密钥
npx tsx scripts/ai-capabilities.ts --human     # 人类可读能力说明
npx vitest run server/ai/task-plan.test.ts server/ai/jev-decision.test.ts server/ai/planned-agent.test.ts server/ai/planned-agent-session.test.ts
npm run check                               # 按仓库要求串行执行，不并行启动重型检查
```

| 模块 | 所有权 |
| --- | --- |
| `server/ai/tool-registry.ts` | 工具名称、描述、声明参数；新增工具先在这里登记 |
| `server/ai/capability-catalog.ts` | 从注册生成目录；计划参数的额外白名单与形状校验 |
| `server/ai/task-plan.ts` | 纯计划校验、依赖与回执关联、健康验收 |
| `server/ai/task-planner.ts` | 主备 LLM 的单次结构化规划与用量记账 |
| `server/ai/jev-decision.ts` | 可选外部选择器、最小数据边界、超时/置信度/返回值校验 |
| `server/ai/planned-agent.ts` | 内存检查点、逐步调度、失败停止；无正式工程写权限 |
| `src/lib/agent-session.ts` | 真正的浏览器工具执行、影子工程和落地策略，不绕过 |

新增工具时同时补执行器、风险策略、契约测试和文档。能力目录不是授权接口。不要将项目数据、外部素材说明或检索文本作为 system 指令。不要在 issue、日志或示例里上传真实学生名单。

## 自建服务的实验启用

先使用虚构示例与新建工程。静态 GitHub Pages 演示没有 Node AI 服务，不能只通过前端开关启用。

在服务端环境中设置以下变量（不要使用 `VITE_*`，不要提交真实密钥）：

```dotenv
AI_AGENT_PLANNING=1
AI_PRIMARY_BASE_URL=<已验证的 OpenAI-compatible 服务地址>
AI_PRIMARY_MODEL=<该服务实际提供且支持 tool_calls 的模型 ID>
AI_PRIMARY_API_KEY=<服务端密钥>
# 可选备选模型：保留既有路由配置，明确其数据处理边界
# AI_FALLBACK_BASE_URL=...
# AI_FALLBACK_MODEL=...
# AI_FALLBACK_API_KEY=...

# 可选 Jev；不配置时使用确定性调度
# AI_DECISION_PROVIDER=jev
# JEV_API_KEY=<单独申请的服务端密钥>
# JEV_MODEL=jev-latest
# JEV_TIMEOUT_MS=1500
# JEV_MIN_CONFIDENCE=0.85
```

配置沿用项目原有环境加载方式。默认不启用新规划，不修改旧模型默认值；本文不保证这些历史模型 ID 当前可用。未配置主模型却打开新模式会明确失败，不会用关键词假装完成复杂任务。开放给其他用户前，需补齐新任务 UI、外部服务告知/同意和 P2 验收。

Jev 仅向官方 `https://api.typesafe.ai/v1/systemone` 请求；不接受客户端指定 URL，不跟随重定向。只发送代码定义的工具名、是否只读、依赖数量和临时选项序号；不发送用户指令、任务标题、学生字段、工程摘要、参数或计划 ID。关闭或只有一个就绪步骤时不请求。收到的 choice 必须属于就绪集合，概率/置信度合法且达阈值，否则按固定顺序选择。隐私最小化不等于零元数据传输。

LLM 仍按既有远程 AI 边界接收指令与工程摘要；配置备用供应商前必须理解相同数据可能被传给该供应商。不要将 Jev 的数据最小化描述套用到 LLM。

## 试验指令与验收操作

使用虚构示例，输入：“地图缩小 20%，按城市分组，卡片改紧凑样式，保持姓名和院校不变，最后检查布局；导出 PNG。”

预期：读取真实状态；生成依赖计划；预览中的分组、地图比例和卡片样式逐步改变；事实字段不动；正式工程在应用前不变；最终检查存在问题则报告阻塞。PNG 应明确列为未自动执行，在交付界面手动导出。检查计划不能误加 `auto_layout` 丢弃手工位置；确有自动重排需求时，仍需原有高风险确认。

额外验收：故意让一个工具返回失败；在步骤间更改需求；取消请求；停服务后重试；模拟 Jev 超时/低置信度。这些情况不能出现重复写入、悄悄换模型再执行或“全部完成”。

## 检查点、预算和回滚限制

检查点为服务进程内存中的不可变记录，随机句柄写入每个 assistant 工具回合，能适应浏览器近期会话压缩；从首次读取起 15 分钟有效，最多保留 512 个检查点。重启、驱逐或需求变化会停止并要求新建任务。句柄不是身份或授权证明；外层原有认证与签名预算回执仍不可省略。尚无持久恢复、跨设备恢复或工程版本级绑定。服务端依赖浏览器上报的回执，不是对恶意客户端的独立证明。

轮次上限包含读取、执行、健康检查与结束响应。规划模型缺失用量或请求失败时使用保守估算；Jev 每次请求预留/记账 2048 token 单位，不冒充真实账单。应用 token 预算不是硬性货币支出上限。生产环境还应设置供应商侧限额。停用：移除 `AI_AGENT_PLANNING` 或设为 0 并重启；Jev 另移除 `AI_DECISION_PROVIDER`。未改工程格式或存储 schema，无数据迁移。停用后不要继续旧计划，新建助手任务；正式工程回滚仍使用现有撤销/备份。

## 调研依据与验证证据

一手资料（2026-09-30 查阅）：
- [TypeSafe Jev API](https://docs.typesafe.ai/api)：结构化选择，不是编辑器授权。
- [TypeSafe confidence](https://docs.typesafe.ai/confidence)：置信度需校准，不能证明正确。
- [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)：应用执行工具并回传结果，schema 不代替业务验收。
- [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence) 与 [interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)：借鉴检查点和人工介入，不新增框架依赖。

自动化测试使用 mock 供应商和虚构工程。PR 的 CI/检查日志才是测试、类型检查和构建的执行证据；此文不预先宣称通过。未执行真实 Jev/LLM 付费调用、人工浏览器可用性研究或生产灰度。后续在 PR 记录 failure → cause → fix → recheck；不要以“已写测试”代替“测试已通过”。
