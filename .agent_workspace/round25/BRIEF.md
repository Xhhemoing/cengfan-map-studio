# Round 25 结论简报

- **时间**: 2026-08-24
- **前置**: Round 24 BRIEF（218 files / 1933 tests）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **集成**: `tsc` app+node 0 error；`npx eslint . --max-warnings 0`；全量 vitest **220 files / 1947 tests passed**（74.88s）

## 相对 Round 24

| 代理 | Round 24 | Round 25 |
| --- | --- | --- |
| R25-fable-arch | PNG type=button | AssetLibraryPanel Chevron `aria-hidden` + 测试 |
| R25-fable-sota | 抽屉关闭图标 | 学生表行内 IconButton 图标 hidden + 测试 |
| R25-opus-layout | layoutGrid orderResult | `repackAll` 经 `orderResult` 退出；删 `inputIndexes` Map。pack.ts 393 行 |
| R25-opus-data | CELL_DELIMITERS `／` | HTML 标签已剥干净；`CELL_DELIMITERS`/`LIST_MARKER`/`FREEFORM_SEPARATOR` 加小写顿号 `﹑`（U+FE51）。import-data 仍 400 |
| R25-gpt-perf | 诚实跳过 | 诚实跳过 |
| R25-gpt-server | RFC 7239 Forwarded | XFF / X-Real-IP IPv4 `:port` 剥离（IPv6 冒号不动） |

## 验证链

| failure | cause | fix | recheck |
| --- | --- | --- | --- |
| 无集成失败 | — | 子代理改动互不冲突 | tsc 0；eslint --max-warnings 0；220 / 1947 |
| `repackAll` 若直接返回 placed.items | 面积序重试先放下宽带，调用方顺序会变成 band, square-nw, square-se | `orderResult(cards, placed.items, space)` | pack 套件：id 序仍是 square-nw, square-se, band |
| `林舟﹑浙江大学﹑杭州市` 无法识别 | CELL_DELIMITERS 只有 `、` | 加入 `﹑`，3 格才当分隔，LIST_MARKER 同步 | import 套件绿 |
| ALB `203.0.113.9:54321` 当 IP | XFF/X-Real-IP 未剥 IPv4 端口 | 与 Forwarded 共用 `ipv4WithPort` | client-ip 单测绿 |

## 仍未达印刷级 SOTA

- 无真浏览器 E2E；协作 flock 只保证单机。
- 饱和溢出仍堆在 `y = maxY`。浏览器 PNG 仍为 sRGB。
