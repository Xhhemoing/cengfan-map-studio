# Round 25 结论简报（验证中）

- **时间**: 2026-08-24
- **前置**: Round 24 BRIEF（218 files / 1933 tests）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **注意**: 不要回退 `e7783e1`（`forwarded` 头在 Node 类型里是 string、运行时重复头是数组）

## 相对 Round 24

| 代理 | Round 24 | Round 25 |
| --- | --- | --- |
| R25-fable-arch | PNG type=button | AssetLibraryPanel Chevron `aria-hidden` + 测试 |
| R25-fable-sota | 抽屉关闭图标 | 学生表行内 IconButton 图标 hidden + 测试 |
| R25-opus-layout | layoutGrid orderResult | `repackAll` 经 `orderResult` 退出；删 `inputIndexes` Map。pack.ts 393 行 |
| R25-opus-data | CELL_DELIMITERS `／` | HTML 标签已剥干净；`CELL_DELIMITERS`/`LIST_MARKER`/`FREEFORM_SEPARATOR` 加小写顿号 `﹑`（U+FE51）。import-data 仍 400 |
| R25-gpt-perf | 诚实跳过 | 诚实跳过 |
| R25-gpt-server | RFC 7239 Forwarded | XFF / X-Real-IP IPv4 `:port` 剥离（IPv6 冒号不动） |

## 验证链（待主调度填写）

| failure | cause | fix | recheck |
| --- | --- | --- | --- |
| （集成后填写） |  |  |  |

## 仍未达印刷级 SOTA

- 无真浏览器 E2E；协作 flock 只保证单机。
- 饱和溢出仍堆在 `y = maxY`。浏览器 PNG 仍为 sRGB。
