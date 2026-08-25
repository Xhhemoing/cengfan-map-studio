# Round 1 — Agent A (fable) — 架构审计:merge-all → main

- **Model:** claude-fable-5-thinking-xhigh
- **Audit target:** `origin/main` @ `388eafc`（PR #44 merge，分支 `cursor/verify-merged-code-e17a`）
- **Scope:** 合并结构有效性（冲突残留 / App.tsx 拆分保持 / 测试文件去重 / import 可解析 / 未接线模块定性）

## 结论:**ACCEPT**（附 4 条 NITS，无 BLOCKER，未做任何代码修改）

---

## 逐项审计结果

### 1. 冲突标记 — 通过

全仓（含 `server/`、`scripts/`、隐藏文件，排除 `node_modules`）扫描 `<<<<<<<` / `=======` / `>>>>>>>` / `|||||||`:**源码零命中**。
唯一命中是 `.agent_workspace/r1-opus-r12.md` 第 253/258 行——那是 agent 报告里**引用展示**的冲突原文（fenced code block，讲解 `file-size-allowlist.json` 的解法），属于文档内容,不是残留。见 NIT-2。

### 2. App.tsx 拆分保持 — 通过

- `src/App.tsx` 现为 **923 行**（合并前 main @ `897a2a6` 是 2466 行,未回滚成任何巨石版本）。
- 第 59–68 行 import 了 `./components/editor/` 下全部 10 个外壳:`ExportProjectDialog`、`GlobalSettingsShell`、`LegacyEditorInspector`、`LegacyEditorSidebar`、`LegacyEditorStage`、`LegacyEditorTopbar`、`MissingProjectShell`、`ProjectLoadingShell`、`EditorTopbarActions`、`StageLayoutScreen`。
- **不存在** `src/components/studio-editor/` 目录。`StudioEditorShell.tsx`（`src/components/` 下的单文件组件,经 `StudioLayoutTemplate` 使用）是既有六阶段外壳,与被担心的 `studio-editor/` 目录无关。
- 行数闸门:allowlist 记 `"src/App.tsx": 923`,与实际一致,ratchet 卡在拆分后的水位上。

### 3. 删除后重加的测试文件 — 通过,无双份拷贝

r12 合并（`ac7d7b9`）删除的 6 个巨石测试,在 HEAD 全部确认**未被重新加回**:

| 已删巨石 | HEAD 状态 | 替代拆分 |
|---|---|---|
| `src/components/AgentAssistant.test.tsx` | 不存在 | 6 份 `AgentAssistant.*.test.tsx` |
| `src/components/AssetPanel.test.tsx` | 不存在 | 6 份 `AssetPanel.*.test.tsx` |
| `src/components/ProjectWorkbench.test.tsx` | 不存在 | 8 份 `ProjectWorkbench.*.test.tsx` |
| `src/lib/agent-conversation-store.test.ts` | 不存在 | 4 份拆分 + fixtures |
| `src/lib/binary-import.test.ts` | 不存在 | 4 份拆分 + fixtures |
| `src/lib/export-poster.test.ts` | 不存在 | 5 份拆分 + fixtures |

`PosterCanvas.test.tsx` / `MapLayer.test.tsx` 同样只有拆分版。唯一保留巨石名的是 `DataWorkspace.test.tsx`（241 行,describe 为 "record editing"）,与 4 份 `DataWorkspace.*.test.tsx` 的 describe（import recognition / import fidelity / roster actions / live regions）**互不重叠**——是拆分后的残余切片,不是双份拷贝。

### 4. import 可解析 — 通过（全量硬验证）

- `npx tsc -b --noEmit`:**exit 0**,静态与动态 import 全部可解析,无任何指向 r12 已删文件的引用。
- `npm test`（run-heavy 包装的全量 vitest）:**351 个测试文件通过、2411 个用例通过、0 失败**（2 个 skip 为既有的 `server/collaboration.test.ts` 内 `.skip` 块与 `project-store.bench.test.ts`,与本次合并无关）。
- `scripts/file-size-ratchet.test.ts` 单跑复核:5/5 通过;allowlist 全部 29 个条目在磁盘上都存在,无指向已删文件的悬空条目。
- `npm run lint`:**0 errors**,5 个既有 warnings（见 NIT-3）。

验证纪律记录:本轮所有检查一次通过,无 failure→cause→fix 链条需要记录。

### 5. 未接线摘取模块 — 定性:**dead code,无害,非合并损坏**

三个模块（`DataImportConsent.tsx`+test、`src/lib/use-studio-preferences.ts`+test、`src/lib/print-bleed.ts`+test）经符号级搜索确认**无任何生产消费者**（print-bleed 甚至无跨文件引用;use-studio-preferences 仅被同样未接线的 DataImportConsent 引用 `loadAiParseConsent`）。

这不是合并事故,而是 `1d6d064`（chore(r2-b)）**有意为之的"先落地、后接入"摘取**:提交信息明确记录了三者未接线、原分支的 App.tsx 重写按 Round 2 政策不接,并给出回滚方案（revert 该提交或直接删文件,无引用方）。合并前 main 从未有过这三个模块或其接线,因此 HEAD 相对旧 main **没有功能回退**。三个模块各自 typecheck/test/lint 通过且在 400 行闸门内(print-bleed 250 行)。

---

## NITS（按优先级）

1. **[最高优先跟进] DataImportConsent 未接线 = 同意闸门缺位(但非合并回退)。**
   `DataWorkspace.tsx` 的两条 AI 识别路径是**活的**:显式「智能识别名单」按钮(`prepareAiImport`,L383)与一键导入的自动升级(`importDirectly`,L471)都会把粘贴原文(含学生姓名)经 `requestAiParseData` 送第三方模型,**当前无任何同意询问**。此行为与合并前 main 一致,所以不是 BLOCKER;但源分支 `6d0b1ab` 的接线落在 main 上不存在的 `DataImportPanel.tsx` 里,无法直接搬。后续接入需按现 DataWorkspace 结构重写接线(用 `useAiUploadConsent` 包住上述两个调用点),这是三个未接线模块中唯一有隐私含义的,建议排第一。

2. **`.agent_workspace/r1-opus-r12.md` 含引用型冲突标记**(fenced block 内,已入库)。若日后 CI 加朴素的 conflict-marker grep,此文件会误报;建议该类检查排除 `.agent_workspace/`,或该文档改用缩进码块。

3. **5 个 lint warnings**(0 errors):`DataImportConsent.tsx:24` 与 `ReferenceCardVisual.tsx` 的 react-refresh 导出模式 ×4,`DataWorkspace.tsx:238` 的 exhaustive-deps。均为既有风格问题,不影响合并有效性。

4. **use-studio-preferences 与 App.tsx 的双实现风险(潜伏)。**
   App.tsx L206–246 保留 `useState` 版主题/面板宽度逻辑;`use-studio-preferences.ts` 是模块级单例 + `useSyncExternalStore` 的另一套模型。今天双方互不相扰(后者无消费者);但**将来接线时必须两个外壳一起切**,只切一侧会造成面板宽度双源互相覆写存储——该文件自己的 docstring 已写明此约束。接线前它只是安全的死代码。

## 回滚方案(记录性)

本审计未改动任何代码。若需整体回退合并:`git revert -m 1 388eafc`。若仅回退三个未接线模块:`git revert 1d6d064` 或直接删除 6 个文件(3 模块 + 3 测试),现无引用方,`1d6d064` 提交信息已记录同样方案。

## 证据摘要

| 检查 | 命令 | 结果 |
|---|---|---|
| 冲突标记 | rg 全仓扫描(4 种标记) | 源码 0 命中 |
| Typecheck | `npx tsc -b --noEmit` | exit 0 |
| 全量测试 | `npm test` | 351 files / 2411 tests passed, 0 failed |
| 行数闸门 | `npx vitest run scripts/file-size-ratchet.test.ts` | 5/5 passed |
| Lint | `npm run lint` | 0 errors / 5 warnings |
