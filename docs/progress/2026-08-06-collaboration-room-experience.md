# 协作房间体验补全进度记录（2026-08-12）

> 对应计划：`docs/superpowers/plans/2026-08-06-collaboration-room-experience.md`（冻结契约）。本记录覆盖 Task 2（客户端）与 Task 3（集成验证）的落地结果；Task 1（服务端）已在 `6e11803` 完成。

## 当前结论

房间体验补全的五项能力中，客户端侧缺口已闭合：

- **成员状态**：`RoomMember` 类型 + `subscribeRoom` 的 `members` SSE 事件回调；协作弹层渲染成员列表（owner 标记 👑 + 「我」标记 + 仅查看标记）。
- **只读/关闭**：`setRoomAccess` 客户端函数；房主可见「设为只读/恢复编辑」「关闭房间」按钮；非房主与关闭房间按模式显示，不暴露房主按钮；`readonly`/`closed` 状态会停止本地增量上传（`canEditSharedProject` 与发送 effect 双重守卫）。
- **断线重连补操作**：SSE `onerror` 时用 `fetchRoomOperations(afterVersion)` 拉取区间增量并按语义操作重放；`VERSION_CONFLICT`（历史已裁剪）回退 `fetchRoom` 全量快照；`backfillInFlightRef` 防止并发重复补齐。
- **离开广播**：断开房间时 fire-and-forget 调用 `leaveRoom`，成员列表实时反映离开。

## 实现清单（客户端）

- `src/lib/collaboration-client.ts`：
  - `RoomMember` / `RoomClosedInfo` / `RoomOperationsResponse` 类型；`CollaborationRoom` 增加 `readonly?` / `closed?` / `members?`。
  - `leaveRoom(roomId, accessToken, clientId)` → `POST /api/rooms/:id/leave`。
  - `setRoomAccess(roomId, accessToken, clientId, action)` → `POST /api/rooms/:id/access`（action: `set-readonly` | `close`）。
  - `fetchRoomOperations(roomId, accessToken, afterVersion)` → `GET /api/rooms/:id/operations?afterVersion=N`。
  - `subscribeRoom` options 扩展 `onMembers` / `onClosed`（可选，向后兼容）；`closed` 事件回调后关闭 EventSource。
- `src/App.tsx`：
  - 状态 `roomMembers` / `roomReadonly` / `roomClosed`；`CollaborationStatus` 增加 `closed`。
  - `receiveRoomUpdate` 同步成员/只读/关闭字段；关闭消息与状态置为 closed。
  - 订阅 effect 增加 `onMembers` / `onClosed`，`onerror` 触发补同步（`fetchRoomOperations` → 语义重放 → 冲突回退全量快照）。
  - `setCollaborationRoomAccess` 房主操作 handler；`leaveCollaborationRoom` 广播离开；创建/加入房间时同步服务端 members/readonly/closed。
  - `canEditSharedProject` 与增量发送 effect 均受 `roomReadonly` / `roomClosed` 约束（服务端也只读/关闭拒绝全部事务，客户端同步停发）。
- `src/components/ProjectMenu.tsx`：成员列表（`aria-label="房间成员"`）、模式行（可编辑/只读/已关闭）、房主 access 按钮、只读/关闭提示。
- `src/components/StudioAssistantRail.tsx`：`CollaborationStatus` 增加 `closed` 与「房间已关闭」标签。
- `src/styles.css`：`.collaboration-members` / `.collaboration-closed` 最小样式。

## 测试与验证

- TDD：先写 3 个 App 级 UI 回归（房主成员列表+切换只读、非房主只读模式无房主按钮、关闭房间隐藏全部控制）与 4 个客户端单测（leave/access/operations/subscribeRoom 事件），红→绿。
- `src/lib/collaboration-client.test.ts`：12 通过。
- `src/App.test.tsx`：109 通过（含既有 viewer 只读提交边界回归）。
- 全量串行验证：`NODE_ENV=test env -u PORT npm test` ✓、`tsc -p tsconfig.app.json --noEmit` ✓、`tsc -p tsconfig.node.json --noEmit` ✓、`npm run lint` 0 错误、`npm run build` ✓、`git diff --check` ✓。

## 已知边界（与冻结契约一致，后续独立计划）

- 资源大对象按哈希上传、持久化房间、成员踢出/邀请鉴权仍不在范围内。
- 成员列表仅展示 `clientId`（服务端 Member 无 displayName 字段）；显示名前缀截断至 6 字符，属契约内限制。
