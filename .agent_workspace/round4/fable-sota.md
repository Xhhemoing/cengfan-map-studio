MODEL_SLUG: claude-fable-5-thinking-xhigh

# Round 4 — R4-fable-sota: ThemeToggle 名/状态修复 + 自有 chrome 收尾 a11y

分支：`cursor/agent-sota-polish-cbcd`（按指令未提交，改动留在工作树；工作树内另有其他 R4 agent 的在途改动，未触碰）。
目标：清掉 R3 遗留的三项自有 chrome 问题——ThemeToggle 名称/状态矛盾、ProjectMenu Label-in-Name、助手栏元素 listbox 非规范键盘模式。

## 一、改动清单（仅限授权文件）

### 1. `src/components/ThemeToggle.tsx` — 规范切换按钮（WCAG 2.2 / APG toggle）
- 旧契约把两种模式混在一起：动态 aria-label（切换到亮色/暗色模式，说的是**动作**）+ aria-pressed（说的是**状态**），读屏下出现「切换到亮色模式，已按下」这类自相矛盾的播报。
- 新契约：可及名固定为「暗色模式」，状态只由 `aria-pressed`（暗色时 true）表达；`title` 与可及名一字不差（图标钮悬浮提示）。点击行为、图标逻辑、`data-theme-mode` 均不变。
- 新增 `ThemeToggle.test.tsx`（3 用例）：名称跨状态稳定、pressed 正确翻转、title=name、图标 aria-hidden、light↔dark 回调。

### 2. `src/components/ProjectMenu.tsx` — Label in Name（WCAG 2.5.3）全量清剿
- `<summary>`：aria-label「打开项目菜单」→「项目菜单」（以可见文字「项目」开头）。
- 新建项目 / 恢复最近项目 / 保存到本机 / 复制邀请凭证：删除与可见文字不符（「恢复**本机**最近项目」「保存**项目**到本机」）或冗余的 aria-label，可及名即可见文字。
- PNG 倍率下拉：可见文字「PNG 倍率」→「PNG 导出倍率」（与被 App 级测试钉死的 aria-label 一字不差；R3 DeliveryWorkspace 同款修法）。
- 协作触发钮：aria-label 由固定「增量在线协作」（不含可见文字「增量协作」，连接后更与房间码无关）改为动态 `roomId ? 增量协作房间 ${roomId} : "增量协作"`——两种状态下名称都包含可见文字。
- 强制保存钮：空闲名「强制保存到浏览器本地」被**禁改的** `AppProjectMode.test.tsx` 钉死，故改**可见文字**「保存到本机」→「保存到浏览器本地」（取名子串，且描述更准确：确实写的是浏览器存储）；保存中名称跟随可见文字「保存中」（禁用态，钉死查询只发生在空闲态，已逐处核对）。
- 导入工程 file input：aria-label「导入完整工程包」→「导入工程」（与包裹 label 的可见文字一致）。
- 新增 `ProjectMenu.test.tsx`（6 用例）：空闲态与已连接房主态的全量「名称 ⊇ 可见文字」扫描、文字命名按钮无 aria-label 且回调可用、PNG 下拉可见文字=可及名、强制保存双态契约、导入 input 命名+change 回调。

### 3. `src/components/StudioAssistantRail.tsx` — 元素 listbox 规范化（roving tabindex）
- 旧模式：`role="listbox"` 下每个 `role="option"` 按钮都可 Tab、无方向键——非规范（R3 遗留）。角色本身被**禁改的** `StudioAssistantDrawer.integration.test.tsx` 按 `[role="option"]` 钉住，保持不动。
- 新模式：单一 Tab 停靠点（默认为当前选中项，否则第一项），ArrowUp/Down 移动焦点（到端点截停不回绕，按 APG listbox），Home/End 跳首尾，tabindex 跟随焦点；Enter/Space 激活沿用原生按钮行为。进入元素视图时（按钮或本阶段卡片入口）重置焦点记忆。
- `StudioAssistantRail.test.tsx` 新增 1 用例：单一停靠点、方向键移动+tabindex 跟随、Home/End、两端截停。

### 4. `src/App.test.tsx` — 仅改钉死 ThemeToggle/ProjectMenu 可及名的断言（授权范围内，共 9 行）
- 6 处 `[aria-label="增量在线协作"]` → `[aria-label="增量协作"]`（均在未连接态查询，已逐处核对）。
- 2 处 `input[aria-label="导入完整工程包"]` → `input[aria-label="导入工程"]`。
- 1 处主题切换 `[aria-label="切换到暗色模式"]` → `button[aria-label="暗色模式"][aria-pressed="false"]`（顺带把新的非矛盾契约钉在 App 层）。
- 未动任何其他 App 断言。

### 5. 文档
- `USER_GUIDE.md` / `README.md` 未提及任何受影响文案（「保存到本机」「PNG 倍率」「切换到暗色」等均无出现，已 grep 核实），无需改动。

## 二、钉死契约核对（动手前逐一确认）

- 禁改 `AppProjectMode.test.tsx`（3 处）与 `App.test.tsx:623` 查询「强制保存到浏览器本地」都发生在空闲态 → 保留空闲名，只改可见文字。
- 禁改 `StudioAssistantDrawer.integration.test.tsx:91` 断言 `[role="option"]` 数量 > 0 → 保留 listbox/option 角色，改为 roving tabindex。
- `App.test.tsx:1367-1368` 要求菜单文本含「导入工程」「在线协作」→ 两者可见文字均保留。
- `App.test.tsx:1361` 断言无 `[aria-label="在线协作"]`（精确匹配）→ 新名「增量协作」不命中 ✓。
- `WorkflowGuide.test.tsx` 按文本点「保存到本机」→ 那是 WorkflowGuide 自己的按钮；ProjectMenu 项目管理区的「保存到本机」也保留原文，无歧义。
- `ProjectWorkbench` 卡片菜单钮（aria-label「项目菜单」）与编辑器菜单触发器同名，但两者不同路由、从不同时渲染，且无测试跨界查询。
- lucide-react 本版本对无子元素图标默认注入 `aria-hidden="true"`（已查 node_modules 源码），ProjectMenu 图标无需逐个补。

## 三、验证证据（failure → cause → fix → recheck）

本轮开发期间**没有出现红色状态**：动手前先完成上表钉死契约核对，避开了三个本会破坏禁改测试的改法（改强制保存的 aria-label、去掉 option 角色、把导入 input 可见文字改成「导入完整工程包」——最后者会破坏 1367 行的文本断言）。如实记录：无 failure 链可写。

最终证据（全部改动完成后复跑）：
```
npx vitest run src/components/StudioUi.test.tsx src/components/StudioAssistantRail.test.tsx \
  src/App.test.tsx src/components/ProjectMenu.test.tsx src/components/ThemeToggle.test.tsx
→ Test Files 5 passed (5)，Tests 135 passed (135)
```
（该命令在另一 R4 agent 的 App.tsx / studio-editor 拆分改动落入共享工作树**之后**又复跑一遍，结果同样 5 文件 135 用例全绿。）
- 回归（禁改文件的钉死契约）：`AppProjectMode.test.tsx`、`StudioAssistantDrawer.integration.test.tsx`、`ProjectWorkbench.test.tsx`、`WorkflowGuide.test.tsx`、`StudioUi.controls.test.tsx`、`StudioTopbar.test.tsx` → **6 文件 55 用例全绿**。
- `npx eslint`（7 个触碰文件）→ 0 error 0 warning。
- `npx tsc -p tsconfig.app.json --noEmit` → 0 error（含工作树内其他 R4 agent 的在途改动）。
- 行数纪律：ThemeToggle 29 行、ProjectMenu 200 行、StudioAssistantRail 303 行，均 < 400。

## 四、验收方式与回滚（交付纪律）

- **验收**：跑上方 vitest 命令 + 手动走查——NVDA/VoiceOver 下主题钮播报「暗色模式 切换按钮 未按下/已按下」（切换后名称不变、只变状态）；语音控制说「点击 项目 / 增量协作 / 保存到浏览器本地 / 导入工程」均可命中；元素查看列表 Tab 只停一次、上下方向键在选项间移动、Home/End 跳首尾。
- **用户可见文案变化（两处，均为 2.5.3 修复）**：项目菜单里「PNG 倍率」→「PNG 导出倍率」、工程文件区「保存到本机」→「保存到浏览器本地」（后者同时更准确——该按钮写的是浏览器本地存储）。
- **回滚**：全部为 ARIA 属性、键盘事件、按钮文案与测试的增量修改，无数据/导出格式/API 形状变更；逐文件 `git checkout --` 即可（新增的 ThemeToggle.test.tsx / ProjectMenu.test.tsx 直接删除）。

## 五、遗留 SOTA 缺口（如实）

1. **元素 listbox 语义双重性**：`role="option"` 落在 `<button>` 上（角色覆盖原生语义），且选中不跟随焦点（方向键只移焦点、Enter/Space 才选中——APG 允许，考虑到选中有画布副作用是刻意为之）。角色被禁改 drawer 集成测试钉死，彻底改成非 option 语义需跨 agent 协调。
2. **ThemeToggle 图标隐喻**：暗色时显示太阳（表示「点了会变亮」的动作图标），与 pressed=true 的状态语义方向相反；纯视觉惯例问题，非 AA 违规，未动。
3. **强制保存钮保存中名称整体切换为「保存中」**：名称随状态变化（为兼顾钉死的空闲名与 2.5.3 的折中）；禁用态语音用户本就无法激活，风险极低。
4. **MapInspector 边界风格圆盘**仍是全选项可 Tab 的 listbox（R3 遗留，本轮不在授权文件内）。
5. **DisplayFrameSubcanvas 缩放手柄**纯指针交互，键盘等价物为检查器宽/高输入框（R3 已记录，维持结论：可接受）。
6. ProjectWorkbench 卡片「项目菜单」图标钮与编辑器菜单触发器可及名相同——不同路由从不同时渲染，无实际冲突；如后续合流需改名协调（ProjectCard 非本 agent 所有）。
