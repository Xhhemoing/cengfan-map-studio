gpt-5.6-sol-xhigh-fast

# Round 3 gpt-sol-2 回归扫荡

## 必跑结果

- 命令：`npx vitest run src/lib/card-layout.properties.test.ts src/lib/destination-layout.test.ts src/lib/card-layout-cache.test.ts src/lib/card-layout-cache.affine.cycle3.test.ts src/lib/card-layout-cache.invariants.cycle3.test.ts src/lib/scene-document.test.ts src/lib/scene-document.cards-layout.test.ts src/components/canvas/PosterCanvas.overlap-obstacles.round1.test.tsx scripts/file-size-ratchet.test.ts`
- 结果：**9 个测试文件通过，63/63 个测试通过，0 失败**。
- 失败链：无失败，因此没有测试或生产实现修复。
- 证据：`/opt/cursor/artifacts/round3_gpt2_regression_suite.log`。

## 兼容与守卫

- `destination-layout` 旧入口仍绿：旧 wrapper 继续把新求解器的非 `solved` 状态映射为 `crossing-fallback`，默认 mode 仍为 `quadrant`；其回归用例随必跑集通过。
- R1 双开关/障碍隔离守卫仍绿：`PosterCanvas.overlap-obstacles.round1.test.tsx` 的 4 个用例通过，地图障碍与元素障碍仍分属 `occupiedAreas` / `elementAreas`，拖拽 clamp 与自动布局仍使用同一份 bounds。
- R2 几何与拆分守卫仍绿：`card-layout.properties.test.ts` 全部通过；`scripts/file-size-ratchet.test.ts` 的 5 个 ratchet 用例通过，拆分后的文件规模约束未回退。
- scene 文档默认值、旧文档 normalize、布局 mode 兼容，以及 cache key 对 `elementAreas` / 双开关的区分均随必跑集通过。

## 泄漏扫荡

- **未发现重复障碍注入或同一请求的双重 `elementAreas`。** 生产链路中 `collectElementObstacles` 只在 `PosterCanvas` 调用一次，所得数组只在 `cardLayoutBounds` 写入一次；`destination-layout` wrapper 原样转交 bounds，不会再次拼接；求解器只在 `obstacleZones` 中把 map / element 两组障碍合并一次。
- 全仓生产代码另有一处 `elementAreas` 位于 `agent-session.ts`，它属于 AI `auto_layout` 的另一条独立请求，不是同一请求的重复写入。
- **仍有 ROUND2-BRIEF 已记录的实现缺口，不是本轮新泄漏：** `agent-session.ts` 仍只用固定高度 `120` 构造嘉宾障碍，没有复用画布的 `collectElementObstacles`，因此 AI 路径仍缺文本、装饰障碍，且嘉宾高度可能与画布解析值不同。按任务约束未改生产实现，留给主代理处理。
