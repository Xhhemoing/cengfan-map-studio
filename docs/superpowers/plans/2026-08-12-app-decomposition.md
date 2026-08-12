# App.tsx 分解实施计划（2026-08-12）

> 依据已批准的 `docs/superpowers/specs/2026-08-08-project-optimization-design.md` 阶段 3（App.tsx 按 400 行规范拆分；阶段 1 的 MUI 改造已合并，拆分范围已无约束）。
>
> 状态：Task 1（协作生命周期 hook）随 `7eac32b` 完成；Task 2（导出管线 hook）随 `7c0ccda` 完成。Task 3 评估后缓行：workspaceSync 构造闭包与 projectIdRef/editorProjectStore/浏览器存储键深度交织，强制抽取引入时序约束、收益有限（约 150 行且边界模糊），故不在本轮执行。剩余分解（数据导入/模板/场景处理）工作量仍大（App.tsx 2727 行），下一轮建议委托子智能体按域拆分并严格核验。

## 现状

- `src/App.tsx` 3105 行（`StudioApp` 组件自 265 行起），含状态/处理函数/effect 混杂。
- 回归网：`src/App.test.tsx` 109 测试 + 其余套件，全量绿（`bc2c9a2` 后验证）。
- 约束：纯重构，不改行为；每步跑 `src/App.test.tsx` + 双 `tsc --noEmit`；每步独立提交。

## 任务分解（每步 2–5 分钟粒度，测试先行由既有回归网承担）

### Task 1：抽取协作生命周期 hook

- 新建 `src/lib/useCollaborationRoom.ts`：将 roomId/token/role/members/readonly/closed/version/status/message 状态、`receiveRoomUpdate`、订阅 effect（含断线补同步）、`startCollaborationRoom`、`joinCollaborationRoom`、`createCollaborationInvitation`、`leaveCollaborationRoom`、`setCollaborationRoomAccess`、`storedRoomAccess`/`persistRoomAccess`/`forgetRoomAccess` 移入 hook。
- hook 入参：`{ clientId, getCurrentPackage, applySharedPackage, canEditSharedProject 所需状态 }`；返回状态与动作，App 内保持调用点不变。
- `canEditSharedProject`、发送 effect 依赖的 `roomReadonly/roomClosed` 由 hook 返回。
- 验收：`NODE_ENV=test env -u PORT npx vitest run src/App.test.tsx src/lib/collaboration-client.test.ts` 全绿；`tsc -p tsconfig.app.json --noEmit` 干净；App.tsx 减少约 450 行。

### Task 2：抽取导出管线 hook

- 新建 `src/lib/usePosterExport.ts`：PNG/SVG/工程包导出状态与处理函数（`exportingPng`、`exportState`、`exportError`、`lastExportRef`、`exportSvg`、`exportPng`、`openProjectExportDialog`、`includeResourcesInProjectExport`、`importProjectPackage` 及其辅助）。
- 验收：同上；App.tsx 再减约 250 行。

### Task 3：抽取工作区持久化 hook

- 新建 `src/lib/useWorkspacePersistence.ts`：`workspaceSync` 实例构造、镜像恢复、`overwriteBrowserStorage`、`restoreLocalProject`、草稿/镜像键管理。
- 验收：同上；App.tsx 再减约 250 行。

### Task 4：收尾评估

- App.tsx 若仍 > 800 行，再按数据导入/模板/样式面板继续抽取一轮。
- 全量串行验证 + 更新 `docs/progress/2026-08-12-app-decomposition.md` + 提交。

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| 抽取破坏闭包/ref 语义 | 每步全量 App 测试；hook 边界只搬不写新逻辑 |
| 发送 effect 依赖变化 | 依赖数组原样搬运，仅在 hook 内重组 |
| 并行子智能体冲突 | 本计划顺序执行，不并行改同一文件 |
