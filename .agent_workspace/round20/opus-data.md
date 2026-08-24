MODEL_SLUG: claude-opus-5-thinking-high-fast

# R20-opus-data — 全角数字序号被当成姓名(静默串列)

## 结论

三个候选里 **只有一个是真的**:全角数字序号。`No.1` 前缀判为不真实(见下),`.0` 尾巴已被 `SERIAL_CELL` 覆盖(实测通过)。

`src/lib/import-data.ts` 仍为 **400 行**(两处正则原地改写,零净增行)。

## 1. failure — 复现

`npx vite-node` 直接调 `parseStudentText`,修复前:

| 输入 | 解析结果 | 告警 |
| --- | --- | --- |
| `１ 林舟 北京大学 北京市` | name=`１`, university=`林舟`, city=`北京大学` | 无 |
| `１,林舟,北京大学,北京市` | name=`１`, university=`林舟`, city=`北京大学` | 无 |
| `１、林舟，北京大学，北京市` | name=`１、林舟` | 无 |
| `１ 林舟 北京大学 北京市 海外` | name=`１` … `海外` 被挤出 `去向类型` 槽位 | 无 |

最后一行是最贵的一条:整行左移一格后 `海外` 落到了城市之后没人读的位置,`locationScope` 丢失,**一个出国的学生被静默放回中国地图**。整条记录“看起来完整”,`unparsed` 为空,用户没有任何提示。

对照:同形状的半角 `1 林舟 北京大学 北京市` 早就被正确丢弃(已有测试 `import-data.test.ts:462`)。所以这是半角/全角之间的行为分裂,不是未实现的功能。

## 2. cause — 根因

数字识别是 **ASCII-only** 的。两个常量各自用 `\d`,而 JS 的 `\d` 在无 `u` 标志下只匹配 U+0030–0039:

- `SERIAL_CELL = /^\d+(?:\.\d+)?$/` — 判断“整列/首格是纯数字”的唯一依据。全角 `１` 不匹配 ⇒ `usableColumnsByDelimiter` 把该列记进 `named`(当成有名字的真实列)⇒ 定位读取器保留它;自由分隔路径里 `splitCells` 的 `SERIAL_CELL.test(parts[0])` 同样为 false ⇒ 序号占住 `姓名`。
- `LIST_MARKER = /^\d+[.、)]\s*(?=\D)/` — 同样只认半角,所以 `１、` 没被当成列表标记剥掉,和后面的姓名黏在一格里。

全角数字在中文名单里不是边角料:WPS/Word 里输入法处于全角模式时,手打的序号列就是 `１ ２ ３`。

## 3. fix — 最小修复

只换字符类,不改任何判定逻辑、不加行:

```
-const LIST_MARKER = /^\d+[.、)]\s*(?=\D)/;
+const LIST_MARKER = /^\p{Nd}+[.、)]\s*(?=[^\p{Nd}])/u;

-const SERIAL_CELL = /^\d+(?:\.\d+)?$/;
+const SERIAL_CELL = /^\p{Nd}+(?:[.．]\p{Nd}+)?$/u;
```

`\p{Nd}` 与文件里既有的 `DATA_CHARACTER = /[\p{L}\p{N}]/u` 同一写法。`LIST_MARKER` 的后瞻由 `(?=\D)` 收紧为 `(?=[^\p{Nd}])`:原来 `\D` 把全角数字算作“非数字”,放宽数字类后会让 `1.１` 被误剥成 `０`-式残值;收紧后 `1.１ 林舟 …` 依然整体判为序号并丢弃。

**没有做的事(有意留下)**:全角标点 `．` `）` 仍不在 `LIST_MARKER` 的标记类里,所以 `１．林舟 北京大学 北京市` / `1）林舟 …` 依旧会把标记黏进姓名。那是标点类的问题,不是数字类的,属于另一处独立缺陷,本轮不夹带。

## 4. recheck — 复验

同一条 `vite-node` 探针 + 定向 vitest。

修复后行为:

- `１ 林舟 北京大学 北京市` → 林舟 / 北京大学 / 北京市
- `１ 林舟 … 海外` → `locationScope: "international"` 正确落位
- `１、林舟，北京大学，北京市` → 林舟 / 北京大学 / 北京市

护栏(与半角行为逐条对齐,全部保持):

- `００１ 北京大学 北京市`(只有三格,没有多余列可让)→ 姓名仍取 `００１`,匿名名单照常导入,和已有的 `001` 用例同规则
- `序号 姓名 院校 城市` + `１ 林舟 …` → 交给表头映射,序号列不被私自丢弃
- `１,林舟,…` 与 `苏禾,浙江大学,…` 混排 → 第一列被另一行填了真名,整列保留(不背着用户丢列)
- `1.0` / `1.0,…` → 仍识别为 Excel 序列号并丢弃
- `1\t林舟 舟\t…` → 仍按制表符切分,序号作为格而非标点

命令与结果:

- `npx vitest run src/lib/import-data.test.ts src/lib/import-headers.test.ts src/lib/binary-import.test.ts` → 3 files / **101 tests passed**(新增 5 条)
- 下游消费方 `npx vitest run src/lib/html-table-parse.test.ts src/lib/student-data.test.ts src/lib/data-health.test.ts src/lib/data-workspace.test.ts src/lib/project-migration-students.test.ts` → 5 files / **71 tests passed**
- `npx eslint src/lib/import-data.ts src/lib/import-data.test.ts` → 无输出
- `npx tsc --noEmit -p tsconfig.app.json` → 无输出
- `wc -l src/lib/import-data.ts` → **400**

## 被否掉的两个候选

**`No.1` 前缀 — 不修。** 现状确实会把 `No.1` 读成姓名(已实测),但这不是中文毕业名单里的序号写法;而要认它就得让“数字格”开始接受带字母的前缀,这会反过来威胁匿名学号(`A001`、`B2026` 这类是真姓名占位)。收益不抵风险,不动。

**Excel `.0` 尾巴 — 不是缺陷。** `SERIAL_CELL` 的 `(?:\.\d+)?` 早已覆盖;`1.0 林舟 北京大学 北京市` 与 `1.0,林舟,…` 修复前后都正确丢弃。之所以没被 `LIST_MARKER` 误剥,是因为原本的 `(?=\D)` 后瞻挡住了 `1.` + `0`——这一保护在本次改动里被显式保留并加了回归用例。

## 读过但判定已对齐的函数

`stripNegatedMarkers` / `parseLocationScopeValue`(否定式海外标记,逐轮消解正确)、`splitLines` + `joinQuotedLines` + `scanDelimitedLine`(RFC4180 引号跨行,行号不重排)、`detectDelimiter`(`、` 从第二次出现起才信)、`splitDelimitedLine`、`usableColumnsByDelimiter`(空列/数字列的取舍与 `>=3` 列护栏)、`toCandidate`、`candidateFromColumns`、`parseLabeledCandidate`(全角冒号已覆盖)、`detectTextHeader`(首行两列规则 / 迟到表头两格精确)、`parseStudentText` 主循环(表头前内容、汇总行、重述表头、部分映射行不回落定位读取)。以及 `import-headers.ts` 全文(别名表、模糊匹配护栏、孪生列回退)。除上面点名的数字类外,未发现第二处静默串列。

## 交付

- 改动文件:`src/lib/import-data.ts`(2 行正则 + 2 行注释)、`src/lib/import-data.test.ts`(新增 `describe("a 序号 typed in fullwidth digits")`,5 例)
- 验收方式:上面的定向 vitest + lint + tsc;PR CI 复跑同一套
- 回滚方案:两处正则各自还原为 `\d` 版本即可,无数据迁移、无导出格式变化、无 API 形状变化。行为面唯一收窄点是“全角数字序号列会被丢弃”,若某用户确实以全角数字作姓名且该行仍有 4 格以上,还原即恢复旧行为。
- 按指令**未提交**(未 `git add`/`commit`/`push`)。工作区里其他被修改的文件来自本分支的其他轮次,与本轮无关。
