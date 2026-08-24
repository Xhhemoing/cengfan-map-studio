# Cycle 2 Round 3 — `.template-exchange__status:empty` 无障碍修复（opus-1）

承接 Round 2 登记项（`.agent_workspace/cycle2/round2/opus-1-a11y.md` 第 5 节）与 `CYCLE2-ROUND2-BRIEF.md` 的「Round 3 必须修」。改动范围：`src/styles.css` 一条规则 + `src/components/TemplateExchange.test.tsx` 测试。未改 `App.tsx`，不涉及支付。**未 commit、未 push**（按任务要求）。

## 1. 问题

`src/components/TemplateExchange.tsx:106` 是一个常驻的 live region：

```106:106:src/components/TemplateExchange.tsx
      <p className="template-exchange__status" role="status" aria-live="polite">{status}</p>
```

组件把它常驻渲染是对的——屏幕阅读器只播报「已经在无障碍树里的 live region 内部发生的变化」，region 与内容同时插入 DOM 时 NVDA / VoiceOver 经常不播。但 `styles.css` 原来的

```css
.template-exchange__status:empty { display: none; }
```

把空态元素移出了无障碍树，等于 region 仍然「和内容一起出现」，常驻渲染的收益被 CSS 抵消。B2 已把 `TemplateExchange` 放进内容阶段主路径，命中概率随之上升。这与 D2 在 `.data-message` 上论证并避开的写法完全同类。

## 2. 改动

### 2.1 `src/styles.css:3790-3792`（净增 2 行，删 1 行）

改为与 `.data-message:empty`（`styles.css:462`）同构的 visually-hidden 写法，并把基础规则挪到 `:empty` 之前，与 `.data-message` 的书写顺序一致：

```3790:3792:src/styles.css
.template-exchange__status { margin: 0; color: var(--editor-ink, #314d60); font-size: 11px; line-height: 1.5; }
/* 常驻 live region：无消息时收成不可见的 1px，既不撑出空行也不离开无障碍树。 */
.template-exchange__status:empty { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; background: none; border: 0; clip-path: inset(50%); }
```

三点说明：

1. **为什么不是 `visibility: hidden` / `height: 0`**：两者同样会把内容移出无障碍树或使其不可读；`position: absolute` + 1px + `clip-path: inset(50%)` 是标准 visually-hidden，元素留在树内。
2. **空态零布局影响**：`.template-exchange` 是 `display: grid; gap: 6px`（`styles.css:3781`），绝对定位使空 region 不再作为栅格项参与行距计算，视觉与改动前的 `display: none` 一致，不会多出 6px 空行。
3. **顺序与特异性**：`.template-exchange__status:empty` 特异性 (0,2,0) 高于基础规则 (0,1,0)，调序不改变层叠结果；调序只为可读性对齐 `.data-message` 段落。`padding/background/border` 三项在当前基础规则下是冗余的，保留是为了与 `.data-message` 同构，防止后续给该类加皮肤背景时空态漏出色块。全仓无 `.template-exchange__status` 的暗色/atelier 覆盖（已 grep 确认）。

### 2.2 `src/components/TemplateExchange.test.tsx`（改 1 例、增 1 例）

- 改：`keeps a polite live region for import and export receipts` —— 从「只断言 `aria-live=polite`」加强为断言状态节点**存在**、`aria-live="polite"`、**空态无子节点**（即 `:empty` 真的成立，CSS 规则不是空挂）、`textContent === ""`，且整个组件只有一个 `role="status"`（避免两个 polite region 互相打断）。
- 增：`reuses the idle live region node for both failure and success receipts` —— 先取到空闲态节点引用，上传坏文件触发失败回执，断言**同一个节点引用**的 `textContent` 含「导入失败」且 `querySelector(...) === region`；再上传合法模板包触发成功回执，同样断言同一节点含「已导入模板」。这条守住「节点不被卸载重建」，即 region 先于内容进入无障碍树。

未改动任何既有用例的原有断言，其余 8 例原样通过。

## 3. 验证链（failure → cause → fix → recheck）

| # | 步骤 | 命令 / 手段 | 结果 |
|---|---|---|---|
| 1 | 修复后目标测试 | `npx vitest run src/components/TemplateExchange.test.tsx` | 1 file, **10 passed**，Duration 1.05s |
| 2 | 反向对照（构造 failure） | 临时把 `TemplateExchange.tsx:106` 改成 `{status && <p …>}` 后重跑同一命令 | **2 failed / 8 passed**：`expected null not to be null`（新加强的空态断言）与 `Cannot read properties of null (reading 'textContent')`（节点复用断言）——证明两条新断言真的守着「常驻 region」，不是恒真空跑 |
| 3 | 还原并复检 | 还原 `TemplateExchange.tsx` 后重跑同一命令 | 1 file, **10 passed**，Duration 945ms |
| 4 | CSS 层叠实证 | jsdom 29.1.1 载入真实 `src/styles.css`，构造空/非空两个 `.template-exchange__status` | 空态：`matches(':empty') = true`、`display = block`（**不是 none**，留在无障碍树）、`position = absolute`、`width/height = 1px/1px`、`clip-path = inset(50%)`；非空态：`matches(':empty') = false`、`position = static`、`font-size = 11px`（不受影响） |
| 5 | Lint | `npx eslint src/components/TemplateExchange.test.tsx src/components/TemplateExchange.tsx` | exit 0 |
| 6 | 类型 | `npx tsc --noEmit -p tsconfig.app.json` | 无输出，exit 0 |

关于 failure 环节的如实记录：步骤 1 一次通过，**没有真实失败**。为不让「一次通过」变成无信息量的结论，步骤 2 主动注入了本条改动要防的那个回归（把常驻 region 改回条件渲染），确认测试会红——failure（注入后 2 红）→ cause（region 条件渲染，空态节点不存在）→ fix（还原常驻渲染）→ recheck（步骤 3 复绿）闭环成立。

另外，单测跑在 jsdom 里、不加载 `styles.css`，因此**测试本身证明不了 CSS 修没修对**，只能守住 DOM 侧前提（节点常驻 + 空态 `:empty` 成立）。CSS 侧的证据是步骤 4 的层叠实证——两者合起来才覆盖这次改动。

## 4. 手动验收（自动化覆盖不到的部分）

1. 内容与排版阶段展开「整体模板与交换」，确认无消息时该行**不占高度**、不出现 6px 空行（默认 / 暗色 / atelier 三皮肤各看一次），与改动前视觉一致。
2. 开 VoiceOver / NVDA：进入该区域时确认空态不会被读出多余空白项；随后触发一次「导入失败」（选一个非模板文件）与一次成功导入，确认两条回执都被播报，且焦点不被 live region 夺走。这是本次改动的真正验收点——jsdom 无法替代。

## 5. 回滚

单行 CSS 回滚即可：把 `styles.css:3792` 换回 `.template-exchange__status:empty { display: none; }`（顺序无所谓，特异性不变），并删除 `TemplateExchange.test.tsx` 中新增的 `it("reuses the idle live region node …")` 块、把 `keeps a polite live region …` 还原为单行 `aria-live` 断言。

破坏性评估：**无**。不涉及数据结构、导出文件格式、API 形状、本地存储；不改任何 TSX 产品代码（`TemplateExchange.tsx` 已还原为改动前状态，`git diff` 中不出现）；视觉上空态与改动前等价，非空态完全不受影响。
