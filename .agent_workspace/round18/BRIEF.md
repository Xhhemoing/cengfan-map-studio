# Round 18 结论简报

- **时间**: 2026-08-24
- **前置**: Round 17 BRIEF（210 files / 1831 tests）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **集成**: `tsc` app+node 0 error；`npx eslint .` 0 error（5 条既有 react-refresh 警告）；全量 vitest **210 files / 1846 tests passed**（73.90s）

## 相对 Round 17

| 代理 | Round 17 | Round 18 |
| --- | --- | --- |
| R18-fable-arch | hook 与组件同文件 + eslint-disable | `use-history-announcement.ts` 独立模块 |
| R18-fable-sota | 仅工作室壳 skip-link | 全局设置页「跳到设置内容」，不占 `#studio-stage` |
| R18-opus-layout | 缺 id 回落 (0,0)/right | `orderResult` 边距座位 + `sideOf`；产品调用传入 space |
| R18-opus-data | 连字符姓名 | 无表头纯数字序号列不再被当成姓名 |
| R18-gpt-perf | stackAtMargin 残差观测 | 诚实跳过 |
| R18-gpt-server | gzip * | CI 串行 `npx eslint .` |

## 验证链

| failure | cause | fix | recheck |
| --- | --- | --- | --- |
| 缺 id 坐在原点 | orderResult 写死 0,0/right | marginSeat + 调用方传 space | pack 18；card-layout* 绿 |
| `20260001,林舟,北大,北京` 当姓名 | 无表头序号列占第一格 | 可用列排除纯数字（表头路径不动） | import 套件 + 全量 1846 |
| CI 无 lint | workflow 只有 tsc/vitest | 串行 eslint 步 | `npx eslint .` 0 error |

## 仍未达印刷级 SOTA

- 无真浏览器 E2E；协作 flock 只保证单机。
- 饱和溢出仍堆在 `y = maxY`。浏览器 PNG 仍为 sRGB。
- eslint 仍有 5 条既有 react-refresh 警告（非本轮引入）。
