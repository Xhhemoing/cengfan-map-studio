[Model: gpt-5.6-sol-xhigh-fast]
round: R1
role: probe
scope: DESIGN-CONTRACT vs 实现、文案一致性（只读：styles.css / ProjectWorkbench / inspector / USER_GUIDE / README）

done:
- 违禁文案扫描：`src/` 内「升学率/就业率/录取率」0 命中；docs 命中全部是合规否定句（"不写升学率"），无违规。
- 工作台空态已覆盖多场景：`ProjectGrid.tsx:37`「做毕业去向、开学合影或校庆班级图」——文档声称的"已做"属实。
- classic/原型残留定位：`workflow-workspaces.css:10-18`（workflow-data-views / workflow-export-button 硬编码色）只挂在 `legacyEditorEnabled` 旧编辑器路径；`workflow-prototype.css`（42 处硬编码色）只被 `main.tsx:49` 原型路由引用。两者非 atelier 主路径 bug，单独归档即可。
- 导出接线复核：透明背景、PNG 倍率、工程包资源开关均共享 `usePosterExport` 单一状态，双入口间无数值 desync（但见 p1-3 的行为不一致）。

open:
- DESIGN-CONTRACT 自称 "visual source of truth"，但 token 表与 styles.css、frontUI2 §8.2 三方互不相同（见 p1-5）。改契约还是改实现需 ASK 裁决，探针不预设答案。

tests:
- 只读轮未跑。落地时对应测试面：`usePosterExport.test`、`DeliveryWorkspace.test`、`workflow-stages.test`、`StudioRoutes.test`/`AppProjectMode.test`（全局设置文案）。

p0/p1/p2:
1. [p1·真实产品] 导出默认 1×，frontUI2 §5.6/§13.3 规定默认 2× PNG：`usePosterExport.ts:86` `useState(1)`；交付主按钮文案也只写「PNG」（`DeliveryWorkspace.tsx:139`），未按规范写「导出 2× PNG」。一处前端接线即可修，不动算法。
2. [p1·真实产品] 两套流程词汇并存：一级步骤条为 名单/地图/版式/内容/交付（`workflow-stages.ts:23-29`），而全局设置内嵌导览仍用旧五步 准备名单/地图呈现/全局布局/局部调整/检查导出（`GlobalSettingsScreen.tsx:77-83`）。用户在"版式"阶段打开全局设置会看到「当前流程：全局布局」，对不上号。
3. [p1·真实产品] 导出入口重复且行为不一致：`ProjectMenu.tsx:177-185` 保留完整「导出海报」（PNG 倍率 + 导出 PNG/SVG），直接违反 frontUI2 §11.3「项目菜单不再重复 PNG/SVG」；工程包导出顶栏路径走确认弹窗（`ExportProjectDialog`，含"未包含资源包"警告），交付栏按钮却直调 `exportProjectPackage` 跳过确认（`StageLayoutScreen.tsx:306`）。
4. [p1·真实产品·暗色] 交付检查状态块硬编码浅色、无暗色覆盖：`workflow-workspaces.css:28,32,39,40,42`（__all-clear #eef7f0、__error #fff7f5、__result #f2faf6、__result button #fff、__check small #6b7d83）。暗色主题只补了 `__issue-list button`（styles.css:1373）。已有 `--status-success/warning/error` token（styles.css:38-40）未被使用。
5. [p1·契约漂移] DESIGN-CONTRACT token 表整体未落地：atelier 实际值（bg #f0f0eb、primary #24665a，styles.css:2318-2348）≠ 契约表（#ece8df、#315f57）；契约的 `--radius-sm/md/lg`、`--shadow-popover/dialog` 在 CSS 中不存在（圆角逐条硬写）；`--editor-line-strong` 被引用（styles.css:2398）却从未定义，border-strong 角色永久回退普通边框。frontUI2 §8.2 是第三套建议色。三方对齐方向需 ASK。
6. [p2·真实产品·术语] 同一对象多名：全局设置导航叫「数据板块」（GlobalSettingsScreen.tsx:53）、检查器标题叫「卡片属性」（CardsInspector.tsx:139）、层级按钮叫「数据框」（CardsInspector.tsx:112）；嘉宾侧「辅助板块/嘉宾板块/嘉宾面板/特邀嘉宾」混用（GuestsInspector.tsx:72,79）。违反契约验收项 same semantic vocabulary。附带：检查器全局设置入口只列 3/6 分区且固定打开 canvas（InspectorPanel.tsx:107）。
7. [p2·毕业季残留·漏网] 空态之外编辑器 UI 仍只讲毕业：`workflow-stages.ts:24`、`stage-overview.ts:99`、`WorkflowGuide.tsx:33,168`（「导入并校验毕业去向名单」）、`PosterCanvas.tsx:885` aria-label「毕业去向蹭饭图编辑画布」。默认海报标题/导出文件名（scene-document.ts:406-407、export-filename.ts:12）属"场景包待做"，本轮勿抢跑。
8. [p2·文档 vs UI] USER_GUIDE.md:15「新建项目→输入班级名称」——实际直接创建「未命名项目」无命名步骤（project-store.ts:98）；USER_GUIDE.md:96「使用『高清 PNG』选项」——实际控件叫「PNG 倍率 1×/2×/3×」。纯文档修订。

assumptions:
- 判定 5 阶段（素材并入内容）是被接受的演进而非 bug：USER_GUIDE 与 workflow-stages 一致，只有 frontUI2 写 6 步；不将其列为独立缺陷。
- 嘉宾默认值三副本（scene-document `createDefaultGuestPanel` y 自适应 vs guest-panel-layout / InspectorPanel 写死 y=780）仅在 guests 缺失且画布高≠1000 时显性，未占 8 条名额，落地统一词汇时可顺手收敛为单一来源。

do_not_touch:
- 一切业务文件与 docs（本轮只写本报告）；支付/闭源 SaaS 方向；场景包与三分钟路径（产品方向须 ASK）；`cursor/fix-advanced-settings-editable-05ab` 已覆盖的高级设置面；海报/导出内容色板（契约明确属项目内容，MapDataLayer 等画布内 hex 不是违规）。

next:
- 建议 R2 落地顺序：#1（默认 2× + 按钮文案，一行级）→ #2/#6（先出一份统一词汇表再批量替换）→ #4（状态块接 --status-* token）→ #3（工程包入口收敛到单一确认路径）→ #5 与 #7 的默认标题部分先 ASK 裁决权威。
