# R11-fable-sota — 出血示意层 a11y/UX 补漏（键盘焦点 / reduced-motion / 窄屏裁切）

MODEL_SLUG: claude-fable-5-thinking-xhigh

## 改动文件（均在允许清单内）

- `src/components/workspaces/DeliveryWorkspace.tsx`（320 行，≤400）
- `src/components/workspaces/DeliveryWorkspace.test.tsx`（353 行，新增 2 个用例，15/15 通过）
- `USER_GUIDE.md`（「交付页尺寸」条目补一句窄屏说明）
- `src/styles.css` **未改**：审计后确认无需改（见下），符合「仅在需要时改」的约束。

## 逐项结论

### 1. 键盘焦点 / 读屏（已验证 + 用测试钉住）

核查结果：叠加 SVG 已具备 `aria-hidden="true"`、`focusable="false"`、
`pointer-events: none`，且无 `tabindex`；舞台内除海报外没有任何可交互元素，
Tab 顺序与出血为 0 时完全一致。可滚动预览框（`.delivery-workspace__canvas`
是 `overflow: auto`）里被命名的图像仍是成品画布本身——PosterCanvas 的
`role="img"` + `aria-label`（未改 PosterCanvas，只依赖），且海报不在任何
`aria-hidden` 子树内。新用例
"keeps keyboard focus on the poster: the bleed chrome adds no tab stops and stays static"
把以上全部断言钉死。

### 2. prefers-reduced-motion（审计结论：无需新增 CSS）

- 逐条审计了 `src/styles.css` 与 `workflow-workspaces.css` 的全部
  `transition` / `animation` / `@keyframes` 声明：没有任何选择器能命中出血
  示意层（都是按钮、抽屉、spinner 等）；`workflow-workspaces.css` 完全没有
  动效声明。
- 示意层本身是纯静态几何：虚线用静态 `stroke-dasharray`（没有 dashoffset
  走马灯），无 SMIL（`<animate>` 等）、无内联过渡——新用例断言了这两点，
  防止未来有人给印前示意加动画。
- `styles.css` 底部已有全局 `@media (prefers-reduced-motion: reduce)` 块把
  所有过渡/动画收敛到 0.01ms，未来即使某个皮肤给 svg 加过渡也会被覆盖。
- 结论：出血/裁切示意不依赖任何动画，reduced-motion 下渲染结果不变；
  按「仅在需要时改 styles.css」的约束，不添加多余规则（也因此不需要
  reduced-motion 的 CSS 文本测试）。

### 3. 窄屏裁切（真实缺口，已修）

**根因**：叠加 SVG 带媒体框固有宽高属性（默认画布 + 3mm 出血 ≈ 1545px），
`.delivery-workspace__canvas` 是 `display: grid` 的 auto 轨道——轨道按内容
max-content 撑到媒体宽；舞台的 `width: min(100%, mediaWidth)` 是循环百分比，
在内在尺寸阶段按内容参与计算，之后 100% 又对着被撑大的轨道解析，所以
**永远收不小**。窄屏上成品只能横向滚动才看得全，≤760px 时预览节点还是
`overflow: hidden`（滚动在 canvas 层），体验上就是「预览装不下」。

**修复**（全部在组件内，不碰 print-bleed 数学 / PosterCanvas / 导出链路）：
舞台的注入 `<style>` 里把画布网格轨道钉成
`.delivery-workspace__canvas:has(> .delivery-workspace__bleed-stage) { grid-template-columns: minmax(0, 1fr); }`
（仓库已有 `:has()` 先例），轨道从此等于容器宽，`min(100%, …)` 真正生效：
窄屏舞台整体缩小、成品与裁切标记完整可见；宽屏行为不变（轨道铺满容器、
舞台仍以媒体宽为上限居中）。同时给舞台补 `min-width: 0` 兜底自动最小尺寸。
出血为 0 时没有舞台也没有注入样式，`:has` 选择器不命中任何东西——预览
与原来逐字一致（用例断言 `section style` 为 null）。

### 4. USER_GUIDE

「交付页尺寸」条目追加一句：窄屏或手机上示意会整体缩小以完整显示成品与
裁切标记，无需左右滚动。

## 验证（failure → cause → fix → recheck）

1. **failure**：新用例断言 `stage.style.width === "min(100%, 1545.3544px)"`
   得到空串。**cause**：React 经 CSSOM 写内联样式，jsdom 的 cssstyle 解析
   不了 `min()`，整条 width 声明被静默丢弃（连 style 属性里都不落地；真实
   浏览器不受影响）。**fix**：把舞台的 position/width/min-width 全部移进
   本就存在的注入 `<style>`（文本可直接断言，舞台布局规则也集中到单一来源），
   用例改断言样式表文本。**recheck**：重跑同一命令，15/15 通过。
2. `npx vitest run src/components/workspaces/DeliveryWorkspace.test.tsx`
   → 15 passed（13 旧 + 2 新）。
3. `npx tsc --noEmit -p tsconfig.app.json` → 0 错误。
4. `npx eslint` 两个 TSX 文件 → 0 问题。

## 验收方式与回滚

- 验收：交付页设 3mm 出血后，把窗口收窄到媒体宽以下（或手机模拟器）——
  出血环、裁切标记与成品应整体缩小、无横向滚动条；清零出血预览恢复原样；
  Tab 遍历交付页时焦点顺序与出血为 0 时一致，示意层不出现在焦点链里。
- 回滚：纯 UI 示意层修补，无数据/导出格式/API 形状变更；revert 本轮三个
  文件即可（styles.css 未动）。

按指令未 commit / 未 push。
