# R14-fable-sota — 地图样式撤销/重做读屏零反馈：补持久 polite live region

MODEL_SLUG: claude-fable-5-thinking-xhigh

## 改动文件（均在允许清单内）

- `src/components/workspaces/MapStyleWorkspace.tsx`（166 行，≤400）
- `src/components/workspaces/MapStyleWorkspace.test.tsx`（171 行，新增 1 个用例，6/6 通过）
- `USER_GUIDE.md`（「地图编辑」条目补一句撤销/重做播报说明，恰 1 句）
- `ContentLayoutWorkspace.tsx(.test)` **审计后未改**（见下），符合「挑一个真实洞」约束；
  按指令未碰 Delivery/DataUpload。

## 洞的定位（对两台工作区逐控件审计）

- 先排除掉的候选：画布选中播报已有 PosterCanvas 的
  `[data-canvas-selection-announcement]`（R12 审计过、两台测试钉住）；
  SegmentedControl 五个按钮带 aria-label + aria-pressed；`<details>/<summary>`
  原生具名可展开；两处 `__canvas` 容器虽 `overflow: auto`，但 `.poster` 被
  max-width/max-height 100% 约束住，实际不产生滚动，"scrollable region not
  focusable" 属潜伏而非现实洞。
- **真实洞（本轮修，对应简报第 5 条"交付/数据以外的 live region 可能还有漏"）**：
  地图样式阶段的撤销/重做按钮由 `MapStyleRail` 自有（`地图样式历史` group）。
  点击后文档回退、地图外观变化，但读屏用户得到**零反馈**：
  1. 画布 live region 只播报**选中**变化，撤销不改选中；
  2. 按钮 `aria-label` 从「撤销：改陆地颜色」静默换成下一步的标签，
     非 live 元素的名字变更不会被读出；
  3. 撤到底时按钮变 disabled，连焦点都会被丢掉。
  违反 WCAG 4.1.3（状态消息应可编程确定、无需获得焦点即可被 AT 呈现）。
- ContentLayout 阶段的撤销/重做在**顶栏**（`StudioTopbarActions`，App 侧），
  不在本轮可改文件内，故该台无需也无法在组件内修；这也是本轮只改
  MapStyleWorkspace 一个组件文件的原因。

## 修复（全部在 `MapStyleRail` 内，不碰 PosterCanvas / InspectorPanel / 布局）

- 新增 `historyAnnouncement` 状态 + 持久的
  `<span class="sr-only" role="status" aria-live="polite" data-history-announcement>`
  （复用 R12 DataUpload `data-mapping-announcement` 同款模式：区域先于变更
  存在于 DOM、不按需挂载；sr-only 绝对定位不参与 grid 布局，无任何可见变化）。
- 点击撤销/重做时用**点击前**的按钮标签播报 `已{label}`（真实应用里即
  「已撤销：切换数据呈现」；label 来自 `describeProjectHistory`）。
- **复读保护**：连续撤销两个同名步骤时文本完全相同，aria-live 不会复读；
  用 `tick` 奇偶在文本尾部切换一个隐形 `\u00A0`，保证每次播报 DOM 文本都
  有变化且读出来一致。
- 既有交互不变：按钮 label / disabled / onUndo / onRedo 语义原样，只是
  onClick 里先播报再回调。

## 测试（新增 1 例）

"announces undo/redo outcomes through a persistent polite live region"：

- 断言交互前区域已在 rail（`[aria-label="地图对象属性"]`）内、
  `role="status"` + `aria-live="polite"` + `sr-only` 且为空；
- 点撤销 → `onUndo` 被调、剥掉 `\u00A0` 后文本为 `已撤销地图修改`；
- **再点一次同名撤销** → 语义文本相同但 raw textContent 与上次不同
  （钉住复读保护）；
- 点重做 → `已重做地图修改`，且区域节点始终 `isConnected`（不靠重挂载）。

既有 5 个用例（含点击撤销/重做断言回调次数的
"keeps history controls…"）原样通过。

## 验证（failure → cause → fix → recheck）

1. `npx vitest run` MapStyle + ContentLayout 两个测试文件 →
   2 files / 10 tests 全过（MapStyle 6 = 5 旧 + 1 新；ContentLayout 4 不变）。
   本轮无失败-修复循环；沿用 R13 的教训**直接**用 `npx tsc -b`
   （根 tsconfig 是 solution-style，裸 `--noEmit` 是假阳性）→ 0 错误。
2. `npx eslint` 本轮 2 个 TSX 文件 → 0 问题。
3. `git diff --stat` 复核：恰 3 个文件、+59/-2；工作区其余改动来自
   R14 并行代理（card-layout / student-data / layout-health / perf / server，
   与简报路径隔离表一致），未越界。

## 验收方式与回滚

- 验收：地图样式页改几次地图外观（如陆地颜色、收折南海），用读屏
  （VoiceOver/NVDA）点右栏「撤销」——应立即听到「已撤销：某步骤」，连点
  两次同名步骤也每次都播报；不用读屏时界面与之前逐像素一致（区域 sr-only）。
- 回滚：纯播报补充，无数据/导出格式/API 形状变更；revert 本轮 3 个文件即可。

## 留给后续轮的候选洞（本轮按规则只修一个）

- 顶栏 `StudioTopbarActions` 的撤销/重做（内容阶段与快捷键 Ctrl+Z 路径）
  同样零播报，宜在 App/顶栏层补同款 live region，让两条历史入口行为一致。
- 撤到底时 disabled 会把焦点丢到 body，可考虑 `aria-disabled` + 焦点保持。

按指令未 commit / 未 push。
