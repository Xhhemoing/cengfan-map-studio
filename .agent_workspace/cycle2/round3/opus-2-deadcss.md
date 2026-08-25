# Round 3 — 死 CSS 清理：`.template-workspace__swatch*`

模型：claude-opus-5-thinking-high-fast
分支：`cursor/feature-expansion-research-c710`（未提交、未推送，按指令保留在工作区）

## 结论

Round 2 审计（`.agent_workspace/cycle2/round2/fable-1-audit.md:38`）的判断成立：`.template-workspace__swatch*` 四条规则确为死代码，已删除。**仅**删除这四行，未动其它任何 CSS。

## 一、rg 确认零消费者

| 检索 | 范围 | 结果 |
| --- | --- | --- |
| `template-workspace__swatch` | 全仓库 | 仅 `workflow-workspaces.css:43-46`（规则自身）+ round2 审计 md |
| `swatch`（忽略大小写，排除 `*.md`） | 全仓库 | 仅上述 4 行 + 无关的 `prototype-inspector-swatch`（`WorkflowPrototype.tsx:85` / `workflow-prototype.css:100`，属另一套原型样式） |
| `swatch` | `src/styles.css` | 0 次 —— 排除皮肤层（`[data-editor-skin="atelier"]`）复合选择器覆盖 |
| `--\$\{` / `` `xxx__${ `` 模板串 | 全部 `*.tsx` | 无任何拼接出 `template-workspace__swatch--*` 的写法；命中的都是 `template-card__preview--${templateId}`、`data-overview__metric--${id}` 等其它前缀 |
| `template-workspace` | 全仓库非 md | 只出现在两个 CSS 文件与 `server/styles.test.ts` |

补充两点判断依据：

1. **不是动态类名漏检。** 修饰符 `--cartoon / --q / --grain / --scenery / --regional` 看着像模板 id，容易怀疑是 `` `...__swatch--${templateId}` `` 拼出来的。实际拼接点在 `src/App.tsx:2114` 的 `` `template-card__preview template-card__preview--${templateId}` ``，对应 `src/styles.css:160` 的 `.template-card__preview--*` 一族 —— 那才是现行实现，swatch 是被它取代的旧模板工作区遗留。
2. **未牵连测试断言。** `server/styles.test.ts` 对 `.template-workspace__*` 有 6 处断言（`catalog` / `detail` / `footer .primary-button` / `layout` 及根选择器），但**没有一条**涉及 swatch。

## 二、改动

`src/components/workflow-workspaces.css`，删除 43-46 行共 4 行，diff 为纯删除、零新增：

```
-.template-workspace__swatch { width: 44px; height: 38px; ... }
-.template-workspace__swatch--cartoon, .template-workspace__swatch--q { ... }
-.template-workspace__swatch--grain { ... }
-.template-workspace__swatch--scenery, .template-workspace__swatch--regional { ... }
```

刻意**未**动的相邻内容：

- `:39` 的 `.template-workspace__list button { grid-template-columns: 44px minmax(0, 1fr) auto; }` —— 首列 `44px` 原本正是留给 swatch 的槽位。既然整个 `.template-workspace` 列表在 TSX 中同样零渲染，改它属于扩大范围，且会触发对布局契约的重新论证，本轮不碰。
- 整个 `.template-workspace` 区块（`:20-53`、`:83-102`）虽同样没有 TSX 消费者，但 `server/styles.test.ts` 对其中多条规则有断言，删除会直接红灯。这是本轮之外的独立议题，记录于下方"遗留"。

## 三、验证（failure → cause → fix → recheck）

- 唯一读取该 CSS 文件的测试：`npx vitest run server/styles.test.ts` → **12 passed / 1 file，0 失败**。
- 本轮**无 failure 环节**：删除前先用上表的 rg 矩阵证明零引用，且预先核对过测试断言不覆盖 swatch，因此一次通过，不存在"重试蒙混"的情况。
- 未运行全量 `npm test`：本轮只删纯装饰性、零引用的 CSS 声明，不改选择器结构、不改 JS/TS，影响面封闭在该文件内。

## 四、交付与回滚

- **状态**：按指令**未 commit、未 push**，改动留在工作区。工作区另有 `CHANGELOG.md`、`src/components/TemplateExchange.test.tsx`、`src/styles.css` 三处前序轮次的未提交改动，非本轮产物，未触碰。
- **验收方式**：`rg 'template-workspace__swatch' -n`（应零命中）+ `npx vitest run server/styles.test.ts` 全绿；视觉上无需人工验证，因为无 DOM 节点携带这些类名。
- **非破坏性**：不涉及数据、导出格式或 API 形状。
- **回滚**：`git checkout -- src/components/workflow-workspaces.css`（会一并丢弃该文件的其它未提交改动，本轮该文件仅含此 4 行删除）；若已提交则 `git revert <sha>`。

## 五、遗留

整个 `.template-workspace` 区块（约 34 条规则 + 两段媒体查询）在 TSX 中同样零渲染，疑似与 swatch 同批遗留。清理它需要同步改写 `server/styles.test.ts` 的 6 条断言，属于"删规则 + 改契约测试"的组合改动，需单开一轮并明确该契约是否仍要保留。
