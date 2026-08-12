# 语义化数组协作进度记录（2026-08-06，真实落地版）

> **前置状态核实（重要）：** 本目录旧版进度记录声称实现已提交到 `master`（`5949eb8`，cherry-pick 后 `53cd286`）。经核实：这两个 commit 及旧文档引用的 agent-safety 三个 commit（`d48be31`/`1492422`/`17bb367`）**均不存在于本仓库任何分支、reflog 或 git 对象库**（`git fsck --no-reflogs` 无匹配，`git log --all` 无匹配）；`array-upsert` 关键字在整个代码库中零命中。即旧文档描述的是从未合并的实现。本记录为 2026-08-12 会话在主工作树按 TDD 从零真实落地的结果。

## 当前结论

AI 助手确认与实时协作此前把整个数组当原子值写回，同一名单中不同学生的并发编辑可能互相覆盖。现在所有元素均带唯一、非空字符串 `id` 的数组（`students`、`textElements`、`assetElements`、`guests`、`assets`、`fonts`、`customTemplates` 等）在协作差异中生成按元素 ID 的 `array-upsert` / `array-remove` 操作；无稳定 ID 的数组（如 `visibleFields`、历史兼容数组）继续使用原有原子 `set`，协议向后兼容。

实现提交：`a50c40d feat(collab): apply id-qualified arrays as semantic operations`（本会话，主工作树，单提交可回滚）。前置 UI 组件抽取重构为独立提交 `a06f7c9`。

## 协议设计（与计划一致）

- `CollaborationOperation` 新增两种严格校验的操作：
  - `array-upsert { path, item }`：`item` 必须是带非空字符串自身 `id` 的普通对象。
  - `array-remove { path, itemId }`：`itemId` 必须是非空字符串。
- `path` 继续使用既有安全路径校验（原型污染键、深度上限）；新增操作仅接受恰好 `type/path/item` 或 `type/path/itemId` 三个键，多余键拒绝。
- `isCollaborationOperation` 拒绝缺 id、空 id、非字符串 id、非对象 item、原型污染路径、多余键的载荷。

## 差异与应用

- `diffCollaborationDocument` 仅当 before/after 两侧都是「元素均为唯一非空字符串 id 的普通对象」数组时生成语义操作：
  - before 中存在而 after 缺失的 id → `array-remove`（按 before 原顺序）。
  - after 中新增或值变化的 id → `array-upsert`（按 after 顺序）。
  - 未变化的唯一 id 数组不产生操作。
- 任一侧不合格（缺 id、重复 id、非对象元素、非数组）→ 保持原有一条原子 `set`。
- 语义操作数量会让最终差异超过既有 `MAX_OPERATIONS = 256` 时，该数组回退为单条原子 `set`，公共上限不变。
- `applyCollaborationOperations` 不可变应用：`array-upsert` 更新已存在 id 时保持原位置、不存在时追加到末尾；`array-remove` 仅删除同 id 元素；输入数组与元素均不被修改。

## 冲突判定

- 新增 `collaborationOperationsOverlap(left, right)`（保留 `collaborationPathsOverlap` 供路径级使用）：
  - 两个语义操作：仅当**同一集合路径 + 同一元素 id** 时冲突；同集合不同 id 不冲突（可并发重放）。
  - 语义操作与 `set` / `delete` 混合：沿用原路径前缀重叠语义（同集合、祖先、后代均冲突）。
- 服务器陈旧事务重放（`server/collaboration.ts` 的 `canRebase`）改用操作级判定，因此可以：
  - 合并同一名单中不同学生的并发修改（新回归 `STUD01`）。
  - 拒绝同一学生 id 的并发修改（`STUD02`，`VERSION_CONFLICT`）。
  - 拒绝「集合级原子替换 ↔ 元素级操作」双向冲突（`STUD03`、`STUD04`）。

## AI 事务端到端

- 新回归：AI 通过 `manage_students.update_fact` 修改学生 A，会话期间用户手工修改学生 B，确认后事务同时保留 A 与 B 的修改；仍为单个可撤销事务。
- **与计划预期的差异（如实记录）：** 计划预计该回归在旧实现下 RED。实际当前 `transactionForSteps` 已按「把选中写步骤重放到确认时的最新项目」实现（而非旧文档声称的 `diffCollaborationDocument(base, shadow)` 方式），该架构天然满足 A/B 并存契约，回归测试**直接 GREEN**，无需修改 `src/lib/agent-session.ts`。测试仍作为契约守卫保留：若未来事务应用退化为整体影子替换，它将失败。

## TDD 与审查证据

### RED → GREEN（本会话，主工作树）

1. `src/lib/collaboration-operations.test.ts` 先写失败用例（语义差异、回退原子 set、不可变应用、协议验证、上限回退），运行：
   ```text
   Test Files  1 failed (1)
   Tests  3 failed | 5 passed (8)
   ```
   失败项正是「唯一 id 数组按元素差异」「upsert/remove 应用」「语义操作验证」三条新回归。
2. `server/collaboration.test.ts` 增加 STUD01–STUD04 冲突矩阵用例，运行：
   ```text
   Tests  1 failed | 17 passed (18)
   ```
   失败项为 STUD01「不同 id 语义操作合并」（旧路径重叠判定误判冲突），同 id 与集合替换冲突按预期天然通过。
3. 实现协议/差异/应用/操作级冲突判定并接入 server 后，目标套件：
   ```text
   Test Files  3 passed (3)   Tests  47 passed (47)   （协作操作 8 + server 18 + agent-session 29 之前基线）
   ```
   含 App/客户端回归共 5 个文件 169 项通过。
4. 双 `tsc --noEmit`（app + node）通过；改动文件 ESLint 通过。

## 验证结果（全量，串行）

全部命令使用 `NODE_ENV=test env -u PORT`：`.env` 含 `NODE_ENV=production`，vitest 加载后 React 走生产构建（无 `act` 导出），不加 `NODE_ENV=test` 会误报 15 项 `act is not a function` 失败（实测有/无本改动均同样误报，已排除为环境陷阱，非代码缺陷）。

- `NODE_ENV=test env -u PORT npm test`：**160 个测试文件全部通过，1184 项测试通过，0 失败**。
- `npx tsc -p tsconfig.app.json --noEmit`、`npx tsc -p tsconfig.node.json --noEmit`：通过。
- `npm run lint`：0 错误，2 警告（均为 react-refresh/only-export-components 类既有警告，其中一条来自本次提交的 `GlobalDataNavigation.tsx` 组件+纯函数同文件模式，与仓库既有 `GlobalDataScreen` 同类）。
- `npm run build`：通过（主 JS 约 1,567.96 kB，gzip 约 400.76 kB；保留既有 Vite 大 chunk 警告）。
- `git diff --check`：通过。

## 工作区保护

- 实施前基线已提交（`a06f7c9` 组件抽取重构 + 更早的 `a769be8`），实现隔离在单个提交 `a50c40d`（5 个文件，+261/−9），可整体 revert；故未另做目录备份。
- 未修改 package lock、`ProjectDocument`、工程包 schema/version、导入导出、地图/布局核心。
- 未触碰 `server/index.ts`（仓库中不存在未提交的端口修改；该文件未被改动）。

## 残余限制（与计划一致）

- 不支持数组排序/移动：元素更新保持原位置，新元素追加；同集合不同 id 的插入顺序由服务端到达顺序决定。
- 同一元素 id 的并发修改仍是明确冲突（`VERSION_CONFLICT`），未实现字段级 CRDT 合并。
- 服务端操作历史与客户端基线仍以操作数组为单位重放；跨客户端顺序差异仅影响新增元素位置。
- 既有 Vite 大 chunk 警告不在本轮范围。

## 后续优先级

1. **协作房间体验补全**（`docs/superpowers/plans/2026-08-06-collaboration-room-experience.md`，未开始）：成员状态、只读邀请、房主关闭房间、断线重连补操作；资源大对象按哈希上传留作独立计划。
2. **AI 体验增强**：SSE 流式进度、冲突时给用户可操作的提示。
3. **文档真实性核对**：`docs/progress/2026-08-06-agent-safety-and-transaction-integrity.md` 引用的 commit 不存在，已核实其功能大多存在（未知工具拒绝在 `server/ai/agent-request.ts`、`patch-validator.ts`、`AgentAssistant` 复选框、`transactionForSteps`），但与文档描述有两处不符：事务应用为「重放到当前项目」而非「diff(base,shadow)」；`update_fact` 白名单为 `name/university/city`（文档写含 `province`）。补充说明已追加到该文档。
