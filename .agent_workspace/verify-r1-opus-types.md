# Round 1 Agent D (opus-fast) — 合并图谱的静态正确性

**MODEL:** `claude-opus-5-thinking-high-fast`
**Base:** `388eafc`(`Merge branch 'cursor/merge-all-branches-e17a'`,双亲 `897a2a6` + `d6eac6b`)
**Branch:** `cursor/verify-merged-code-e17a`(未新建分支:无编译错误需要修复,故无提交)

## 结论(TL;DR)

**合并后的代码在类型层面是干净的。** `npm run typecheck` 通过,强制全量重建也通过;
1882 条相对导入全部解析到真实文件,零悬空导入;14 个裸包导入全部已安装且已声明。
`print-bleed` 与 `DataImportConsent` 属于「已落地未接线」,但**都在 typecheck 程序内、都是强类型正确的**,
自带用例 19 条全绿。

**未修复任何东西 —— 因为没有发现任何合并引入的编译错误。** 发现的两个问题
(`scripts/` 不在 typecheck 覆盖内、7 个死组件)都用 git 证据证明为**合并前既有**,
按「只修合并引入的问题」的约束不动。

## 1. Typecheck

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck`(`tsc -b --noEmit`) | **exit 0**,0 error(9.3s) |
| `npx tsc -b --force --noEmit`(绕开增量 buildinfo) | **exit 0**,0 error(11.6s) |

强制重建是必要的一步:`tsc -b` 会跳过 buildinfo 判定为最新的 project,
只跑增量版本无法证明「合并后的全图」被真正检查过。两次都是 0 error。

### 覆盖范围(重要:typecheck 并非覆盖全仓)

| project | include | 本仓文件数 |
| --- | --- | --- |
| `tsconfig.app.json` | `src` | 555 |
| `tsconfig.node.json` | `vite.config.ts`、`server/**/*.ts`、`src/vite-env.d.ts` | 80 |
| —— | `scripts/**/*.ts` | **0(无任何 project 覆盖)** |

`tsconfig.app.json` 的 `include: ["src"]` 把 `*.test.ts(x)` 一并纳入,
所以**测试文件也是被类型检查的**(已用 `--listFiles` 确认 `DataImportConsent.test.tsx` 在程序内)。
且该 project 开着 `strict` + `noUnusedLocals` + `noUnusedParameters` + `verbatimModuleSyntax`,
对「合并残留的未使用局部变量/失效导入」这类问题本来就有较强的捕获力 —— 它没报错是有分量的信号。

## 2. 需要修复的合并引入错误:无

没有做任何代码改动,因此**没有提交**(遵循「Commit only if you fix compile errors」)。
本报告文件 `.agent_workspace/verify-r1-opus-types.md` 以未跟踪状态留在工作区,未 push。

## 3. 悬空导入排查(不存在的文件)

写了一个解析器遍历 `src/` + `server/` + `scripts/` 共 **645 个** `.ts/.tsx/.js/.jsx/.mjs` 文件,
抽出所有 `import` / `export ... from` / 动态 `import()` / `require()` 说明符,
按 `""/.ts/.tsx/.d.ts/.js/.jsx/.mjs/.json/.css` 与 `index.*` 逐一在磁盘上求解。

**相对导入:1882 条,悬空 0 条。**

唯一一条初次被标记的是误报,已核实:

```
src/lib/map-data.ts -> ../assets/china.geojson?raw
```

`src/assets/china.geojson` 真实存在(582521 字节),标记只是因为我的解析器没有剥掉 Vite 的
`?raw` 查询后缀。剥掉后即命中。**不是问题。**

**裸包导入:14 个不同说明符,问题 0 个** —— 每一个的顶层包名都同时满足「`node_modules/` 下存在」
与「在 `package.json` 的 dependencies/devDependencies 中声明」。这一项专门针对
「合并带进来一个 import,但对应依赖从未进入 `package.json`」这种典型合并事故,结果是干净的。

## 4. print-bleed / DataImportConsent

**两者都是「未接线(unused)」,并且都是「类型正确」—— 即任务里可接受的那一档。**

| | `src/lib/print-bleed.ts` | `src/components/DataImportConsent.tsx` |
| --- | --- | --- |
| 在 typecheck 程序内 | 是(`--listFiles` 第 1224 行) | 是(`--listFiles` 第 974 行) |
| strict 下类型错误 | 0 | 0 |
| 导出符号 | 25 个(常量/接口/纯函数) | 5 个(`AiUploadSource`、`AiUploadConsentGate`、`useAiUploadConsent`、`AiUploadConsentMemo`、`AiUploadConsentDialog`) |
| 非测试消费者 | **无** | **无** |
| 自带用例 | `print-bleed.test.ts` | `DataImportConsent.test.tsx` |

用例合并跑:`npx vitest run src/lib/print-bleed.test.ts src/components/DataImportConsent.test.tsx`
→ **2 files / 19 tests passed**。

「未接线」是按符号级而非文件级确认的:对
`resolvePrintBleedGeometry` / `applyPrintBleedToSvg` / `resolveBleedExportSize` / `cropMarkSegments` /
`normalizePrintBleedMm` / `AiUploadConsentDialog` / `useAiUploadConsent` / `AiUploadSource`
在排除两个模块自身及其测试、并排除 `.agent_workspace/` 后全仓检索,**零命中**。
这与 `round-merge-all-r2.md`、`r3-opus-extract.md` 记录的「extract-only,未接线」完全一致,没有偏离。

唯一相关的 lint 告警是 DX 级、非类型问题:

```
src/components/DataImportConsent.tsx  24:17  warning  react-refresh/only-export-components
```

原因是该文件在导出组件的同时导出了 `useAiUploadConsent` hook。只影响 Fast Refresh 粒度,
对一个尚未接线的模块无实际影响;接线时若要消除,把 hook 拆到单独文件即可。

`npm run lint` 全仓:**0 errors, 5 warnings**,与 `r3-opus-extract.md` 记录的既有状态逐条一致
(DataImportConsent ×1、DataWorkspace ×1、ReferenceCardVisual ×3),合并没有引入新的 lint 回归。

## 5. 额外发现(均为合并前既有,本轮不修)

### 5.1 `scripts/**/*.ts` 完全不在 typecheck 覆盖内 —— 且藏着一个真实类型错误

14 个 `scripts/*.ts` 不属于任何 tsconfig project。用一份等价的 strict 配置临时检查,报 10 条错误。
其中 8 条是我这份临时配置的产物(导入无声明文件的 `.mjs` / `jsdom` 导致的隐式 any),可忽略;
但有 **1 条是真实的类型不匹配**:

```
scripts/perf-canvas-bench.ts(122,69): error TS2345:
  Argument of type 'Student[]' is not assignable to parameter of type 'readonly PreparedBatchStudent[]'.
    Types of property 'province' are incompatible: 'string | undefined' vs 'string'.
```

根因:`Student.province` 在 `src/lib/project-data.ts:8` 是可选的(`province?: string`),
而 `scripts/perf-canvas-bench-harness.ts:99` 里本地镜像的 `PreparedBatchStudent.province` 要求必填。
`buildPosterCanvasBenchFixture` 实际上给每个元素都赋了 `province`,所以**运行时正确**,
`npm run perf:canvas` 也确实跑得通(`tsx` 不做类型检查)—— 这正是它能长期潜伏的原因。

**是否合并引入?否,已证伪。** 该 harness 文件由 `76bbe9c`(合并善后的拆分提交)创建,
表面上像是合并产物。我用 git worktree 检出其父提交 `76bbe9c^` 并跑同一份临时配置,
拆分**之前**同一处就已经报错,只是形态不同(当时是内联写法,报 `text: string | undefined`):

```
scripts/perf-canvas-bench.ts(229,24): error TS2345:
  '{ text: string | undefined; field: "title"; }[] | ... ' is not assignable to 'CardTextFragment<...>[]'
```

即 `76bbe9c` 只是把一个**既有**的 `province` 可选性错配从内联表达式搬进了一个具名 interface,
没有制造新错误。按「只修合并引入的」约束,不动。

建议 Round 2/3 处理(独立于本次合并验证):把 `scripts/**/*.ts` 纳入一个 tsconfig project,
并把 `PreparedBatchStudent.province` 放宽为 `string | undefined` 或让 fixture 返回收窄类型。

### 5.2 7 个零引用组件(死代码),合并前即已孤立

`src/` 中有 7 个组件不被任何文件导入(仅在 `docs/` / `frontUI2.md` 等文档里出现):

`AssetLibraryPanel.tsx`、`GlobalSettingsDrawer.tsx`、`HistoryControls.tsx`、`StudioStageShell.tsx`、
`workspaces/DisplayFrameItemInspector.tsx`、`workspaces/DisplayFrameLayerList.tsx`、`workspaces/FlowFrameEditor.tsx`

它们**都能通过 strict 类型检查**,所以不影响静态正确性,只是合并残留观感。
是否为本次合并造成?**否** —— 在合并的**两个父提交** `897a2a6` 与 `d6eac6b` 上分别检索,
7 个组件在两侧就已经无人导入。合并没有孤立它们。

另有 `src/test/leaked-root-guard.ts`(`vite.config.ts:66` 的 `setupFiles`)与 `src/vite-env.d.ts`
(ambient 声明)也被扫描器列为零引用,属误报,均由配置而非 import 引用。

## 6. 验证证据链(failure → cause → fix → recheck)

本轮**没有出现需要修复的失败**,唯一一次「疑似失败」的完整链条如下:

1. **failure** —— `scripts/perf-canvas-bench.ts(122,69)` TS2345,`Student[]` 不可赋给 `PreparedBatchStudent[]`。
2. **cause** —— 假设「合并善后提交 `76bbe9c` 新建 harness 时写错了 interface」。
   验证方式:`git worktree add /tmp/pre-split 76bbe9c^`,软链 `node_modules`,跑同一份临时 tsconfig。
3. **fix** —— **不修**。父提交上同一处已报同源错误(`text: string | undefined`),
   证明是 `Student.province?` 的既有可选性错配,非合并引入;且该目录不在 typecheck 覆盖内。
4. **recheck** —— `npx tsc -b --force --noEmit` 仍 exit 0;`npm run lint` 0 errors / 5 warnings(与既有记录一致);
   `npx vitest run` 两个目标测试 19 passed。worktree 已 `git worktree remove --force` 清理,
   `git worktree list` 只剩 `/workspace`,临时 tsconfig 已删除,工作区无残留改动。

## 7. 交付与回滚

- **代码改动:0**,**提交:0**,**push:无**。不存在需要回滚的内容。
- 过程中产生的临时物(`tsconfig.scripts.tmp.json`、`/tmp/pre-split` worktree)已全部清理,
  `git status` 除 `.agent_workspace/` 下的报告文件外干净。
- 交给 Round 2 的两条待办(都不是本次合并的债):把 `scripts/` 纳入 typecheck;
  清理 7 个死组件或补回引用。
