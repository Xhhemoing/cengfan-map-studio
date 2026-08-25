# Round 20 结论简报

- **时间**: 2026-08-24
- **前置**: Round 19 BRIEF（211 files / 1853 tests）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **集成**: `tsc` app+node 0 error；`npx eslint . --max-warnings 0`；全量 vitest **212 files / 1866 tests passed**（73.79s）

## 相对 Round 19

| 代理 | Round 19 | Round 20 |
| --- | --- | --- |
| R20-fable-arch | 返回钮已拆 | `useCollaborationRoom` 复用 `loadBrowserValue` |
| R20-fable-sota | 顶栏图标 hidden | 项目菜单 + 工作台顶栏装饰图标 |
| R20-opus-layout | orderResult space 必填 | `layoutGrid` clamp 后 `sideOf` |
| R20-opus-data | ASCII 序号 | `\p{Nd}` 全角数字序号 |
| R20-gpt-perf | — | 诚实跳过 |
| R20-gpt-server | Vary gzip | 500 JSON 固定文案，不泄路径 |

## 验证链

| failure | cause | fix | recheck |
| --- | --- | --- | --- |
| 宽浅地图网格卡标 left | 自制左右中线，忽略 top | sideOf(clamped seat) | pack 新例绿；card-layout* 绿 |
| `１ 林舟 北京大学 北京市` 姓名=１ | SERIAL_CELL 只用 \\d | \\p{Nd} | import 套件绿 |
| workspace 500 含路径 | message 透传 Node 错误 | 固定「服务器内部错误」 | security 500 断言不包含 dataDir |

## 仍未达印刷级 SOTA

- 无真浏览器 E2E；协作 flock 只保证单机。
- 饱和溢出仍堆在 `y = maxY`。浏览器 PNG 仍为 sRGB。
