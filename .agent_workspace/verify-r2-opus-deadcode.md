# Round 2 Agent D — 死代码三件套的「不可误入生产」证明

**模型:** `claude-opus-5-thinking-high-fast`
**HEAD:** `4b30a69`(分支 `cursor/verify-merged-code-e17a`)
**范围:** 只验证 `DataImportConsent` / `print-bleed` / `use-studio-preferences` 是否会被误入生产路径。**未接线,未改动任何生产代码。**

## 结论(一句话)

三个模块**确实不在生产 bundle 里**——这不是靠 grep 推断,而是用真实 rolldown 产物的 sourcemap 模块清单 + 产物原文 grep 双重证实的。
仓库里**根本不存在 barrel 文件**,所以「barrel 把死代码拖进 bundle」这条风险为零。
无需修改代码,**本轮不产生代码提交**。

发现一处值得记录但**不需要现在改**的隐患:`mmToPx` / `pxToMm` 在死的 `print-bleed.ts` 与活的 `print-size.ts` 上重名(详见第 4 节),由参数个数不同兜底,typecheck 会拦住误用。

---

## 1. 符号级 grep:零生产引用

全仓库 grep `DataImportConsent|print-bleed|use-studio-preferences|useStudioPreferences|printBleed`,
排除 `.agent_workspace/*` 的历史记录后,**所有命中都落在这三个模块自身与它们自己的测试里**:

| 被引用方 | 引用方 | 性质 |
| --- | --- | --- |
| `src/lib/print-bleed.ts` | 仅 `print-bleed.test.ts` | 死→自测 |
| `src/lib/use-studio-preferences.ts` | `use-studio-preferences.test.tsx`、`DataImportConsent.tsx`、`DataImportConsent.test.tsx` | 死→死 |
| `src/components/DataImportConsent.tsx` | 仅 `DataImportConsent.test.tsx` | 死→自测 |

依赖方向是安全的:`DataImportConsent.tsx` 反过来依赖生产文件 `./StudioUi`,
但**没有任何生产文件依赖它**,所以它只是挂在生产模块下游的一片枯叶,不会把自己送进图里。

**App / DataWorkspace 定点复核(任务点名要求):**

- `src/App.tsx` 的全部 import 逐条列出,无一条指向三者。
- `src/components/DataWorkspace.tsx` 的 14 条相对 import 逐条列出,无一条指向三者。

## 2. 间接注入渠道:全部为空

grep 名字只能证明「没有按名字引用」,证明不了「没有被通配/桶文件卷进去」。四条间接渠道逐条查空:

| 渠道 | 结果 |
| --- | --- |
| barrel 文件(`src/**/index.ts(x)`) | **一个都不存在**(`find` 零命中) |
| `export *` 再导出 | 全 `src` 零命中 |
| `import.meta.glob` / `require.context` | 全 `src` 零命中 |
| tsconfig `paths` / `baseUrl` 别名 | 未配置,不存在别名歧义 |

所以简报里问的「barrel 是否会把它们拖进 bundle」——**该风险在本仓库不存在,因为本仓库压根没有 barrel**。
这也意味着将来若有人新增 `src/lib/index.ts` 之流并 `export *`,风险会瞬间从零变成真;这是唯一需要留意的未来触发条件。

## 3. 决定性证据:真实构建产物的模块清单

前两节仍属静态推断。用真实打包器出一份带 sourcemap 的生产产物,直接读 bundle 里到底有哪些模块:

```
npx vite build --sourcemap --outDir /tmp/deadcode-dist
✓ 2476 modules transformed / built in 1.50s / exit 0
```

**(a) sourcemap 模块清单** — 遍历全部 `assets/*.map` 的 `sources`,bundle 内共 **249 个 `src/` 模块**,
匹配 `print-bleed|DataImportConsent|use-studio-preferences` 的:**0 个**。

**(b) 阳性对照(证明扫描方法本身有效,排除假阴性)** — 同一段扫描脚本能正确捞出应当在场的模块:

```
index-*.js.map -> src/App.tsx
index-*.js.map -> src/components/DataWorkspace.tsx
index-*.js.map -> src/lib/theme.ts
index-*.js.map -> src/lib/editor-layout.ts
```

注意 `theme.ts` 与 `editor-layout.ts` **在 bundle 里,但不是被 `use-studio-preferences` 带进去的**——
它们是 `App.tsx` 自己那套 `useState` 主题/面板实现直接引用的。死模块与活外壳共用底层库,方向仍是死→活。

**(c) 产物原文 grep(覆盖两个无 sourcemap 的 worker chunk)** — 对 `assets/*.js` 全部 JS(含
`card-layout.worker` 与 `workbook-import.worker`)grep 唯一运行时标记
`ai-parse-consent` / `发送到智能识别前请确认` / `已恢复询问` / `MAX_PRINT_BLEED_MM` / `cropMarkStrokePt` / `裁切标记`:
**NO MATCHES in any emitted JS**。

三条独立证据一致:**三个模块一个字节都没进生产产物**。

## 4. 唯一新发现:`mmToPx` / `pxToMm` 重名(记录,不修)

对三个死模块的 **37 个导出符号**做全量重名扫描,命中两处:

| 符号 | 活模块(已进 bundle) | 死模块 |
| --- | --- | --- |
| `mmToPx` | `src/lib/print-size.ts` | `src/lib/print-bleed.ts` |
| `pxToMm` | `src/lib/print-size.ts` | `src/lib/print-bleed.ts` |

两者语义不同:`print-size` 的是 **dpi 感知**的 `mmToPx(mm, dpi)`(印刷尺寸预设用,活跃消费者为
`DeliveryWorkspace.tsx` / `CanvasInspector.tsx` / `grid.ts`);`print-bleed` 的是**固定 96dpi** 的 `mmToPx(mm)`。

**为什么现在不用改:** 两者**参数个数不同(2 个 vs 1 个)**,IDE 自动导入若挑错了模块,
调用点会立刻报 `Expected 1 arguments, but got 2`(或反向),`tsc` 必然拦下。
也就是说这条误入路径**有类型系统兜底,不会静默生效**,不满足「生产 import 写错」的修改门槛,故不动代码。

**将来接线出血位时的要求:** 两个 `mmToPx` 不应长期并存。接线时应让 `print-bleed` 复用
`print-size` 的换算(传 96),或把 96dpi 版重命名为 `mmToCssPx`,避免读代码的人靠参数个数区分语义。

`MM_PER_INCH` 在 `print-size.ts` 里是模块私有常量(非 `export`),不构成重名。

## 5. 死代码健康度(确认它不会烂在原地)

| 检查 | 结果 |
| --- | --- |
| `npx vitest run` 三个测试文件 | **3 files / 24 tests passed** |
| 是否在 typecheck 程序内 | **是**。`tsconfig.app.json` 为 `include: ["src"]`,`--listFiles` 确认 6 个文件(3 源 + 3 测试)全部在册 |
| `npm run lint` | **0 errors / 5 warnings**,与 Round 1 基线**逐条相同**(`DataImportConsent.tsx:24` ×1、`DataWorkspace.tsx:238` ×1、`ReferenceCardVisual.tsx` ×3) |

关键点:这三者虽不进 bundle,却**仍在 typecheck 与测试覆盖之内**。
这是好事——它们不会因为没人引用而悄悄类型腐烂,将来接线时是可用的起点,而不是需要考古的残骸。

## 6. 一并确认的既有缺口(仅记录,本轮明确不修)

Round 1 follow-up #1 所指的同意闸门缺位,本轮拿到了精确坐标:

- `DataWorkspace.tsx` L391 与 L471 两处**已在生产中**把 `importText`(含学生姓名的粘贴原文)
  经 `requestAiParse` 送往第三方 AI。
- 全 `src` 目录中,除了那两个未接线的死文件外,`consent` 一词**零命中**——即这条出境路径上**当前没有任何同意闸门**。

这不是合并造成的回退(合并前 main 同样没有闸门),但它是一条**真实存在的隐私缺口**,
而恰好已经落地的 `DataImportConsent` 就是为它写的。接线属于独立任务,超出「确认合并正确」范围,本轮不做。

## 7. 验证纪律四步链

本轮**没有出现任何 failure**:构建 exit 0、24 项测试全绿、typecheck 在册、lint 与基线逐条一致。
故不存在 failure → cause → fix → recheck 循环需要记录。
唯一的方法论风险是「扫描假阴性」,已用第 3 节(b) 的阳性对照主动证伪:
同一脚本能捞出 `App.tsx` 等应在模块,却捞不到这三者,说明「捞不到」是事实而非工具失灵。

## 8. 交付与回滚

- **本轮无代码改动,因此无需回滚方案。** 生产 import 均正确,不满足任务给定的提交条件,**未产生代码提交**。
- 本报告为工作树内的新增文档,未提交、未推送。
- **复现方式**(任何人可独立重跑):

```bash
npx vite build --sourcemap --outDir /tmp/deadcode-dist
# 读 sourcemap 模块清单,应为 0 命中;换成 App.tsx 应有命中
node -e 'const fs=require("fs");for(const f of fs.readdirSync("/tmp/deadcode-dist/assets").filter(x=>x.endsWith(".map"))){const j=JSON.parse(fs.readFileSync("/tmp/deadcode-dist/assets/"+f,"utf8"));for(const s of j.sources)if(/print-bleed|DataImportConsent|use-studio-preferences/.test(s))console.log(f,s);}'
rg -c "ai-parse-consent|MAX_PRINT_BLEED_MM|裁切标记" /tmp/deadcode-dist/assets/*.js   # 期望:无命中
```

## 给下一轮的结论

1. **三件套确认为纯死代码,零生产渗透,可安全放置。** 不要接线,也不要因为「看起来没人用」就删除——它们有测试、在 typecheck 内,是后续接线的现成起点。
2. **不存在 barrel 风险,因为不存在 barrel。** 但若将来有人引入 `export *` 的桶文件,该结论立即失效,需重跑第 3 节的产物扫描。
3. **`mmToPx`/`pxToMm` 重名已登记**,由参数个数差异兜底,接线出血位时必须一并收敛。
4. **AI 出境无同意闸门是真实缺口**,坐标为 `DataWorkspace.tsx` L391 / L471,建议单开任务接线,不要混进合并验证轮次。
