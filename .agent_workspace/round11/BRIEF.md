# Round 11 任务简报（进行中）

- **时间**: 2026-08-24
- **前置**: Round 10 BRIEF（tsc 绿、200 files / 1699 tests）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **集成**: `tsc` app+node 0 error。全量 vitest 见 verification commit。

## 仍未达印刷级 SOTA（本轮可推进的真实缺口）

1. `src/lib/agent-session-tools.ts` 的 `healthInput` 仍把所有卡压成一块 180 高矩形、不传 connectors，Agent「检查排版」与交付页健康检查口径不一致。
2. Agent 自动排版调用 `solveCardLayout` 时未传 `fixedPositions`，会把用户手摆的卡重新打散。
3. 连接线健康用地图中心当锚点，跨省引线误报/漏报。
4. 嵌套 HTML 表仍会丢外层列（round 9 记下）。
5. 交付预览出血环是示意；键盘/焦点是否包住新 overlay 未核。
6. 服务端：预检已放行 `X-Request-Id`，查 Host / 限流 / SSE 是否还有同级漏洞。

## 路径隔离（严禁跨组改文件）

| 代理 | 允许 |
| --- | --- |
| R11-fable-arch | `src/lib/agent-session-tools.ts`、`src/lib/agent-session.ts`、`src/lib/agent-session-*.ts`（不含 compaction 大重构）、对应测试。应用 `listContentLayoutIssues` / `buildContentLayoutInput`，不要复制 180 逻辑。 |
| R11-fable-sota | `src/components/workspaces/DeliveryWorkspace.tsx`、其测试、`USER_GUIDE.md`、`src/styles.css`（仅 a11y/reduced-motion 与出血预览焦点）。禁止改 print-bleed 数学。 |
| R11-opus-layout | `src/lib/content-layout-objects.ts`、其测试、`src/lib/connector-geometry.ts`、`src/lib/layout-health.ts`、对应测试。目标：连接线锚点用省份/分组锚点而非画布中心（在不引入 geojson 解析的前提下尽量诚实）。禁止改 card-layout-cache.ts。 |
| R11-opus-data | `src/lib/binary-import.ts`、`src/lib/import-data.ts`、`src/lib/import-headers.ts`、`src/lib/data-health.ts`、对应测试。嵌套表或其它静默错数据。禁止改 GlobalDataScreen（除非测试需要）。 |
| R11-gpt-perf | `scripts/perf-layout-bench.ts`、其测试、`src/lib/layout-perf.ts`、`src/lib/card-layout-cache.ts`。可测 `buildContentLayoutInput` 成本（opt-in）。禁止改阈值除非数量级证据。 |
| R11-gpt-server | `server/**`。查 Host 头、限流、SSE、路径穿越；`server/index.ts` ≤400。 |

静态目录禁止拆。禁止 Playwright、支付、CMYK/ICC。
