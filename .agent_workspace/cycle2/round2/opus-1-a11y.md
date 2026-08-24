# C2-R2 · D2/B2 无障碍复核 —— 结论：两条待修项均不成立，补 1 条缺失测试

MODEL: claude-opus-5-thinking-high-fast
范围：只读复核 `src/components/DataWorkspace.tsx`（D2 live region）与 `src/components/workspaces/ContentLayoutWorkspace.tsx`（B2 模板 `<details>`）；唯一代码改动是 `src/components/workspaces/ContentLayoutWorkspace.test.tsx` 新增 1 个用例。**未提交、未推送。**

## 1. 复核结论速览

| 待查项 | 结论 | 处置 |
|---|---|---|
| live region 空态抢焦点 | **不成立**，空态容器不可聚焦、无可聚焦后代、无任何代码给它 `focus()` | 不改 |
| 模板 `<details>` 缺少键盘可达 summary | **不成立**，用的是原生 `<summary>`，样式未破坏其可聚焦性与激活行为 | 不改，补测试锁定 |
| 把 `regional` 加进内置模板列表 | 明确不做（历史项目可读，不作为新内置预设） | 未触碰 |

## 2. 逐条证据

### 2.1 D2：空态 live region 不会抢焦点

`DataWorkspace.tsx:577-580` 的常驻容器：

```tsx
<div role="status" aria-live="polite" aria-atomic="true" className="panel-note data-message">
```

- 该 `div` **没有 `tabIndex`**，也不是原生可交互元素，因此不进 Tab 序列、不能被 `focus()` 之外的方式聚焦。
- 空态时它**没有任何子节点**（两个条件表达式都为假），所以不存在「藏在视觉隐藏容器里的可聚焦后代把焦点带到屏幕外」这一经典失效模式；即使有消息，子节点也只是 `<span>`。
- 全仓 `\.focus\(\)` 检索（`src/**/*.tsx`）共 24 处调用，分别落在 GlobalSettingsScreen 的 tab 漫游、DataUploadWorkspace 的 rail tab 漫游、StudioAssistantDrawer 的抽屉焦点收束、StudioEditorShell 的返回焦点，以及若干测试内的 `input.focus()`。**没有任何一处指向 `.data-message` / `[role="status"]`**。
- `styles.css:462` 的空态规则是视觉隐藏（`position: absolute; width/height: 1px; overflow: hidden; clip-path: inset(50%)`），属于布局层处置，与焦点管理无关；Round 1 刻意避开 `display: none`，正是为了让 region 留在无障碍树内，这条不能反向「修」回去。

结论：不存在可修的真实缺陷。空态唯一可议的残留是「1×1 px 绝对定位元素理论上可吞掉 1 像素范围的指针事件」，属于假想级别且需要额外 `pointer-events: none`，判为 drive-by，不做。

### 2.2 B2：模板折叠区已经是键盘可达的原生 summary

`ContentLayoutWorkspace.tsx:145-149`：

```tsx
<details className="content-layout-workspace__assets content-layout-workspace__templates" aria-label="整体模板与交换">
  <summary>整体模板与交换</summary>
```

- 原生 `<summary>` 作为 `<details>` 的首个子元素，浏览器默认赋予其可聚焦性与 Enter/Space 激活行为，无需 `tabindex` 或 `role="button"`；补这些属性反而会与原生语义打架。
- 唯一命中的样式 `styles.css:3193` 只设 `color / font-size / font-weight / cursor`，**没有** `display`、`list-style`、`pointer-events`、`visibility` 等会破坏 summary 语义或可聚焦性的声明（对照 `.project-menu summary`、`.property-panel__advanced summary` 那种 `list-style: none` 的写法，这里连标记都保留了）。
- 焦点可见性：暗色皮肤 `styles.css:1505` 与 atelier 皮肤 `styles.css:2413` 都把 `summary` 纳入 `:focus-visible` 描边；默认皮肤沿用 UA 默认描边——全仓仅 `styles.css:195` 的 `.editable-text:focus` 清了描边，没有全局 `outline: none` 重置。
- jsdom 29.1.1 环境实测：`summary.focus()` 后 `document.activeElement === summary`，`summary.click()` 后 `details.open === true`，即语义链完整。

### 2.3 `regional` 未触碰

`src/lib/project-data.ts:20` 已有注释「`regional` remains readable for historical projects but is not shown as a new built-in preset」，`template-store.ts:29` 的 `MAP_TEMPLATE_IDS` 保留它仅用于历史工程读取。本轮不改任何模板 id 列表，也未改 `App.tsx` 传给 `ContentLayoutRail` 的 `templates`。

## 3. 唯一改动：补 1 条缺失测试

`src/components/workspaces/ContentLayoutWorkspace.test.tsx` 新增
`opens the template disclosure through a native keyboard-focusable summary`：

- 断言折叠区首层是 `SUMMARY` 且 `parentElement === details`（挡住「换成 `<div onClick>` 自绘折叠」的回归）；
- 断言 summary 没有 `tabindex`、没有 `aria-hidden`、文案为「整体模板与交换」（挡住「补一个多余 `tabindex` 或把标题搬进 `aria-hidden` 装饰层」）；
- `summary.focus()` 后 `document.activeElement` 命中它，再 `click()` 后 `details.open` 由 `false` 变 `true`（锁定键盘可达 + 展开行为）。

既有 4 条用例一字未改。为什么补在 B2 而不是 D2：D2 的 `announces import results in a live region that stays mounted while empty` 已经用「同一节点 `toBe(region)`」守住了核心不变量，而 B2 侧只断言过 `details.open === false`，从未验证这个折叠区能不能用键盘打开——那是本次两项复核中唯一真正缺测的点。

## 4. 验证链（failure → cause → fix → recheck）

本轮**无失败环节**，如实记录，并附加改动前的基线对照：

| 步骤 | 命令 | 结果 |
|---|---|---|
| 基线（改动前） | `npx vitest run src/components/DataWorkspace.test.tsx src/components/workspaces/ContentLayoutWorkspace.test.tsx` | 2 files, **37 passed**（33 + 4） |
| jsdom 能力预检 | node + jsdom 29.1.1 直接构造 `<details><summary>` | `activeElement === summary` 为 true；`click()` 后 `open` 为 true — 证明新用例的断言在本环境有意义，不是空跑 |
| 目标测试（改动后） | 同上 | 2 files, **38 passed**，Duration 2.13s |
| Lint | `npx eslint src/components/workspaces/ContentLayoutWorkspace.test.tsx` | exit 0 |
| 类型 | `npx tsc --noEmit -p tsconfig.app.json` | 无输出，exit 0 |

预先排查并证伪的失败假设：**「jsdom 不实现 summary 可聚焦或 details 激活行为，新用例会假阳/假阴」** —— 先用独立 jsdom 探针验证两项行为均已实现，再落笔写断言，避免写出一条在 jsdom 里恒真的空断言。

## 5. 顺带发现（本轮未修，建议进 Round 3）

`styles.css:3790` `.template-exchange__status:empty { display: none; }`：`TemplateExchange.tsx:106` 的状态条是 `role="status" aria-live="polite"` 的常驻 `<p>`，但空态被 `display: none` 移出无障碍树 —— 这正是 D2 报告第 1.2 节论证过要避开的写法（region 与内容同时进入 a11y 树时，NVDA / VoiceOver 常常不播报），而 B2 刚把 `TemplateExchange` 放到内容阶段主路径，命中概率随之上升。修法与 D2 同构（换成 `.data-message:empty` 那套视觉隐藏），一行 CSS。本轮判为超出「D2/B2 复核」授权范围，不做，仅登记。

## 6. 手动验收（自动化覆盖不到的部分）

1. 内容与排版阶段：只用键盘 Tab 到「整体模板与交换」，确认有可见焦点环（默认/暗色/atelier 三皮肤各看一次），Enter 与 Space 都能展开，展开后能继续 Tab 进入模板按钮与「导入模板文件」。
2. 数据阶段开 VoiceOver / NVDA：无消息时确认焦点顺序里不会出现空白停留点；触发「下载 XLSX 模板」后确认消息被播报且焦点仍停在原按钮上（不被 live region 夺走）。

## 7. 回滚

唯一改动是新增测试用例，回滚 = 删除 `ContentLayoutWorkspace.test.tsx` 中该 `it(...)` 块。无产品代码、无 CSS、无数据/导出格式/API 形状变更，零存储影响，无破坏性风险。
