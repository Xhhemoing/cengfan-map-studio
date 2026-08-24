MODEL_SLUG: claude-fable-5-thinking-xhigh

# R20-fable-arch 报告：去重 `loadBrowserValue`

## 改动

仅改一个文件：`src/lib/useCollaborationRoom.ts`。

1. 删除本地私有的 `loadBrowserValue<T>(load, fallback)`（原第 79–85 行），其实现与 `src/lib/app-initialization.ts` 导出的版本逐字符相同（try/load/catch/fallback）。
2. 新增 `import { loadBrowserValue } from "./app-initialization";`。文件内两处调用点（`hasStoredRoomAccess` 初始化、`storedRoomAccess`）不变，行为完全一致。

无循环依赖风险：`app-initialization.ts` 只依赖 `app-constants` / `project-document` / `project-data`，不反向引用 collaboration 模块。`src/hooks/use-studio-navigation.ts`、`use-workspace-session.ts`、`use-workspace-persistence.ts` 早已从同一路径导入该函数，本次改动使 `useCollaborationRoom` 与它们对齐。

## 测试

`src/lib/useCollaborationRoom.test.ts` 只 mock `./collaboration-client`，未 mock 本地 `loadBrowserValue`，因此测试无需修改。

## 验证（failure → cause → fix → recheck）

- 无失败发生，一次通过。
- `npx vitest run src/lib/useCollaborationRoom.test.ts src/App.collaboration.test.tsx src/lib/collaboration-operations.test.ts src/lib/collaboration-client.test.ts` → 4 个文件、26 个测试全部通过（Vitest v4.1.10，Duration 5.97s）。
- `npx eslint src/lib/useCollaborationRoom.ts` → 0 问题（确认无未使用导入/变量）。

## 边界遵守

- 未触碰 `pack.ts`；未执行 git commit/stash/push。
- 回滚方案：还原 `useCollaborationRoom.ts` 中的 import 行并恢复本地函数即可（单文件、非破坏性改动，不涉及数据或 API 形状）。
