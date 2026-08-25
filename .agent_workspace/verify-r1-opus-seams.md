# Round 1 Agent C (opus-fast) — 合并腐坏猎捕

**MODEL:** `claude-opus-5-thinking-high-fast`
**Base:** `388eafc`(`Merge branch 'cursor/merge-all-branches-e17a'`,双亲 `897a2a6` + `d6eac6b`)
**工作分支:** `cursor/fix-export-interruption-seam-8044`(自 `cursor/verify-merged-code-e17a` 切出)
**提交:** `70f95b9` `fix(export): 别让插队的 SVG/工程包吞掉在途的 PNG`(**未 push**,按任务要求)

## 结论(TL;DR)

**找到并修复了 1 个真实缺陷,就在任务点名的 ProjectMenu 导出接缝上。**

合并 `08c88b4` 给 ProjectMenu 的「导出 PNG」补了 `exportState` 置灰,prop 注释写明理由是
「任一导出在途时置灰……导出互相打断会毁掉正在写的那一份文件」——但紧挨着的「导出 SVG」
没有一起接上。那扇没关的门恰好触发 `c1b4fc7` 引入的导出代次守卫的两个副作用:
**用户点过的 PNG 从未落盘**,以及 **`exportingPng` 永远停在 `true`**。
两条都用先失败后通过的用例钉住了。

任务点名的另外三项**均未发现问题**:行数闸门清单与实际行数**逐条精确相符**;
无测试导入已删文件;`publicDemo` / `StageLayoutScreen` 接缝正确。
7 个孤立组件确认为**合并前既有**,不属本轮范围(与 `verify-r1-opus-types.md` §5.2 独立复核一致)。

---

## 1. 缺陷:插队的导出会吞掉在途的 PNG

### 复现路径(用户可走到)

项目菜单 →「导出 PNG」(异步:等字体加载 + SVG→PNG 编码)→ 在编码完成前点同一个菜单里的
「导出 SVG」。结果:

1. **PNG 从未落盘。** 界面只说「SVG 已导出」,用户等来的 PNG 不存在,**也没有任何报错**。
2. **`exportingPng` 卡死为 `true`。** 旧版编辑器顶栏(`LegacyEditorTopbar:122`)与右栏
   (`LegacyEditorSidebar:272`)的 PNG 按钮此后一直显示「导出中...」。

### 根因

`usePosterExport.exportPng` 里代次守卫的两处判断都建立在「被顶掉 = 这一轮整个作废」上:

```ts
const blob = await svgToPngBlob(source, { ... });
if (!isCurrent()) return;          // ← 在 downloadBlob 之前就返回了
downloadBlob(blob, fileName);
...
} finally {
  if (isCurrent()) setExportingPng(false);   // ← 被顶掉就永不复位
}
```

而 `exportSvg` / `exportProjectPackage` 都会 `exportGenerationRef.current += 1`,
于是 SVG 一插队,在途 PNG 的 `isCurrent()` 立刻为假。

守卫**自身的注释**与 `c1b4fc7` 的提交说明写的都是「先发起的那次落地后**不再改状态**」——
它的本意是状态仲裁,不是丢产物,也不该管 `exportingPng` 的归还。实现越过了自己的契约。

### 这算不算合并腐坏

算,而且是「解法只做了一半」这一类:

- `c1b4fc7`(T9 blob 导出流水线)经 `5f7c377` 进入本合并系列,**不在合并前的 main 上**
  (`git merge-base --is-ancestor c1b4fc7 897a2a6` 为假)。
- `08c88b4` 的合并记录(`r2-opus-ux.md` §3.2)明确写着这次接线是为了满足
  `App.export-busy.test.ts` 的「任一导出在途时所有 PNG 入口一起置灰」。
  但那条守卫是**源码扫描**,只认 `<ImageDown` + 「导出 PNG」的按钮,
  于是 SVG 入口天然在它视野之外,合并接线也就停在了那里。

也就是说:合并作者点名了「导出互相打断会毁掉正在写的那一份文件」这个危险,
只关上了其中一个方向,而另一个方向正是它真正发生的方向。

### 修复

把原来一个代次量在管的三件事拆开,各自回答一个问题:

| 量 | 回答的问题 | 变化 |
| --- | --- | --- |
| `exportGenerationRef` | 谁能写导出状态与提示 | **行为不变** |
| `latestPngGenerationRef` | 这份 PNG 还要不要落盘 | 新增 |
| `pngExportsInFlightRef` | 有没有 PNG 在途(`exportingPng`) | 新增,计数而非代次 |

- **落盘**改由 `latestPngGenerationRef` 判定:**只有更晚的另一次 PNG** 才让这份成为多余的
  文件;SVG / 工程包是另一份东西,顶掉状态但不顶掉产物。
- **`exportingPng`** 改成在途计数,`finally` 里减到 0 才复位——被顶掉的那一轮同样交还占用。
- **ProjectMenu 的「导出 SVG」**按同一个 `exportState` 置灰,与 `DeliveryWorkspace`
  三个导出入口(PNG / SVG / 工程包)的既有口径对齐。

**刻意保留的既有约定:** PNG 被更晚的 PNG 顶掉时不重复落盘。原用例
`ignores a stale png export that settles after a newer one` 未修改且仍然通过。

### 新增用例(3 条)

| 用例 | 钉住的行为 |
| --- | --- |
| `usePosterExport` › `still writes the png when another kind of export starts mid-flight` | SVG 插队后 PNG 仍落盘;同时确认代次守卫仍生效——晚落地的 PNG 不改写 SVG 的状态与提示 |
| `usePosterExport` › `releases the png busy flag even when a later export supersedes it` | 工程包插队后 `exportingPng` 回到 `false` |
| `ProjectMenu` › `greys out both poster exports while one is in flight` | 两个海报导出入口同时置灰 |

## 2. 验证证据链(failure → cause → fix → recheck)

1. **failure** —— 先写用例、先看它红:
   `still writes the png…` 报 `[svg] ≠ [svg, png]`(PNG 确实丢了);
   `releases the png busy flag…` 报 `expected true to be false`;
   `greys out both…` 报 SVG 按钮 `disabled` 为 `false`。三条都精确复现了预测的现象。
2. **cause** —— 见 §1「根因」:`if (!isCurrent()) return` 位置早于 `downloadBlob`,
   且 `finally` 的复位也挂在同一个判断上,而 `exportSvg` / `exportProjectPackage` 会推进代次。
3. **fix** —— 见 §1「修复」。
4. **recheck** —— 一次中途修正也记在这里:第一版把 `downloadBlob` 无条件提到守卫之前,
   **弄红了既有用例** `ignores a stale png export that settles after a newer one`
   (`expected length 1, got 2`)。查因发现该用例的「陈旧导出」实际会经
   `loadPosterImage` 的 data-URL 兜底重试而**成功**,旧代码是靠抑制落盘把它藏住的;
   即 PNG→PNG 不重复落盘是一条被钉住的既有约定。据此改为按 `latestPngGenerationRef`
   区分「被更晚的 PNG 顶掉」与「被别的导出顶掉」,该用例恢复通过。

最终复检:

| 检查 | 结果 |
| --- | --- |
| `npx tsc -b --noEmit` | exit 0,无输出 |
| `npm test` | **351 files / 2414 passed \| 2 skipped**(基线 2411,+3 为本轮新增) |
| `npm run lint` | **0 errors / 5 warnings**,与基线逐条相同(DataImportConsent ×1、DataWorkspace ×1、ReferenceCardVisual ×3),无新增 |
| `npx vitest run scripts/file-size-ratchet.test.ts` | 5 passed;改动的 4 个文件最大 354 行,均在 400 行闸门内,无需动 allowlist |

## 3. 未发现问题的三项(逐项给证据)

### 3.1 行数闸门清单 vs 实际行数:**逐条精确相符**

`git ls-files -z -- '*.ts' '*.tsx' '*.css' '*.mjs' | xargs -0 wc -l | sort -rn` 与
`scripts/file-size-allowlist.json` 对照:超过 400 行的文件**恰好 29 个**,与清单条目
**一一对应且数字完全相等**(3804 / 2951 / 2944 / 1662 / 1011 / 979 / 948 / 923 / 865 /
846 / 799 / 766 / 760 / 754 / 748 / 705 / 676 / 606 / 601 / 555 / 555 / 508 / 452 / 418 /
416 / 403 / 403 / 402 / 401)。既无虚报(允许比实际大 = 偷偷留出增长余量),
也无失效条目。`server/ai-routes.test.ts` 正好 400 行,压线合规。

闸门覆盖面也查了:`*.js` / `*.jsx` / `*.cjs` / `*.mts` / `*.cts` / `*.html` / `*.py`
在本仓最大的是 `demo.html` 266 行,没有藏在 glob 之外的超限源文件。

### 3.2 导入已删文件的测试:**零条**

`npx tsc -b --noEmit` 通过,而 `tsconfig.app.json` 的 `include: ["src"]` 把
`*.test.ts(x)` 一并纳入——悬空导入会直接编译失败。`git grep` 冲突标记
(`<<<<<<<` / `=======` / `>>>>>>>`)在 `src` / `server` / `scripts` / `docs` 下 **0 命中**。
全仓仅 1 处 `it.skip`,是 `server/collaboration.test.ts:7` 的
`COLLAB_AUTH_BENCH` 环境开关(压测专用),不是被合并悄悄关掉的用例。

另外扫了「拆分后失去断言的用例」:遍历全部 `*.test.ts(x)` 找不含 `expect` 的 `it` 块,
8 处命中**全为误报**,逐一核实后都是走共享断言助手
(`assertHardConstraints` / `expectPackError`)。

### 3.3 `publicDemo` / `StageLayoutScreen` / ProjectMenu 类型接缝:正确

- **`publicDemo`** —— `ProjectWorkbench` 默认值 `publicDemo = isPublicDemoBuild()`
  (`public-base-path.ts` 读 `VITE_PUBLIC_DEMO === "1"`),横幅与 AGPL 源码链接在
  `ProjectWorkbench.tsx:299`,用例在 `ProjectWorkbench.listing.test.tsx:29`
  经装置第 4 个参数注入。`f9560ab` 的合并新增行(`++`)与该装置签名一致,无遗留。
- **`StageLayoutScreen`** —— 逐槽核对五个阶段。`project` vs `renderProject` 的分配
  自洽:右栏(检查器,编辑真值)用 `project`,中栏(画布,含 AI 预览)用 `renderProject`。
  版式阶段的 `ReferenceCardStyleRail` 只取 `templatePickerProps` 8 个字段中的 6 个,
  漏掉的 `customTemplateRecords` / `templateAuthor` / `onImportTemplateRecord` 是
  **有意为之**(社区模板交换只在内容阶段),与 `r2-opus-ux.md` §6 的记载一致。
- **ProjectMenu 其余部分** —— `08c88b4` / `0745f2f` 两次合并对本文件的手工解法逐行看过,
  协作三态(跳过/裁剪/落盘失败)、终局/离线优先级、昵称 `useState` 均完整保留;
  唯一的洞就是 §1 修掉的 SVG 按钮。

## 4. 排除的线索(留档,免得下一轮重走)

| 线索 | 结论 |
| --- | --- |
| 7 个零引用组件(`AssetLibraryPanel`、`GlobalSettingsDrawer`、`HistoryControls`、`StudioStageShell`、`workspaces/DisplayFrameItemInspector`、`DisplayFrameLayerList`、`FlowFrameEditor`) | **合并前既有**。最后触碰它们的是 `5013191` / `b253b76` / `36c5dd7` / `44312ea`,都远早于合并轮次;`git log -S` 显示引用方在那时就已消失。另有 `WorkflowGuide.tsx` 同属此列(只被自己的用例引用)。不在本轮范围。 |
| `lastNonTemplateStageRef`(`App.tsx:200`)只写不读 | **合并前既有**。读取方在 `b253b76`「unified MUI editor shell」里被删,`rememberStage` 至今写进一个没人读的 ref。`noUnusedLocals` 抓不到(ref 确实「被使用」了)。真实死代码,但非合并引入。 |
| `scripts/**/*.ts` 不在任何 tsconfig project 内 | 与 `verify-r1-opus-types.md` §5.1 独立撞见同一处,该报告已用 worktree 证明为合并前既有。不重复处理。 |
| `run-heavy.mjs` 疑似吞掉子进程退出码 | **误报,已证伪**。首次观察到的 exit 0 是我把命令管进了 `tail` 所致。直接运行:`node scripts/run-heavy.mjs definitely-not-a-real-binary` → 127,`node scripts/run-heavy.mjs node -e 'process.exit(3)'` → 3。退出码传递正常。 |
| `DataUploadWorkspace` 里 `hideDataExpression` 既由 `StageLayoutScreen:202` 传入、又在组件内硬写 | 冗余但无害(硬写在展开之后,结果一致)。非缺陷。 |

## 5. 交付与回滚

- **验收方式:** 上述四条命令在本分支可复现。人工验收走 §1 的复现路径——
  项目菜单点「导出 PNG」,在导出中确认「导出 SVG」已置灰;
  若绕过 UI(例如旧版编辑器的工程包对话框)让别的导出插队,PNG 仍应正常落盘。
- **回滚:** `git revert 70f95b9`。**无数据、导出格式、API 形状变更**:
  导出文件名规则、产物格式、`UsePosterExportResult` 的公开形状都没动,
  新增的三个 ref 全是模块内部量。ProjectMenu 唯一的对外变化是 SVG 按钮多了 `disabled`。
- **未 push**,按任务要求。分支 `cursor/fix-export-interruption-seam-8044` 停在本地。
