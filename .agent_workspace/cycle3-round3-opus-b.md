MODEL: claude-opus-5-thinking-high-fast

# Cycle 3 Round 3(FINAL freeze)— opus-fast-B:`scripts/perf-canvas-bench.ts` ~185 字号回退链定性

结论先行:**Round 2 的怀疑不成立**。bench ~183-185 的 `preparedFieldFontSize` 是 **prepared-wrap(typography-first)链**,不是 flow 游标的重复实现。按任务硬约束,**不替换为 `destinationCardFlowContentStart`**,只加一行注释说明这是有意为之的 typography 链。

---

## 1. 发现:两条链的判别

| | flow 游标 | bench ~185 的实际形态 |
| --- | --- | --- |
| 权威实现 | `destinationCardFlowContentStart`(`destination-card-metrics.ts:176-183`) | `cardFieldFontSize`(`prepared-card-content.ts:101-108`) |
| 字号回退 | `block.style?.fontSize ?? (city ? max(9, fs−1) : fs)` — **不查 `fieldTypography`** | `fieldTypography?.[field]?.fontSize ?? (city ? max(9, fs−1) : fs)` — **typography 优先** |
| 还带什么 | `reduce`:起点 `DESTINATION_CARD_TITLE_TOP`(12),每块累加 `block.spacing + size * block.lineHeight` | 无累加、无游标、无 12、无 `spacing`/`lineHeight` |
| 消费方 | `destinationCardBodyTop` 的 `flowContentStart` | `wrapCardText` 批次的 `fontSize` / `maxWidth` |

判别依据是**首项**:bench 表达式的第一个回退项是 `project.cards.fieldTypography?.[field]?.fontSize`(:184),与 `cardFieldFontSize` 逐字同构;而 flow 游标的首项是 `block.style?.fontSize`,且 `destination-card-metrics.ts:169-174` 的文档注释明确写了它**故意不查 `fieldTypography`**("consulting typography would move the flow cursor of every document that sets it, which is a pixel change, not a refactor")。两式共享的只有尾部 `(city ? max(9, fs−1) : fs)` 这一段 city 降档规则 —— 这正是 Round 2 误判的来源:**看到共同尾巴,漏了不同的头**。

补充证据:全文件通读 `scripts/perf-canvas-bench.ts`(493 行)**不存在** flow reduce 的任何复制品 —— 无 `reduce`、无 `block.spacing`、无以 12 起步的游标。任务书设定的"只有找到真正的 flow reduce 重复才调用 `destinationCardFlowContentStart`"这一前置条件**未触发**。

若真按 Round 2 的建议替换,后果是 bench 从"测 prepared-wrap 批次"变成"测 flow 头部游标",测量对象改变(且当前 fixture 是 fixed 模式,flow 游标根本不参与),属于任务书明令禁止的一类改动。

## 2. 改动:一行注释,零行为

`scripts/perf-canvas-bench.ts`,`preparedFieldFontSize` 定义之上加注释,把"这是哪条链"钉在原地,避免下一轮再次误判:

```
// Typography-first chain, mirroring `cardFieldFontSize` in `prepared-card-content` — not the
// flow cursor of `destinationCardFlowContentStart`, which ignores `fieldTypography` on purpose.
```

除此之外 **无任何代码改动**。未触碰 `MapLayer.tsx` / `PosterCanvas.tsx` / `destination-card-metrics.ts`,未新增导入,未改分支。

## 3. 验证(failure → cause → fix → recheck)

`scripts/` 目录既不在任何 tsconfig 的 `include` 内(`tsconfig.node.json` 只收 `vite.config.ts` / `server/**` / `src/vite-env.d.ts`),也被 ESLint 忽略(`eslint scripts/perf-canvas-bench.ts` 返回 "File ignored because no matching configuration was supplied"),因此**静态检查对本文件无覆盖,唯一有效验证是实跑 bench**。

- `npx tsc --noEmit -p tsconfig.app.json` → 0 错(确认无外溢影响)。
- `npm run perf:canvas` → 退出码 0,30 条 metric 全部产出,脚本内建的所有不变量断言(卡片计数、`translate(...)` map transform、frozen 位置不漂移、省份 recolor fill、guest 行/卡计数)全部通过。

**一次真实 failure 及其闭环:** 为核对 bench 手写链与权威实现是否等值,先写了直接 `tsx` 导入 `project-document` 的临时探针(仅在 `/tmp`,未入库),报 `SyntaxError: Unexpected token ':'` 落在 `src/assets/china.geojson`。根因不是链本身,而是该模块图经 `?raw` 导入 GeoJSON,裸 tsx 无此 resolver —— 这恰是 bench 自己用 `vite.ssrLoadModule` 加载模块的原因(:114-124 注释已写明)。修法是把探针改走同一 Vite SSR loader,重跑通过。

**等值核对结果**(经 Vite SSR loader,`buildPosterCanvasBenchFixture(8)` + `templateId: "original"`):

```
fontSize 12, visibleFields ["name","university","city"], fieldTypography null
bench: rowFontSize 12, titleFontSize 12, contentWidth 196, titleWidth 154
real (computePreparedCardMetrics): 12, 12, 196, 154   → 完全一致
```

## 4. 顺带发现(**未改动**,登记为 deferred)

bench :187 用 `preparedFieldFontSize` 映射 `visibleFields`,而权威 `computePreparedCardMetrics`(`prepared-card-content.ts:125`)对可见字段用的是 `fieldTypography?.[field]?.fontSize ?? fontSize` —— **不套 city 降档**(只有 city *标题* 降一档,作为 `cityHeadingFontSize` 单独并入 `Math.max`)。即 bench 对"可见字段中的 city"多降了一档。

- **当前 fixture 下无数值漂移**:`visibleFields` 含 name/university(均为 fs=12),`Math.max` 吃掉了差异,实测两侧同为 12(见 §3)。
- **潜在漂移场景**:仅当所有可见字段都会降档时暴露。定向探针 `visibleFields: ["city"]` 实测 **bench 11 vs real 12**。
- **本轮不改的理由**:(a) Round 3 为 FINAL freeze;(b) 该行不是本轮授权的 :185 目标行,改它属扩大范围;(c) 当前 fixture 零影响,不是活跃缺陷。留给后续 cycle:把 :187 改为 `project.cards.fieldTypography?.[field]?.fontSize ?? project.cards.fontSize`,或直接从 `prepared-card-content` 导入 `cardFieldFontSize` 并同步可见字段映射,可一并消除手写副本。

## 5. 交付与回滚

- **验收方式**:`npm run perf:canvas` 实跑(退出码 0 + 30 条 metric + 内建断言全通过);注释本身为非执行文本,对 metric 数值零影响。
- **回滚**:删除 `scripts/perf-canvas-bench.ts` 中新增的两行注释即可,无数据/导出格式/API 形状变更,不涉及持久化。
- **纪律边界**:全程停留在 `cursor/canvas-render-display-46a1`,无 checkout/stash/commit/push/建分支;仅写 `scripts/perf-canvas-bench.ts` 与本报告;临时探针只落在 `/tmp`,未入库。
