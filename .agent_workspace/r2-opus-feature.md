# Round 2 Agent D — `feature-expansion-research-c710` 合并记录

**Model:** `claude-opus-5-thinking-high-fast`
**Merge commit:** `0745f2f`（parents `361be99` + `cb4bb12`）
**分支:** `cursor/merge-all-branches-e17a`（未 push）

## 执行路径

接手时 `/workspace` 正被另一个 Round 2 agent 占用（`.git/MERGE_HEAD` = `canvas-render-display-46a1`，
索引里挂着未提交的解冲突结果）。为不破坏对方索引，全程在 `/tmp/r2d` 隔离克隆里做，
最后以 fast-forward 落回 `/workspace`。

对方在此期间落了 3 个提交，基线从 `e760174` 前进到 `361be99`。已在新基线上重做整个合并
（同样 13 个冲突），未采用「先合 c710 再合 canvas 线」的双 merge commit，历史保持单个干净的 merge。

## 冲突处置（13 个文件）

总原则：**保留 HEAD 架构，把 c710 的行为移植到 HEAD 拆分后的归属模块**。

| 文件 | 处置 |
| --- | --- |
| `.agent_workspace/PROGRESS.md` | 取 ours |
| `USER_GUIDE.md` | 双方合并：采用 c710 的工程包命名说明 + 保留 HEAD 的画幅预设 / 印刷尺寸两条 |
| `src/App.tsx` | 取 HEAD 三段拆分结构，丢弃 c710 的整屏内联分支；c710 的行为改投下列模块 |
| `src/components/AppProjectMode.test.tsx` | 保留 HEAD 的「不可读 ≠ 已删除」断言，采用 c710 收窄后的 `.workbench-error[role='alert']` 选择器 |
| `src/components/DataWorkspace.test.tsx` | 取 ours（HEAD 已按域拆分），c710 断言另投（见下） |
| `src/components/ProjectMenu.tsx` | 保留 HEAD 的终局/离线/持久化降级判定与 `RoomPersistenceOutcome`，叠加 c710 的 `DisplayNameInput` / `describeRole` / `RoomRoster`；「模式」行保留 HEAD 的 `roomExpired` 分支 |
| `src/components/ProjectWorkbench.test.tsx` | modify/delete：HEAD 已拆成 8 个文件，`git rm`，断言另投 |
| `src/components/ProjectWorkbench.tsx` | 保留 HEAD 的 `ProjectListItem` 元数据视图、`downloadProject`/`exportFromNotice` 双出口与 `reportFailure`；接上 c710 的 `loadSampleProject`（错误改走 `reportFailure`） |
| `src/components/workbench/ProjectGrid.tsx` | 保留 HEAD 的 `ProjectGridItem` 窄类型与空态文案，接上 `onLoadSample` 按钮 |
| `src/lib/project-package.test.ts` | 取 ours；c710 的 `downloadProjectPackage` 用例另投 |
| `src/lib/useCollaborationRoom.ts` | 保留 HEAD 的 `signal` / `notePersistence` / `useCallback` 接线，`COLLABORATION_DISPLAY_NAME` → `loadDisplayName()` |
| `src/lib/usePosterExport.test.tsx` | add/add：取 HEAD 的 blob 环境仿真套件，c710 的命名套件独立成 `usePosterExport.naming.test.tsx` |
| `src/lib/usePosterExport.ts` | 保留 HEAD 的 `svgToPngBlob` + `downloadBlob` + generation 判定，接上 `buildExportFileName` 与 `lastExportFileName` |

## c710 行为的落点（HEAD 已拆分，原位不存在）

- `HelpFeedbackMenu` 顶栏入口 → `src/components/editor/EditorTopbarActions.tsx`
- `getProjectName` → `projectRecord.nameRef.current`（HEAD 的 `useEditorProjectRecord` 持有该 ref）
- 内容与排版右栏的模板交换 → `StageLayoutScreen` 的 `ContentLayoutRail`
- 全局设置整屏的模板交换 → `GlobalSettingsShell`
- `lastExportFileName` → `StageLayoutScreen` 的 `DeliveryRail` / `DeliveryWorkspace`
- PNG 导出忙碌判定（`exportState === "exporting"`）→ `LegacyEditorTopbar` + `LegacyEditorSidebar`
- 去掉 `hideTemplateDownload: true` → `StageLayoutScreen` 的 data 阶段

## 测试断言的落点（HEAD 拆分后按域归位）

- DataWorkspace 的 5 条 live region 用例 → 新建 `src/components/DataWorkspace.live-regions.test.tsx`
- 工作台导出命名 2 条 → `ProjectWorkbench.card-actions.test.tsx`
- `downloadProjectPackage` 2 条 → 新建 `src/lib/project-package.download.test.ts`
- `usePosterExport` 命名 2 条 → 新建 `src/lib/usePosterExport.naming.test.tsx`，另在 HEAD 套件里补 1 条项目名导出用例
- 既有文件名断言随新命名更新：`ProjectWorkbench.backup-export`、`StudioRoutes`、`crash-disaster.integration`、`project-package-file-name`

## 行数闸门（`scripts/file-size-ratchet.test.ts`）

合并首次跑全量时该闸门报 5 处失败。闸门明写 **「Allowlisted counts only ratchet down.
Move the new code elsewhere.」**，因此没有上调任何条目，改为把新代码外移：

| 文件 | 合并直后 | 上限 | 处置 |
| --- | ---: | ---: | --- |
| `src/App.tsx` | 960 | 936 | 模板接线抽到 `src/lib/editor-template-actions.ts`；顶栏动作簇抽到 `src/components/editor/EditorTopbarActions.tsx` → 934，allowlist 下调 |
| `src/styles.css` | 3884 | 3820 | 三段新样式随组件走：`HelpFeedbackMenu.css` / `TemplateExchange.css` / `collaboration/collaboration-identity.css` → 3820 |
| `src/components/DataWorkspace.tsx` | 888 | 885 | 两个 live region 抽到 `src/components/DataMessageRegions.tsx` → 885 |
| `src/lib/project-package.test.ts` | 498 | 452 | 下载用例拆出独立文件 → 452 |
| `src/components/editor/StageLayoutScreen.tsx` | 419 | 400 | 与 `GlobalSettingsShell` 共用 `templatePickerProps()` → 390 |
| `src/components/DataWorkspace.import-recognition.test.tsx` | 448 | 400 | live region 用例拆出独立文件 → 347 |
| `src/lib/useCollaborationRoom.ts` | 846 | 847 | 合并后自然缩短，allowlist 下调到 846 |

顺带消掉的重复：`SYSTEM_TEMPLATE_OPTIONS` 与 id→记录回查原本在两处外壳各写一份，
现在统一在 `src/lib/editor-template-actions.ts`。

## 验证（failure → cause → fix → recheck）

1. **failure** `tsc`：`src/App.tsx(352) Cannot find name 'projectNameRef'`。
   **cause** c710 在 App 里自建了 `projectNameRef`，HEAD 把该 ref 收进 `useEditorProjectRecord`。
   **fix** 改读 `projectRecord.nameRef.current`。**recheck** `tsc -b --noEmit` 通过。
2. **failure** `src/App.export-busy.test.ts` 扫 `src/App.tsx` 只找到 0 个 PNG 按钮。
   **cause** HEAD 已把按钮拆进 `src/components/editor/`，该用例硬编码单文件路径。
   **fix** 改为经 `git ls-files` 扫全部 `src/**/*.tsx`，下次拆分不会再让约束失守。
   **recheck** 单跑通过。
3. **failure** `crash-disaster.integration` 期望 `示例：2026届毕业去向-2026-08-25.json`。
   **cause** 工程包命名改为「项目名-工程包-日期」。**fix** 更新断言。**recheck** 通过。
4. **failure** 行数闸门 5 处。**cause** 合并把新代码堆进已到上限的文件。
   **fix** 见上表，全部外移。**recheck** `scripts/file-size-ratchet.test.ts` 5 passed。

最终（在 `/workspace` 实测，非克隆）：
- `npx tsc -b --noEmit` — 通过
- `npm test` — **347 passed | 2 skipped（2371 tests）**
- `npm run lint` — **0 error**，4 条既有 warning（`DataWorkspace` 的 exhaustive-deps、
  `ReferenceCardVisual` 的 only-export-components，均非本次引入）

## 破坏性变更与回滚

**变更**：工程包导出文件名 `项目名-日期.json` → `项目名-工程包-日期.json`，并加入
非法字符清洗（`\/:*?"<>|`、控制字符、Windows 保留名）与空名回退「我的毕业去向图」。
PNG 文件名加上倍率后缀（`我的毕业去向图-2x.png`）。

**兼容性**：导入侧未变。`.json` 与 `.cengfan` 后缀都能导入，历史导出的
`cengfan-project-*.json` 仍可正常读取。只影响新导出文件的命名。

**回滚方案**：
1. `src/lib/project-package-file-name.ts` 改回 `` `${project.name}-${project.updatedAt.slice(0, 10)}.json` ``；
2. `src/lib/usePosterExport.ts` 的三处 `buildExportFileName` 换回原字面量，并删掉
   `lastExportFileName` 状态（`DeliveryRail` 的成功条会退回「已导出，请到浏览器下载目录查看」）；
3. `src/lib/project-package.ts` 的 `downloadProjectPackage` 默认值换回
   `` `cengfan-project-${pack.exportedAt.slice(0, 10)}.json` ``；
4. 同步回滚 `USER_GUIDE.md` 的工程包说明与上述四个测试文件的文件名断言。

## 交付方式

改动已提交在 `cursor/merge-all-branches-e17a`（按指令未 push）。
验收依据：上述 tsc / vitest 全量 / eslint 三项在 `/workspace` 实测结果。
