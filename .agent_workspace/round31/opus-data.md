# R31-opus-data — Word 直排冒号 `︰` / `︓` 进 CELL_DELIMITERS

- **模型**: claude-opus-5-thinking-high-fast
- **分支**: `cursor/agent-sota-polish-cbcd`（未 commit / 未 push，按约束）
- **改动文件**: `src/lib/import-data.ts`、`src/lib/import-data.test.ts`

## 缺口

Word 与直排 CJK 表格导出的冒号既不是全角 `：`(U+FF1A) 也不是小型 `﹕`(U+FE55)，而是竖排呈现形式
`︰`(U+FE30 PRESENTATION FORM FOR VERTICAL TWO DOT LEADER) 与 `︓`(U+FE13 PRESENTATION FORM FOR
VERTICAL COLON)。`CELL_DELIMITERS` 不认这两个字符，整行不分列，一条学生记录整个落进 `unparsed`。

## 改动

`src/lib/import-data.ts`（仍为 **400 行**，未越界）：

- `CELL_DELIMITERS` 在 `"﹕"` 之后插入 `"︓", "︰"`，位置在 `"、", "﹑"` 之前，因此
  `detectDelimiter` 里 `/^[、﹑]$/` 的 3-cell 例外**不适用**于它们——两者走和 `：`/`﹕` 一样的
  **2-cell 规则**（冒号是分隔，不是顿号那样的句内枚举）。
- **未**改 `LIST_MARKER`（编号列表用 `、`/`．`/`）`，与直排冒号无关），**未**改
  `FREEFORM_SEPARATOR`，**未**碰 `src/lib/html-table-parse.ts` 的实体解码。
- 注释压缩：第 119 行 `CELL_DELIMITERS` 文档注释收紧为
  「小型 ﹔ ﹕ ﹑ 代表 ； ： 、；直排 ︓ ︰ 都是 ：」，把新增两个字符的说明塞进原来的单行，未新增行；
  第 130 行 3-cell 例外说明由 `` `﹔` 和 `﹕` included `` 改为 `` `﹔` `﹕` `︓` `︰` included ``，同样原地替换。
  净行数变化 0。

`src/lib/import-data.test.ts`：镜像既有 `﹕` 四例 + 1 例 `︓`，均在 `fullwidth colon separated rows` describe 内：

1. `splits a row typed with the vertical colon Word writes down a CJK column` —— 无表头单行 `林舟︰北京大学︰北京市`
2. `reads a roster headed by the vertical colon and names the gap of its empty 院校 cell` —— 4 列表头 + 空 `院校` 报「缺少院校」
3. `reads a ︰-separated roster without a header and reports its gap` —— 无表头 + gap 报「无法识别学生名称、录取院校和城市」
4. `keeps a ︰ inside one cell from splitting a row another delimiter already divides` —— 逗号表头下 `波士顿︰剑桥` 保持一格
5. `splits a row typed with the vertical form of the fullwidth colon` —— `︓` 版本

## 禁项自查

| 禁项 | 状态 |
| --- | --- |
| 加 `·`（会拆 美国·波士顿） | 未加 |
| 加 ASCII `:` 或 `/` | 未加（原有「leaves an ASCII colon inside a cell alone」`09:00` 用例仍通过） |
| 超过 400 行 | `wc -l` = 400 |
| 改 html-table-parse 实体解码 | 未改 |
| 把 `ldquo`/`rdquo` 映射成空格 | 未做 |
| 加进 `、﹑` 3-cell 例外 | 未加，走 2-cell |

## 验证链（failure → cause → fix → recheck）

1. **failure**：把 `"︰"` 从 `CELL_DELIMITERS` 临时摘掉后重跑
   `npx vitest run src/lib/import-data.test.ts src/lib/html-table-parse.test.ts` →
   `Tests  3 failed | 104 passed (107)`，失败的正是 1/2/3 三条**依赖分列**的新用例：

   ```
   × splits a row typed with the vertical colon Word writes down a CJK column
   × reads a roster headed by the vertical colon and names the gap of its empty 院校 cell
   × reads a ︰-separated roster without a header and reports its gap

   AssertionError: expected [] to deeply equal [ { name: '林舟', …(4) } ]
   -     "rawLine": "林舟︰北京大学︰北京市",
   ```

   `candidates` 为空数组 —— 整行没被分列，落到 unparsed，正是缺口本身。
   第 4 条（cell 内保留 `︰`）在缺失时同样通过，符合预期：它是**防回归护栏**，锁的是逗号优先、
   `︰` 不得抢分列权，摘掉分隔符时行为本就一致。
2. **cause**：`detectDelimiter` 只在 `CELL_DELIMITERS` 中查找，U+FE30 不在表内 → `split` 长度恒为 1 →
   无 delimiter → 回落 `FREEFORM_SEPARATOR`（空白/顿号），直排冒号不匹配 → 单字段 → `toCandidate` 拿不到
   university/city → null。
3. **fix**：把 `"︓", "︰"` 按 2-cell 规则插入 `"﹕"` 之后、`"、"` 之前。
4. **recheck**：还原后重跑同一条命令 → `Test Files 2 passed (2) / Tests 107 passed (107)`；
   `wc -l src/lib/import-data.ts` = 400；`npx eslint src/lib/import-data.ts src/lib/import-data.test.ts` 通过；
   `npx tsc --noEmit -p tsconfig.app.json` 通过。
   全量 `npx vitest run` → `226 files / 2021 tests` 全绿（首跑有 1 例
   `server/client-ip.test.ts` 失败，属并行槽位 R31-gpt-server 正在编辑的文件，不在本槽位 ALLOWED PATHS 内，
   复跑已绿）。

## 验收与回滚

- **验收方式**：CI 跑 `npx vitest run src/lib/import-data.test.ts`；手工验证可在导入框粘贴
  `林舟︰北京大学︰北京市`，应识别为一条学生记录而非「无法识别」。
- **破坏性**：无。仅**新增**两个分隔符候选，既有分隔符顺序与优先级不变，导出格式与 API 形状未动。
  唯一行为变化是原先整行不可解析的直排冒号行现在被分列。
- **回滚**：从 `CELL_DELIMITERS` 删除 `"︓", "︰"` 两个元素并删除对应 5 条测试即可，无数据迁移。
