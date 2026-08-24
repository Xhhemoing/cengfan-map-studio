MODEL_SLUG: claude-fable-5-thinking-xhigh

# Round 3 — R3-fable-arch 报告

## 结果总览

- **App.tsx：1136 → 798 行（−338，目标 ≤900 达成）**，App 只剩状态编排、组合与阶段分派。
- 协作 send/debounce/apply-remote 按要求提取到 `src/hooks/use-collaboration-sync.ts`，**线上协议零变化**（仍走 `submitRoomOperations`，负载 `txId/clientId/baseVersion/operations` 与提取前逐字一致；`useCollaborationRoom` 未改动）。
- 另拆 4 个 hooks（场景动作、资源库、会话、撤销快捷键），全部 ≤161 行。
- `studio-editor-helpers.ts` 新增 6 个纯函数（协作发送门槛/发送计划、会话选中恢复/会话快照、历史摘要、素材去重入库），**新增 17 个单元测试**（23 通过，此前 6 个）。
- skip-link 与 `StageSlotsContext` 未触碰（`components/studio-editor/**` 零改动），2 个 skip-link 回归测试继续通过。
- 无用户可见文案变化（所有字符串逐字搬移）；未提交（遵循 Do not commit）。

## 新增/修改文件

| 文件 | 行数 | 说明 |
| --- | --- | --- |
| `src/App.tsx` | 798 | 薄组合器；不再持有任何 `useEffect`（全部效果都在 hooks 内） |
| `src/hooks/use-collaboration-sync.ts` | 131 | clientId + 全部协作 ref、`applyPackage`（远端快照/增量落地五个 setter + markPending）、600ms 防抖增量上传；包 `useCollaborationRoom` 并以 `{...room, clientId}` 返回 |
| `src/hooks/use-scene-actions.ts` | 161 | 网格吸附、`patchScene`（map/province 变更冻结已解析卡片位置）、字体应用、场景重置、省份智能底色、贴图/底图对齐、文本/素材/数据框/嘉宾拖拽缩放 |
| `src/hooks/use-resource-library.ts` | 144 | 素材入库去重/替换/删除、字体上传删除、资源包导入导出、`assetUsageById` memo、@font-face 注入 + 字体预加载两个效果 |
| `src/hooks/use-workspace-session.ts` | 32 | 会话一次性加载 + 阶段/选中对象变化时自动落盘 |
| `src/hooks/use-undo-redo-shortcuts.ts` | 32 | Cmd/Ctrl+Z/Y 快捷键；保留原「无依赖数组、每次渲染重绑定」语义 |
| `src/lib/studio-editor-helpers.ts` | 396 | +93 行：`canSendCollaborationUpdate`、`planCollaborationSend`、`deriveSessionSelection`、`buildWorkspaceSessionUpdate`、`describeProjectHistory`、`addAssetToLibrary`（仍 <400 行预算） |
| `src/lib/studio-editor-helpers.test.ts` | 326 | +17 测试：发送门槛（角色/只读/关闭/缺基线）、发送计划（空差分、撤销栈不产生增量、exportedAt 固定基线、内容编辑产生 set 操作）、会话恢复/快照、历史摘要文案、素材去重（id / src+kind+provinceIds） |

## 关键设计决策

1. **协作 hook 的边界**：`useCollaborationRoom`（房间生命周期/SSE/补齐）保持原样在 `src/lib`，新 hook 只收编 App 侧胶水——六个 ref、`currentPackage`、`applyPackage` 与防抖上传效果。这与该文件头部注释声明的分层（"upload side stays in the caller"）一致：caller 现在是专职 hook 而非 App。
2. **防抖效果依赖不变**：仍依赖单个房间字段 + 五个工作区状态（沿用原 eslint-disable 注释），`suppressSendRef` 的消费时机（先过门槛再消费）逐行保序，避免远端落地误触发回传。
3. **纯逻辑下沉可测**：发送门槛与「按基线 exportedAt 打包再差分」进入 helpers，hook 内只剩计时器与请求编排；App 与 hook 都不再 import `diffCollaborationDocument`/`buildCollaborationPackage`。
4. **`workspace` 参数只作重武装依赖**：发送内容始终取 `latestWorkspaceRef.current`（与原实现一致），传入的 `workspace` 快照仅用于 effect 依赖，不参与打包，杜绝陈旧闭包。

## 验证证据链（failure → cause → fix → recheck）

### 链 1：`planCollaborationSend` 新测试断言过严
- **failure**：`npx vitest run src/lib/studio-editor-helpers.test.ts` 1 失败——期望「仅撤销栈差异」只产生 `project.version` 一条操作，实际多出 `canvas.lineHeight`、`cards.fieldFonts` 等 5 条 set。
- **cause**：`applyTransaction` 经 `cloneSnapshot/cloneScene` 归一化文档，把缺省值落成自有属性；新建文档没有这些自有键，首笔事务的差分必然包含这些一次性归一化 set。这是既有生产行为（真实首个防抖上传同样包含），非本次引入。
- **fix**：改为断言真实意图——差分不含 `history`、不含 `exportedAt`、包含 `project.version` set、全部操作落在 `project` 子树；并在测试注释记录归一化原因。
- **recheck**：23/23 通过。

### 链 2：共享工作区并发漂移
- **failure**（风险而非报错）：首轮验证通过后 `git status` 显示其他 R3 代理已改动 `card-layout*`、`DataWorkspace*`、`server/` 等共享文件。
- **cause**：多代理共享同一工作区，我的首次绿灯可能基于过期树。
- **fix**：无需改码（无文件冲突，各自所有权互斥）。
- **recheck**：对当前树整体重跑验证命令，152/152 通过 + tsc 通过（见下）。

## 最终验证命令与结果

```
npx vitest run src/App.test.tsx src/App.debug.test.tsx \
  src/components/AppProjectMode.test.tsx src/lib/studio-editor-helpers.test.ts \
  src/components/studio-editor
→ Test Files 4 passed (4) / Tests 152 passed (152)
  （studio-editor 目录本身无测试文件，故为 4 个文件；skip-link 两个回归测试包含在 App.test.tsx 内且通过）

npx tsc --noEmit -p tsconfig.app.json
→ 通过

npx eslint src/App.tsx src/hooks/use-*.ts src/lib/studio-editor-helpers.ts src/lib/studio-editor-helpers.test.ts
→ 通过（0 问题）
```

## 交付与回滚说明

- 验收方式：上述三条命令 + 本报告证据链；行为等价重构，无 UI/协议验收项新增。
- 回滚方案：本轮改动集中于 `src/App.tsx`、`src/hooks/use-{collaboration-sync,scene-actions,resource-library,workspace-session,undo-redo-shortcuts}.ts`、`src/lib/studio-editor-helpers{,.test}.ts`，无数据/导出格式/API 形状变更；整组 revert 即可完全还原。

## 遗留事项（下轮候选）

- `mapStyleAssetPanelProps`（32 行）与 `dataWorkspaceProps` 仍在 App 内联重建；再拆需与 memo 化一起评估，未混入本轮。
- `GlobalSettingsScreen` 分支的顶栏 JSX（约 60 行）可提为 `studio-editor/GlobalSettingsChrome`，但 props 面很宽，收益有限。
- `useCollaborationRoom` 的六个 ref 现在由 `use-collaboration-sync` 独占创建，后续可把 ref 组下沉进 room hook 本体（需同步调整其测试与注释声明的分层）。
