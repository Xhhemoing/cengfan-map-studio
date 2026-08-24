# Round 7 · R7-opus-data — 出血区版面体检 + 迁移默认出血

模型:`claude-opus-5-thinking-high-fast`。目标:设置印刷出血后,版面体检要能提示卡片/文字压在出血区(裁切线之外)或离裁切线过近。

## 改动清单(仅限所有权范围)

| 文件 | 改动 |
| --- | --- |
| `src/lib/layout-health.ts` | 新增 `object-in-bleed`(severity `warning`);出血几何全部复用 `./print-bleed` 的 `normalizePrintBleedMm` / `mmToPx` |
| `src/lib/layout-health.test.ts` | 3mm 出血下「越过裁切线的卡片 / 贴裁切线的文字 / 版心内卡片 / 满版地图」+ 无出血时静默 |
| `src/lib/project-migration-helpers.ts` | 新增 `PrintBleedCanvas` 类型(画布记录里出血一定已解析) |
| `src/lib/project-migration.ts` | 画布迁移写入 `printBleedMm`(默认 0);导出 `readPrintBleedMm` 供适配层读取 |
| `src/lib/project-migration.test.ts` | 默认 0、往返保留 3mm、脏值回落 0、未知 schema 版本仍保留名单 |

未触碰 `export-poster.ts` / `CanvasInspector`,未 commit / stash / 切分支。

## 与 `src/lib/print-bleed.ts` 的对齐(重要)

开工时仓库还没有 `print-bleed` 模块,本地先写了 96dpi 换算;**同轮另一位代理随后落地了 `src/lib/print-bleed.ts`,于是本模块改为直接 import,并按它的几何约定重写判定**:

- 该模块的约定是 **trim(成品裁切框)= 原画布**,出血框由画布**向外**扩展,media 框再向外留裁切标记位;
- 因此「落在出血区」= 对象越过画布边缘(`inset < 0`),而不是画布内缩后的区域;
- 换算沿用 `mmToPx`(96dpi,1mm = 96/25.4 px),归一化沿用 `normalizePrintBleedMm`(非法/负值 → 0,上限 20mm,保留两位小数),不再自带常量,避免两套出血语义漂移。

判定规则:

| 情形 | 结果 |
| --- | --- |
| 对象越过画布(裁切线)边缘 | `object-in-bleed` / `warning` / 文案「落在出血区(裁切线之外)」 |
| 对象在画布内但距边缘不足一个出血宽度(安静区) | `object-in-bleed` / `warning` / 文案「距裁切线不足 Nmm」 |
| 距离足够 或 未设置出血 | 无新增 issue |

- severity 一律 `warning`(不是 error),不阻断交付。
- 豁免层:`canvas`、`map`。地图底图经常刻意满版出血;`card` / `text` / `asset` / `guests` 参与检查。
- 出血为 0 / 缺省 / 非法值时行为与改动前**完全一致**,现有调用方零影响(已有的 `out-of-bounds` / `overflow` 判定未做任何修改)。

## 迁移侧

- `migrateCanvasSettings` 现在总是写出 `printBleedMm`,缺省 **0**(纯数字稿);`readPrintBleedMm(canvas)` 是对外读取口子,`"3mm"` / `null` / 负值 / 缺字段一律得 0。
- 迁移只负责「带上默认值 + 保住已存值」,完全不碰学生数据路径;未知 `schemaVersion`(41 / 99)照样保留完整名单,已固化为测试。
- 共享的 `CanvasSettings` 由印刷代理补上了 `printBleedMm?: number`,这里用 `PrintBleedCanvas = CanvasSettings & { printBleedMm: number }` 表达「迁移出口必有值」,即使那个可选字段被回滚也仍可编译。

## 未接线的一步(交给拥有适配层的代理)

`listContentLayoutIssues`(`src/lib/studio-editor-helpers.ts:129`)构造体检输入时还没传出血,所以画布上的出血值目前不会触发该告警。接线只需一行:

```ts
canvas: {
  width: project.canvas.width,
  height: project.canvas.height,
  safeMargin: project.canvas.safeMargin,
  printBleedMm: project.canvas.printBleedMm,
},
```

`src/lib/agent-session.ts` 的 `healthInput` 同理。

## 验证(failure → cause → fix → recheck)

| failure | cause | fix | recheck |
| --- | --- | --- | --- |
| 首版判定与 `print-bleed` 语义相反(把画布当含出血的 media 框、trim 内缩),会把满版画面误判、把真正出血的对象漏判 | 开工时 `print-bleed.ts` 尚未存在,只能自行假设一套几何;该模块随后落地,约定是 trim = 画布、出血向外 | 删掉本地 mm→px 与内缩 trim 计算,改 import `mmToPx` / `normalizePrintBleedMm`,判定基准改为画布边缘 | `npx vitest run src/lib/layout-health.test.ts src/lib/project-migration.test.ts` → **24 passed / 2 files**;`npx vitest run src/lib/print-bleed.test.ts …` 一并绿 |

回归面(改判定后全部重跑):

- `npx tsc -p tsconfig.app.json --noEmit` → 本轮改动 0 error。**最后一次复跑出现一条非本代理的错误**:`src/components/inspector/CanvasInspector.tsx(3,1): TS6133 'MAX_PRINT_BLEED_MM' is declared but its value is never read.` 该文件在我的 FORBIDDEN 列表内,且 18:26 那次 tsc 还是全绿、随后才被印刷代理改动,属于并行中间态,请由该文件所有者清理。
- `npx eslint`(5 个改动文件)→ 0 problem
- `npx vitest run src/lib/studio-journey.test.ts src/lib/project-document.test.ts src/lib/agent-session.test.ts src/lib/scene-document.test.ts src/lib/scene-document-modules.test.ts src/lib/print-bleed.test.ts src/lib/template-store.test.ts` → 92 passed
- `npx vitest run src/lib/template-store.test.ts server/collaboration.test.ts src/lib/binary-import.test.ts` → 63 passed(覆盖对画布/快照做整体 `toEqual` 的用例,确认新增的 `printBleedMm` 字段没有打破序列化断言)

## 交付与回滚

- 验收方式:上述目标命令 + CI;适配层接线后可在编辑器把画布出血设为 3mm,把卡片拖到边缘,交付工作区应出现「落在出血区 / 距裁切线不足 3mm」的黄色警告(非阻断)。
- 数据兼容:项目文件的 `canvas.printBleedMm`(默认 0)由印刷代理引入 schema,本轮只保证迁移侧一定带默认值。旧文件读入即补 0;新文件被旧版本读到时该字段被忽略,不影响任何既有字段。
- 回滚:revert 本轮这 5 个文件即可,`object-in-bleed` 随之消失,其余体检项不受影响;残留在项目 JSON 里的 `printBleedMm` 会被当作未知字段,不会导致载入失败。若 `print-bleed.ts` 整体被回滚,`layout-health.ts` 与 `project-migration.ts` 的这两处 import 必须同批回滚。
