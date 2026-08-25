[Model: gpt-5.6-sol-xhigh-fast]
round: R1
role: probe
scope: 无障碍 / 键盘 / 空态 / 窄屏（只读）
done:
- 对照 `docs/design/DESIGN-CONTRACT.md`、`frontUI2.md` 静态扫描 details/summary、dialog/drawer、tablist、FileDropzone、工作台空态、顶栏图标、检查器 boolean-control 与 `<=760px` CSS；未改 `src/`。
open:
1. [P1][键盘] `src/components/FileDropzone.tsx`：可用态的唯一原生控件是带 `hidden` 的 `<input type="file">`，外层 `<label>` 没有 `tabIndex`/按钮语义/键盘处理；禁用态又把 `aria-disabled` 放在普通 label 上。复现：打开名单、素材、画布背景或字体上传，连续 Tab，焦点会跳过整块“点击或拖拽”控件；鼠标点击却能打开文件选择器。禁用时拖放确实被拦截，但屏幕阅读器拿不到“这是一个已禁用上传控件”的可靠语义。现有 `FileDropzone.test.tsx` 所谓 “accessible file input” 只断言 label 关联，没有断言可聚焦性。
2. [P1][dialog] `src/App.tsx`、`src/components/editor/ExportProjectDialog.tsx`：新版聚焦工作区从 `StageLayoutScreen` 提前 return，未挂载 `ExportProjectDialog`；键盘在项目菜单激活“导出工程”后无任何可见结果。切到 legacy content 后虽会出现 `aria-modal="true"` 对话框，但打开时焦点仍在背后的菜单按钮，没有 Tab 陷阱、Esc 关闭或关闭后焦点恢复，`aria-modal` 与真实行为不符。复现：默认公开壳层进入名单/地图阶段 → 项目 → 导出工程；再在 legacy content 重复并按 Tab/Esc。
3. [P1][tablist] `src/components/global-data/GlobalDataNavigation.tsx`：非选中 tab 被设为 `tabIndex=-1`，但 tablist 没有 ArrowLeft/ArrowRight/Home/End 处理。复现：打开全局数据工作台，Tab 到“数据总览”，按左右方向键无变化，再按 Tab 直接离开 tablist；“名单管理/数据质量/地图映射/数据展示”只能鼠标点。`GlobalSettingsScreen` 已有正确的 `onTabKeyDown`，可作为同仓库参照。
4. [P1][窄屏遮挡] `src/styles.css`：`<=760px` 把 `.studio-topbar` 改成两行，第二行步骤按钮固定 44px；但 topbar 仍固定 52px（Atelier）/56px（Classic），`StudioEditorShell` 也只减去该单行高度。复现：390px 宽进入任一聚焦阶段，横向步骤条溢出 header 的固定高度并覆盖工作区顶部，首行名单/画布工具落在其下方。320px 同样成立。
5. [P2][tablist] `src/components/StudioAssistantRail.tsx`：三个 `role=tab` 全部保留默认 `tabIndex=0`，也没有方向键处理。复现：桌面左栏或移动 AI 抽屉中 Tab 会逐个经过三个 tab，ArrowLeft/ArrowRight 不切换；这是按钮组键盘行为，却对辅助技术声明为 tablist。
6. [P2][44px/顶栏图标] `src/App.tsx`、`src/components/StudioEditorShell.tsx`、`src/components/StudioAssistantDrawer.tsx`、`src/styles.css`：AI 顶栏入口是无 `icon-button` class 的裸图标 button，虽有 `aria-label`，但没有契约要求的 `title`，也没有移动端 44px 规则；移动右栏浮钮为 40×40，两个 drawer 关闭按钮为 28×28。复现：`<=760px` 查看计算样式并触控 AI、右栏、关闭，命中框均未统一达到 44×44。
7. [P2][details/menu] `src/components/ProjectMenu.tsx`、`src/components/HelpFeedbackMenu.tsx`：native summary 本身可 Tab/Enter/Space 打开，但弹出内容没有菜单焦点管理或 Esc/外点关闭。复现：键盘打开“项目”或“帮助”，Tab 进入内容后按 Esc，details 仍保持 open；继续 Tab 可穿到页面其余控件，不符合 `frontUI2.md`“Esc 关闭菜单”。
8. [误报] 工作台空态与检查器关联：`src/components/workbench/ProjectGrid.tsx` 的空态不是覆盖层，示例按钮和顶栏“新建项目/导入”均为原生 button；`MapInspector.tsx`、`CardsInspector.tsx`、`ProvinceInspector.tsx` 的 `boolean-control` 均由包裹 input 或 `htmlFor/id` 正确关联。原生 details/summary 也不是“键盘到不了”；问题仅限第 7 条的菜单生命周期。
tests:
- `npx vitest run src/components/FileDropzone.test.tsx src/components/StudioEditorShell.test.tsx src/components/StudioAssistantRail.test.tsx src/components/workspaces/ContentLayoutWorkspace.test.tsx src/components/GlobalDataScreen.test.tsx src/App.project-persistence.test.tsx`：6 files / 31 tests 全绿（4.01s）。这些回归确认 disabled drop、MUI drawer Esc/焦点返回、native summary、legacy 导出对话框未退化，同时暴露当前测试未覆盖 FileDropzone Tab、两个 tablist 方向键、新版对话框挂载和 320/390/760px 几何。
p0/p1/p2:
- P0: 0；P1: 4；P2: 3；误报: 1 组。
assumptions:
- 以默认公开壳层为新版路径、`LEGACY_EDITOR_STORAGE_KEY=1` 为 legacy content 路径；窄屏按权威断点 `<=760px`，触控目标按 44×44px。
- 严重度按“核心操作键盘不可达/被遮挡”为 P1，“仍可完成但 ARIA 模式、Esc 或触控面积不合约”为 P2。
do_not_touch:
- 本轮只写探针报告，不修改前端实现、不扩展数据/API/导出格式，也不复述已在其他分支处理的条目。
next:
- 先补 FileDropzone 键盘入口、统一挂载并完善 ExportProjectDialog、实现 GlobalData roving-tab 键盘处理；随后修正移动 topbar 总高度，再收口 tablist、44px 与 details 菜单行为。每项加真实 Tab/Arrow/Esc/焦点恢复断言及 320/390/760px 回归。
