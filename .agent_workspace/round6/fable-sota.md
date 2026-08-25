MODEL_SLUG: claude-fable-5-thinking-xhigh

# Round 6 — R6-fable-sota: AgentAssistant 拆分（UI vs 会话胶水）+ 遗留 a11y 清账

分支：`cursor/agent-sota-polish-cbcd`（按指令未提交，改动留在共享工作树；工作树内其他 R6 agent 的在途文件——`server/collaboration*`、`src/components/canvas/map-*`、`asset-panel-*`、`useCollaborationRoom*` 等——均未触碰）。

## 一、改动清单（仅限授权文件）

### 1. 拆分：`AgentAssistant.tsx` 607 → **375 行**（UI 与会话胶水分层，行为零变化）

| 文件 | 行数 | 职责 |
| --- | ---: | --- |
| `AgentAssistant.tsx` | 375 | 容器/胶水：`AssistantConversationProvider`（App.tsx 从此路径导入，禁改文件，故 Provider 留在原处）、hydrate/持久化/digest 变更 rebase 等全部 effect、run/continue 会话循环、toggle/apply/select 处理器、docked 与 floating 组装 |
| `agent-assistant-model.tsx` | 157 | 会话模型：类型（`AssistantConversation`/`Mode`/`ConversationStatus`）、`READ_ONLY_TOOLS`、restore/persist/rebase/create 纯函数、`AssistantConversationContext` + `useAssistantConversationState()` 钩子（无组件导出，react-refresh 零警告） |
| `agent-assistant-conversation-view.tsx` | 111 | 纯展示：对话历史 + 模式单选 + 输入区 + 修改预览，全部经 props 回调，无状态无副作用 |
| `agent-assistant-window.tsx` | 80 | 悬浮窗外壳：标题栏四个动作钮 + 指针拖拽/clamp（位置状态仍在 Provider，最小化后保留，与原实现一致） |

- 所有类名、`data-agent-presentation`、`role="dialog"`、aria-label、localStorage 键、进度/失败文案原样保留；23 个存量用例未改一行断言全绿。
- 唯一结构性简化：docked 占位会话由 `{ ...createConversation(...), id: "docked-initializing", title: "AI 对话" }` 构造，字段值与原 17 行字面量逐项相同（digest 同为当前项目指纹）。
- clamp resize 监听原来由 `open && position` 门控；窗口组件仅在 open 时挂载，门控等价（effect 内仍查 `position`）。

### 2. a11y 修复（AgentAssistant 侧）

- **惰性 aria-label 生效**：`.agent-assistant-history` 的 `aria-label="对话历史"` 原挂在无角色 div 上（多数 AT 忽略），补 `role="group"`（与 R5 在 MapInspector 的同类修法一致）。
- **当前对话不只靠视觉**：活动对话的历史按钮补 `aria-current="true"`（原来只有 `.is-active` 高亮）。
- **无未命名图标钮**：逐项审计 launcher/标题栏四钮/取消/确认/checkbox/textarea/radio——R3 起已全部有可及名，本轮以审计测试钉死（见 §4），防回归。

### 3. `StudioAssistantRail.tsx` — option-on-button：**决策为「保留 + 钉死」而非改宿主**（任务要求 2 的文档义务）

`role="option"` 仍落在原生 `<button type="button">` 上，理由：

1. **无一致性违规**：ARIA in HTML 允许 `button` 承载 `option` 角色（axe `aria-allowed-role` 通过）；option 角色在无障碍树中完全覆盖按钮语义，读屏正常播报为列表选项，不存在双重语义暴露。
2. **原生行为白拿**：可聚焦性与 Enter/Space 激活来自浏览器原生按钮实现；换成 `div[role="option"]` 必须手写键盘激活，纯增风险零收益。
3. **样式所有权**：`styles.css:2733` 与 atelier 皮肤 `:3026` 以 `.studio-advanced__element-list button` 元素选择器钉住样式，styles.css 非本轮授权文件，换宿主会静默破坏视觉。
4. 测试钉的是 `[role="option"]` 选择器 + roving tabindex 契约（本就正确）；本轮新增**宿主元素契约用例**把「原生 button + type=button + 有可及名 + aria-selected 二态」显式钉死，并在 JSX 留注释说明改宿主的前置条件（先改测试与样式）。

代码改动仅为该 listbox 处的决策注释扩写；rail 其余控件审计无未命名项（返回/各 advanced 动作钮均有 aria-label 或文本）。

### 4. 测试（+3 用例；AgentAssistant 23→25，StudioAssistantRail 8→9）

- `AgentAssistant.test.tsx`：① **可及名审计**——最小化态 launcher + 展开态跑完带步骤的会话后，容器内每个 `button` 有 aria-label 或文本、每个 `input/textarea` 有 aria-label 或包裹 label；② **历史组语义**——`role="group"[aria-label="对话历史"]` 存在，新建对话后 aria-current 落在新会话、点回旧会话后跟随。
- `StudioAssistantRail.test.tsx`：③ **option 宿主契约**——listbox 名称、≥4 个选项全部为原生 `<button type="button">`、有可及名、aria-selected 为 true/false 二态。

## 二、钉死契约核对（动手前逐一确认）

- `App.tsx`（禁改）`import { AssistantConversationProvider } from "./components/AgentAssistant"` → Provider 留在 `AgentAssistant.tsx`，导出路径不变 ✓。
- `AgentAssistant.test.tsx` 钉的 `.agent-assistant-window/-header/-history/-launcher` 类名、`role="dialog"`、`aria-label="确认应用"/"新建对话"/"最小化 AI 助手"/"重置窗口位置"`、拖拽有限坐标、`docked` 无 launcher → 全保留 ✓。
- `StudioAssistantRail.test.tsx` / `StudioAssistantDrawer.integration.test.tsx` 钉的 `[role="option"]`、roving tabindex、tab 键盘循环 → 未动行为 ✓。
- localStorage 键与记录形状（`cengfan-map-studio:ai-conversations:v1`）→ persist/restore 函数原样搬迁，隐私过滤测试绿 ✓。

## 三、验证证据（failure → cause → fix → recheck）

**故意失败链（证明新测试咬得住）**：临时回退两处 a11y——删 `role="group"`/`aria-current`、删最小化钮 aria-label——复跑新用例：

- 审计用例 ×，断言输出精确点名 `unnamed button: <button type="button" title="最小化 AI 助手">…`；
- 历史组用例 ×，`[role="group"][aria-label="对话历史"]` 为 null。

cause 即被删属性；fix 恢复实现；recheck 复跑全绿。

**外部 tsc 噪声（如实记录）**：`npx tsc -p tsconfig.app.json --noEmit` 报 2 个错误，全部在 `src/lib/useCollaborationRoom.test.ts`——其他 R6 agent 的未跟踪在途文件（git status `??`），非本 agent 所有权；**本轮触碰的 7 个文件零类型错误**。

最终证据（全部改动完成后复跑）：

```
npx vitest run src/components/AgentAssistant.test.tsx src/components/StudioAssistantRail.test.tsx
→ Test Files 2 passed (2)，Tests 34 passed (34)
```

- 消费者回归：`StudioAssistantDrawer.integration.test.tsx` + `src/App.test.tsx` → **2 文件 118 用例全绿**。
- `npx eslint`（7 个触碰文件）→ 0 error 0 warning（模型文件只导出非组件、视图/窗口文件只导出组件，规避 react-refresh 混合导出警告）。
- 行数纪律：AgentAssistant **375**、model 157、view 111、window 80，均 ≤400。

## 四、验收方式与回滚（交付纪律）

- **验收**：跑上方 vitest 命令 + 手动走查——右下角打开 AI 助手，读屏按组导航应播报「对话历史 组」，历史条目播报「当前项」；跑一次会话确认历史/预览/确认应用与拆分前一致；最小化后徽标计数照旧；左栏高级功能 → 元素查看，Tab 只停一次、方向键移动、Enter 选中画布元素。
- **用户可见行为变化**：无（纯拆分 + ARIA 属性增量；aria-current/role=group 对视觉零影响）。
- **回滚**：无数据/导出格式/API 形状变更。`git checkout -- src/components/AgentAssistant.tsx src/components/AgentAssistant.test.tsx src/components/StudioAssistantRail.tsx src/components/StudioAssistantRail.test.tsx` 并删除三个 `agent-assistant-*.tsx` 新文件即可整体还原。

## 五、遗留 SOTA 缺口（如实）

1. **悬浮窗 `role="dialog"` 无焦点管理**：非模态、无 aria-modal，打开时焦点不移入、无 Esc 关闭。补焦点移入会改交互行为（现有拖拽/最小化流测试未钉初始焦点），留给下一轮带用例决策。
2. **历史条目删除缺失**：对话只增不减（localStorage 有上限裁剪，UI 无删除钮）；属功能而非 a11y，越权未做。
3. **拖拽无键盘等价的「移动」**：键盘侧只有「重置窗口位置」兜底（既定结论，维持）；如需 SOTA 可加方向键微调，涉及新交互留所有者决策。
4. R5 已记录的圆盘 listbox「Tab 不关弹层」与 MapLayer 行数问题不在本轮授权内，未动。
