MODEL_SLUG: claude-fable-5-thinking-xhigh

# Round 3 — R3-fable-sota: SOTA 文档 + 自有面板收尾 a11y

分支：`cursor/agent-sota-polish-cbcd`（按指令未提交，改动留在工作树）。
目标：清剿自有文件里残留的无名/图标控件；确认 prefers-reduced-motion 覆盖；USER_GUIDE/README 补跳转链接与 OCR 诚实说明；对自有组件交叉核对 WCAG 2.2 AA。

## 一、改动清单（仅限授权文件）

### 1. `src/components/StudioUi.tsx` — 图标槽位中央化装饰隐藏
- 新增 `decorativeIcon()`：`IconButton` / `CompactButton`（含转发的 `ToolbarButton`）在渲染 `icon` 元素时统一强制 `aria-hidden`（已显式传入者不动，Fragment 跳过）。
- 动机：仓库约定图标由调用方手写 `aria-hidden`，但 MapInspector/TextInspector/AssetInspector/CardsInspector/CanvasInspector/GuestsInspector/GlobalSettingsDrawer 以及**非本 agent 所有的** data-workspace-student-table、AssetPanel、AssetLibraryPanel、studio-editor/* 等十余处漏传。中央化后所有现有与未来调用点一次修复，不需要碰非授权文件。
- 零 DOM/视觉变化（cloneElement 注入属性，不加包装节点；确认 src 无 `> svg` 直接子选择器）。

### 2. `src/components/inspector/GuestsInspector.tsx` — 头像链接输入框命名
- 「头像」span 只是视觉分组标题，未与任何控件关联；头像 URL 输入框此前**没有可及名**（唯一真正的无名控件）。现赋 `aria-label="${person.name} 的头像图片链接"`，span 标记 `aria-hidden`。

### 3. `src/components/inspector/MapInspector.tsx` — 边界风格圆盘键盘化
- Escape 关闭圆盘并把焦点还给「打开边界风格选择器」触发按钮（此前选项卸载后焦点掉到 body）。
- 选中选项后同样还焦触发钮。
- ArrowLeft/Right/Up/Down 在选项间循环移动焦点，Home/End 跳首尾。
- 保持既有 `aria-label` 文案与 `role="listbox"/"option"` 结构不变（测试与调用方兼容）。

### 4. `src/components/workspaces/DeliveryWorkspace.tsx` — Label in Name（WCAG 2.5.3）
- PNG 倍率下拉的可见文字「PNG 倍率」与 aria-label「PNG 导出倍率」不一致（可见文字不是可及名的子串，语音控制用户念出可见标签无法命中）。aria-label 被非本 agent 所有的 `App.test.tsx` 钉死，故把**可见文字**统一为「PNG 导出倍率」。

### 5. `src/components/WorkflowGuide.tsx` / `WorkflowPrototype.tsx` — 装饰图标隐藏
- WorkflowGuide 步骤导航的 lucide 图标容器补 `aria-hidden`（全仓唯一漏网的生产路径图标）。
- WorkflowPrototype（原型页）17 处 lucide 图标与「!」警示点补 `aria-hidden`；所有按钮本就有文字或 aria-label。

### 6. 文档（诚实 UX 说明）
- `USER_GUIDE.md` 功能详解补两句：①「键盘直达画布」——编辑器内按 Tab 首个焦点是「跳到主要内容」链接，回车跳过顶栏进画布（R2 已接线到 `#studio-stage`，本轮只写文档）；②「不提供图片 OCR」——识别 OCR 文本只解析粘贴文字，图片名单先用外部 OCR 工具转文字。
- `README.md` 功能表下补一行同义说明（两句实话）。未发明任何功能。

### 7. 新增/扩展测试（6 个测试文件）
- `StudioUi.test.tsx`：调用点漏传 aria-hidden 时 IconButton/CompactButton 的 svg 仍为 `aria-hidden="true"`，按钮名不受影响。
- `GuestsInspector.test.tsx`：头像链接输入与上传输入的可及名。
- `MapInspector.test.tsx`：圆盘方向键循环（含双向回绕、Home/End）、Escape 关闭还焦、选中后还焦。
- `DeliveryWorkspace.test.tsx`：可见 label 文字与 aria-label 一字不差。
- `WorkflowGuide.test.tsx`：5 个步骤图标容器全部 aria-hidden。
- `WorkflowPrototype.test.tsx`：全部 svg 隐藏 + 每个按钮都有可及名。

## 二、prefers-reduced-motion 审计（要求 2）

结论：**无剩余需要禁用的动画**，全部已被守卫覆盖，本轮无需改 CSS。
- `styles.css` 末尾的全局 `@media (prefers-reduced-motion: reduce)`（R1 加入）把所有 transition/animation 压到 0.01ms、iteration 1，`!important` 覆盖内联样式；`main.tsx` 全局引入。
- `workflow-prototype.css` 自带同款守卫。
- `PosterCanvas.tsx` 经 grep 确认无 `<animate>`、无 CSS transition、无装饰性 rAF；`DisplayFrameSubcanvas` 与 CanvasDragPreview 的 rAF 是指针拖拽的直接操纵反馈（WCAG 2.3.3 essential，例外豁免）。
- 全仓仅存的 2 个 `@keyframes` 是 spinner（agent-assistant / asset-panel，非本 agent 面板），已被全局规则冻结。

## 三、验证证据（failure → cause → fix → recheck）

本轮开发期间**没有出现红色的测试/类型/构建状态**（改动均为增量 ARIA 属性与事件，先读齐上下文并核对了钉死断言——`App.test.tsx` 的 `select[aria-label="PNG 导出倍率"]`、MapInspector.test 的圆盘 aria-label——再动手，避免了两处本会破坏非授权测试的改法：改 aria-label 而不是可见文字、改 listbox 角色）。如实记录：无 failure 链可写。

最终证据（全部在 MapInspector/Delivery 改动之后复跑）：
```
npx vitest run src/components/workspaces src/components/inspector \
  src/components/WorkflowGuide.test.tsx src/components/WorkflowStageStepper.test.tsx \
  src/components/StudioUi.test.tsx src/components/canvas/PosterCanvas.test.tsx
→ Test Files 18 passed (18)，Tests 152 passed (152)
```
- 回归（IconButton/CompactButton 中央化影响非授权消费者）：`WorkflowPrototype.test.tsx`、`StudioUi.controls.test.tsx`、`GlobalSettingsDrawer.test.tsx`、`DataWorkspace.test.tsx`、`components/App.test.tsx`、`src/App.test.tsx`、`AssetPanel.test.tsx`、`StudioEditorShell.test.tsx`、`StudioTopbar.test.tsx` → **8 文件 203 用例全绿**。
- `npx eslint`（全部 12 个触碰的 src 文件）→ 0 error 0 warning。
- `npx tsc -p tsconfig.app.json --noEmit` → 0 error（含工作树内其他 R3 agent 的在途改动）。

## 四、验收方式与回滚（交付纪律）

- **验收**：跑上方 vitest 命令（18 文件 152 用例）+ 手动走查——NVDA/VoiceOver 下检查器的图标按钮不再出现无名 graphic；嘉宾行头像链接框朗读「王老师 的头像图片链接」；边界风格圆盘方向键循环、Escape 关闭回触发钮；系统开启「减弱动态效果」后界面无过渡动画；USER_GUIDE/README 的两条说明与实际行为一致。
- **回滚**：全部为 ARIA 属性、键盘事件与文档文字的增量修改，无数据/导出格式/API 形状变更；逐文件 `git checkout --` 即可，无迁移成本。

## 五、遗留 SOTA 缺口（如实，含越权项）

1. **ThemeToggle** 动态 aria-label + aria-pressed 组合仍矛盾（R1 报过；label 被非授权 `App.test.tsx` 钉死，需跨 agent 协调）。
2. **`.studio-advanced__element-list`**（StudioAssistantRail）listbox + Tab 聚焦 option 的非规范模式仍在：文件本身授权，但 `App.test.tsx`（禁改）按 `[role="option"]` 查询，改角色需协调。
3. **边界风格圆盘**保留 `role="listbox"/"option"`＋全部选项可 Tab（未做 roving tabindex）；已补方向键/Escape，属 APG 最佳实践偏差而非 AA 违规。
4. **ProjectMenu**（非授权）存在同款「PNG 导出倍率」Label-in-Name 问题（其可见文字在 `<summary>` 结构里），移交所有者。
5. 嘉宾行「显示」checkbox 逐行同名，仅靠 `${person.name} 操作` 组名区分——可用但非最优。
6. MUI Drawer 关闭仍走 JS timeout 时长（reduced-motion 下无可见动画，纯延迟小疵，R1 已记录）。
7. `DisplayFrameSubcanvas` 缩放手柄是纯指针交互；键盘等价物为检查器的宽/高输入框（可接受，记录在案）。
