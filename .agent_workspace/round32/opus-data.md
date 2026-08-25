# R32-opus-data — HTML 实体表补 `&MediumSpace;`

- **模型**: claude-opus-5-thinking-high-fast
- **分支**: `cursor/agent-sota-polish-cbcd`(未 commit / 未 push,按约束)
- **改动文件**: `src/lib/html-table-parse.ts`、`src/lib/html-table-parse.test.ts`

## 缺口

`HTML_NAMED_ENTITIES` 收了 `emsp/emsp13/emsp14/ensp/hairsp/numsp/puncsp/thinsp`,唯独缺 HTML5
的 `&MediumSpace;`(U+205F MEDIUM MATHEMATICAL SPACE)。Word/HTML5 具名字符引用表里有它,
一份用它撑开两字姓名的粘贴表格,`苏&MediumSpace;禾` 会原样落进 `name` 字段,姓名带着实体文本进
名单。

## 改动

1. `src/lib/html-table-parse.ts`:实体表加 `mediumspace: " "`,并顺带补 `thickspace: " "`
   (`&ThickSpace;` 在 HTML5 里是 U+205F U+200A,整名映射成单个 `" "` 与本表"排版空格一律解码
   成可折叠空格"的口径一致)。解码器走 `entity.toLowerCase()`,所以键写全小写。记录仍是**一条**
   `Record`、仍按字母序:`… hairsp, lt, mediumspace, nbsp, numsp, puncsp, quot, thickspace,
   thinsp`。文件 209 行。
2. `src/lib/html-table-parse.test.ts`:照 emsp13 用例加一条
   `reads a name padded with the &MediumSpace; of an HTML5 export`,覆盖 `苏&MediumSpace;禾`、
   大写 `林&MEDIUMSPACE;舟`(验大小写不敏感)、`顾&ThickSpace;言`、以及连写
   `陈&MediumSpace;&ThickSpace;白` → 均折叠为一个空格。文件 308 行。

解码成 `" "` 之后由 `htmlCellText` 里既有的 `\s+ → " "` 折叠收口,不需要动 `htmlCellText`,
也不需要动 `import-data.ts`(已 400 行,未触碰)。

## 验证链(failure → cause → fix → recheck)

1. **failure(先证测试真的抓得住)**:临时删掉 `mediumspace` 键后跑
   `npx vitest run src/lib/html-table-parse.test.ts src/lib/import-data.test.ts` →
   `Tests 1 failed | 107 passed`,失败点正是新用例第 92 行,diff 显示
   `- "name": "林 舟"` / `+ "name": "林&MEDIUMSPACE;舟"`、`+ "name": "陈&MediumSpace; 白"`;
   `顾&ThickSpace;言` 这一行此时仍通过,说明失败被隔离到 `mediumspace` 这一个键上。
2. **cause**:`decodeHtmlEntities` 对未知具名实体走 `?? match` 原样返回,`&MediumSpace;` 不在表
   里就整段留在单元格文本中,后面的 `\s+` 折叠对它无能为力。
3. **fix**:恢复 `mediumspace: " "`(并加 `thickspace: " "`)。另单独删 `thickspace` 复跑一次,
   只有 `顾&ThickSpace;言` 一行失败(`+ "name": "顾&ThickSpace;言"`),确认这个键同样是承重的、
   不是凑数;随后恢复。
4. **recheck**:同一条命令
   `npx vitest run src/lib/html-table-parse.test.ts src/lib/import-data.test.ts` →
   **Test Files 2 passed / Tests 108 passed**。另跑
   `npx eslint src/lib/html-table-parse.ts src/lib/html-table-parse.test.ts`(clean)与
   `npx tsc --noEmit -p tsconfig.app.json`(clean)。

## 禁项自查

- 未加 `·` 分隔符;未加 ASCII `:` `/`;未把 `ldquo/rdquo` 映射成空格(第 79 行"leaves an entity
  that is not whitespace alone"用例仍原样通过)。
- 未解码 `ZeroWidthSpace` / `zwsp`——零宽空格折成可见空格会在姓名里凭空造出分隔符,与"排版空格
  折叠"不是一回事,明确不收。
- 未扩 `import-data.ts`;未 commit / stash / checkout / push / 建分支;两个文件均 ≤400 行。

## 验收方式与回滚

- **验收**:CI 跑 `npm test`;或本地
  `npx vitest run src/lib/html-table-parse.test.ts src/lib/import-data.test.ts`;手动验收可在导入
  面板粘贴一份含 `苏&MediumSpace;禾` 的 HTML 表格,姓名列应显示 `苏 禾`。
- **破坏性评估**:非破坏。只影响此前会原样保留实体文本的输入(那本来就是坏数据),导出格式、API
  形状、存储结构均未变。
- **回滚**:删掉 `HTML_NAMED_ENTITIES` 里的 `mediumspace` / `thickspace` 两个键及对应用例即可,
  单文件两行,无数据迁移。
