# Cycle 3 Round 3 · 任务 Empty · C3R3-O1

代理：C3R3-O1（claude-opus-5-thinking-high-fast）
基线：HEAD `18a45f9`（Round 2）
改动文件：`src/components/DataWorkspace.tsx`、`src/components/DataWorkspace.test.tsx`
未改动：`src/styles.css`（`.data-message:empty` 收起规则保持原样）；未 commit / push。

## 1. 目标

`DataWorkspace` 的两个常驻 live region（`role="status"` 与 `role="alert"`）在空闲时必须匹配 CSS `:empty`，否则
`styles.css:463` 的 `.data-message:empty { ... clip-path: inset(50%) }` 不生效，页面上会露出空的绿框 / 红框。

## 2. 验证链（failure → cause → fix → recheck）

本轮的特殊之处：**先证明测试有效，再落防御性改法**。

1. **先加断言，跑基线**
   新增用例 `leaves both live regions CSS-:empty while idle so the collapse rule applies`，
   断言空闲时 `statusRegion.matches(":empty") === true`、`alertRegion.matches(":empty") === true`，
   并追加 `childNodes.length === 0` 双保险。
   在**未改产品代码**的 Round 2 源码上运行：`1 passed`。
   → 结论：Round 2 的 JSX 在 React 18 客户端渲染下**当前没有**空白文本节点
   （JSX 会剥掉含换行的缩进空白；`message === ""` 时 `{message && ...}` 求值为 `""`，React 不为空字符串建文本节点）。

2. **failure（人为复现，验证测试灵敏度）**
   临时在 alert region 里插入 `{" "}`（模拟一次普通的 JSX 换行/空白回归）后重跑：

   ```
   FAIL  DataWorkspace > leaves both live regions CSS-:empty while idle ...
   AssertionError: expected false to be true
    ❯ src/components/DataWorkspace.test.tsx:237  expect(alertRegion.matches(":empty")).toBe(true)
   ```

3. **cause**
   `:empty` 按规范对**任何**子节点（含纯空白文本节点）都不匹配。原写法把两个条件表达式分行摆在父节点里，
   一旦有人在同一父节点内写入非换行空白（`{" "}`、行尾拼接、条件后跟文字），就会生成文本节点，
   `clip-path` 收起规则整体失效 → 空绿/红框暴露。同时 `{cond && jsx}` 这种短路写法在 `cond` 为字符串时
   会把 `""` 交给渲染器，属于易碎写法。

4. **fix**
   还原人为回归，按要求把两个 region 改成**无空白子节点的单行**，且条件分支显式返回 `null`：

   ```tsx
   <div role="status" ... className="panel-note data-message">{replaceConfirmation ? <span .../> : null}{message && !isImportFailureMessage(message) ? <span .../> : null}</div>
   <div role="alert" ... className="panel-note data-message data-message--alert">{message && isImportFailureMessage(message) ? <span .../> : null}</div>
   ```

   注释同步说明"任何空白文本节点都会让 `:empty` 失效"，防止后续格式化时被拆回多行。

5. **recheck**

   ```
   npx vitest run src/components/DataWorkspace.test.tsx src/lib/import-message.test.ts src/components/AppProjectMode.test.tsx
   → Test Files 3 passed (3) | Tests 71 passed (71)

   npx eslint src/components/DataWorkspace.tsx src/components/DataWorkspace.test.tsx
   → 0 problems

   npx tsc --noEmit -p tsconfig.app.json
   → 0 errors
   ```

## 3. 行为不变性

- 两个 region 仍然**常驻挂载**（既有用例 "same node reused" 全部保留并通过）。
- 失败消息仍走 `role="alert" aria-live="assertive"`，成功/进度消息仍走 `role="status" aria-live="polite"`，
  路由判定仍由 `isImportFailureMessage` 决定，未改判定逻辑。
- 替换摘要仍与 status 消息同区、同 `aria-atomic="true"` 播报。
- 未删除任何既有用例；`DataWorkspace.test.tsx` 仅新增 1 个用例（36 个用例）。

## 4. 新增测试覆盖点

`leaves both live regions CSS-:empty while idle so the collapse rule applies`：

| 阶段 | status `:empty` | alert `:empty` |
|------|------|------|
| 初始空闲 | true（且 `childNodes.length === 0`） | true（且 `childNodes.length === 0`） |
| 空名单点"一键识别并导入"（失败消息） | true | false |
| 随后下载 XLSX 模板（成功消息） | false | true |

即"有消息的一侧非 `:empty`、无消息的一侧回到 `:empty`"双向都被钉住。

## 5. 备注与残留风险

- 全仓 `.data-message` 只出现在 `DataWorkspace.tsx`（产品代码）与 `styles.css`，无其他组件复用该收起规则，改动无外溢。
- 残留风险：本用例只覆盖 React 客户端渲染路径下的 DOM 形状；若将来引入 SSR/hydration 或 Prettier 强制换行，
  可能重新引入空白节点——新用例会立刻失败，属于可检出回归。
- 回滚方案：改动为纯 JSX 排版 + 一个新增测试，`git checkout 18a45f9 -- src/components/DataWorkspace.tsx src/components/DataWorkspace.test.tsx` 即可完全回退，无数据 / 导出格式 / API 形状变更。
- 验收方式：CI 上 `npx vitest run src/components/DataWorkspace.test.tsx`；人工验收为浏览器打开数据工作台，
  空闲时不应看到任何空的绿框/红框，导入失败时应出现红框 alert。
- 未涉及支付、套餐、模板手续费。
