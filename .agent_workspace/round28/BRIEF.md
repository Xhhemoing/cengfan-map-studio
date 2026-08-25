# Round 28 结论简报

- **时间**: 2026-08-24
- **前置**: Round 27 BRIEF（221 files / 1966 tests）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **集成**: `tsc` app+node 0 error；`npx eslint . --max-warnings 0`；全量 vitest **221 files / 1979 tests passed**（77.16s）

## 相对 Round 27

| 代理 | Round 27 | Round 28 |
| --- | --- | --- |
| R28-fable-arch | AssetInspector 图标 | CanvasInspector 重置画布图标 hidden |
| R28-fable-sota | TextInspector 图标 | CardsInspector 图层/重置图标 hidden |
| R28-opus-layout | slotPlacements marginSeat | contain/saturated 经 orderResult。card-layout.ts 370 行 |
| R28-opus-data | CELL_DELIMITERS `﹔` | 小写冒号 `﹕`（U+FE55）。import-data 仍 400 |
| R28-gpt-perf | nearestValues Set | 诚实跳过（候选更慢） |
| R28-gpt-server | XFF 剥 IPv6 方括号 | XFF/X-Real-IP 走 Forwarded 引号规范化 |

## 验证链

| failure | cause | fix | recheck |
| --- | --- | --- | --- |
| 无集成失败 | — | 子代理路径隔离；perf 诚实跳过未改 pack.ts | tsc 0；eslint --max-warnings 0；221 / 1979 |
| 饱和回落若返回打包序 | contain/saturated 直接 reduce betterLayout | `leastBad` 对 winner `orderResult` | card-layout：fallback id 序 = 输入 |
| `林舟﹕北京大学﹕北京市` 无法分列 | CELL_DELIMITERS 只有 `：` | 加入 `﹕`，两格即分隔 | import 套件绿 |
| XFF `"203.0.113.9"` 带引号 | rightmostHop 未走 Forwarded 引号规则 | 每 hop `normalizeForwardedAddress` | client-ip 单测绿 |

## 仍未达印刷级 SOTA

- 无真浏览器 E2E；协作 flock 只保证单机。
- 饱和溢出仍堆在 `y = maxY`。浏览器 PNG 仍为 sRGB。
