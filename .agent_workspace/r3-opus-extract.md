# Round 3 Agent C —— agent-sota-polish / sota-campaign 安全摘取

**模型未降级。** slug：`claude-opus-5-thinking-high-fast`。

任务:从 `origin/cursor/agent-sota-polish-cbcd` 与 `origin/cursor/sota-campaign-6231`
再摘一批**独立文件**,不整分支合并,不碰 `src/App.tsx` / `AgentAssistant.tsx` / `server/index.ts`。

## 结论

三个候选里**只有 1 个落地**,另外 2 个按"不能对着 HEAD 编译就不要"的闸门驳回。
工作树保持未合并状态(无 `MERGE_HEAD`,两分支的 ref 未动)。

| 候选 | 判定 | 原因 |
| --- | --- | --- |
| `src/lib/print-bleed.test.ts` | **落地**(去掉 1 个 describe) | `print-bleed.ts` 与 HEAD 逐字节相同;14 条纯函数用例直接通过 |
| `src/lib/import-headers.ts` + test | 驳回 | 用例要的 6 个符号 HEAD 的 `import-data.ts` 没有导出 |
| `src/lib/export-size-estimate.ts` + test | 驳回 | 依赖 HEAD 不存在的两个模块,不是独立文件 |

## 逐项证据

### 1. print-bleed.test.ts —— 落地

Round 2 的 `1d6d064` 已经把 `print-bleed.ts` 摘进来了,但原分支"未附带用例",所以它一直是
裸模块。这次把用例补上。

先确认被测对象没有版本差:

```
git diff HEAD:src/lib/print-bleed.ts origin/cursor/agent-sota-polish-cbcd:src/lib/print-bleed.ts
→ 空(逐字节相同)
```

用例还引了 `./scene-document` 的 `createDefaultScene` / `normalizeScene` / `updateSceneTarget`,
三个 HEAD 都有(`scene-document.ts:476 / :549 / :726`),所以先原样摘进来跑。

**failure → cause → fix → recheck:**

- **failure** —— 15 条里 1 条挂:`scene canvas print bleed field > defaults to 0 and clamps
  patched values through normalizeScene`,`expected undefined to be +0`(测试文件 195 行,
  `scene.canvas.printBleedMm`)。
- **cause** —— 不是用例写错,是 HEAD 的画布 schema 里根本没有这个字段:
  `grep -n printBleedMm src/lib/scene-document.ts` 零命中。出血位接进 scene document
  (`canvas.printBleedMm` 的默认值、`normalizeScene` 钳制、`updateSceneTarget` 写入)是
  `agent-sota-polish` 分支在 `scene-document.ts` 上的改动,本轮不接。这正是任务里说的
  "需要 scene 集成的用例跳过"。
- **fix** —— 删掉 `describe("scene canvas print bleed field")` 整块(原 191–204 行),
  以及随之失去调用方的 `import { ... } from "./scene-document"`。
  `MAX_PRINT_BLEED_MM` 仍被 39 行的 `normalizePrintBleedMm(999)` 用到,保留。
  纯函数部分一行未改。
- **recheck** —— `npx vitest run src/lib/print-bleed.test.ts` → **14 passed**。

留下的覆盖:mm/px 换算、`resolvePrintBleedGeometry` 的 media/trim 几何、`parseTrimBox`、
`applyPrintBleedToSvg` 的 viewBox 改写与裁切线、`resolveBleedExportSize` 与 media box 的一致性。
丢掉的只有"画布字段"那一条 —— 等出血位真正接进 scene document 时再从原分支取回。

### 2. import-headers.ts + test —— 驳回

闸门是"没有缺失导出才要"。缺了,而且缺的不是一个路径:

`import-headers.test.ts` 从 `./import-data` 引 6 个符号 —— `detectHeaderColumns`、
`detectHeaderMapping`、`looksLikeStudentHeader`、`missingRequiredColumns`、
`normalizeHeaderCell`、`readStudentColumn` —— HEAD 的 `import-data.ts` 一个都没导出
(它只导出 `parseDelimitedTable` / `parseStudentText` 和三个类型)。

改个 import 路径解决不了:用例还在 11 处调 `parseStudentText`,断言的是**表头感知版**的
解析行为。那是分支对 `import-data.ts` 的重写(`+332 / -93`),`import-headers.ts` 只是这次
重写抽出来的一半。单独摘模块 = 一份没有调用方、没有用例的死代码
(`grep -rn detectHeaderMapping\|STUDENT_HEADER_ALIASES src/` 在 HEAD 零命中),
所以模块和用例一起放弃。

要接的话得连 `import-data.ts` 的重写一起接,并重跑现有 `import-data.test.ts` —— 那是独立任务,
不属于"安全摘取"。

### 3. export-size-estimate.ts + test —— 驳回

闸门是"独立文件才要"。它不独立:

```ts
import { formatByteSize } from "./image-downscale";          // HEAD 无此文件
import { MAX_PROJECT_PACKAGE_BYTES } from "./import-file-limits";  // HEAD 无此文件
```

两个模块 HEAD 都不存在,`grep -rn "formatByteSize\|MAX_PROJECT_PACKAGE_BYTES" src/` 零命中。
用例自己也直接引 `./import-file-limits`。

跟着摘的话要再拖进 `image-downscale.ts`(289 行,含 canvas 缩放、`OversizedImageError`、
`applyImageWithinBudget` 等一整套图片预算逻辑)和 `import-file-limits.ts`(55 行,且它自己也
依赖 `image-downscale`)。这是把 sota-campaign 的整条导入体积闸门搬过来,超出本轮范围。

## 验收

按 AGENTS.md 的顺序串行跑,未并行:

| 检查 | 结果 |
| --- | --- |
| `npx vitest run src/lib/print-bleed.test.ts` | 14 passed |
| `npm run typecheck` | 通过,0 error |
| `npm run lint` | 0 errors,5 warnings(全部是既有的 `DataImportConsent` / `DataWorkspace` / `ReferenceCardVisual`,与本次无关) |
| `npm test` | **351 passed / 2 skipped(353 files),2406 passed / 2 skipped** |

行数闸门:`print-bleed.test.ts` 189 行,在 400 行以内,不需要动 allowlist。

## 回滚

`git revert` 本提交,或直接 `rm src/lib/print-bleed.test.ts`。纯新增测试文件,
不改任何产品代码、导出格式或 API 形状,无数据迁移,无破坏性变更 —— 删掉即回到落地前状态。

## 交接

- 出血位(print bleed)现在是**有测试覆盖的纯函数模块,但仍无调用方**。接进编辑器需要在
  `scene-document.ts` 的 canvas schema 上加 `printBleedMm`(默认 0、`normalizeScene` 钳制到
  `MAX_PRINT_BLEED_MM`、`updateSceneTarget` 可写),然后在导出路径调 `applyPrintBleedToSvg`。
  对应用例在 `origin/cursor/agent-sota-polish-cbcd:src/lib/print-bleed.test.ts` 的
  `scene canvas print bleed field` 块,以及 `print-bleed.journey.test.ts`(本轮未取),接线时一并取回。
- 表头识别与导出体积闸门这两条线,分别绑在 `import-data.ts` 重写和 `image-downscale` 体积体系上,
  只能整块接,不能再按文件摘。
