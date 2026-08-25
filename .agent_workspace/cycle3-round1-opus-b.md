# Cycle 3 Round 1 — opus-B：connector 滤镜 id 实例化（P2 残项 C2-4）

**结论：原先并不唯一，属现存 bug，已修复并加回归测试。**

## 1. 问题确认（不是"已唯一，只补测试"）

`PosterCanvas` 用固定前缀解析连接线样式：

```ts
const connectorEdge = useMemo(() => resolveEdgeStyle({ ..., filterPrefix: "connector-edge" }), [...]);
```

`DestinationCardsLayer` 直接把 `connectorEdge.filters[].id` 写进 `<defs>`。于是同页两个
`PosterCanvas`（编辑器 + `dataTemplateId` 模板预览）都会输出
`id="connector-edge-soft-glow"`，SVG id 是全文档解析，`url(#connector-edge-soft-glow)`
只会命中先挂载的那一个。两实例 `connectorWidth` 不同 → `feGaussianBlur stdDeviation`
/ `feDisplacementMap scale` 串味；`serializePosterSvg` 克隆整棵 SVG 导出，克隆内的
引用也跟着指向别人的滤镜。

对照 Cycle 1 风险榜第 3 条与 Cycle 2 Round 2 残留 b，判定为**现存 bug**。

## 2. 改法

受本轮 ALLOWED 约束（`PosterCanvas.tsx` 不可动），把作用域收在消费端：

- `src/lib/edge-styles.ts` 新增纯函数 `scopeEdgeStyleFilters(resolved, scope)`：
  只改写 `filters[].id` 与 `underlays/strokes[].filter` 里的 `url(#…)` 引用，
  颜色 / 宽度 / dasharray / linecap / opacity 一律原样透传。
  - 无滤镜或 scope 清洗后为空时**返回入参本身**（引用相等），memo 不掉链。
  - 内部 `sanitizeIdToken` 只保留 `[A-Za-z0-9_-]`：React 19 的 `useId` 返回
    `«r0»`，`«` 不是合法 XML Name 起始字符，直接进 `id` 会让
    `data:image/svg+xml` 导出解析失败。
- `src/components/canvas/DestinationCardsLayer.tsx`：`useId()` + `useMemo`
  包一层，仅改 defs id 与引用，视觉分支（`soft-glow` / `ink` 的 markup、
  `seed="1"`）一字未动。

id 形态：`connector-edge-soft-glow` → `connector-edge-soft-glow-r0`，保留原前缀，
调试时仍看得出是哪种样式。

`useId` 的唯一性只在同一 React 树内成立；`src/main.tsx` 全站单 root，编辑器与模板
预览同树，成立。（若将来另起 `createRoot`，需给它传 `identifierPrefix`。）

## 3. 验证（failure → cause → fix → recheck）

**a. 回归测试有效性（反向对照）**
把 `scopeEdgeStyleFilters(incomingConnectorEdge, instanceId)` 临时改回 `""`（等价于修复前），
`DestinationCardsLayer.test.tsx` 2 条失败：id 仍是裸 `connector-edge-soft-glow`、
两画布 id 相同。恢复后通过 → 测试不是空转。

**b. 导出用例一次失败并定位**
- failure：`export-poster.round3.test.ts` 新用例断言 `DOMParser` 无 `parsererror`，
  实际报 `duplicate attribute: xmlns`。
- cause：与 filter id 无关。`serializePosterSvg` 读 `clone.getAttribute("xmlns")`
  为 null（`createElementNS` 建的根不带字面量属性）就补写一次，而 happy-dom 的
  `XMLSerializer` 自己也会输出命名空间声明，根节点因此重复。属 `export-poster.ts`
  在测试环境下的既有行为，且该文件不在本轮 ALLOWED。
- fix：断言收窄到本轮真正要保的性质——`filterId` 匹配合法 XML Name
  `/^[A-Za-z][A-Za-z0-9_-]*$/`，且序列化产物里 `id=` 与 `url(#…)` 对得上。
- recheck：同一命令重跑通过。

**c. 指定验证命令**

```
npx vitest run src/lib/edge-styles.test.ts src/components/canvas/DestinationCardsLayer.test.tsx \
  src/lib/export-poster.test.ts src/lib/export-poster.round3.test.ts
→ 4 files / 29 tests passed
```

**d. 扩面**

```
npx vitest run src/components/canvas src/lib   → 116 files / 835 tests passed
npx eslint <5 个改动文件>                        → 0
npx tsc --noEmit -p tsconfig.app.json           → 本轮文件 0 error
```

`tsc` 另报 4 条 `src/lib/card-layout-cache.ts` 的 `TS18048: 'polygonOrigin' is
possibly 'undefined'`。该文件是并行 agent 在同一工作树里的未完成改动（本轮 FORBIDDEN），
不在本次 diff 内，未处理。

## 4. 新增测试

- `edge-styles.test.ts` / `scopeEdgeStyleFilters`：id 与引用同步改写、多滤镜样式（ink）、
  视觉字段逐字段等值、`«r0»` 清洗、无滤镜/空 scope 时引用相等。
- `DestinationCardsLayer.test.tsx`：单实例 id 形态 + 引用自洽；**同一 React 树内两个
  `<svg>` 各自持有不同 filter id，且各自的 `url(#…)` 能在自己子树里 `querySelector` 到**
  （等同导出克隆的解析条件）。
- `export-poster.round3.test.ts`：作用域 id 经 `serializePosterSvg` 后仍是合法 XML Name
  且 defs 与引用成对存活。

## 5. 验收与回滚

- **验收：** 上述四个测试文件的 vitest 命令即验收口径；人工验收路径为同页同时打开编辑器
  与模板预览、把两侧 `connectorDash` 设成 `soft-glow`/`ink` 且 `connectorWidth` 取不同值，
  观察两侧模糊/抖动强度互不影响。
- **破坏性：** 无。不涉及数据、导出格式、API 形状；导出 SVG 里只有 filter id 字面量变化，
  外部无人按该 id 取值。
- **回滚：** 单点回滚 —— 把 `DestinationCardsLayer` 的 `connectorEdge` memo 换回直接使用
  入参（一行），`scopeEdgeStyleFilters` 即成未调用的纯函数，行为回到修复前。

## 6. 未覆盖（同类 id，均在本轮 ALLOWED 之外）

同页多画布时仍会互串，建议后续用同一 `scopeEdgeStyleFilters` / 实例前缀套路收口：

| id | 位置 |
| --- | --- |
| `map-edge-*` / `south-sea-edge-*` 省界滤镜 | `MapDataLayer.tsx:373`、`MapLayer.tsx:261` |
| `province-texture-clip-${featureId}` | `MapDataLayer.tsx:195` |
| `map-image-clip` | `MapLayer.tsx:147` |
| `editor-grid-pattern` | `PosterCanvas.tsx:883` |
| `guest-avatar-clip-${person.id}` | `GuestsLayer.tsx:216,305`（按人唯一，跨实例同人仍撞） |
| `svgId(asset.id)` | `RegionalAssetLayer.tsx:182`（同上） |
