# Round 27 结论简报

- **时间**: 2026-08-24
- **前置**: Round 26 BRIEF（221 files / 1957 tests）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **集成**: `tsc` app+node 0 error；`npx eslint . --max-warnings 0`；全量 vitest **221 files / 1966 tests passed**（76.98s）

## 相对 Round 26

| 代理 | Round 26 | Round 27 |
| --- | --- | --- |
| R27-fable-arch | 素材库删除/抠图图标 | AssetInspector 删除/图层/复制图标 hidden |
| R27-fable-sota | GuestsInspector 图标 | TextInspector 删除/显隐图标 hidden |
| R27-opus-layout | packSides orderResult | slotPlacements 走 marginSeat。saturation.ts 374 行 |
| R27-opus-data | HTML emsp | CELL_DELIMITERS `﹔`（U+FE54）。import-data 仍 400 |
| R27-gpt-perf | nearestX/Y hoist | nearestValues 不再二次 Set（入参已是 Set） |
| R27-gpt-server | 跳过 unknown XFF | XFF/X-Real-IP 剥 IPv6 方括号 |

## 验证链

| failure | cause | fix | recheck |
| --- | --- | --- | --- |
| 无集成失败 | — | 子代理路径隔离；nearestValues 仅被 Set 调用 | tsc 0；eslint --max-warnings 0；221 / 1966 |
| 槽外卡内联 clamp 与 marginSeat 漂移 | slotPlacements 自写座位 | `return seated ?? marginSeat(card, space)` | saturation：toEqual(marginSeat(...)) |
| `林舟﹔北京大学﹔北京市` 无法分列 | CELL_DELIMITERS 只有 `；` | 加入 `﹔`，两格即分隔 | import 套件绿 |
| XFF `[2001:db8::1]` 带括号 | 仅 Forwarded 剥括号 | 共享 unwrapBracketedAddress | client-ip 单测绿 |

## 仍未达印刷级 SOTA

- 无真浏览器 E2E；协作 flock 只保证单机。
- 饱和溢出仍堆在 `y = maxY`。浏览器 PNG 仍为 sRGB。
