# Round 3 Agent C (opus-fast) — 还能不能丢掉一份 PNG

**MODEL:** `claude-opus-5-thinking-high-fast`
**基线:** `b5ae155`(`cursor/verify-merged-code-e17a`,含 `70f95b9` + `19ffd72`)
**工作分支:** `cursor/report-superseded-png-export-failure-189e`
**提交(未 push):** `ea38982` 产品修复 + `423a3b5` 用例拆分

## 结论:不是 NONE,还剩半扇门

`70f95b9` 把「别的导出插队」这条路径修好了**一半**。在途 PNG **成功**时产物不再被吞掉;
**失败**时,`catch` 里的 `if (!isCurrent()) return` 依旧把失败整个咽下去——面板、错误、
状态行一个都不写。用户点过的 PNG 没落盘,界面上只有一句「SVG 已导出」,`exportState`
是 `success`。

这正是 Round 1 报告给这个缺陷下的定义(§1「PNG 从未落盘……**也没有任何报错**」),
只不过那一轮只关上了成功那一半的门。

**这一轮不需要给 `LegacyEditorSidebar` 置灰**(简报的前置条件),修的是 hook 内部的判据。

## 一、复现:生产可点到,且实测过

`LegacyEditorSidebar.tsx:273` 的「导出 SVG」至今未置灰(Round 2 §5 已记录,当时判为 NIT,
理由是「hook 修复后交错不再丢产物」——对成功路径成立,对失败路径不成立)。

点「导出 PNG」→ 编码期间点右栏「导出 SVG」→ PNG 解码失败或写盘被拦。

先用探针实测,不是推演:

```
statuses: ["SVG 已导出"]  state: success  error: undefined  downloads: ["我的毕业去向图.svg"]
```

失败被完整咽掉。

### 其中一格是货真价实的产物丢失

失败不只有「没编出来」。`downloadBlob` 会在 `link.click()` 上抛
(浏览器/扩展拦下程序化下载,`export-poster.download.test.ts:44` 已在建模这一种):

```ts
if (isLatestPng()) downloadBlob(blob, fileName);   // ← blob 已经在手上了,这一行抛
if (!isCurrent()) return;                          // ← catch 里同样的早退,静默
```

**字节存在过,文件没落地,界面上一点痕迹都没有。** 这不是「没告诉用户失败」,
这就是简报说的「丢掉一份 PNG」。

## 二、根因:判据用错了量

`70f95b9` 自己画的那条线是对的——「SVG 是另一份文件,它顶掉的是状态而不是产物」——
但这条线只画在了落盘那一行,没画在 `catch` 上:

| 问题 | 该用哪个量 | 落盘 | 失败上报(修复前) |
| --- | --- | --- | --- |
| 谁能写导出面板 | `isCurrent()` | — | **误用** |
| 这份 PNG 还欠着吗 | `isLatestPng()` | ✓ | 缺 |

`exportSvg` / `exportProjectPackage` 都会推进 `exportGenerationRef`,于是 SVG 一插队,
在途 PNG 的 `isCurrent()` 立刻为假,失败连同「用户还欠着一份 PNG」的事实一起消失。

## 三、修复(`ea38982`)

```ts
} catch (error) {
  const message = error instanceof Error ? error.message : "PNG 导出失败";
  if (!isCurrent()) {
    if (isLatestPng()) reportStatus(message);   // 面板归后来者,状态行仍要说一声
    return;
  }
  setExportState("error");
  setExportError(message);
  reportStatus(message);
}
```

- `isCurrent()` 继续只回答「谁能写导出面板」,被顶掉就不写——**代次守卫契约一字未改**。
- 失败改由 `isLatestPng()` 决定要不要报:只要没被**更晚的一次 PNG** 取代,用户就仍然
  欠着一个结果,落不了盘就得告诉他。走 `reportStatus`(App 里是 `setStatusMessage`
  状态行)而不是 `exportState`,不与后发起的那次导出抢面板。
- 被更晚的 PNG 顶掉时依旧沉默:那次才是同一份文件的最终结果,再报只会让用户以为
  刚成功的导出也坏了。这条边界单独有用例钉着。
- **成功路径一个字没动**,`statuses.at(-1)` 仍是「SVG 已导出」。

## 四、新增用例(3 条)

| 用例 | 钉住的行为 |
| --- | --- |
| `still reports the png failure when another kind of export starts mid-flight` | SVG 接管面板后,PNG 的失败仍要出现在状态行;面板/错误仍归 SVG |
| `still reports a blocked png download when another kind of export starts mid-flight` | 字节已编好、倒在写盘上的那一格——真的丢了产物,必须报 |
| `stays quiet when the failing png was superseded by a newer png` | 反向边界:被更晚的 PNG 顶掉的失败不报,防止过修 |

第二条需要装置能模拟「写盘被拦」,为此给装置加了 `downloadBehavior` 开关。

## 五、验证证据链(failure → cause → fix → recheck)

### 5.1 产品修复

1. **failure** —— 探针用例先跑,打出 §1 那行输出;两条正式用例红,报
   `expected 'SVG 已导出' to contain 'SVG 转 PNG 失败'` 与 `… to contain '下载被拦截'`,
   精确复现预测的现象。第三条(边界)一开始就绿,说明它约束的是「别过修」。
2. **cause** —— 见 §2:`catch` 的早退挂在 `isCurrent()` 上,而 SVG / 工程包会推进代次。
3. **fix** —— 见 §3。
4. **recheck** —— `npx vitest run src/lib/usePosterExport*.test.tsx` → 18/18。

### 5.2 闸门失败与修法

1. **failure** —— `npm test` 报 `usePosterExport.test.tsx: 431 lines (limit 400)`。
2. **cause** —— 三条新用例把单文件推过 400 行。
3. **fix** —— 闸门自己写明「Split the file……adding a new entry needs an explicit
   reviewer decision」,所以拆文件、不加白名单:装置提取为
   `poster-export-test-harness.tsx`(按仓库既有 `*-test-harness.tsx` 约定),代次矩阵
   搬进 `usePosterExport.generation.test.tsx`。行数 203 / 144 / 143,全部在闸门内。
4. **recheck** —— `npm test` 通过,无新增白名单条目。

### 5.3 变异测试(拆分**之后**重跑,每条实跑)

装置搬家最容易空转(Round 2 就栽在这上面),所以拆完必须再验一遍:

| 变异 | 失败用例 |
| --- | --- |
| `catch` 回退到 `if (!isCurrent()) return` | `still reports the png failure…` + `still reports a blocked png download…` |
| `catch` 去掉 `isLatestPng()`(无条件报) | `stays quiet when the failing png was superseded by a newer png` |
| 落盘去掉 `isLatestPng()` | `writes only the newest png when an earlier one is still encoding` |
| `exportingPng` 无条件置 false | `keeps the png busy flag raised until every in-flight png settles` |

> 与 Round 2 记录的一处出入:那一轮把「落盘去掉 `isLatestPng()`」记为同时打挂
> `ignores a stale png export`。现在只打挂一条。原因是 `19ffd72` **在同一个提交里**
> 给该用例加了 `imageBehavior = "error"`,两条通道都失败后它压根走不到 `downloadBlob`,
> 那格自然不再响。记录描述的是加开关**之前**的行为,属笔误,不影响守卫仍被钉住。

### 5.4 全量闸门

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | exit 0,无输出 |
| `npm test` | **354 files / 2419 passed \| 2 skipped**(基线 2416,+3 为新用例;文件 +1 为拆分) |
| `npm run lint` | **0 errors / 5 warnings**,与基线逐条相同(DataImportConsent ×1、DataWorkspace ×1、ReferenceCardVisual ×3),无新增 |
| file-size-ratchet | 通过,无新增白名单条目 |

## 六、排查过但**确认无洞**的路径(留档,免得下一轮重走)

先把范围收敛干净:全仓 `downloadBlob` / `svgToPngBlob` 的调用方只有 `usePosterExport`
一处,PNG 产物只可能从 `exportPng` 出来。于是「丢一份 PNG」只剩两种可能——
落盘被跳过,或落盘抛了。逐条查:

| 路径 | 结论 |
| --- | --- |
| PNG 在途 + SVG / 工程包插队(**成功**) | `70f95b9` 已修,产物照常落盘。用例在案 |
| PNG 被**更晚的 PNG** 顶掉 | 既有约定,不重复落盘。更晚那次负责给结果;它若失败,用户看得到错误 |
| 两次 PNG 同时在途 | 只可能经 SVG 插队的窗口进入(所有 PNG 按钮都按 `exportState === "exporting"` 置灰)。仍是「更晚的赢」,非丢失 |
| `WorkflowGuide` 三个未置灰的导出按钮 | **组件未接线**:`rg WorkflowGuide --glob '!*.test.*'` 在 `src/**` 只命中它自己的定义,App 从不渲染。非活动入口(与 R1 §4、R2 §5 一致) |
| `stage-overview` 的 `export-png` 卡片动作 | 仅在 `exportState === "error"` 时出现,是重试入口。触发的是「更晚的 PNG」,非丢失 |
| `retryLastExport`(DeliveryWorkspace 的「再次导出」/「重试」) | 按 `lastExportRef` 分派;PNG 在途时点它最多再起一次导出,在途那份仍按 `isLatestPng()` 落盘 |
| 编辑器卸载 / 切阶段时 PNG 在途 | `downloadBlob` 用游离锚点,不依赖 React;`svg` 在 `await` 之前已捕获,脱离文档仍能 `cloneNode` 序列化。产物照常落盘 |
| `pngScale` / `transparentExport` 导出中被改 | 在途那次用的是闭包里的旧值,文件名与画布尺寸同源,自洽 |
| 计数泄漏(`pngExportsInFlightRef`) | 自增之后到 `try` 之间只有 `setState`,不会抛;`finally` 必然归还 |
| `exportState` 卡死在 `exporting` | 唯一无超时的 `await` 是 `ensureUserFontsLoaded`;它内部每个 `face.load()` 都 `.catch`,末尾 `document.fonts.ready`。非本轮范围,也非丢产物 |

**未触碰**(按简报):consent 接线、print-bleed UI、`LegacyEditorSidebar` 置灰。
其中置灰这一项:本轮的修复让它从「会丢东西」降级为纯一致性问题——PNG 在途时
右栏 SVG 仍可点,但产物落盘、失败有声。要对齐得同时改 `App.export-busy.test.ts`
的正则口径(它只认带 `<ImageDown` 的按钮),留给后续产品任务。

## 七、交付与回滚

- **验收方式:** 上述四条闸门在本分支可复现。人工验收走 §1 复现路径——点「导出 PNG」,
  编码期间点右栏「导出 SVG」,断开网络或用扩展拦下下载制造 PNG 失败:
  状态行应出现 PNG 的失败原因,而不是只剩「SVG 已导出」。
- **回滚:** `git revert 423a3b5 ea38982`。**无数据、导出格式、API 形状变更**——
  `UsePosterExportResult` 的公开形状、导出文件名规则、产物格式都没动,
  唯一对外差别是多一条状态行文案。
- **未 push**,按任务要求。
