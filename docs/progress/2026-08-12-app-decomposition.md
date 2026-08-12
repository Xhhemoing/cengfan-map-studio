# App.tsx 分解进度记录（2026-08-12）

> 对应计划：`docs/superpowers/plans/2026-08-12-app-decomposition.md`（依据已批准的 2026-08-08 项目优化设计阶段 3）。

## 当前结论

`src/App.tsx` 从 3105 行降至 **2727 行**（-378 行），协作生命周期与海报导出管线已拆分为两个独立模块；行为零变化，全部回归测试通过。

## 落地内容

### Task 1：`src/lib/useCollaborationRoom.ts`（436 行，提交 `7eac32b`）

- 从 App.tsx 抽取：房间全部状态（roomId/token/role/participants/members/readonly/closed/invitation/version/status/message/输入框）、SSE 订阅（含断线补同步与 VERSION_CONFLICT 回退全量快照）、创建/加入/邀请/离开/房主 access 处理函数、访问凭证 localStorage 管理。
- 边界设计（React Compiler 规则约束）：
  - refs 采用 **uncontrolled 模式**：`baselineRef` 等 6 个 ref 由 App 本地创建、经 `UseCollaborationRoomRefs` 传入；hook 返回值不包含可变 ref，满足 `react-hooks/immutability`（禁止修改 hook 返回值）。
  - `optionsRef` 在 effect 中同步（渲染期写 ref 被 `react-hooks/refs` 禁止）。
  - 动作函数不使用 `useCallback([])`（避免陈旧闭包），每渲染新建。
- 上传侧（workspace diff → submitRoomOperations 的 debounce effect）留在 App，因为它依赖 `latestWorkspaceRef` 与 workspace 状态；hook 暴露 setter 供其回写状态。

### Task 2：`src/lib/usePosterExport.ts`（184 行，提交 `7c0ccda`）

- 抽取：PNG/SVG/工程包导出的状态机（exportingPng/exportState/exportError/lastExport/pngScale/transparentExport/确认对话框/是否含资源包）与全部导出/导入处理函数。
- 工作区回写经两个回调：`applyImportedPackage`（导入时设置 assets/fonts/templates/renderSettings + commitProject + 选中画布）与 `reportStatus`（状态消息）。
- 新增 FileReader `onerror` 分支（原代码缺失，导入失败时现在有用户可见反馈）——唯一的非纯搬移改动。

### Task 3：评估后缓行（记录于计划文档）

workspaceSync 构造闭包与 projectIdRef/editorProjectStore/浏览器存储键深度交织，抽取引入时序约束、边界模糊，收益有限，本轮不做。

## 验证

- 每步：`NODE_ENV=test env -u PORT npx vitest run src/App.test.tsx src/lib/collaboration-client.test.ts`（109 + 12 = 121 全绿）+ `tsc -p tsconfig.app.json --noEmit` + `npx eslint`（0 错误）。
- 收尾全量：`npm test`、双 `tsc --noEmit`、`npm run lint`、`npm run build`、`git diff --check` 全绿。

## 后续建议

- App.tsx 仍有 2727 行：数据导入/模板处理/场景操作/旧版编辑器 JSX 可继续按域拆分；建议下一轮按用户偏好多智能体并行拆分，父代理核验 diff + 测试后再合并。
- 性能基线保持稳定：布局 worker 400 卡 254ms（`npm run perf:layout`），与 2026-08-08 基线一致。
