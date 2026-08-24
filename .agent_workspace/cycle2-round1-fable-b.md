MODEL: claude-fable-5-thinking-xhigh

# Cycle 2 Round 1 — fable-B:S1/S2/S8 施工计划(preset 声明式覆盖表 · 头部几何纯函数 · deprecated 注记)

**分支:** `cursor/canvas-render-display-46a1`(未离开,无任何 git 操作)｜ **性质:** 纯规划,零 src 改动 ｜ **输入:** cycle1-round3-conclusion.md、cycle1-round3-fable-b.md ｜ **行号基准:** 当前工作树实测(Round 3 生产改动仍在工作树,本文全部行号对其成立;若合入批次调整行号,以锚点函数名/属性名重定位)。

---

## 0. 范围与纪律声明

- 本计划覆盖结论《Cycle 2 开刀顺序》第 3、4 条中划给本席的三件事:**S1** preset 声明式覆盖表、**S2** `destinationHeight`/头部几何魔数纯函数化、**S8** `margin`/`fieldOrder` 的 JSDoc `@deprecated` 注记。
- **不复活展示框工作台**:`DisplayFrameSubcanvas`/`ItemInspector`/`LayerList`/`FlowFrameEditor` 维持零生产挂载,本计划不引入任何指向它们的 import、不建议任何挂载动作。S7(死工作台 CSS 卫生)不在本轮。
- 承袭两轮裁决继续禁止:虚拟化、换渲染器、改 `data-*` 锚点名、导出离屏重建、求解器增量化。
- S1/S2 主体是**像素不变重构**;唯二像素变更(§5 批次 D 的 photo 正文 +32、§3.3 D1 统一)单独成批、先加几何断言、交付说明含回滚,遵守白名单流程。

---

## 1. 证据盘点(工作树实测)

### 1.1 preset 五值散点(S1 靶面)

`CardPreset = "standard" | "compact" | "ticket" | "photo" | "borderless"`(template-document.ts:6,默认 "standard" :208)。当前视觉消费全部是内联三元:

| 消费点 | 位置 | 行为 |
| --- | --- | --- |
| photo 标题缩进 | DestinationCard.tsx:165 | `photoOffset = preset==="photo" ? 32 : 0`,仅 titleX(:190)消费;**正文行不加**(P2-4 已知缺陷,挪 S2 时登记为批次 D) |
| surface 圆角 | DestinationCard.tsx:244 | `ticket→12、borderless→0`,压过 `surface.borderRadius`(含用户显式值) |
| surface 描边 | DestinationCard.tsx:247-248 | borderless:`stroke="none"`、`strokeWidth=undefined` |
| ticket 装饰 | DestinationCard.tsx:264 | accent 条 8×height rx4 fill=activeColor;打孔圆 (w−18,18) r7 α0.2 |
| photo 装饰 | DestinationCard.tsx:265 | 头像圆 (hp+13,21) r13 α0.2;首字 text y=25 fs11 fw700 |
| divider 显隐 | DestinationCard.tsx:284 | `preset !== "borderless"` 才渲染 |
| compact 行高下限 | PosterCanvas.tsx:479 与 :535 | `compactLayout = cards.compactLayout===true || preset==="compact"` → 行高下限 18/20,**两处重复计算** |
| borderless 连接线 | PosterCanvas.tsx:756/:774(拖拽)、:932(渲染) | `borderless && opacity<0.9` 隐藏连接线——**属 S6,不进覆盖表**(画布级行为 + 阈值魔数,另案) |
| 导出锚点 | PosterCanvas.tsx:981 | `data-card-preset` 属性,**不改** |

非渲染消费(inspector/迁移/模板存储,scene-document.ts:603 等)不在本计划触碰范围。

### 1.2 头部/行距魔数与两处新发现的算式分叉(S2 靶面)

**魔数清单:**

| 魔数 | 位置 | 语义 |
| --- | --- | --- |
| `44` | PosterCanvas.tsx:133-135 `destinationHeight` | 头部块高 = 正文基线默认 42 + 2 下降部余量 |
| `42` | DestinationCard.tsx:211(`frameBodyItem?.y ?? 42`)、display-frame.ts:236(derive body y) | fixed 正文首行基线默认 |
| `12`/`24` | DestinationCard.tsx:272(title y ??12)、display-frame.ts:236/:238(derive title y12 h24) | 标题盒顶/高 |
| `30` | DestinationCard.tsx:284 | divider y = 30+headerExtra |
| `22` | DestinationCard.tsx:283 | count 基线(右锚 width−hp,字号取 `style.fontSize`) |
| `20` | display-frame.ts:236 derive body 步进;PosterCanvas 行高下限 | 两个"20"语义不同但数值耦合,须同源注释 |
| `max(16, fs+4)` | PosterCanvas.tsx:543 与 DestinationCard.tsx:272 | 标题行步进,**公式两处重复** |
| `max(floor, fs+6)×m` | PosterCanvas.tsx:489-492(cardStyle.rowHeight)与 :537-538(solver rowHeight) | 正文行步进,**公式两处重复且不等价**(见 D1) |
| `3`/`30`/`36` | DestinationCard.tsx:255-258 texture(y3, 30×30)、PosterCanvas.tsx:583 textureHeaderWidth 36 | 省贴图头部占位 |
| `max(42, titleFs×3)` | PosterCanvas.tsx:584 | 标题右侧让位(count 区) |

**D1|rowHeight 双算式分叉(本轮新发现,实测确认):** cardStyle 侧(:491)对 visibleFields 内的 `city` 取 `fieldTypography.city?.fontSize ?? fontSize`;solver 侧(:536-537)经 `cardFieldFontSize` 对 city 取 `max(9, fontSize−1)`。当 **`visibleFields === ["city"]` 且无 city 字号覆盖且 fontSize≥10** 时,渲染步进比求高步进大 1×lineHeightMultiplier/行 → 末行向下溢出约 `(lineCount−1)×m` px,破坏"末行 baseline ≤ height−bottomPadding"不变量。这是统一入 metrics 模块时**必须做的语义裁决**(§3.3)。

**D2|flow 标题 lineHeight 分叉:** 渲染侧标题步进乘 `flowTitleBlock?.lineHeight ?? lineHeightMultiplier`(DestinationCard.tsx:272),solver 的 `titleLineHeight`(:543)恒乘 `lineHeightMultiplier`。flow 模式且 block.lineHeight≠画布倍率时,headerExtra(定卡高、divider、正文起点)与实际标题步进不一致。与 S5(title 字号布局耦合,:507 vs :539 字号来源分叉)同族——**本轮只登记与参数化,不改行为**,修复归 S5 批次。

### 1.3 margin / fieldOrder 消费面(S8 靶面,复核 round3 §3 结论仍成立)

- `margin`:display-frame.ts:16 定义、:81 默认、:153 normalize 钳制、:227 derive 自 `cards.gap`;display-frame-style.ts:28 透传声明、:80 透传赋值。渲染消费者 0;间距真源 `cards.gap`。
- `fieldOrder`:display-frame.ts:68 定义、:190/:218-219 derive、:229/:243 驱动 derive 内 items/blocks 生成、:332 normalize 往返;渲染顺序真源 `cards.visibleFields`(`cardRowsForGroup`);bench 合成数据(canvas-render-metrics.ts)非渲染路径。
- 两处至今无 JSDoc 注释,禁接线裁决只存在于 round 报告里——写进类型定义是本轮补的欠账。

---

## 2. S1 设计:`src/lib/card-preset-overlay.ts`(声明式覆盖表)

### 2.1 模块与类型

新建纯模块(kebab-case,符合"布局/样式逻辑进 `src/lib` 纯函数"),不 import React、不 import 组件:

```ts
import type { CardPreset } from "./template-document";
import type { ResolvedDisplayFrameSurface } from "./display-frame-style";

/** 覆盖在已解析 surface 之上;undefined = 不覆盖该 token,沿用解析层级联结果。 */
export interface CardPresetSurfaceOverlay {
  borderRadius?: number;   // ticket: 12;borderless: 0
  border?: "none";         // borderless:stroke="none" 且不输出 strokeWidth
}

export type CardPresetOrnament =
  | { kind: "accent-bar"; width: 8; rx: 4 }                                         // 高=卡高,fill=activeColor
  | { kind: "punch-hole"; fromRight: 18; cy: 18; r: 7; opacity: 0.2 }               // fill=activeColor
  | { kind: "avatar-badge"; cxFromPadding: 13; cy: 21; r: 13; circleOpacity: 0.2;
      initialFontSize: 11; initialBaseline: 25 };                                    // 圆+组名首字

export interface CardPresetOverlay {
  surface?: CardPresetSurfaceOverlay;
  /** 标题(批次 C)与正文行(批次 D,视觉变更)共用的头部缩进;photo=32。 */
  contentIndent: number;
  showHeaderDivider: boolean;                    // borderless: false
  ornaments: readonly CardPresetOrnament[];
  /** 布局侧消费(经 card-metrics),paint 层不读。compact: 18。 */
  rowHeightFloor?: number;
}

export const CARD_PRESET_OVERLAYS: Record<CardPreset, CardPresetOverlay>;

/** surface 三属性的最终字节:锁 rx/stroke/strokeWidth 与现状逐字节一致。 */
export function resolveCardSurfaceAttrs(
  preset: CardPreset,
  surface: ResolvedDisplayFrameSurface,
): { rx: number; stroke: string; strokeWidth: number | undefined };
```

设计克制点:**只有三个装饰、五个 preset,不做通用 SVG DSL**。表提供几何/paint token(可单测),`DestinationCard` 内保留一个 ~20 行的 `renderPresetOrnaments` 把 kind 映射到 SVG——`data-card-accent`/`data-card-avatar` 锚点原样保留。首字内容(`group.title.slice(0,1)`)是数据依赖,由渲染器传入,表只声明字号/基线。

### 2.2 消费改造(DestinationCard.tsx)

- :165 `photoOffset` 三元 → `overlay.contentIndent`(批次 C 仍只给 titleX 消费,像素不变;正文行消费留给批次 D)。
- :244/:247-248 → `resolveCardSurfaceAttrs(preset, surface)` 展开,输出属性集合与现状逐字节等价(borderless 不输出 `strokeWidth` 属性,不能输出 `strokeWidth={0}`——序列化字节不同,违反 round3 §2G 的显式缺省政策)。
- :264/:265 两个 preset 分支 → `overlay.ornaments.map(renderPresetOrnaments)`。
- :284 `preset !== "borderless"` → `overlay.showHeaderDivider`。
- PosterCanvas.tsx:479/:535 的 `compactLayout` 双份判断 → 由 `CARD_PRESET_OVERLAYS[preset].rowHeightFloor` 经 card-metrics 单点消费(与 S2 批次 B 合并处理,见 §3.2;`cards.compactLayout === true` 布尔仍并联,迁移语义 scene-document.ts:603/:608 不动)。

### 2.3 语义决策(记录在案)

1. **preset 赢过用户 surface token,维持现状。** ticket rx12 目前无条件压过 `displayFrame.style.borderRadius` 的用户显式值——覆盖表如实复刻(overlay 在 resolved surface 之上应用)。"用户显式 token 应否反压 preset"是观感决策,不属于像素不变重构,单独登记待议,本轮不改。
2. **S6 边界:** borderless 连接线隐藏(`opacity<0.9`,PosterCanvas.tsx:756/:774/:932)**不进表**——它是画布级行为且拖拽/渲染两路重复,阈值常量化归 S6,与 DestinationCardsLayer 抽取(开刀顺序第 2 条)同区域,避免双 owner 冲突。
3. **compact 归 metrics 段而非 paint 段**:compact 无任何 paint 差异,只有行高下限;放进同一张表的 `rowHeightFloor` 字段保证"每 preset 单一事实来源",但消费方是布局(card-metrics),paint 渲染器不读它。

### 2.4 测试

- 新 `src/lib/card-preset-overlay.test.ts`:五 preset 的表值快照;`resolveCardSurfaceAttrs` 对 ticket/borderless/standard 的三元组逐值锁(rx12 / rx0+stroke none+strokeWidth undefined / surface 透传)。
- 既有锁回归:PosterCanvas.test 的 preset 用例(borderless/photo 切换)、DestinationCard.test 边界锁、`DestinationCard.align.round3.test.tsx`、`export-poster.round3.test.ts` 全绿即字节不变的集成证据。

---

## 3. S2 设计:`src/lib/card-metrics.ts`(头部几何与行距纯函数)

### 3.1 常量与函数签名

模块名取 `card-metrics.ts` 而非 round3 建议的 `card-header-geometry`:靶面实测后不止头部——行步进/标题步进公式各有两份重复(§1.2),同模块收编。

```ts
export const CARD_HEADER = {
  titleTop: 12,          // fixed title y 默认;derive title 盒 y
  titleBoxHeight: 24,    // derive title 盒高
  countBaseline: 22,
  dividerY: 30,          // 实际 y = dividerY + headerExtra
  bodyTop: 42,           // fixed 正文首行基线默认;derive body y
  baselinePad: 2,        // 头部块高 44 = bodyTop + baselinePad
  textureY: 3, textureSize: 30, textureHeaderWidth: 36,
} as const;

export function cardTitleLineHeight(titleFontSize: number, lineHeightMultiplier: number): number;
// = Math.max(16, titleFontSize + 4) * lineHeightMultiplier

export function cardHeaderExtra(titleLineCount: number, titleLineHeight: number): number;
// = Math.max(0, titleLineCount - 1) * titleLineHeight

export function cardRowHeight(input: {
  rowFontSize: number;            // 调用方经统一的 cardFieldFontSize 计算(见 D1 裁决)
  lineHeightMultiplier: number;
  rowHeightFloor?: number;        // CARD_PRESET_OVERLAYS[preset].rowHeightFloor ?? 20
}): number;                        // = Math.max(floor, rowFontSize + 6) * m

export function destinationCardHeight(input: {
  lineCount: number; rowHeight: number; bottomPadding: number; headerExtra: number;
}): number;                        // = (bodyTop + baselinePad) + headerExtra + lineCount*rowHeight + bottomPadding
```

`cardFieldFontSize`(city = `max(9, fontSize−1)`)不重写:语义已存在于 `resolveDisplayFrameFieldFontSize`(display-frame-style.ts:89-91),metrics 模块 re-export 或调用方直用,保证与渲染 tspan 字号级联同源。

### 3.2 消费点改造(全部为公式搬迁,值不变)

| 消费点 | 改造 |
| --- | --- |
| PosterCanvas.tsx:133-135 `destinationHeight` | 删本地函数,:597 改调 `destinationCardHeight` |
| PosterCanvas.tsx:543 / :586 | `cardTitleLineHeight` / `cardHeaderExtra` |
| PosterCanvas.tsx:489-492 与 :537-538 双份 rowHeight | 合并为一次 `cardRowHeight` 调用,结果同时供 cardStyle 与 solver(**须先过 D1 裁决**);`compactLayout` 判断收敛到 `rowHeightFloor` 入参 |
| DestinationCard.tsx:211/:272/:283/:284 | `?? 42`→`?? CARD_HEADER.bodyTop`、`?? 12`→`?? CARD_HEADER.titleTop`、`22`→`countBaseline`、`30`→`dividerY`;标题步进改调 `cardTitleLineHeight`(lineHeight 来源仍按现状传 `flowTitleBlock?.lineHeight ?? lineHeightMultiplier`,D2 不动) |
| display-frame.ts:236-238 derive 几何 | y12/y42/h24 改引 `CARD_HEADER` 常量(lib→lib 无环:card-metrics 不 import display-frame);步进 20 与行高下限 20 数值耦合处加注释声明各自语义,不强行同源 |

memo 热路径注意:仅纯函数抽取,不动 :445-466/:514-532 的 useMemo 依赖数组语义,不碰 `arePosterCanvasPropsEqual` 比较器。

### 3.3 D1/D2 处置

- **D1(必须裁决):** 统一到 `cardFieldFontSize` 语义(city 取 `max(9,fontSize−1)`)——理由:city 行 glyph 实际渲染字号走同一级联,solver 侧本来就是这个语义,且它保住"末行 baseline ≤ height−bottomPadding"不变量。**像素影响:** 仅 `visibleFields===["city"]` 且无 city 字号覆盖且 fontSize≥10 的文档,渲染行步进减 1×m px/行(卡内不再溢出);求高不变。作为**独立小批次**(§5 批次 B2)交付:先加"city-only 字段行步进 = solver 步进"的回归锁,交付说明记录受影响文档条件,回滚 = revert 单批。
- **D2(只登记):** `cardTitleLineHeight` 的 multiplier 入参由调用方显式传,两处调用各传现状值,分叉如实保留并在函数 JSDoc 登记"flow 模式 block.lineHeight 与 solver 不一致,归 S5 与标题字号耦合同批修"。禁止本轮顺手改——那是视觉变更且需布局侧感知,round3 S5 已裁决"勿单独改渲染"。

### 3.4 不变量测试(新 `src/lib/card-metrics.test.ts`)

1. 数值锁:`destinationCardHeight` 展开 = `44 + headerExtra + n×rowHeight + bottomPadding`(锁 44 不漂移);`CARD_HEADER` 全常量快照。
2. 结构不变量:`titleTop < countBaseline < dividerY < bodyTop`;`headerExtra(1行) === 0`。
3. 末行不变量(性质测试,参数扫 lineCount 1–20 × fontSize 9–24 × multiplier {0.8,1,1.5}):`bodyTop + headerExtra + (lineCount−1)×rowHeight ≤ height − bottomPadding`。
4. D1 回归锁:`visibleFields=["city"]` 时 cardStyle 行步进 === solver 行步进(批次 B2 落地后启用)。
5. 集成字节锁:批次 B 前后对同一 fixture 跑 `serializePosterSvg` 字符串全等断言(临时对照,批内自证后删除或转为既有 export 测试的补充断言;正式 golden 取样仍按 round3 §5.4 政策等全批合入后)。

---

## 4. S8:JSDoc @deprecated 文案(可直接粘贴,零像素风险)

display-frame.ts:16(`DisplayFrameStyle.margin`):

```ts
/**
 * @deprecated 仅为 schema 往返保留:normalize 钳制、derive 时自 `cards.gap` 回声。
 * 渲染/布局消费者为 0;卡间距唯一真源是 `cards.gap`(布局经 `bounds.gap`)。
 * 禁止接线——接入渲染会与 `cards.gap` 形成双写分叉。裁决见 .agent_workspace/cycle1-round3-fable-b.md §3。
 */
```

display-frame.ts:68(`DisplayFrameDefinition.fieldOrder`):

```ts
/**
 * @deprecated derive/normalize 往返回声字段;渲染顺序唯一真源是 `cards.visibleFields`
 * (`cardRowsForGroup`)。现存消费者仅 schema 往返与 bench 合成数据(非渲染路径)。
 * 禁止接线为渲染排序依据。裁决见 .agent_workspace/cycle1-round3-fable-b.md §3。
 */
```

display-frame-style.ts:28(`ResolvedDisplayFrameSurface.margin`,镜像注记防下游经解析层接线):

```ts
/** @deprecated 自 DisplayFrameStyle.margin 透传,无渲染消费者;间距真源是 cards.gap。禁止接线。 */
```

不做:`DestinationCardStyle.flowNameFontSize` 从接口移除(props 形状变化,须与 PosterCanvas 同批,round3 S8 尾项另案);不加 eslint deprecation 插件(工程无此依赖,不为注记引新依赖)。

---

## 5. 批次顺序、验收与回滚

前置:Round 3 工作树改动须先按 round3 §5 的四条同批纪律提交落地,本计划各批次基于其后的 HEAD。

| 批次 | 内容 | 像素 | 验收 | 回滚 |
| --- | --- | --- | --- | --- |
| **A** | S8 三处 JSDoc | 无 | `npx vitest run src/lib/display-frame.test.ts src/lib/display-frame-style.test.ts` + `npm run lint` | revert 即可,无依赖 |
| **B** | card-metrics.ts + §3.2 消费搬迁(不含 D1 语义变更:双 rowHeight 先各自调 `cardRowHeight` 传各自现状 rowFontSize) | 无(字节锁自证) | `npx vitest run src/lib/card-metrics.test.ts src/components/canvas/PosterCanvas.test.tsx src/components/canvas/DestinationCard.test.tsx src/lib/export-poster.round3.test.ts src/components/canvas/PosterCanvas.performance.test.tsx` | revert 单批;无 schema/导出形状变化 |
| **B2** | D1 统一(solver 语义) | **有**(窄边缘,§3.3 条件) | 先落 D1 回归锁再改;交付说明记录受影响文档条件 | revert 单批恢复双算式 |
| **C** | card-preset-overlay.ts + DestinationCard 消费(contentIndent 仅 title) | 无(字节锁自证) | `npx vitest run src/lib/card-preset-overlay.test.ts` + 批次 B 同一测试集 | revert 单批 |
| **D** | photo 正文行消费 `contentIndent`(P2-4 修复) | **有**(photo preset 文档正文 x+32) | 先加几何断言(photo 正文行 x = anchorX+32)再改一行;交付说明 + 回滚=revert 单 token | revert 单批 |

顺序 A→B→B2→C→D:B 在 C 前,因 overlay 的 `rowHeightFloor` 经 metrics 消费;B2/D 是仅有的两个视觉批,各自独立可弃。每批 = 代码+测试同 commit,失败按 failure→cause→fix→recheck 链记录。

## 6. 并行协同与遗留登记

- **与开刀顺序第 1 条(preparedCards 解耦)**:批次 B 是其直接前置——rowHeight/titleLineHeight 单源化后,文本换行输入集合收敛,解耦时不会再复制第三份公式。建议 B 先行合入。
- **与第 2 条(DestinationCardsLayer)**:冲突面在 PosterCanvas :914-1018 渲染区与 :746-776 拖拽区;批次 B 只动 :489-597 计算区,C/D 只动 DestinationCard.tsx,冲突可控;S6 连接线阈值随 Layer 抽取一并处理,本席不碰。
- **S4 第一半(`lineHeightMultiplier` 一行接线,PosterCanvas :969-983)**:仍开放,非本席范围;建议搭第一个触碰该挂载区的批次(大概率 DestinationCardsLayer 抽取批)落地,断言 opus-B 侧已就位,勿散佚。
- **待议决策登记**:①用户显式 `borderRadius` 应否反压 ticket rx12(§2.3-1);②D2/S5 标题步进与字号耦合的布局侧感知方案。
