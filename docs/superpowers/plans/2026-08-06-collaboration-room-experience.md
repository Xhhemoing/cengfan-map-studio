# 协作房间体验补全计划（2026-08-06）

> 状态：Task 1（服务端）随 `6e11803` 完成；Task 2（客户端函数 + UI + 断线补同步）随 `feat(collab): client room members, readonly/close UI, and gap backfill` 完成；Task 3 全量验证与记录完成。冻结契约全部落地。

## 背景

`docs/plans/2026-07-27-map-label-roster-collaboration-improvements.md` 任务 7 明确列出共享编辑房间应支持：成员状态、只读邀请、房主关闭房间、断线重连补操作、资源大对象按哈希上传。当前 `master` 已实现房间创建/加入、快照获取、SSE 操作广播、版本冲突检测（`server/collaboration.ts` + `server/index.ts` 路由 + `src/lib/collaboration-client.ts` + `src/App.tsx` 弹层），但上述五项均未落地。

## 目标与边界

### 目标

1. 房间维护成员列表（加入/离开/心跳），SSE 广播成员变化。
2. 房主（创建者）可把房间设为只读或关闭房间；只读/关闭后拒绝写入与加入。
3. 断线重连可通过增量操作补同步，避免总是重拉完整快照。
4. 全部行为有 TDD 回归，服务端与客户端按冻结契约并行开发。

### 不做（后续独立计划）

- 资源大对象按哈希上传：涉及素材/字体二进制存储、哈希索引与引用协议，改动面大，单独规划。
- 持久化房间（需明确部署存储）；本地开发继续内存房间。
- 多房间权限体系（登录/账号）、成员踢出、邀请链接鉴权。

## 冻结的服务端契约

### 成员状态

- `POST /api/rooms/:id/members`，body `{ clientId: string }`
  - 200 → `{ id, version, members: Member[] }`；成员列表按加入时间排序。
  - 404 `ROOM_NOT_FOUND`；409 `ROOM_CLOSED`（房间已关闭）。
  - 幂等：同 clientId 重复加入只刷新 `lastSeenAt`。
- `POST /api/rooms/:id/leave`，body `{ clientId: string }`
  - 200 → `{ id, version, members }`；404 `ROOM_NOT_FOUND`。不存在成员时幂等返回当前列表。
- `Member = { clientId: string; role: "owner" | "editor" | "viewer"; joinedAt: string; lastSeenAt: string }`
  - 创建者 `owner`；普通成员 `editor`；只读邀请加入者 `viewer`。
- SSE 广播新增 `event: members`，data 为成员数组（不含 snapshot 字段）。

### 只读与关闭（仅房主）

- `POST /api/rooms/:id/access`，body `{ clientId: string; action: "set-readonly" | "close" }`
  - 200 → `{ id, version, readonly: boolean, closed: boolean }`
  - 403 `FORBIDDEN`（`clientId !== createdBy`）；404 `ROOM_NOT_FOUND`；409 `ROOM_CLOSED`。
- 只读语义：`room.readonly === true` 时，所有事务提交（snapshot 或 operations）返回 403 `READONLY_ROOM`；加入（members）仍允许，角色为 `viewer`。
- 关闭语义：`room.closed === true` 后，事务、加入、access 均返回 409 `ROOM_CLOSED`；已订阅成员收到 `event: closed`（data 为 room 元数据，不含 snapshot），随后 SSE 关闭连接。
- `CollaborationRoom` 新增字段：`readonly?: boolean`、`closed?: boolean`、`members: Member[]`。
- `CollaborationError` code 扩展：`FORBIDDEN`、`READONLY_ROOM`、`ROOM_CLOSED`。

### 断线重连补操作

- `GET /api/rooms/:id/operations?afterVersion=N`（N 为整数 ≥ 0）
  - 200 → `{ id, version, afterVersion, operations: CollaborationOperation[] }`
    - operations 为 `(afterVersion, room.version]` 区间内全部增量操作的合并数组（按版本顺序拼接）。
    - 若 `afterVersion === room.version` → `operations: []`。
  - 425 `ROOM_INITIALIZING`（房间未就绪）；404 `ROOM_NOT_FOUND`。
  - 若 `afterVersion < 0` 或非整数 → 400 `VALIDATION_ERROR`。
  - 若 `afterVersion` 落后太多、所需历史已被裁剪（无法完整补齐区间）→ 409 `VERSION_CONFLICT`，客户端应回退全量快照。
- 客户端 `subscribeRoom` 现有 `version` 参数行为保持不变（重连时仍可全量）。

## 任务分解

### Task 1: 服务端成员/权限/补操作 API（DeepSeek，worktree A）

**文件：** `server/collaboration.ts`、`server/collaboration.test.ts`、`server/index.ts`、`server/index.test.ts`

**TDD 顺序（每个用例先写失败回归再实现）：**
1. 房间创建即含 `members: [owner]`。
2. 加入/离开/心跳：重复加入幂等并刷新 `lastSeenAt`；离开幂等。
3. 非房主 `access` → 403；房主可设只读/关闭；关闭后事务与加入被拒。
4. 只读房间拒绝事务（403 `READONLY_ROOM`），仍可加入为 viewer。
5. `operations?afterVersion=` 返回区间增量；越界/裁剪返回 409；房间未就绪 425。
6. SSE 广播 members 事件与 closed 事件。

**验收：** `npx vitest run server/collaboration.test.ts server/index.test.ts` 通过；`npx tsc -p tsconfig.node.json --noEmit` 通过；不触碰 `server/index.ts` 中用户已有的 `resolvePort` 修改（diff 仅新增路由分支）。

### Task 2: 客户端函数与 UI（DeepSeek，worktree B）

**文件：** `src/lib/collaboration-client.ts`、`src/lib/collaboration-client.test.ts`、`src/App.tsx`、`src/App.test.tsx`

**TDD 顺序：**
1. `joinRoom` / `leaveRoom` / `setRoomAccess` / `fetchRoomOperations` 客户端函数（含错误映射，如 `ROOM_CLOSED`、`FORBIDDEN`）。
2. `subscribeRoom` 增加 `onMembers` / `onClosed` 回调（可选参数，向后兼容）。
3. App：协作弹层显示成员列表（owner 标记）、当前模式（可编辑/只读/已关闭）；房主显示「设为只读/恢复编辑」「关闭房间」按钮；非房主显示只读状态。
4. App：SSE 断开时用 `fetchRoomOperations(afterVersion)` 补同步，失败回退 `fetchRoom` 全量。

**验收：** `npx vitest run src/lib/collaboration-client.test.ts src/App.test.tsx` 通过；`npx tsc -p tsconfig.app.json --noEmit` 通过；UI 沿用现有 `collaboration-*` 样式类，不改主题/布局语义。

### Task 3: 父审查、集成、全量验证与记录

1. 独立审查两个 worktree 实际 diff（契约一致性、错误码、SSE 兼容、`server/index.ts` 保护）。
2. 先 cherry-pick 服务端，再 cherry-pick 客户端；跑目标测试。
3. 串行全量：`env -u PORT npm test`、双 `tsc --noEmit`、`npm run lint`、`npm run build`、`git diff --check`。
4. 更新本计划勾选与 `docs/progress/2026-08-06-collaboration-room-experience.md`，提交。

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| 旧客户端收到新字段/事件 | 字段可选（`readonly?`/`closed?`），事件为新增类型，旧端忽略未知事件。 |
| 只读/关闭导致写死锁 | 关闭不可逆，仅房主可触发；UI 确认对话框。 |
| 补操作区间被历史裁剪 | 409 回退全量快照；`afterVersion === version` 返回空数组。 |
| `server/index.ts` 用户修改被覆盖 | 只新增路由分支，合并前 diff 核对 `resolvePort` 两行不变。 |
| App.tsx 过大导致改动风险 | 只动协作弹层与协作生命周期相关代码；测试先行。 |

## 代理分工

`deepseek-v4-flash` × 2 在独立 worktree A/B 并行实现 Task 1/2，严格 TDD 并按冻结契约提交。父代理负责计划、备份、diff 审查、集成、全量验证与记录。
