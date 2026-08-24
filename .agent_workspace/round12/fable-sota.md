# R12-fable-sota — 数据阶段「指定省份」读屏零反馈：补持久 polite live region

MODEL_SLUG: claude-fable-5-thinking-xhigh

## 改动文件（均在允许清单内）

- `src/components/workspaces/DataUploadWorkspace.tsx`（301 行，≤400）
- `src/components/workspaces/DataUploadWorkspace.test.tsx`（398 行，新增 1 个用例，12/12 通过）
- `USER_GUIDE.md`（「导入学生名单 · 匹配失败时」条目补一句播报说明）
- ContentLayout / MapStyle 两个工作台**审计后未改**（见下），符合「挑一个真实洞」的约束。

## 洞的定位（grep aria-live / htmlFor / role=status 后逐台核查）

- **ContentLayoutWorkspace / MapStyleWorkspace**：画布选中播报已有
  PosterCanvas 的 `[data-canvas-selection-announcement]`（polite），且两台
  测试都钉住了（MapStyle 测试 L121、ContentLayout 测试 L134）；检查器焦点
  目标带 `aria-label="当前对象属性：…"`；两台自身没有对话框，无焦点返回洞。
- **DataUploadWorkspace**：导入错误已有 FileDropzone 的 `role="status"`
  错误行；定位动作已有焦点落行 + 被筛隐藏提示（既有测试覆盖）。
- **真实洞（本轮修）**：地图映射面板的「指定省份」按钮点击后：
  1. 可见反馈只是按钮文字闪成「已指定」1.6 秒，但按钮带
     `aria-label="为 X 应用省份覆盖"`，aria-label **覆盖了可见文字**——
     读屏用户对这次成功操作得到的反馈是零；
  2. 更糟：`MappingIssueRow` 的 key 含学生当前省份
     （`${issueId}-${province}`），真实应用里 `onUpdateStudent` 落库后该行
     **整体重挂载**，任何行内 live region 都会随之消失，播报不可靠。

## 修复（全部在组件内，不碰布局算法 / DataWorkspace / FileDropzone）

- `DataUploadRail` 增加 `mappingAnnouncement` 状态，在 tablist 之后、tab
  条件渲染**之外**放一个持久的
  `<span class="sr-only" role="status" aria-live="polite" data-mapping-announcement>`
  （复用仓库既有 `.sr-only` 与 DeliveryWorkspace R11 的同款模式）。放在
  条件外有两个原因：区域必须先于变更存在于 DOM 才可靠播报；切换到素材库
  tab 再切回时不重挂载，避免旧文案被部分读屏重复播报。
- `MappingIssueRow` 新增 `onAnnounce` 回调，`applyProvince` 成功后播报
  `已为 {姓名} 指定省份：{省份}`。按钮的可见「已指定」闪现与 aria-label
  均保持原样（不改既有交互状态）。

## 测试（新增 1 例）

"announces an applied province override through a persistent polite live region"：

- 断言交互前区域已存在且为空、`role="status"` + `aria-live="polite"` +
  `sr-only`、**不在** `.data-upload-workspace__mapping-row` 内（钉住
  「行重挂载也不丢区域」的设计约束）；
- 输入火星省 → 点应用 → 断言 `onUpdateStudent` 收到 patch 且区域文本为
  `已为 林舟 指定省份：火星省`，节点仍 `isConnected`；
- 切到素材库 tab 后断言仍是同一个节点（未重挂载）。

## 验证（failure → cause → fix → recheck）

1. `npx vitest run` 三个工作台测试 → 3 files / 22 tests 全过
   （DataUpload 12 = 11 旧 + 1 新；ContentLayout、MapStyle 不变）。
2. **failure**：`npx tsc --noEmit -p tsconfig.app.json` 在共享工作区报 4 个
   错误。**cause**：全部位于 `src/lib/binary-import.ts(.test)`——R12-fable-arch
   正在同分支进行中的拆分（`parseHtmlTableRows` 尚未落地），与本轮文件无关
   （`git status` 证实六个代理并行改动）。**fix**：不能动 git 状态，改用
   `git archive HEAD`（只读）导出干净快照到 /tmp，仅覆盖本轮 3 个文件后
   重跑同一命令。**recheck**：0 错误（TSC-CLEAN-OK）。
3. `npx eslint` 本轮 2 个文件 + ContentLayout/MapStyle → 0 问题。

## 验收方式与回滚

- 验收：数据与素材页右栏「地图映射」，用读屏（VoiceOver/NVDA）给未定位
  学生输入省份并点「指定省份」——应立即听到「已为 某某 指定省份：某省」；
  不用读屏时界面与之前逐像素一致（区域是 sr-only）。
- 回滚：纯播报补充，无数据/导出格式/API 形状变更；revert 本轮 3 个文件即可。

## 留给后续轮的候选洞（本轮按规则只修一个）

- 同文件「省份分布」网格 `role="list"` 的子级 chip 缺 `role="listitem"`
  （ARIA 要求 list 拥有 listitem 子级），属缺角色类小洞。

按指令未 commit / 未 push。
