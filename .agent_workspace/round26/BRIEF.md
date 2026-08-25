# Round 26 结论简报

- **时间**: 2026-08-24
- **前置**: Round 25 BRIEF（220 files / 1947 tests）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **集成**: `tsc` app+node 0 error；`npx eslint . --max-warnings 0`；全量 vitest **221 files / 1957 tests passed**（76.82s）

## 相对 Round 25

| 代理 | Round 25 | Round 26 |
| --- | --- | --- |
| R26-fable-arch | 素材库 Chevron | asset-panel-library Trash2/Scissors `aria-hidden` + 测试 |
| R26-fable-sota | 学生表行内图标 | GuestsInspector Eye/X/Trash2 hidden + 测试 |
| R26-opus-layout | repackAll orderResult | packSides 经 `orderResult` 退出。modes.ts 352 行 |
| R26-opus-data | CELL_DELIMITERS `﹑` | HTML `&emsp;`/`&ensp;`/`&thinsp;` 解码为空格 |
| R26-gpt-perf | 诚实跳过 | `repackAll` 把 nearestX/Y 提出笛卡尔循环（行为不变）。pack.ts 395 行 |
| R26-gpt-server | IPv4 `:port` | XFF/X-Real-IP 跳过 `unknown` / `_` hop |

## 验证链

| failure | cause | fix | recheck |
| --- | --- | --- | --- |
| 无集成失败 | — | 子代理路径隔离，pack.ts 仅 hoist nearestValues | tsc 0；eslint --max-warnings 0；221 / 1957 |
| packSides 若返回 placed.items | 右先于左打包，侧内按 primaryKey 排序 | `orderResult(cards, placed.items, space)` | modes：id 序等于 leftColumnBoard |
| `苏&emsp;禾` 姓名含实体 | 命名实体表无 typographic space | emsp/ensp/thinsp → `" "` | html-table 套件绿 |
| XFF `198.51.100.1, unknown` | rightmostHop 只滤空串 | 从右跳过 unknown/_ | client-ip 单测绿 |

## 仍未达印刷级 SOTA

- 无真浏览器 E2E；协作 flock 只保证单机。
- 饱和溢出仍堆在 `y = maxY`。浏览器 PNG 仍为 sRGB。
