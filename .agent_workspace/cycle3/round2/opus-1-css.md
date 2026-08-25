# Cycle 3 Round 2 — CSS2：清理分组选择器里残留的 `.template-workspace*`

MODEL: claude-opus-5-thinking-high-fast
Agent: C3R2-O1 ｜ 分支: `cursor/feature-expansion-research-c710` ｜ 未提交（按要求不 commit / 不 push）

## 结论

Round 1 删掉的是 `workflow-workspaces.css` 里 `.template-workspace*` 的**独立规则块**，但 `src/styles.css`
的**分组选择器**里还挂着 5 处同名残留。本轮把这 5 行删干净，同组其它工作区类
（data-upload / map-style / display-frame / content-layout / delivery）一行未动。

改动范围：`src/styles.css` **5 行删除、0 行新增**。`server/styles.test.ts` 未改（理由见下）。

## 删除清单

| 原行号 | 被删选择器 | 所在分组保留下来的兄弟选择器 |
|--------|-----------|--------------------------|
| 2485 | `.app-shell[data-editor-skin="atelier"] .template-workspace__catalog-heading h2` | `delivery-workspace__checks-title`、`data-upload-workspace__title strong`、`display-frame-editor__heading strong`、`map-style-workspace__section-heading strong`、`content-layout-workspace__section-heading strong` |
| 2554 | `.studio-stage-shell .template-workspace` | 同 shell 下 data-upload / map-style / display-frame / content-layout / delivery 五个 workspace |
| 2860 | `.studio-stage-shell .template-workspace`（`@media (max-width: 760px)`） | 同上五个 |
| 2881 | `.app-shell[…atelier] .studio-stage-shell .template-workspace` | data-upload / map-style / display-frame / content-layout（delivery 在紧邻的独立规则里，未动） |
| 2894 | `.app-shell[…atelier] .studio-stage-shell .template-workspace`（`@media (max-width: 760px)`） | 同上四个 |

每处都只删掉分组中的一行选择器，声明块（`height` / `min-height` / `font-family` / `font-weight`）原样保留。
5 处残留全部不是所在分组的**最后一个**选择器，因此没有任何一处需要改动 `{` 所在行的格式。

## failure → cause → fix → recheck

本轮**全程未出现红灯**：删除前后 `npx vitest run server/styles.test.ts` 均为 12/12 通过，eslint 退出码 0。
按验证纪律，下面记录唯一一处「本可以变成 failure」的风险点，以及它为什么没有触发。

- **潜在 failure（预判）**：`server/styles.test.ts` 的 `extractRule()` 靠 `source.indexOf("${selector} {")`
  定位规则体。若被删的选择器恰好是某个分组的**末位**（即紧跟 `{` 的那一个），删除后该分组的
  `extractRule` 查找会落空、返回 `""`，相关断言会从「包含某属性」直接变成空串失败。
- **cause 分析**：这类失败的根因是「分组末位选择器同时充当规则体的检索锚点」，而不是删除行为本身。
- **fix（实为预防）**：逐条核对 5 处残留在各自分组中的位置——全部位于中间行，末位锚点分别是
  `content-layout-workspace__section-heading strong`、`delivery-workspace`、`delivery-workspace`、
  `content-layout-workspace`、`content-layout-workspace`，均未被触碰，因此无需改测试。
- **recheck**：`rg 'template-workspace' server/styles.test.ts` 零匹配，佐证测试文件对该类名本就没有任何断言，
  「必要时才改 `server/styles.test.ts`」的前置条件不成立，故保持该文件不变。

## 验证证据

| 检查 | 命令 | 结果 |
|------|------|------|
| TSX/HTML 无消费者（删除合法性前提） | `rg 'template-workspace' --glob '*.{tsx,html}'` | 退出码 1，零匹配 |
| 目标文件残留清零 | `rg -n 'template-workspace' src/styles.css` | 退出码 1，零匹配 |
| 全仓库非 md 残留清零 | `rg -n 'template-workspace' --glob '!*.md'` | 退出码 1，零匹配（仅历史 md 记录保留） |
| 契约测试 | `npx vitest run server/styles.test.ts` | 1 file / **12 tests passed** |
| 连带回归（另两个读 `styles.css` 的测试） | `npx vitest run src/lib/shell-layout-contract.test.ts src/components/TemplateExchange.test.tsx` | 2 files / **14 tests passed** |
| Lint | `npx eslint server/styles.test.ts` | 退出码 0，无输出 |
| CSS 结构完整性 | 花括号计数 | open 1617 / close 1617，BALANCED |

## 边界遵守

- 未改 `src/components/workflow-workspaces.css`（Round 1 已清规则块）。`git diff --name-only` 中不含该文件。
- 未碰 `.data-message` / `.data-message--alert`（`styles.css:460-461`，含 Round 2 之前的 `:empty` 视觉隐藏写法），
  也未碰 `App.tsx`。
- 未重排任何无关规则；`styles.css:2492` 那处「`}` 与下一个选择器同行」的既有格式怪癖属于我编辑的分组的收尾行，
  已确认原样保留，未顺手格式化。
- 无支付相关改动；未执行 `git commit` / `git push`。
- 工作区 `git diff --name-only` 另含 `src/components/ProjectWorkbench.tsx`、`src/lib/project-package.ts`，
  属同轮 F3b 代理在共享工作树中的改动，**非本代理产出**，未读写。

## 验收方式与回滚

- **验收**：上表命令可在 PR/CI 上原样复跑。无需人工视觉验证——被删类名在 TSX/HTML 中零渲染，
  不存在携带该 class 的 DOM 节点，删除对任何实际渲染结果的计算样式为空影响。
- **非破坏性**：不涉及数据、导出格式或 API 形状，无需回滚方案。
- **回滚**：如需还原，`git checkout -- src/styles.css` 或反向 apply 该 5 行删除即可，无依赖改动。
