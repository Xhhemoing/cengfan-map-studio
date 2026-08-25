MODEL_SLUG: claude-opus-5-thinking-high-fast

# R29 opus-data — Word 图形空格/发丝空格实体

## 改动

`HTML_NAMED_ENTITIES` 原本收了 `emsp`/`ensp`/`thinsp`/`nbsp`,但没有 Word 排版常用的另外两个空格实体,
所以 `苏&numsp;禾` 解码后 `&numsp;` 原样留在姓名里。补上两个映射即可,`htmlCellText` 里既有的
`\s+ → " "` 折叠会把它们和相邻空格并成一个空格,无需改动折叠逻辑。

- `numsp` (U+2007 FIGURE SPACE) → `" "`
- `hairsp` (U+200A HAIR SPACE) → `" "`

未触碰 `import-data.ts`(已 400 行),未把 `ldquo`/`rdquo` 解码成空格 —— 现有「非空白实体原样保留」
用例仍然断言 `&ldquo;强基&rdquo;计划 & A&unknown;B`,通过。

## 文件变更

| 文件 | 变更 |
| --- | --- |
| `src/lib/html-table-parse.ts` | 实体表新增 `hairsp`/`numsp`,按字母序排列并折成两行(207 → 208 行,远低于 400) |
| `src/lib/html-table-parse.test.ts` | 新增用例 “reads a name padded with the figure and hair spaces a Word export writes”(248 → 266 行) |

新用例覆盖三行:`苏&numsp;禾` → `苏 禾`、`林&hairsp;舟` → `林 舟`,外加相邻双实体
`顾&numsp;&hairsp;言` → `顾 言`,验证折叠成单个空格。

## 跑过的检查

- `npx vitest run src/lib/html-table-parse.test.ts src/lib/import-data.test.ts` → 2 files / 101 tests passed
- `npx eslint src/lib/html-table-parse.ts src/lib/html-table-parse.test.ts` → 无告警
- `npx tsc --noEmit -p tsconfig.json` → 无输出

## 证据链(failure → cause → fix → recheck)

1. **failure** —— 先把新用例连同修复一起写好,再临时把实体表回退成改前的一行,
   跑 `npx vitest run src/lib/html-table-parse.test.ts -t "figure and hair"`,用例失败,
   实际值为 `name: "顾&numsp;&hairsp;言"`,且该行因带实体的姓名被判成
   `sourceLine: 4` 的未识别行。
2. **cause** —— `decodeHtmlEntities` 对命名实体只查 `HTML_NAMED_ENTITIES`,查不到就
   `?? match` 原样返回;`numsp`/`hairsp` 不在表里,于是实体文本进入单元格,
   后续 `\s+` 折叠也就无从触发(字面量 `&numsp;` 里没有空白字符)。
3. **fix** —— 只在 `HTML_NAMED_ENTITIES` 里补 `numsp: " "` 与 `hairsp: " "`,不改解码器、
   不改折叠正则、不改 `import-data.ts`。
4. **recheck** —— 恢复修复后重跑同一条命令:目标用例通过;再跑完整的
   `npx vitest run src/lib/html-table-parse.test.ts src/lib/import-data.test.ts`,101 passed;
   ESLint 与 `tsc --noEmit` 均干净。

## 验收与回滚

- **验收方式**:CI 上述 vitest 两个文件即可;人工验证可在导入面板粘贴一段 Word 表格,
  含 `苏&numsp;禾`,确认姓名列显示为「苏 禾」而不是带实体的原文。
- **回滚**:非破坏性变更,不涉及数据结构、导出格式或 API 形状。回滚只需从
  `HTML_NAMED_ENTITIES` 删掉 `numsp`/`hairsp` 两个键并移除对应用例,行为回到改前。
- **未提交**:按任务要求没有 commit / push,改动留在工作区。
