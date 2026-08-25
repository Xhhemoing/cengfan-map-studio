# Round 2 Agent B(Opus)— `optimize-studio-ux-7077` 合并完成记录

**状态:已完成并提交,未推送(任务要求)。**

- 分支:`cursor/merge-all-branches-e17a`
- 合并提交:`08c88b4` `merge(r2-b): optimize-studio-ux-7077 into decomposed editor (名单→交付)`
- 附带提交:`1d6d064` `chore(r2-b): 摘取 sota-campaign / agent-sota-polish 的独立新模块`
- 上游 tip:`origin/cursor/optimize-studio-ux-7077` @ `373d91b`;`reorder-function-entries-7077` 被其覆盖,已跳过。

接手时 `src/App.tsx` 与 `src/App.test.tsx` 已按 `--ours` 定稿(保留 HEAD 的编辑器拆分),
本轮没有重写 App.tsx——只在其上做了 5 处小接线,详见 §2。

---

## 1. 11 个 UU 文件的逐个解法

| 文件 | 解法 |
| --- | --- |
| `USER_GUIDE.md` | 取 incoming 的五阶段流程叙述,保留 HEAD 的在线演示链接与 `.json` 工程包说明;模板段改写为「版式阶段选样式 + 内容阶段做社区模板交换」,与代码实际位置一致。另修掉正文里残留的「数据与素材」。 |
| `src/components/ProjectMenu.tsx` | 取 incoming 的 `ImageDown` / `onExportPng` / 导出 PNG 按钮五行,完整保留 HEAD 的协作 UI(落盘降级三态、离线、过期、`useState` 昵称、`RoomPersistenceOutcome`)。 |
| `src/components/workflow-workspaces.css` | 取 incoming 的 `__all-clear`,保留 HEAD 在共享 padding 规则里的 `.delivery-workspace__result`(incoming 把它删了,HEAD 仍在用)。 |
| `src/components/workspaces/ContentLayoutWorkspace.tsx` | 取 incoming 的素材库 `<details>`(`aria-label="素材库"`、仅 `selection.type === "canvas"` 时展开),保留 HEAD 的「整体模板与交换」区块。 |
| `src/components/workspaces/DataUploadWorkspace.test.tsx` | 两侧断言取并集:incoming 的模板下载可见 + HEAD 的「数据阶段不承载整体模板选择器」。 |
| `src/components/workspaces/DataUploadWorkspace.tsx` | 取 incoming 的 `hideWorkbenchHeader`(而非 HEAD 的 `hideTemplateDownload`),名单阶段恢复模板下载。 |
| `src/components/workspaces/DeliveryWorkspace.tsx` | 冲突仅在 import:两行都留(`describeExportPrintHint` 是 HEAD 的打印尺寸行,`resolveStudentLocation` 是 incoming 的全绿总结行);其余(`aria-label="交付"`、all-clear、HEAD 的 `DeliveryRail`)自动合并。 |
| `src/components/workspaces/ReferenceCardStyleWorkspace.test.tsx` | 取 incoming 的结构(rail/workspace 拆分、实时画布断言),把 HEAD 那条「只有一个样式格被选中」改写到新 API 上(`renderStage(cardsOverride)` + 在右栏内查询),并删掉 HEAD 遗留的第二套 `mounted` 卸载装置。 |
| `src/components/workspaces/ReferenceCardStyleWorkspace.tsx` | 取 incoming 的三段拆分(`ReferenceCardStyleOptions` / `ReferenceCardStyleRail` / 实时 `PosterCanvas` 工作区),**补回** canvas 合并加的 `data-reference-card-style` 与 `data-reference-card-style-selected` 钩子(incoming 丢了这两个属性)。PosterCanvas 用的是 HEAD/canvas 的现行 props,未回退。 |
| `src/lib/stage-overview.ts` | 取 incoming 的 `data-clean` 下一步动作,保留 HEAD 的 `h.total > 0` 守卫——空名单不算健康。 |
| `src/styles.css` | 取 incoming 的实时画布布局与 760px 断点,保留 HEAD 的 `__copy strong` 字重/字距;丢弃 HEAD 里指向已删除 `__grid` 的两条媒体查询。 |

## 2. HEAD 侧的补齐(incoming 放在 App.tsx 里、我们放到拥有它的模块)

- `src/components/editor/StageLayoutScreen.tsx`
  - 名单阶段:`DataUploadRail` / `DataUploadWorkspace` 去掉 `assetPanelProps` 与 `onCreateDecoration`;`StageLayoutScreenProps.onCreateDecoration` 随之删除(素材库唯一入口回到内容阶段)。
  - 版式阶段:右栏换成 `ReferenceCardStyleRail`(整体模板 + 4 套样式格 + 全局 `CardsInspector`),中栏换成实时 `ReferenceCardStyleWorkspace`。
  - 内容阶段:工具栏「返回地图样式」→「返回地图」。
- `src/App.tsx`(5 处小接线,未动结构):ProjectMenu 的 `onExportPng` 与 `exportState`;
  `mapStyleAssetPanelProps` 更名为 `contentAssetPanelProps` 并纳入 `onCreateDecoration`;
  `StudioAssistantRail advancedMode`;顶栏「历史与缩放」→「历史」;把 `legacyEditorEnabled` 交给导航动作。
- `src/lib/editor-navigation-actions.ts`:新增可选 `legacyEditorEnabled`。公开路径下
  `openStudioSettings` → 版式、`openDataDiagnostics` → 名单、`openRenderSettings` → 内容;
  legacy 仍开全局设置的对应分区。`changeWorkflowStage` 提到返回对象之前以便复用。
- 文案清扫:`src/app-test-harness.tsx` 与 6 个拆分后的 App 测试文件统一改为
  名单/地图/版式/内容/交付、数据质量、版式与展示框样式、历史。legacy 顶栏与
  `App.global-settings.test.tsx` 保留「历史与缩放」(那是 `LegacyEditorTopbar` 的真实文案)。

## 3. 验证纪律(failure → cause → fix → recheck)

跑 `npm test` 时出现 3 处失败,逐条走完四步:

1. **`App.shell-layout.test.tsx` 3 条失败。**
   - 现象:右栏槽位表期望 `版式与版式`;两条 `openGlobalSettingsSection` 在 `null` 上 `dispatchEvent`。
   - 根因:(a) 我做文案清扫时把 `展示框样式 → 版式` 的整表替换排在了 `展示框公共样式` 之后,把已经改好的 `版式与展示框样式` 又吃掉一次;(b) 公开路径按设计已经没有「打开全局设置」按钮,这两条用例的前提失效。
   - 修复:表里改回 `版式与展示框样式`;把「trimmed topbar」那条切到 `renderLegacyApp`,把「public 打开全局设置」那条改写为新契约——点「前往版式」后落到版式阶段且全局设置整屏为 null。
   - 复检:`npx vitest run src/App.shell-layout.test.tsx` → 18 passed。
2. **`App.export-busy.test.ts` 失败。**
   - 现象:新的 ProjectMenu「导出 PNG」按钮没有 `disabled`。
   - 根因:incoming 的按钮没有接导出状态,而 HEAD 有「任一导出在途时所有 PNG 入口一起置灰」的源码扫描约束。
   - 修复:ProjectMenu 新增 `exportState` prop 并据此置灰,App 传 `posterExport.exportState`;守卫正则放宽为 `(?:posterExport\.)?exportState`,因为约束的是「同一个导出状态」而不是它挂在哪个对象上。三个 ProjectMenu 用例的 props 工厂补齐该字段。
   - 复检:`npx vitest run src/App.export-busy.test.ts` → passed。
3. **文件行数闸门 2 条失败。**
   - 现象:`src/App.tsx` 937/934、`src/components/DataWorkspace.tsx` 888/885、`src/styles.css` 3844/3820。
   - 根因:本轮接线与 incoming 的新样式各自加了几行,闸门只许降不许升。
   - 修复:按政策抽出而不是抬 allowlist——`src/lib/editor-asset-panel-props.ts`(素材面板入参装配)、
     `src/lib/roster-search-options.ts`(三个检索适配器,`DataWorkspace` 与 `DataUploadWorkspace` 共用),
     版式阶段样式移入 `src/components/workflow-workspaces.css`。allowlist 按抽出后的实际行数**下调**为
     923 / 865 / 3804。
   - 复检:`npx vitest run scripts/file-size-ratchet.test.ts` → 5 passed。

最终:`npm run typecheck` 无输出;`npm test` **348 passed | 2 skipped**(2382 tests);
`npm run lint` **0 errors**(4 条既有 warning,均非本轮引入)。

## 4. 验收方式与回滚

- 验收:上面三条命令在本分支可复现;人工验收看四条 pin——顶栏五步为名单→地图→版式→内容→交付;
  默认公开态落在 `main[aria-label="名单工作台"]` 且模板下载可见;版式阶段中栏有 `svg.poster`、
  右栏有 4 个样式格与模板选择器;项目菜单「导出 PNG」可用且导出中置灰。
- 回滚:`git revert 08c88b4`。无数据、导出格式、API 形状变更;canvas 合并带来的渲染行为未被改写。
- 附带提交 `1d6d064` 可独立 revert。

## 5. 附带摘取(未整分支合并)

`sota-campaign-6231` 与 `agent-sota-polish-cbcd` 各自带着 App.tsx 重写,按本轮政策不接。
只取三处独立新文件:`DataImportConsent.tsx`(+test)、`use-studio-preferences.ts`(+test)、`print-bleed.ts`。

**注意:三者目前都没有接线**——DataImportConsent 尚未挂到导入路径,use-studio-preferences 尚未被外壳调用,
print-bleed 没有调用方且原分支未附带用例。它们是"先落地、后接入"的模块,接入属于后续任务。

## 6. 遗留与后续

- 「整体模板」在版式阶段右栏与内容阶段右栏各有一个入口(社区模板导入导出只在内容阶段)。
  两处都有用例覆盖,USER_GUIDE 也按此描述;若产品上要收敛到一处,是一次独立的取舍。
- `print-bleed.ts` 无用例,接入时应补。
