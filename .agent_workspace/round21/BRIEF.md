# Round 21 结论简报

- **时间**: 2026-08-24
- **前置**: Round 20 BRIEF（212 files / 1866 tests）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **集成**: `tsc` app+node 0 error；`npx eslint . --max-warnings 0`；全量 vitest **216 files / 1886 tests passed**（75.37s）

## 相对 Round 20

| 代理 | Round 20 | Round 21 |
| --- | --- | --- |
| R21-fable-arch | 协作 hook 复用 loadBrowserValue | Legacy 侧栏 / 新增学生 / 资源包导出装饰图标 hidden |
| R21-fable-sota | 项目菜单 + 工作台顶栏 | `ProjectCard` 菜单五枚图标 hidden |
| R21-opus-layout | layoutGrid sideOf | `sweepPack` 剩余卡 `marginSeat`；pack.ts 398 |
| R21-opus-data | `\p{Nd}` 全角数字 | `LIST_MARKER` 标点 `．。）` |
| R21-gpt-perf | 诚实跳过 | `sweepPack` first-fit vs leftovers 形态 bench |
| R21-gpt-server | 500 不泄路径 | trustProxy 时 XFF 最右跳 |

## 验证链

| failure | cause | fix | recheck |
| --- | --- | --- | --- |
| `１．林舟 北京大学 北京市` 姓名含序号 | LIST_MARKER 标点仅 ASCII `[.、)]` | 类扩 `．。）` | import 套件绿（含临时回退旧类仅新例红） |
| sweep 剩余卡 side 写死 left | leftover probe 在入座前撒谎 | `marginSeat` + `stackAtMargin` | pack + modes 绿 |
| 伪造最左 XFF 绕过限流 | trustProxy 取 hop[0] | 取最右非空 hop | security 三例绿 |

## 仍未达印刷级 SOTA

- 无真浏览器 E2E；协作 flock 只保证单机。
- 饱和溢出仍堆在 `y = maxY`。浏览器 PNG 仍为 sRGB。
- `layoutGrid` 无格可坐时多张卡叠在同一 `marginSeat`，尚未走 `stackAtMargin`。
- 品牌标 `MapPinned`（StudioBrand / StudioTopbar / 错误壳）仍无 `aria-hidden`。
- 无表头全角竖线 `｜` 尚未进入 `CELL_DELIMITERS`。
