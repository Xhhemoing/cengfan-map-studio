# R30-opus-data — HTML5 空格实体 `emsp13` / `emsp14` / `puncsp`

- **模型**: claude-opus-5-thinking-high-fast
- **分支**: `cursor/agent-sota-polish-cbcd`（未 commit / 未 push，按约束）
- **改动文件**: `src/lib/html-table-parse.ts`、`src/lib/html-table-parse.test.ts`

## 缺口

`HTML_NAMED_ENTITIES` 只覆盖 `emsp / ensp / hairsp / nbsp / numsp / thinsp` 六个排版空格。Word 与
HTML5 导出还会用 U+2004 / U+2005 / U+2008 对齐两字姓名与列间距，写成 `&emsp13;` `&emsp14;`
`&puncsp;`。解码器认不出，实体原文会被 `trimImportCell` 原样留在姓名里（`顾&puncsp;言`）。

## 实现

`html-table-parse.ts` 的实体表新增三个键，与既有排版空格一样映射为普通空格 `" "`，让
`htmlCellText` 的 `\s+` 折叠把它们并入分隔用的那一个空格：

```ts
const HTML_NAMED_ENTITIES: Record<string, string> = {
  amp: "&", apos: "'", emsp: " ", emsp13: " ", emsp14: " ", ensp: " ", gt: ">",
  hairsp: " ", lt: "<", nbsp: " ", numsp: " ", puncsp: " ", quot: '"', thinsp: " ",
};
```

- 键全小写，解码走 `entity.toLowerCase()`，`&EMSP13;` 同样命中。
- 记录仍按字典序：`emsp < emsp13 < emsp14 < ensp`、`numsp < puncsp < quot`。
- 解码正则 `[a-z][a-z0-9]*` 本就允许尾部数字，`&emsp13;` 无需改正则。
- 未新增任何分隔符；`·`、ASCII `:` `/` 未触碰；`ldquo`/`rdquo` 未映射（"不是空白的实体原样保留"
  一测仍通过）；零宽空格未解码；`import-data.ts` 未改动，仍是 400 行。

## 测试

`html-table-parse.test.ts` 仿 "figure and hair spaces" 用例新增一条，含双实体折叠行：

```
苏&emsp13;禾 / 林&emsp14;舟 / 顾&puncsp;言 / 陈&emsp13;&puncsp;白
→ 苏 禾 / 林 舟 / 顾 言 / 陈 白
```

## 验证证据链（failure → cause → fix → recheck）

1. **failure（反向对照）**：临时从实体表删掉 `puncsp`，跑
   `npx vitest run src/lib/html-table-parse.test.ts -t "fractional em"` → 新测失败，姓名里留着实体原文：
   `name: '顾&puncsp;言'`、`name: '陈 &puncsp;白'`（`emsp13` 已折叠，`puncsp` 未折叠）。
2. **cause**：`decodeHtmlEntities` 对表中没有的具名实体返回 `match` 原文，实体文本因此进入姓名列。
3. **fix**：恢复 `puncsp: " "`（连同 `emsp13`/`emsp14`），三者与既有排版空格一致映射为普通空格。
4. **recheck**：同一命令 + 全量目标套件重跑通过。

```
npx vitest run src/lib/html-table-parse.test.ts src/lib/import-data.test.ts
→ Test Files 2 passed (2) · Tests 102 passed (102)

npx tsc --noEmit -p tsconfig.app.json | rg html-table-parse → 无匹配（本槽位文件零类型错误）
npx eslint src/lib/html-table-parse.ts src/lib/html-table-parse.test.ts → 通过
```

行数：`html-table-parse.ts` 208 行、`html-table-parse.test.ts` 286 行、`import-data.ts` 400 行（未动）。

> 备注：本次 `tsc -p tsconfig.app.json` 全量输出里有 `src/lib/card-layout-cache.ts(24,10)` /
> `(49,12)` 两条 `TS1005`，来自同轮另一槽位正在编辑的文件，与本改动无关（工作区 `git status`
> 显示该文件被并行修改）。

## 验收与回滚

- **验收方式**：上面的 vitest 命令即验收；CI 跑同一套件。
- **破坏性**：无。仅新增三个具名实体映射，不改导出格式、API 形状或既有实体行为；未识别实体与非
  空白实体仍原样保留。
- **回滚**：从 `HTML_NAMED_ENTITIES` 删掉 `emsp13` / `emsp14` / `puncsp` 三个键并删除新增测试用例
  即可完全还原，无数据迁移。
