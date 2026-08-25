# Round 29 结论简报

- **时间**: 2026-08-25
- **前置**: Round 28 BRIEF（221 files / 1979 tests）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **集成**: `tsc` app+node 0 error；`npx eslint . --max-warnings 0`；全量 vitest **223 files / 1991 tests passed**（76.47s）

## 相对 Round 28

| 代理 | Round 28 | Round 29 |
| --- | --- | --- |
| R29-fable-arch | CanvasInspector 重置 | MapInspector 重置/图层图标 hidden |
| R29-fable-sota | CardsInspector 图层 | stage-slots 刷新/返回地图图标 hidden |
| R29-opus-layout | contain orderResult | 手摆卡 side 走 LayoutSpace.sideOf |
| R29-opus-data | CELL_DELIMITERS `﹕` | HTML `&numsp;`/`&hairsp;` 解码为空格 |
| R29-gpt-perf | 诚实跳过 | 诚实跳过 |
| R29-gpt-server | 引号 XFF | `::ffff:` 前缀大小写不敏感 |

## 验证链

| failure | cause | fix | recheck |
| --- | --- | --- | --- |
| 无集成失败 | — | 子代理路径隔离；perf 诚实跳过 | tsc 0；eslint --max-warnings 0；223 / 1991 |
| 手摆卡 side 走私有 sideForPlacement | 与 LayoutSpace.sideOf 入口不一致（实现等价） | `space.sideOf(area)`；坐标不动 | pinned 套件：side 等于 space.sideOf |
| `苏&numsp;禾` 姓名含实体 | 命名实体表无 figure/hair space | numsp/hairsp → `" "` | html-table 套件绿 |
| XFF `::FFFF:203.0.113.9` 留前缀 | `/^::ffff:/` 大小写敏感 | `/^::ffff:/i` | client-ip 单测绿 |

## 仍未达印刷级 SOTA

- 无真浏览器 E2E；协作 flock 只保证单机。
- 饱和溢出仍堆在 `y = maxY`。浏览器 PNG 仍为 sRGB。
