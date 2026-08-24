MODEL_SLUG: claude-fable-5-thinking-xhigh

# Round 20 — 装饰性 Lucide 图标对 AT 隐藏

## 改动范围

仅两处组件 + 其测试；未改任何回调、菜单结构或布局 CSS。所有编辑均为在既有 `<Icon size={n} />` 上追加 `aria-hidden`（React 渲染为 `aria-hidden="true"`）。

### `src/components/ProjectMenu.tsx`（13 枚图标）

- 触发器 `summary`（可见文字「项目」）内的 `FolderOpen`。
- 项目管理区：`Plus` 新建项目、`FolderOpen` 恢复最近项目、`Save` 保存到本机。
- 导出海报区：`Download` 导出 SVG。
- 在线协作区：`Share2` 协作触发器、`Copy` 复制房间码（仅图标但有 aria-label）、`Copy` 复制邀请凭证、`LogOut` 断开房间、`Share2` 创建房间。
- 工程文件区：`Save` 强制保存按钮、`PackageOpen` 导出工程、`PackageOpen` 导入工程 label。

### `src/components/workbench/WorkbenchHeader.tsx`（3 枚图标）

- 品牌标 `MapPinned`（产品名旁，装饰性，按要求隐藏）。
- `FolderOpen` 导入按钮（aria-label「导入工程包」）、`Plus` 新建项目按钮。

## 测试

- `src/components/ProjectMenu.test.tsx`：新增用例 "hides every decorative lucide icon from assistive technology in all menu states"，在三种状态（空闲 9 枚、面板展开未连接 10 枚、已连接创建者含邀请凭证 12 枚）断言容器内每个 `svg` 均为 `aria-hidden="true"`，并用最小数量下限保证条件分支图标都被覆盖。
- `src/components/workbench/WorkbenchHeader.test.tsx`：新建（此前无测试），沿用仓库既有 `createRoot` + `flushSync` 模式。两个用例：① 全部 3 枚 svg（含 `.workbench-brand-mark svg` 品牌标）`aria-hidden="true"`；② 按钮可及名（「新建项目」「导入工程包」）保持不变且点击新建项目仍触发 `onCreateProject`，钉住回调未被破坏。

## 验证证据链

- 复现/基线：改动前两文件所有 Lucide `svg` 无 `aria-hidden`，暴露给 AT（与任务描述一致）。
- 修复：如上仅追加 `aria-hidden`。
- 复检：`npx vitest run src/components/ProjectMenu.test.tsx src/components/workbench/WorkbenchHeader.test.tsx` → **2 files / 9 tests 全部通过**（含既有 7 个 Label-in-Name 用例，证明 aria-label 与可见文字契约未受影响）。
- `npx eslint` 对 4 个触及文件 → 0 报错。

## 交付说明

- 按指令未执行 git commit/stash/push；工作树中另有其他文件的既存改动（server/index.ts、card-layout-pack、import-data、useCollaborationRoom 等），非本轮产物，未触碰。
- 验收方式：跑上述两个 vitest 文件；或在读屏下确认「项目」菜单与工作台头部按钮只朗读文字名，不再朗读/停留在 svg 图形。
- 回滚方案：改动纯增量（每处仅加一个属性），`git checkout -- src/components/ProjectMenu.tsx src/components/workbench/WorkbenchHeader.tsx src/components/ProjectMenu.test.tsx && rm src/components/workbench/WorkbenchHeader.test.tsx` 即可完全还原，无数据/API 形状变化。
