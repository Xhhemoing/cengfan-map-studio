MODEL: claude-fable-5-thinking-xhigh

# Round 3 · R3-F1 · 项 E 实现报告：协作本地昵称 + 角色文字标签（API 零改动）

- **状态**：完成。目标测试 24/24 绿，触达文件 ESLint 0 报错，`tsc --noEmit -p tsconfig.app.json` 0 报错。
- **未提交、未推送**（按指令）。工作区与其他 R3 agent 共享，`git status` 中的其余改动（App.tsx、template-*、WorkbenchHeader 等）不属于本项。

## 文件清单（全部在授权范围内）

| 文件 | 类型 | 内容 |
|------|------|------|
| `src/lib/collaboration-identity.ts` | 新增 | `normalizeDisplayName` / `loadDisplayName` / `saveDisplayName`（localStorage，抛异常回落默认名）、`describeRole`（创建者/编辑者/仅查看 + capability 文案）、`mergeRoomRoster`（自己恒排第一 → owner → editor → viewer → joinedAt） |
| `src/lib/collaboration-identity.test.ts` | 新增 | 16 条：清洗（trim/折叠空白/控制字符/码点截断/emoji 不切半/空回落/幂等）、读写 round-trip、存储异常不抛、角色文案两两不同、名册排序与匿名占位 |
| `src/components/collaboration/DisplayNameInput.tsx` | 新增 | 昵称输入；`useId` 关联 label；连接时 disabled 且文字说明「已在房间内，断开后可修改昵称」；小字「不是账号」 |
| `src/components/collaboration/RoomRoster.tsx` | 新增 | 成员名册：每行文字角色徽标 `.collaboration-members__role` + `aria-label="名字，角色，能力"`；👑 保留但 `aria-hidden`；有匿名成员时一行小字解释成员编号占位 |
| `src/components/ProjectMenu.identity.test.tsx` | 新增 | 8 条：角色文字可见（非仅 👑）、aria-label 三段式、本机昵称显示在自己行、null 角色文案、昵称输入可编辑并归一化落 localStorage、连接时锁定+文字解释、「不是账号」声明、无学生数据（DOM 无名单文本 + localStorage 仅昵称一个键） |
| `src/lib/app-constants.ts` | 编辑 | `COLLABORATION_DISPLAY_NAME` 保留为默认回落；新增 `COLLABORATION_DISPLAY_NAME_KEY = "cengfan-map-studio:collaboration-display-name"` |
| `src/lib/useCollaborationRoom.ts` | 编辑 | create/join 改为请求时读取 `loadDisplayName()`（改名对下一次建房/加入生效，不发新请求） |
| `src/components/ProjectMenu.tsx` | 编辑 | 协作浮层：两分支各插 `DisplayNameInput`；角色摘要改用 `describeRole`；成员 `<ul>` 整段替换为 `<RoomRoster>`；昵称状态为组件内本地偏好（原始输入进 state，归一化值进 localStorage） |
| `src/styles.css` | 编辑 | 末尾 +8 行：昵称输入区、角色文字徽标、名册容器 |

**边界自检**：`git diff --stat server/` 为空；`src/App.tsx` 本项零改动（当前 diff 属 R3-O2/R3-G1）；`RoomMember` 协议未动；无支付/账号字段；昵称不进 `ProjectDocument`、不进任何 URL。

## failure → cause → fix → recheck

### 链 1：主 TDD 循环（先红后绿）

- **failure**：先写两份测试再跑 `npx vitest run src/lib/collaboration-identity.test.ts src/components/ProjectMenu.identity.test.tsx` → **7 failed | 1 passed**。lib 侧全红：`Cannot find module './collaboration-identity'`；组件侧红在无昵称输入、无 `.collaboration-members__role`、aria-label 缺失。唯一先绿的是「正在确认权限」文案守卫（现状已有该文字，属回归锚点）。
- **cause**：功能尚不存在——`collaboration-identity.ts` 未创建；`ProjectMenu` 成员行只有 clientId 切片 + 括号角色，无文字徽标结构、无 aria-label、无昵称输入。
- **fix**：按上表实现 4 个新文件 + 4 处编辑。关键取舍：① App.tsx 被禁改，昵称 state 放 `ProjectMenu` 组件内（`useState(() => loadDisplayName())`），hook 在请求时直接读 localStorage，两者经同一 `normalizeDisplayName` 收敛；② 截断上限 20 码点（指令「max ~20」；`Array.from` 按码点切，不产生半个代理对）；③ 控制字符用 `\p{Cc}` 而非 `\p{C}`，避免删掉 ZWJ 把组合 emoji 拆散。
- **recheck**：同一命令重跑 → 23/24 绿，剩 1 红进入链 2。

### 链 2：jsdom 重复 id 导致查询失效

- **failure**：`keeps project student data out of the popover and out of storage` 红：`TypeError: 'set value' called on an object that is not a valid instance of HTMLInputElement`（对 null 调 value setter）。
- **cause**：该测试同时挂载两个 `ProjectMenu`（一连接、一未连接），两个 `DisplayNameInput` 都用写死的 `id="collaboration-display-name-input"`。jsdom 的选择器引擎（nwsapi）对 `#id` 查询走 `getElementById` + 包含性检查的快路径：重复 id 时命中文档序第一个（第一个菜单内），对第二个容器做包含性检查失败 → 返回 null。
- **fix**：改 `DisplayNameInput` 用 React `useId` 生成实例唯一 id（仓内既有范式：`FileDropzone.tsx:41`、`StudioAssistantDrawer.tsx:25`、`SearchCombobox.tsx:27`），顺带消除真实产品里双顶栏同挂菜单时的潜在重复 id；测试改为按 `.collaboration-display-name input` 查询，并新增断言 `label.htmlFor === input.id` 保住可点击标签语义。
- **recheck**：目标命令重跑 → **2 files, 24/24 passed**。

### 链 3：回归与静态检查

- **failure/风险**：`App.test.tsx:436` 断言 `[aria-label="房间成员"]` 存在；`collaboration-client.test.ts` 断言 create 请求体。改动 `useCollaborationRoom` 与成员列表结构可能破坏。
- **cause**：`RoomRoster` 保留了原 `<ul class="collaboration-members" aria-label="房间成员">` 的类名与 aria-label；client 层签名未动（`displayName` 仍是既有必填参数，只是取值来源变了）。
- **fix**：无需额外修改（结构兼容是实现时的刻意约束）。
- **recheck**：`npx vitest run src/App.test.tsx src/lib/collaboration-client.test.ts` → **126/126 passed**；`npx eslint <8 个触达文件>` → 0 报错（`react-refresh/only-export-components` 满足：两个新组件文件只导出组件，常量在 lib）；`npx tsc --noEmit -p tsconfig.app.json` → 0 报错。未跑全量 `npm test`/`npm run lint`：工作区正被多个 R3 agent 并行改写，全量结果无法归因，且 AGENTS.md 要求重操作勿并行。

## 行为规格（实现结果）

- localStorage 键：`cengfan-map-studio:collaboration-display-name`；写入恒为归一化值（trim、折叠空白、删控制符、20 码点截断），空值回落「本机协作者」；读写异常静默回落，绝不抛。
- 昵称仅在**创建/加入房间时**随既有 `displayName` 字段发出（`useCollaborationRoom` 请求时读取）；改名即存 localStorage，对下一次 create/join 生效——不新增任何 API、不改 SSE。
- 自己行：`昵称（我）`；他人行：`成员 <clientId 前 6 位>`（**接受的差距**：SSE members 事件无 displayName，他人实时昵称本轮不可见，名册下方有文字说明）。
- 角色三通道：文字徽标（创建者/编辑者/仅查看）+ `aria-label="名字，角色，能力"` + 保留的 `data-member-role`；👑 仅装饰（`aria-hidden="true"`），不再被读屏念成「王冠」。

## 验收方式与回滚

- **验收**：`npx vitest run src/lib/collaboration-identity.test.ts src/components/ProjectMenu.identity.test.tsx`（24 绿）+ 手动路径：项目菜单 → 增量协作 → 未连接时改昵称 → 创建房间 → 名册自己行显示昵称、角色为文字、输入框锁定并解释原因。
- **回滚**：revert 本项 diff 即净——无格式/协议/服务端变更；localStorage 残留键 `cengfan-map-studio:collaboration-display-name` 无读取方后无害，删除即回默认名。分级回滚：仅摘除 `ProjectMenu` 中两处 `<DisplayNameInput>` 可保留 hook 能力（仍读 localStorage 或默认名）。
