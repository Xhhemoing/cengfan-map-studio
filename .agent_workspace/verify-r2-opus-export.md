# Round 2 Agent C（opus-fast）— 复核 70f95b9 导出打断修复的接缝覆盖

- **对象**：`70f95b9 fix(export): 别让插队的 SVG/工程包吞掉在途的 PNG`，分支 `cursor/verify-merged-code-e17a`。
- **范围**：`src/lib/usePosterExport.ts`（代次守卫矩阵）、`src/components/ProjectMenu.tsx`（SVG 置灰）及两者的测试。未接线 consent / print-bleed，未动其它功能。
- **产出**：`19ffd72 test(export): 让导出代次守卫的窗口装置真的卡住在途的 PNG`（只改测试文件，未推送）。

## 结论

修复本身正确、无剩余产物丢失漏洞（与 Agent A 的 ACCEPT 一致），但**它自带的测试装置是空转的**，而且代次矩阵里有两格从没被覆盖过。本轮把装置修好并补上两格，全部改动限于 `src/lib/usePosterExport.test.tsx`。

## 一、装置空转：`startGatedPngExport` 从未卡住任何东西

`exportPng` 要先 `await ensureUserFontsLoaded(...)` 才走到 `image.src = url`，而 70f95b9 的助手是

```ts
act(() => { settled = harness.result().exportPng(); });   // 同步 act，不排空微任务
vi.stubGlobal("Image", originalImage);                     // 这一步先于 src 赋值发生
```

换回真实 `Image` 发生在赋值之前，被"卡住"的那次导出其实用的是正常的 `ScriptedImage`，自己跑完；`release()` 里的 `release?.()` 是个 no-op。

**这不等于那两条用例没用**：把源码退回 `70f95b9^`，它们照样双双失败（微任务顺序恰好也给出了同一个窗口）。但装置一空转就有两个后果，下面两条都是实测出来的，不是推演：

1. 「有没有 PNG 在途」这类需要**两次导出真正同时在途**的断言写不出来——我按计数语义写的用例在装置空转时直接失败（两次都早已跑完，`exportingPng` 已是 false）。
2. 既有用例 `ignores a stale png export that settles after a newer one` 名义上测「先发起的那次**失败**不覆写后者的成功」，实际上那次根本没失败（见第二节）。

**修法**：助手改成 `await act(async () => { … })`，循环让出微任务直到装置真的接上这次导出的 `Image` 再换回；接不上就 `throw`，下次再有人让它空转时用例会响。

## 二、`ignores a stale png export` 测的不是失败路径

装置修好后 mutation「删掉 `catch` 里的 `if (!isCurrent()) return`」**仍然通过**。根因不在装置：`loadPosterImage` 在 blob 通道解码失败后会**降级到 data URL 通道重试一次**，而重试用的是已经换回的真实 `Image`（`imageBehavior === "load"`）——先发起的那次于是成功了，压根没进 `catch`。

补 `imageBehavior = "error"` 让两条通道都失败之后，同一个 mutation 才会让用例失败。

## 三、代次矩阵：补齐的两格

| 场景 | 期望 | 70f95b9 后 | 本轮 |
| --- | --- | --- | --- |
| PNG 在途 + SVG 插队 | PNG 仍落盘，状态归 SVG | 已覆盖 | — |
| PNG 在途 + 工程包插队 | `exportingPng` 归位 | 已覆盖 | — |
| PNG 被更晚的 PNG 顶掉（**两次都成功**） | 只落盘更晚那份 | **未覆盖**（既有用例里先发起的那次是解码失败，走不到 `downloadBlob`） | 新增 `writes only the newest png when an earlier one is still encoding`，用倍率区分文件名 |
| 两次 PNG 同时在途 | 先交还占用的那次不清 `exportingPng` | **未覆盖**（计数 vs 布尔无从分辨） | 新增 `keeps the png busy flag raised until every in-flight png settles` |
| PNG 被顶掉后**失败** | 不覆写后者状态 | 名义覆盖，实际走的是成功路径 | 见第二节，改成真失败 |

`ProjectMenu` 一侧无缺口：`greys out both poster exports while one is in flight` 钉住 `exportState === "exporting"` 两个按钮同时置灰，既有点击用例（默认 `exportState: "idle"`）反向钉住空闲时可点；`App.tsx:589` 传的就是 `posterExport.exportState`，prop 必填，接线断了 tsc 会响。故未再加 App 级用例。

## 四、验证证据（failure → cause → fix → recheck）

1. **failure**：新写的 `keeps the png busy flag raised…` 在装置空转下断言 `exportingPng === true` 得到 false。
   **cause**：助手在 `image.src` 赋值前换回真实 `Image`，两次导出都已跑完。
   **fix**：助手改为 async 并等到装置接上；接不上抛错。
   **recheck**：`npx vitest run src/lib/usePosterExport.test.tsx` → 15/15。
2. **failure**：mutation「删 `catch` 里的 `if (!isCurrent()) return`」不被既有 stale 用例捕获。
   **cause**：blob 通道失败会降级 data URL 通道重试，先发起的那次实际成功。
   **fix**：该用例释放前置 `imageBehavior = "error"`。
   **recheck**：同一 mutation 下该用例失败；还原后 15/15。

**变异测试（每条都实跑）**

| 变异 | 失败用例 |
| --- | --- |
| 去掉 `if (isLatestPng())`（无条件落盘） | `writes only the newest png…` + `ignores a stale png export…` |
| `if (pngExportsInFlightRef.current === 0)` → 无条件 `setExportingPng(false)` | `keeps the png busy flag raised…` |
| 去掉 `catch` 里的 `if (!isCurrent()) return` | `ignores a stale png export…`（第二节修好之后才响） |
| 源码整体退回 `70f95b9^` | 该提交自带的两条用例 |

**全量闸门**：`npm test` → 351 文件 / 2416 用例通过、2 skipped；`npm run typecheck` → exit 0；`npx eslint`（三个相关文件）→ 无输出；`scripts/file-size-ratchet.test.ts` 单跑通过（本次只增测试行）。

## 五、未动的残留（与 Agent A 一致，本轮不修）

- `LegacyEditorSidebar` 273 行「导出 SVG」未置灰：hook 修复后交错不再丢产物，仅状态归后者，NIT。要对齐得同时改 `App.export-busy.test.ts` 的正则口径，超出本轮范围。
- 旧版 PNG 按钮在「SVG 已接管成功、在途 PNG 未归位」的窗口里可点却写着「导出中...」（文案看 `exportingPng || exportState`，`disabled` 只看 `exportState`）：纯外观，且计数语义保证再点一次也不会出问题。
- `WorkflowGuide` 三个导出按钮未置灰：该组件在 `src/**` 里只被自身测试引用，App 未渲染，非活动入口；也正因为没有 `<ImageDown>` 图标而逃过 `App.export-busy.test.ts` 的扫描——若将来接线，需同时扩这条闸门。

## 六、交付与回滚

- 交付物只有测试文件，不改运行时行为，验收方式即上面的全量闸门。
- 回滚：`git revert 19ffd72` 即可，回到 70f95b9 的测试文件，无数据/接口影响。
