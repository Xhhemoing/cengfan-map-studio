# Cycle 3 《Round 3 结论简报》— 终局冻结 ACCEPT

**模型未降级。** 6 席全部完成。优化冻结维持；三项 @24 中位全部过线。

## 终局数字（中位口径，`npm run perf:canvas`，串行、离群作废）

| 指标 @24 | fable-A 三遍中位 | gpt-sol-A 两遍中位 | 验收线 | 判定 |
| --- | ---: | ---: | ---: | --- |
| pan | **3.976ms** | 3.959ms | ≤6.0 | PASS（余量 34%） |
| frozen pan | **3.416ms** | 3.456ms | ≤5.5 | PASS（余量 38%） |
| recolor | **5.184ms** | 5.128ms | ≤6.5 | PASS（余量 20%） |

两席差 ≤0.06ms。数字链：pan@24 **21 → 10 → 6.2 → 4.0ms**；MapLayer 单层 2.38 → 0.07ms；recolor ~20+ → 5.2ms；mount ~75ms 未立项。

测量协议：中位、≥2 遍、与其他负载串行。禁止为凑线改 bench 定义。

## 各席核销

| 席 | 结论 |
| --- | --- |
| fable-A | FINAL ACCEPT；优化冻结不翻案；交接清单冻结 |
| fable-B | 展示框冻结合入，条件是 PR 补齐九条视觉/语义回滚 bullets |
| opus-fast-A | 两份守卫测试（polygon-origin 调用方不变量、MapLayer 子树禁读 x/y）；生产代码零 diff |
| opus-fast-B | bench ~185 不是 flow 游标副本（typography-first prepared-wrap）；仅两行注释 |
| gpt-sol-A | 独立两遍过线，与 fable-A 互证 |
| gpt-sol-B | 无新测试；登记 map-edge 滤镜 id 未 scope（C3-R2-4，多 SVG 内嵌才碰撞） |

## 本轮入库

- `MapLayer.origin-isolation.cycle3r3.test.tsx`
- `PosterCanvas.polygon-origin.cycle3r3.test.tsx`
- `scripts/perf-canvas-bench.ts` 两行注释

## 遗留（不修，S5 / 另立）

- flow 求高族 C/D/§3.2/E（字号链与 paint 不一致）
- map-edge defs 跨实例 id
- 行数超标、bench city 降档仅夹具外可见、mount 投影缓存

## 禁令

不复活展示框工作台；不 clamp 冻结坐标；不虚拟化；不改 `data-*`；不动求解器；`MapLayerContent` 禁读 `settings.x/y`；`destinationCardFlowContentStart` 禁换 `cardFieldFontSize`；bench prepared-wrap 禁换 flow 回退。
