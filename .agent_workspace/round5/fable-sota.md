MODEL_SLUG: claude-fable-5-thinking-xhigh

# Round 5 — R5-fable-sota: 地图检查器 + 地图图层 SOTA a11y

分支：`cursor/agent-sota-polish-cbcd`（按指令未提交，改动留在共享工作树；工作树内另有其他 R5 agent 的在途改动——`src/lib`、`server`、PosterCanvas 拆分产物 `poster-*` 等——均未触碰）。

目标：MapInspector 全控件可及名 + 分组语义 + 圆盘 roving tabindex（清掉 R3/R4 报告挂账的遗留缺口）；MapLayer 键盘等价路径（省份/图钉/地图选择）且不动指针命中与投影数学；MapInspector 585 行拆分到 400 行以下。

## 一、改动清单（仅限授权文件）

### 1. 拆分：`MapInspector.tsx` 585 → 348 行（无行为变化的抽取 + 定点 a11y 增强）

- 新建 `src/components/inspector/MapEdgeStyleControls.tsx`（151 行）：省界线纹理区（触发钮 + 圆盘 + 粗细 + 边界色 + `EdgeStylePreview`）。
- 新建 `src/components/inspector/MapAdvancedControls.tsx`（146 行）：热力色阶、单省颜色覆盖、南海诸岛折叠。`selectedProvince` 局部状态随迁（原本就只被这段用到；`collapsible` 由调用点固定、运行期不切换，无状态丢失路径）。
- 所有控件 id（`map-*`）、类名、`data-*` 钩子原样保留，既有测试与 CSS 不受影响。

### 2. `MapEdgeStyleControls.tsx` — 圆盘按 APG listbox-popup 规范化（R4 遗留缺口 #4 清账）

- **Roving tabindex**：任意时刻只有一个选项在 Tab 序（默认当前 aria-selected 项）；tabindex 经 `onFocus` 跟随焦点，方向键/Home/End 移动（既有回绕逻辑不变）。此前 10 个选项个个可 Tab。
- **打开即入焦**：圆盘打开时焦点落到当前选中风格（`useLayoutEffect`，flushSync 内同步生效）；Escape/选中后照旧还焦触发钮。这是本轮唯一的交互行为变化，属 listbox popup 标准行为。
- 触发钮补 `aria-haspopup="listbox"`，并以 `aria-describedby` 关联可见的当前风格名（此前「实线/水纹」文本与按钮无程序化关联）。
- 钉死契约全部保留：`aria-label="打开边界风格选择器"` / `"边界风格圆盘"` / `"选择X边界风格"`、`role="listbox"/"option"`、`aria-expanded/controls`。
- 包裹 div 补 `role="group"`——原来 `aria-label="省界线纹理"` 挂在无角色 div 上是**惰性属性**（多数 AT 直接忽略），现生效。

### 3. `MapAdvancedControls.tsx` — 色阶预览语义

- `.heat-scale-control__preview` 同款惰性 aria-label 修复（补 `role="group"`）；每格本就带「N 人」文本，色阶信息不只靠颜色（1.4.1 已满足，保持）。

### 4. `MapInspector.tsx` — 面板与成对控件命名

- `<section class="property-panel">` 补 `aria-label`（「地图属性」/ placement 模式「地图位置与尺寸」），成为可导航的命名区域。
- 四个 `data-property-pair` 容器补 `role="group"` + 名称（地图位置 / 地图尺寸 / 图片对齐位置 / 图片对齐尺寸）——「X」「Y」这类极简 label 由组名提供上下文。
- 逐项审计确认其余控件已全部有可及名（R2/R3 打底），本轮以**测试**将其钉死（见 §6）。

### 5. `MapLayer.tsx` — 键盘等价路径修复（选择「map 层内 tabindex」方案，非 inspector-only）

- **嵌套交互违规 + 键盘选省被地图抢走（真 bug）**：原来根 `<g>` 是 `role="button"`（选择地图）且自带 Enter/Space 处理器，省份/图钉按钮全嵌在这个大按钮里（4.1.2 违规）；更糟的是省份 hit path 的 Enter **冒泡进根组处理器**，选完省份立刻被「选择地图」覆盖——键盘选省实际不可用。修法：根 `<g>` 改 `role="group" aria-label="地图"`（仅保留指针 onClick，冒泡行为不变），「选择地图」按钮语义（role/tabindex/aria-label/keydown）移到 `data-map-frame` 背景矩形上——frame 是省份 hit path 的**兄弟**节点，键盘事件不再互串。
- **方案说明（任务要求 2）**：省份 hit path 原本就有 `tabindex=0` + Enter/Space（保留在地图层内，非 inspector-only），本轮修的是让它真正可用；指针命中测试零改动（同一批透明 path、strokeWidth 8、几何与投影数学未动）。省份/图钉 keydown 补 `stopPropagation`，与 click 的既有 stopPropagation 对称。
- **学生图钉键盘激活**：图钉此前 `role="button"` + tabindex 却**没有任何键盘处理器**（SVG 无原生按钮行为，纯键盘死路）。补 Enter/Space → `onSelectStudent`。
- **状态不只靠视觉**：选中省份 / 选中图钉补 `aria-current="true"`（此前只有描边颜色/圆点变大）。
- 导出模式照旧不渲染任何角色/焦点（frame 无 role/tabindex，已测）。

### 6. 测试（+6 用例；MapInspector 9→12，MapLayer 16→19）

- `MapInspector.test.tsx`：① 全控件可及名审计（accname 近似解析 aria-label/labelledby/label[for]/包裹 label/内容），跑矢量、图片、collapsible 三种渲染 + 圆盘展开态；② 分组语义（section/pair/边线组/色阶预览的 role+名称、haspopup、describedby 指向当前风格名）；③ roving tabindex（打开即焦点落选中项、唯一 tab 停靠点、方向键移动后 tabindex 跟随、Escape 重开后复位）。
- `MapLayer.test.tsx`：① 地图选择按钮在 frame 上、容器是 group、Enter/Space 触发、导出模式无角色；② **回归钉子**：省份 Enter/Space 选省且 `onSelectMap` 不被触发；③ 图钉 Enter/Space 激活、`aria-current` 只标选中钉、不落穿到地图选择。

### 7. 文档

- `USER_GUIDE.md` 地图编辑节补一行：Tab 依次落到地图/图钉/省份，回车或空格选中，与点击等效。

## 二、钉死契约核对（动手前逐一确认）

- **禁改** `PosterCanvas.test.tsx:959` 点击 `[data-map-frame]` 期望 map 选中 → frame 点击仍冒泡到组 onClick ✓（实测绿）；`:77` `svg > [data-map-layer]` 直接子元素 → 根元素未换 ✓。
- **禁改** `App.test.tsx:286` 数 `[data-student-pin]` → 属性保留 ✓（116 用例实测绿）。
- 本文件既有测试钉的 `打开边界风格选择器`/`边界风格圆盘`/`选择水纹边界风格`/方向键回绕/Escape 还焦 → 全部保留，25 个存量用例先行复跑通过后才加新用例。
- CSS：`.property-panel fieldset` 有边框/内边距样式，故分组用 `role="group"` 而非改标签为 fieldset（AT 语义等价，视觉零变化）；已有的两个 fieldset（热力/单省）保持原样。

## 三、验证证据（failure → cause → fix → recheck）

**故意的失败链（证明新测试咬得住旧 bug）**：把 `MapLayer.tsx` 临时回退到 HEAD 版本跑新用例 → **3 failed / 16 passed**（frame 按钮结构、键盘选省被地图抢走、图钉键盘死路各失败一个）；恢复新实现复跑 → 19 全绿。cause 均见 §5；fix 即 §5 改法。

**外部 tsc 噪声（如实记录）**：`npx tsc -p tsconfig.app.json --noEmit` 报 2 个错误，全部位于 `src/lib/studio-journey.test.ts`——另一 R5 agent 的未跟踪在途文件，非本 agent 所有权且与本轮改动无关；**我触碰的 6 个文件零类型错误**（错误清单里无任何本轮文件）。

最终证据（全部改动完成后复跑）：
```
npx vitest run src/components/inspector/MapInspector.test.tsx src/components/canvas/MapLayer.test.tsx
→ Test Files 2 passed (2)，Tests 31 passed (31)
```
- 回归：`src/components/inspector` + `src/components/canvas` 全目录 → **22 文件 183 用例全绿**（含 PosterCanvas、MapDataLayer、贴图定位等消费者）；`GlobalSettingsScreen.test.tsx` 绿；`src/App.test.tsx` **116 用例全绿**。
- `npx eslint`（6 个触碰文件）→ 0 error 0 warning。
- 行数纪律：MapInspector **348**、MapEdgeStyleControls 151、MapAdvancedControls 146，均 < 400。

## 四、验收方式与回滚（交付纪律）

- **验收**：跑上方 vitest 命令 + 手动走查——画布内 Tab：焦点依次到地图 frame（「选择地图 按钮」）→ 图钉（「选择 林舟 按钮，当前项」）→ 各省份，回车选中后右侧检查器切换、地图不抢选；检查器里打开边界风格圆盘，焦点直接落在当前风格上，Tab 只停一次，方向键转盘，Escape 回触发钮；NVDA/VoiceOver 逐组朗读「地图位置 组」「省界线纹理 组」「热力色阶预览 组」。
- **用户可见行为变化（1 处）**：鼠标点开边界风格圆盘时焦点会移入当前选中项（listbox popup 标准行为）；选中/Escape 后焦点仍回触发钮，指针流程不受影响。
- **回滚**：全部为组件拆分、ARIA 属性与键盘事件的增量修改，无数据/导出格式/API 形状变更。`git checkout -- src/components/canvas/MapLayer.tsx src/components/canvas/MapLayer.test.tsx src/components/inspector/MapInspector.tsx src/components/inspector/MapInspector.test.tsx USER_GUIDE.md` 并删除两个新组件文件即可整体还原。

## 五、遗留 SOTA 缺口（如实）

1. **MapLayer.tsx 493 行（>400）**：改动前已 475 行，本轮授权是「仅 a11y/键盘」，拆分越权未做；建议下轮把 `SouthSeaInset`/`renderMapImage` 抽到 canvas 子模块。
2. **圆盘 Tab 不关弹层**：焦点可 Tab 出打开状态的圆盘而弹层不收起（Escape/选中会收）；`role="option"` 仍落在 `<button>` 上（R3 起被测试钉住的结构，语义双重性依旧）。
3. **省份贴图拖拽（MapDataLayer，非授权文件）纯指针**：键盘等价物是 ProvinceInspector 的贴图偏移输入框（inspector-only，既有），贴图编辑框的 Enter/Space 只做选中不做移动。
4. **覆盖图缩放手柄纯指针**：键盘等价物为检查器「对齐 X/Y/宽/高/旋转」输入（R3 起的既定结论，维持）。
5. **南海诸岛折叠框内无贴图的省份既无指针交互也无键盘交互**（本就不可点，无「等价物」可补；数据展示不受影响）。
6. `aria-current` 在 SVG 元素上的旧版读屏兼容弱于 HTML；视觉选中描边仍在，属渐进增强。
7. 图片透明度滑杆没有像地图透明度那样的 `<output>` 百分比回显（有名称、无实时数值播报；改它会新增可见 UI，留给所有者决策）。
