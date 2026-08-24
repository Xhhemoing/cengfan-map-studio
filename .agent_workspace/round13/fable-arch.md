# Round 13 — fable-arch

MODEL_SLUG: claude-fable-5-thinking-xhigh

## 任务

`src/lib/binary-import.ts` 的 `matrixToText` 仍在用 `filter(Boolean)` 丢弃空单元格，
需按 Round 12 `import-data.splitParts` 的对齐规则保留空列。
测试要求:行 `林舟,,北京市` 以三列形态存活。仅改 `binary-import.ts` 与 `binary-import.test.ts`，
不碰 `html-table-parse.ts`。

## 根因

`matrixToText` 是工作簿在两条回退路径(未识别表头、缺少必填列)喂给 `parseStudentText`
再解析的唯一入口。旧实现 `row.filter(Boolean).join("\t")` 把空单元格整个删掉，
后续每列左移一格:`["林舟", "", "北京市"]` 变成 `林舟\t北京市`,
而 `["林舟", "", "北京市", "海外"]` 会被静默误读为「在北京市就读、城市为海外」的完整记录 ——
正是 `import-data.ts` 中 `paddingColumnsByDelimiter` 注释里点名防范的那类错位。
Round 12 已在文本侧(`splitParts`)保留空格子、只丢全空的 padding 列,二进制侧却没跟上。

排查确认了修复面只需一处:表头路径的 `rawLine`(`parseExcelWorkbookRows` 第 162 行)
仅用于展示(UI 只显示 `sourceLine` 与 `reason`),`candidateFromColumns` 直接按索引读原始行,
不存在再解析错位,故不动。

## 修复

`matrixToText` 改为 `row.join("\t").replace(/\t+$/, "")`:

- 中间与前导空单元格保留为制表位,列索引对齐,与 `splitParts` 的保留规则一致;
- 只剪行尾制表符,全空行归约为空行后照旧被过滤,行为与旧实现在空行上等价;
- 全空的整列(导出残留的 padding)仍由 `paddingColumnsByDelimiter` 在文本侧统一丢弃。

新增测试「keeps a blank cell through the free-text fallback so later columns stay aligned」:
无表头矩阵含 `["林舟", "", "北京市"]`(即 CSV 行 `林舟,,北京市`),同伴行填满中列使空格子是真实缺口。
断言该行保持三列(`rawLine: "林舟\t\t北京市"`)并作为 unparsed 上报,而不是被静默错读。

## 验证(failure → cause → fix → recheck)

1. **failure:** 将 `matrixToText` 临时回退为旧的 `filter(Boolean)` 实现,新测试失败:
   `rawLine` 实际为 `林舟\t北京市`(两列),期望 `林舟\t\t北京市`(三列)。
2. **cause:** `filter(Boolean)` 丢空格子导致列左移,见上文根因。
3. **fix:** 恢复保留空列的 join 实现。
4. **recheck:** `npx vitest run src/lib/binary-import.test.ts` — 19/19 通过;
   `npx tsc -p tsconfig.app.json --noEmit` — 无错误;
   `npx eslint src/lib/binary-import.ts src/lib/binary-import.test.ts` — 无告警。

## 变更文件

- `src/lib/binary-import.ts` — `matrixToText` 保留空单元格,附注释说明对齐规则来源。
- `src/lib/binary-import.test.ts` — 新增空列对齐回归测试。

未提交(按指令 no commit/stash/branch/push)。回滚方案:还原 `matrixToText` 单行即可,
无数据、导出格式或 API 形状变更。
