# D2 · 导入消息常驻 aria-live —— 实现与证据链

MODEL: claude-opus-5-thinking-high-fast
范围：`src/components/DataWorkspace.tsx`、`src/components/DataWorkspace.test.tsx`、`src/styles.css`（仅 `.data-message` 系列选择器）。未提交、未推送。

## 1. 改了什么

### 1.1 `src/components/DataWorkspace.tsx:577-580`

改前（两个条件渲染的 `<p>`，无任何 role）：

```tsx
{replaceConfirmation && <p className="panel-note data-message">替换摘要：当前 {replaceConfirmation.currentCount} 条，新 {replaceConfirmation.nextCount} 条</p>}
{message && <p className="panel-note data-message">{message}</p>}
```

改后（一个常驻容器，两条消息作为内部行）：

```tsx
<div role="status" aria-live="polite" aria-atomic="true" className="panel-note data-message">
  {replaceConfirmation && <span className="data-message__line">替换摘要：当前 {replaceConfirmation.currentCount} 条，新 {replaceConfirmation.nextCount} 条</span>}
  {message && <span className="data-message__line">{message}</span>}
</div>
```

三点设计取舍：

1. **容器常驻**，不写 `{message && <div …>}`。屏幕阅读器只播报「已在无障碍树里的 live region 内部发生的变化」；region 与内容同时插入 DOM 时 NVDA / VoiceOver 经常不播——这是本条改动的全部技术含量，也是测试里 `toBe(region)` 那一行要守住的东西。
2. **只有一个 region**。`replaceConfirmation` 与 `message` 在「替换导入」时会同时出现，若各挂一个 `role="status"`，两个 polite region 会互相打断。`aria-atomic="true"` 保证整块重播。
3. **失败消息不升级为 `role="alert"`**。`setMessage` 同一个状态位既承载成功（`已导入 N 条`）也承载失败（`Excel 解析失败`、`模板下载失败`），拆 assertive 需要给 message 加 tone 字段，超出 D2 范围。

`className` 保留 `panel-note data-message`（按任务要求挂在常驻容器上），因此 `styles.css:397` 的栅格规则
`.workspace--data .import-review, .workspace--data .data-message { grid-column: 1 / -1; order: 4; }`
与 `styles.css:1471` 的暗色规则 `.data-workspace .data-message` **都不需要改**——容器仍是 `.data-workspace` 的直接栅格子元素，跨列与排序不变。这避开了 Round 2 方案里「包一层 div 导致 `.data-message` 不再是 grid 直接子元素」的回归点。

### 1.2 `src/styles.css`（紧邻原 `:460` 的 `.data-message`，新增 4 行）

```css
/* 常驻 live region：无消息时收成不可见的 1px，既不撑出空框也不离开无障碍树。 */
.data-message:empty { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; background: none; border: 0; clip-path: inset(50%); }
.data-message__line { display: block; }
.data-message__line + .data-message__line { margin-top: 4px; }
```

为什么不是 `.data-message:empty { display: none; }`：`display: none` 会把元素移出无障碍树，等于 region 仍然「和内容一起出现」，本条改动就变成假的。这里用标准 visually-hidden 写法保留在树内；同时 `position: absolute` 让空 region 不再作为栅格项参与 `.data-workspace { gap: 10px }` 的行距计算，空态零布局影响。

JSX 里两个条件表达式之间只有含换行的空白（被 JSX 剥离），所以无消息时容器真的没有子节点，`:empty` 成立——测试中的 `region.textContent === ""` 即为此断言。

## 2. 测试

`src/components/DataWorkspace.test.tsx` 新增 2 个用例（未改动任何既有用例）：

- `announces import results in a live region that stays mounted while empty`：渲染后立刻断言 region 已在 DOM（`[role="status"].data-message`）、`aria-live="polite"`、`aria-atomic="true"`、`textContent === ""`，且全组件只有一个 `role="status"`；点「下载学生数据 XLSX 模板」后断言**同一个 `region` 变量**的 `textContent` 含「已下载学生数据导入模板」，最后 `expect(container.querySelector(...)).toBe(region)` 证明节点未被卸载重建。
- `keeps the replace summary inside the same live region as the import message`：智能识别 → 「替换全部」→ 断言「当前 1 条」与「已替换 1 条学生数据」都落在同一个 region 内，且 region 仍是同一节点。

导入成功可见性由既有用例 `offers a canonical XLSX template download action`（断言 `container.textContent` 含「已下载学生数据导入模板」）与既有 `shows candidate counts and keeps replacement cancellable`（断言「当前 1 条」「新 2 条」）继续守住，两者均未修改且通过。

## 3. 验证链（failure → cause → fix → recheck）

本轮**一次通过，无失败环节**，如实记录：

| 步骤 | 命令 | 结果 |
|---|---|---|
| 目标测试 | `npx vitest run src/components/DataWorkspace.test.tsx` | **33 passed**（原 31 + 新 2），Duration 2.10s |
| 邻接回归 | `npx vitest run src/components/workspaces/DataUploadWorkspace.test.tsx` | **7 passed**（该组件复用 `DataWorkspace`） |
| Lint | `npx eslint src/components/DataWorkspace.tsx src/components/DataWorkspace.test.tsx` | 0 errors（`styles.css` 无 ESLint 配置，报 ignored warning，属既有状态） |
| 类型 | `npx tsc --noEmit -p tsconfig.app.json` | 无输出，exit 0 |

预先排查过的两个失败假设，均已证伪：

- **假设 A：包裹后 `.data-message` 失去栅格规则** → 通过把 `data-message` 类留在常驻容器上而非内部 `<span>`，`styles.css:397/1471` 两条选择器命中的仍是同一个直接子元素，无需改选择器，回滚面也随之缩小到「删 4 行 CSS + 还原 JSX」。
- **假设 B：`:empty` 不匹配（JSX 残留空白文本节点）** → JSX 剥离含换行的纯空白，容器无子节点；`region.textContent === ""` 断言在 jsdom 中通过，间接确认无残留文本节点。

## 4. 无法自动化的手动验收

1. 数据阶段点「下载 XLSX 模板」，开 VoiceOver（`Cmd+F5`）或 NVDA，确认「已下载学生数据导入模板」被读出；再拖一个 Excel 进去，确认「已导入 N 条」被读出。
2. 无消息时看数据工作区：消息位不应留下 8px 的空框，也不应多出一行栅格间距。
3. 有消息时看消息块是否仍横跨整行、位置仍在导入区之后（`order: 4`）；暗色皮肤下背景/描边是否仍生效。

## 5. 回滚

还原 `DataWorkspace.tsx:577-580` 为改前的两行 `<p>`，并删除 `styles.css` 中紧邻 `.data-message` 的 4 行（注释 + `:empty` + 两条 `__line`）。**不涉及** `styles.css:397` / `:1471` 的选择器改动，因此不存在「只回滚一半的栅格规则」风险。无数据格式、导出格式、API 形状变更，零存储影响。

## 6. 边界确认

未触碰 `src/App.tsx`、`DataUploadWorkspace` 的隐藏开关、任何支付相关代码；`styles.css` 的改动全部落在 `.data-message` 系列选择器上。工作区内其他文件的改动来自并行任务（F2/H2/B2/P2），不属本条。
