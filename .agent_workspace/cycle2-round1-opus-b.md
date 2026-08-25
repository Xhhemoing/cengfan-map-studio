# Cycle 2 Round 1 — opus-fast-B

**模型未降级。** slug：`claude-opus-5-thinking-high-fast`。

任务：把 `DestinationCard` 的卡片外壳几何魔数令牌化，并给已死的 `margin` / `fieldOrder` 打 `@deprecated`。**视觉零变化**（stock 默认值逐像素不变），未提交。

## 落地

### 1. 新增 `src/lib/destination-card-metrics.ts`

原先散在 JSX 里的头部/计数/分隔线/照片/车票几何，全部变成命名常量与纯函数：

| 令牌 | 值 | 原出处 |
| --- | --- | --- |
| `DESTINATION_CARD_HEADER_HEIGHT` | 44 | `PosterCanvas.destinationHeight()` 里的 `44 +` |
| `DESTINATION_CARD_TITLE_TOP` | 12 | 标题 `frameTitleItem?.y ?? 12` / flow 起点 |
| `DESTINATION_CARD_COUNT_BASELINE` | 22 | "N 人" 的 `y={22}` |
| `DESTINATION_CARD_DIVIDER_Y` | 30 | 分隔线 `30 + headerExtra` |
| `DESTINATION_CARD_FIXED_BODY_TOP` | 42 | 正文 `frameBodyItem?.y ?? 42` |
| `DESTINATION_CARD_FLOW_BODY_GAP` | 8 | flow 正文 `+ 8` |
| `TITLE_LINE_MIN_HEIGHT/LEADING` | 16 / 4 | `Math.max(16, size + 4)` |
| `ROW_LINE_MIN_HEIGHT/LEADING` | 16 / 6 | `Math.max(16, size + 6)` |
| `TEXTURE_HEADER_WIDTH/SIZE/TOP` | 36 / 30 / 3 | 省份贴图 `36`、`30×30`、`y=3` |
| `PHOTO_*` | 32 / r13 / cy21 / y25 / 11 / 700 | 头像盘与首字 |
| `TICKET_*` | rx12 / w8 / rx4 / inset18 / r7 | 票根与打孔 |
| `ORNAMENT_OPACITY` | 0.2 | 票根打孔与头像盘共用 |

函数层（都是纯函数、可单测）：`destinationCardTitleTop/TitleBaseline/TitleLineHeight/TitleX`、`destinationCardDividerY`、`destinationCardBodyTop/BodyBaseline/FlowRowHeight`、`destinationCardTextureBox/Avatar/TicketOrnaments`、`destinationCardHeaderOffset`。

### 2. preset 声明式覆盖表

```ts
DESTINATION_CARD_PRESET_OVERLAYS = {
  ticket:     { borderRadius: 12 },
  borderless: { borderRadius: 0, borderless: true },
  photo:      { headerOffset: 32 },
}
```

`destinationCardSurfaceChrome(preset, surface)` 一次算出 `{ borderRadius, stroke, strokeWidth, showDivider }`，取代原来三处内联三元：

- `rx={preset === "ticket" ? 12 : preset === "borderless" ? 0 : surface.borderRadius}`
- `stroke / strokeWidth` 的 `borderless ? ... : ...`
- `preset !== "borderless" && <line …>`（分隔线本来就是边框的一部分，现在跟同一张覆盖表走）

`standard` / `compact` 不在表里，等于「display-frame 解析出什么就画什么」——新增 preset 只需在表里加一行，不必再回到 JSX 里加三元。

### 3. `@deprecated`（仅 JSDoc，无行为变化）

- `DisplayFrameStyle.margin`：无渲染方读取。`deriveFixedDisplayFrameFromCardSettings` 把 `cards.gap` 抄进来、`resolveDisplayFrameSurface` 原样透传，但真正的卡间距在布局求解器的 `cards.gap`，flow 块间距在 `DisplayFrameFlowBlock.spacing`。字段保留只为文档兼容（老工程仍要能 normalize）。同步给 `ResolvedDisplayFrameSurface.margin` 加了一行镜像说明。
- `DisplayFrameDefinition.fieldOrder`：由 `["title", ...cards.visibleFields]` 派生，只在派生瞬间给 `fixed.items` / `flow.blocks` 播种，之后顺序归这两个列表所有，卡片行顺序看 `cards.visibleFields`。同样只为文档兼容保留。

## 验证（failure → cause → fix → recheck）

1. **failure**：中途 `npx tsc -p tsconfig.app.json --noEmit` 报 `PosterCanvas.tsx` 三十余处 `TS2304 Cannot find name`（`DestinationCard`、`useRef`、`buildConnectorGeometry`…）。
2. **cause**：并行 agent 正在改 `PosterCanvas.tsx`，tsc 撞上写到一半的中间态（import 块已删、引用未改完）。与本轮改动无关——本轮 FORBIDDEN 该文件，`git diff` 里我没有它。
3. **fix**：不介入，改为按文件名过滤确认「我改的四个文件零报错」，待其落盘后重跑。
4. **recheck**：`npx tsc -p tsconfig.app.json --noEmit` 全仓 **0 error**；`npx vitest run src/components/canvas src/components/workspaces/DisplayFrameSubcanvas.test.tsx src/lib/export-poster.round3.test.ts` → **25 files / 190 tests passed**。

指定验证命令（含新增 metric 测试）：

```
npx vitest run src/components/canvas/DestinationCard.test.tsx \
  src/lib/display-frame-style.test.ts src/lib/display-frame.test.ts \
  src/lib/display-frame.boundary.test.ts \
  src/components/canvas/DestinationCard.align.round3.test.tsx \
  src/lib/destination-card-metrics.test.ts
→ 6 files / 54 tests passed
```

`npx eslint`（六个改动文件）零告警。

### 新增测试

- `src/lib/destination-card-metrics.test.ts`（11 例）：头部各基线的先后次序、divider 随 `headerExtra` 下移、fixed/flow 两条 top 解析分支、标题与行高的下限地板、贴图/头像/票根几何、覆盖表对三类 preset 的产出。
  - 其中「reserved header height 与求解器同步」一例会扫 `src/components/canvas/*.tsx`，把 `44 + headerExtra + lineCount * rowHeight` 里的字面量比对 `DESTINATION_CARD_HEADER_HEIGHT`。只在匹配到**数字**字面量时断言，所以 Cycle 2 第 2 项把卡片层搬进 `DestinationCardsLayer`、或改成 import 该常量时，都不会误报。
- `DestinationCard.test.tsx` +3 例：票根 `rx=12` / 票根条 / 打孔位；photo 头像与省份贴图各自的 header 偏移（标题 x 12 → 44 → 80）；`headerExtra=16` 时分隔线与正文行整体下移。`renderCard` 加了 `{ headerExtra, provinceTexture }` 可选参数（默认值与原调用一致，老用例逐字未动）。

## 交付与回滚

- **验收方式**：上述 vitest 命令 + `npx tsc --noEmit` + eslint；视觉侧看 `DestinationCard.test.tsx` 里 ticket / photo / divider 三例锁的坐标。
- **破坏性**：无。未动数据结构、导出格式、API 形状；`@deprecated` 只是 JSDoc，字段仍在正常序列化与 normalize。
- **回滚**：`git checkout -- src/components/canvas/DestinationCard.tsx src/components/canvas/DestinationCard.test.tsx src/lib/display-frame.ts src/lib/display-frame-style.ts && rm src/lib/destination-card-metrics.ts src/lib/destination-card-metrics.test.ts`。metrics 模块无人依赖，删掉即回到原状。
- **未提交**（按指令）。未 checkout / stash，未碰 `PosterCanvas.tsx`、`GuestsLayer`，未复活展示框工作台。

## 给 Round 2 的接口

- `PosterCanvas.destinationHeight()` 仍内联 44。等 Cycle 2 第 2 项动卡片层时，`import { DESTINATION_CARD_HEADER_HEIGHT }` 一行即可，metrics 测试会自动从「比对字面量」退化为「不比对」，不会挡路。
- 同理 `PosterCanvas` 里的 `textureHeaderWidth = 36`（第 583 行）与 `flowContentStart` 的起点 `12`，与 `DESTINATION_CARD_TEXTURE_HEADER_WIDTH`、`DESTINATION_CARD_TITLE_TOP` 是同一个数，属于本轮 FORBIDDEN 范围，留给持有该文件的那一轮收口。
