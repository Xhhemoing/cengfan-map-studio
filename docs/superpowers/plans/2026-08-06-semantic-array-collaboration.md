# 语义化数组协作操作实施计划

## 背景

AI 提案确认已改为把不可变基线到所选影子状态的差异以协作操作写回当前项目，因此无关对象字段可以与手工编辑共存。当前 `diffCollaborationDocument()` 仍把所有数组视为原子值；当 AI 和用户分别修改同一学生名单、文本或素材实例数组的不同元素时，后到的数组替换仍可能覆盖前一方的修改。

项目要求把实际操作串成状态、画布、持久化、协作与导出的闭环，并明确 AI 只能使用预览、白名单命令和明确应用流程。本轮只消除“同一已标识数组内不同元素”的静默覆盖，不改变 `ProjectDocument`、工程包版本、导入导出、地图布局或普通数组的现有语义。

## 目标与边界

### 目标

1. 对内容项均有稳定非空 `id` 的数组，差异计算产生按元素 ID 的 `array-upsert` / `array-remove` 协作操作。
2. 应用数组操作时只替换、删除或追加目标 ID，不影响同数组中的其他元素；更新保持原位置，新增追加到当前末尾。
3. 服务器的乐观重放允许同一集合中不同 ID 的并发操作，拒绝同 ID 或集合级替换与元素级操作之间的冲突。
4. AI 会话确认基于同一协作差异机制，使 AI 更新一个学生不会抹掉会话期间手工修改的另一学生。
5. 无稳定 ID 的数组（例如可见字段、历史兼容数组）继续生成原有原子 `set` 操作，保持协议与恢复兼容。

### 不做

- 不修改 `ProjectDocument`、工程包 schema/version、`ProjectPackage`、数据库或实时事件 API 路径。
- 不引入数组排序/移动操作、三方合并、CRDT、离线队列或跨元素业务规则。
- 不把未知数组或 id 缺失/重复数组误判为元素集合；它们回退为现有原子 `set`。
- 不改动用户已有的 `server/index.ts` 未提交端口修复。

## 协议设计

在现有 `CollaborationOperation` 的 `set` / `delete` 之外增加两种严格验证的操作：

```ts
type CollaborationOperation =
  | { type: "set"; path: string[]; value: unknown }
  | { type: "delete"; path: string[] }
  | { type: "array-upsert"; path: string[]; item: { id: string; ... } }
  | { type: "array-remove"; path: string[]; itemId: string };
```

- `path` 仍通过现有原型污染和深度防护；`item.id` / `itemId` 必须为非空字符串。
- 只有变更前后都由唯一、稳定 `id` 对象构成的数组使用语义操作；其余数组保留单条 `set`。
- `array-upsert` 更新已存在 ID 时保留数组位置；不存在时追加。`array-remove` 只删除同 ID 的项目。
- 冲突判定以操作而不是单纯路径进行：同集合、不同 ID 的语义操作可并发重放；同 ID、或语义操作与该集合路径上的 `set` / `delete` 均冲突。
- 语义操作数量高于保守上限时，该数组回退为单个原子 `set`，避免超过服务端现有 256 操作包限制。

## 任务分解

### Task 1: 语义数组协议与纯函数（DeepSeek）

**文件：**
- 修改 `src/lib/collaboration-operations.ts`
- 修改 `src/lib/collaboration-operations.test.ts`
- 修改 `server/collaboration.ts`
- 修改 `server/collaboration.test.ts`

**TDD：**
1. 先写失败用例：具唯一 ID 的学生集合产生逐项操作；无 ID / 重复 ID 数组仍是原子 set。
2. 先写失败用例：数组 upsert/remove 不修改其他元素并保持更新元素原位置。
3. 先写失败用例：服务端合并不同 ID 的陈旧操作，拒绝同 ID 和集合替换冲突。
4. 运行目标测试确认 RED，再添加最小协议、差异、应用和冲突判定实现。
5. 运行 `npx vitest run src/lib/collaboration-operations.test.ts server/collaboration.test.ts`、应用与 Node TypeScript 检查。

**验收：**（已完成：旧文档标记为已完成但代码从未落地；2026-08-12 会话在主工作树按本 TDD 顺序真实实现并通过）
- 协议输入严格拒绝无效元素 ID、非对象元素、原型污染路径。
- 不同 ID 的并发修改保留双方结果；相同 ID 冲突返回既有 `VERSION_CONFLICT`。
- 老客户端的 `set` / `delete` 和未标识数组行为不变。

### Task 2: AI 事务端到端回归（DeepSeek）

**文件：**
- 修改 `src/lib/agent-session.test.ts`
- 仅在 Task 1 暴露测试失败时修改 `src/lib/agent-session.ts`

**TDD：**
1. 增加失败回归：AI 通过 `manage_students.update_fact` 改学生 A；确认前用户手工修改学生 B；最终事务保留 A 和 B。
2. 先运行 `npx vitest run src/lib/agent-session.test.ts` 观察旧数组原子写入导致的 RED。
3. 在 Task 1 语义操作实现上验证 GREEN，不添加绕过协作协议的特例。

**验收：**（已完成：旧文档标记为已完成但代码从未落地；2026-08-12 会话在主工作树按本 TDD 顺序真实实现并通过）
- AI 仍只生成一个可撤销事务。
- 同数组不同 ID 的手工修改不再被覆盖。
- 同 ID 冲突仍遵循当前确认时写入策略，不声称提供未实现的字段级三方合并。

### Task 3: 父审查、全量验证与事实记录

**文件：**
- 修改 `docs/progress/2026-08-06-semantic-array-collaboration.md`
- 本计划执行状态按实际结果更新
- 仅修改被验证失败明确暴露的文件

**验收与顺序：**（已完成，2026-08-12 会话）
1. 前置核实发现旧进度文档引用的 commit 不存在于仓库，本计划从未真实实现；本会话改为在主工作树按 TDD 直接实现（替代原「子智能体 worktree」分工，避免再次出现未落盘声称）。
2. RED→GREEN 证据齐全：纯函数套件 3 失败→8 通过；server 套件 1 失败→18 通过。
3. 目标测试：`npx vitest run src/lib/collaboration-operations.test.ts server/collaboration.test.ts src/lib/agent-session.test.ts src/lib/collaboration-client.test.ts src/App.test.tsx` → 5 文件 169 项通过。
4. 串行全量验证（`NODE_ENV=test env -u PORT`，排除 `.env` 的 `NODE_ENV=production` 陷阱）：
   - `npm test`：160 文件 / 1184 测试全部通过
   - 双 `tsc --noEmit`（app + node）通过
   - `npm run lint`：0 错误、2 条既有类警告
   - `npm run build`：通过（保留既有大 chunk 警告）
   - `git diff --check`：通过
5. 实现提交 `a50c40d`；组件抽取重构为独立提交 `a06f7c9`。
6. **偏差记录**：Task 2 回归（AI 改 A + 手工改 B）在现有 `transactionForSteps`「重放到当前项目」实现下直接 GREEN，未修改 `agent-session.ts`；测试保留为契约守卫。

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| 协议扩大导致服务端接受恶意对象 | 新操作复用安全路径校验，要求对象项和非空 ID，测试无效载荷。 |
| 不同客户端对数组顺序理解不一致 | 更新保持位置，新元素按服务端到达顺序追加；本轮不支持移动排序。 |
| 大批量替换超过操作数量上限 | 语义变更超阈值回退单条原子 `set`，继续使用已有服务端 256 操作保护。 |
| 将未知数组误识别为集合 | 仅唯一非空字符串 ID 的对象数组采用语义操作；其他保留旧行为。 |
| 同一元素的复杂字段合并被误承诺 | 同 ID 保持明确冲突，不实现字段级 CRDT。 |

## 代理分工

`deepseek-v4-flash` 在独立 worktree 上实现 Task 1 与 Task 2，严格 TDD 并提交仅包含协议、服务端测试和 AI 回归的改动。父代理负责备份、计划、实际 diff 审查、独立复测、合并、全量验证和进度记录。
