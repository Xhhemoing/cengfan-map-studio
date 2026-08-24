MODEL_SLUG: claude-opus-5-thinking-high-fast

# Round 26 — 排版空格实体解码(ensp / emsp / thinsp)

## 结论

确认问题真实存在,已修复:`HTML_NAMED_ENTITIES` 此前只覆盖 amp/apos/gt/lt/nbsp/quot,
Word 与在线表格用来撑开两字姓名的 `&emsp;` `&ensp;` `&thinsp;` 会原样落进姓名里
(`苏&emsp;禾`)。现在三者都解码为普通空格,与 `nbsp` 的处理保持一致。

## 改动文件

- `src/lib/html-table-parse.ts` — `HTML_NAMED_ENTITIES` 增加 `emsp` / `ensp` / `thinsp`,
  均映射为普通空格 `" "`(与既有 `nbsp: " "` 一致,`cat -A` 确认 `nbsp` 映射的是 ASCII
  空格而非 U+00A0)。解码发生在 `htmlCellText` 的 `.replace(/\s+/g, " ")` 折叠之前,
  所以 `苏&emsp;禾` → `苏 禾`,与既有 `&nbsp;` 用例的期望完全一致。文件 199 → 207 行。
- `src/lib/html-table-parse.test.ts` — 新增两个用例(+28 行)。

未改动 `import-data.ts`、`binary-import.ts`,未引入任何分隔符改动,未引入 Playwright。
`ldquo`/`rdquo` 保持不映射(见下方守卫用例)。

## 新增测试

1. `reads a name a word processor padded out with typographic spaces`
   经既有的 `parseHtmlTable` 走完整链路:`苏&emsp;禾` → name `苏 禾`;
   `林&ensp;&thinsp;舟` → name `林 舟`(两个连续空格实体被既有折叠规则合成一个空格)。
2. `leaves an entity that is not whitespace alone`
   回归守卫:`&ldquo;强基&rdquo;计划 &amp; A&unknown;B` 仍解码为
   `&ldquo;强基&rdquo;计划 & A&unknown;B` —— 弯引号没有被当成空格,未知实体原样保留,
   `&amp;` 照常解码。保证本次改动不会顺手吞掉非空白实体。

## 验证链(failure → cause → fix → recheck)

1. **failure**:任务给定的现象复现于代码本身 —— `HTML_NAMED_ENTITIES` 缺三个键,
   `decodeHtmlEntities` 对未知具名实体走 `?? match` 原样返回,实体字面量进入姓名。
2. **cause**:实体表只覆盖了 HTML 转义必需的五个 + `nbsp`,没有覆盖排版类空格实体;
   而这些实体是 Word/在线表格对齐姓名的默认产物。
3. **fix**:向映射表补 `emsp`/`ensp`/`thinsp` → `" "`,不动解码函数逻辑与折叠顺序。
   保守起见未加 `zwnj`/`zwj`(任务允许跳过,收益低于误伤姓名的风险)。
4. **recheck**:
   - `npx vitest run src/lib/html-table-parse.test.ts src/lib/import-data.test.ts`
     → **2 files passed / 93 tests passed**。
   - **反向验证(证明测试非空转)**:临时把映射表还原成修复前的六个键后重跑,
     新用例 1 如期失败(实际得到 `name: "苏&emsp;禾"`),
     `Tests 1 failed | 15 passed`;随后还原文件并重跑,再次 93 passed。
   - `npx tsc --noEmit` → exit 0;`npx eslint src/lib/html-table-parse{,.test}.ts` → exit 0。

## 交付与回滚

- 验收方式:上述两个测试文件在 CI 中运行即可覆盖;人工验证可从 Word 复制一张用
  `&emsp;` 对齐姓名的表格粘贴到导入框,姓名不应再出现 `&emsp;` 字样。
- 破坏性风险:低。仅影响此前必然错误的输入(实体字面量本就不该出现在姓名中),
  导出格式与 API 形状均未变。
- 回滚方案:把 `HTML_NAMED_ENTITIES` 改回
  `{ amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' }`
  并删除两个新增用例即可,无数据迁移。

## 未提交

按指令未执行 git commit / stash / checkout / push / 分支操作。工作区内其他被修改的
文件(`server/client-ip.*`、`src/components/*`、`src/lib/card-layout-*`)来自并行 agent,
非本次改动。
