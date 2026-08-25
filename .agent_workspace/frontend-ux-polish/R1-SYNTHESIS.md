# LOOP3 Round 1 综合稿

- **模式**: LOOP3 R1 只读 → 本文件为落地唯一指令
- **分支**: `cursor/frontend-ux-polish-05ab`
- **来源**: R1-fable-shell / R1-fable-inspector / R1-opus-data / R1-opus-delivery / R1-gpt-a11y / R1-gpt-copy
- **核于**: 2026-08-25

## 共识（采纳，本轮落地）

同根因已去重。P0 必须做完；P1 能顺手且不撞文件则做，否则留 R2。

| ID | 结论 | 根因（一句话） | 主文件 | 认领自 |
|---|---|---|---|---|
| P0-A | 顶栏「导出工程」死按钮 | `ExportProjectDialog` 写在 `StageLayoutScreen` return 之后，新壳永不挂载 | `src/App.tsx` | delivery + a11y |
| P0-B | 新壳操作无回执 | `statusMessage` 只传给 `LegacyEditorInspector` | `StudioLayoutTemplate` / `StageLayoutScreen` / `App.tsx` | fable-shell |
| P0-C | 空名单没有起点；模板下载被折叠埋住 | `showImport` 初值 `!compactRosterControls`；模板按钮在折叠区内 | `DataWorkspace.tsx` | fable-shell + opus-data |
| P0-D | FileDropzone 键盘不可达 | `<input type="file" hidden>` 退出焦点序 | `FileDropzone.tsx` + `styles.css` | opus-data + a11y |
| P0-E | 缺列表头失败只报术语 | 无样式警告块、不给别名与模板 | `DataWorkspace.tsx` / `binary-import.ts` / `styles.css` | opus-data |
| P0-F | 姓名脱敏 / 字段模板默认 UI 不可达 | `CardPresentationSettings` 只挂 legacy 全局设置 | 版式 `CardsInspector` 高级折叠区挂入 | fable-inspector |
| P1-G | PNG 默认 1×，契约要 2× | `usePosterExport` `useState(1)` | `usePosterExport.ts` | fable-shell + gpt-copy |
| P1-H | 具名画布倍率把厘米说错 | `describeExportPrintHint` 放大像素后掉进 150dpi 兜底 | `print-size.ts` | opus-delivery |
| P1-I | 内容阶段省份字体下拉为空 | `ContentLayoutRail` 未传 `provinces` | `ContentLayoutWorkspace.tsx` | fable-inspector |
| P1-J | 导出忙碌无可见文案 | 仅 aria-busy，按钮文字不变 | `DeliveryWorkspace.tsx` | opus-delivery |
| P1-K | 空名单数据质量夸成「已全部定位」 | `mappingIssues.length===0` 不区分空表 | `DataUploadWorkspace.tsx` | fable-shell |
| P1-L | 体积超限/解析超时进 polite 而不是 alert | `isImportFailureMessage` 关键词漏「过大/超时」 | `import-message.ts` | opus-data |

落地顺序（单 opus，禁止双写）：P0-A → P0-B → P0-D → P0-C+P0-E（同一 `DataWorkspace`）→ P0-F → P1-H 再 P1-G → P1-I → P1-J → P1-K → P1-L。每条先写失败测试再修，跑触及文件的 vitest。

详细 diff 草稿以 `R1-opus-data.md` / `R1-opus-delivery.md` 为准；壳层回执按 `R1-fable-shell.md` P0-1。

## 驳回 / 降级 / 不本轮

| 项 | 处置 | 理由 |
|---|---|---|
| 粘贴「姓名 学校 省份」第三列语义 | **ASK** | 破坏性变更 vs 新控件，产品方向 |
| PDF 导出 | **ASK** | 可能改导出格式 |
| DESIGN-CONTRACT token 三方漂移 | **ASK** | 改契约还是改 CSS |
| 展示框孤儿编辑器复挂 vs 删除 | **ASK** | 产品决策 |
| 地图包围盒不作遮挡受害方 / 文本宽度估算 / focusId | **R2** | 算法体检口径，非「小控件」；可清零示例警告但要单测锁死 |
| 新建工程串阶段 / 步骤条空工程 ✓ | **R2** | 会话键与进度口径，单独测 |
| DeferredInput 越界静默、range 失焦才提交、地图显示假 option、global 重置越权 | **R2** | 检查器族，与本批 DataWorkspace/App 分文件 |
| 名单表格 roving tabindex | **R2** | 与空态同行改 DataWorkspace，避免本批 diff 过大 |
| ProjectMenu 重复导出、AI 双入口、窄屏 topbar 高度、GlobalData tab 方向键 | **R2** | a11y/IA，不挡 P0 |
| `useAiUploadConsent` 未接线 | **排队 AUDIT** | 隐私面，高于 UX P2，单开 |
| 三分钟路径 / 场景包 / 合 main / 合 advanced-settings 分支 | **否决本 LOOP** | 产品方向或合入门 |
| mapBoundaryMargin / safeMargin / summary list-item | **do_not_touch** | 另一分支已修 |

## 分歧

- gpt-copy 把默认 1× 标 P1，fable-shell 同标 P1：采纳，不升 P0（交付仍能导出）。
- a11y 未把 FileDropzone 标 P0，opus-data 标了：升 P0（6 个上传口键盘全死）。
- fable-inspector 把姓名脱敏标 P0：采纳（frontUI2 写明高级设置应可达，默认路径不可达）。

## ASSUMPTION

- 公开默认路径 = 非 legacy。
- 不改 ProjectDocument schema、导出字节格式、支付。
- 上轮 `cursor/fix-advanced-settings-editable-05ab` 不合入。

## 下一轮指令

Round 2 在本批落地并测试绿之后启动：注入**本综合稿全文**，6 路打 R2 残留（体检口径、检查器 DeferredInput、会话分键、a11y 菜单/窄屏）。残留 P0 不得假装结束。
