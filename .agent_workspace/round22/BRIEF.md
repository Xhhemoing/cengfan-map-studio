# Round 22 结论简报

- **时间**: 2026-08-24
- **前置**: Round 21 BRIEF（216 files / 1886 tests）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **集成**: `tsc` app+node 0 error；`npx eslint . --max-warnings 0`；全量 vitest **217 files / 1898 tests passed**（77.16s）

## 相对 Round 21

| 代理 | Round 21 | Round 22 |
| --- | --- | --- |
| R22-fable-arch | Legacy / 新增学生 / 资源包图标 | StudioBrand hidden；Topbar 复用 StudioBrand |
| R22-fable-sota | ProjectCard 菜单图标 | 错误壳品牌标 hidden |
| R22-opus-layout | sweep 剩余卡 marginSeat | layoutGrid 剩余卡 stackAtMargin |
| R22-opus-data | LIST_MARKER 全角标点 | CELL_DELIMITERS 加 `｜` |
| R22-gpt-perf | sweepPack 形态 bench | layoutGrid leftover 形态 bench |
| R22-gpt-server | XFF 最右跳 | 无 XFF 时 X-Real-IP 回落 |

## 验证链

| failure | cause | fix | recheck |
| --- | --- | --- | --- |
| 网格剩余卡叠成一点 | fallback 共用 marginSeat 且不入 placed 扫描 | stackAtMargin(marginSeat) | pack 新例绿；临时回退则 y 全为 20 |
| `林舟｜北京大学｜北京市` 无法识别 | CELL_DELIMITERS 只有 ASCII `\|` | 加入 `｜` | import 套件绿 |
| 反代只设 X-Real-IP 时全员同桶 | trustProxy 无 XFF 即用 socket | 回落 X-Real-IP | security 四例绿 |

## 仍未达印刷级 SOTA

- 无真浏览器 E2E；协作 flock 只保证单机。
- 饱和溢出仍堆在 `y = maxY`。浏览器 PNG 仍为 sRGB。
