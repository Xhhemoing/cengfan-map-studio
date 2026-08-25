# Round 31 结论简报

- **时间**: 2026-08-25
- **前置**: Round 30 BRIEF（224 files / 2006 tests）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **集成**: `tsc` app+node 0 error；`npx eslint . --max-warnings 0`；全量 vitest **226 files / 2024 tests passed**（78.25s）

## 相对 Round 30

| 代理 | Round 30 | Round 31 |
| --- | --- | --- |
| R31-fable-arch | AI 预览行图标 | ProjectGrid 空状态 MapPinned hidden |
| R31-fable-sota | WorkflowGuide 导航 | ContinueEditingCard History hidden |
| R31-opus-layout | 门面去冗余 orderResult | 搜索路径 leftover side 锁；非法 repair 提前结束插入序 |
| R31-opus-data | HTML emsp13/emsp14/puncsp | CELL_DELIMITERS `︓` `︰` |
| R31-gpt-perf | cache-key 位置数组 | worker hook 去掉重复 LRU get/set |
| R31-gpt-server | 回环 Host `::ffff:7f00:1` | `clientIp` 将 `::ffff:H:L` 还原为点分 IPv4 |

## 验证链

| failure | cause | fix | recheck |
| --- | --- | --- | --- |
| 无集成失败 | — | 子代理路径隔离；perf 有测得的 cache 路径赢 | tsc 0；eslint --max-warnings 0；226 / 2024 |
| XFF `::ffff:cb00:7109` 原样返回 | 只剥前缀不解析两段十六进制 | `normalizeIpv4MappedAddress` 转点分 | client-ip 39 绿 |
| 直排 `林舟︰北京大学︰北京市` 无法识别 | CELL_DELIMITERS 无 U+FE30/U+FE13 | 加入 `︓` `︰`，2-cell 规则 | import-data 套件绿 |
| 搜索跑过后 leftover side 未锁 | R30 只覆盖 skipped-no-geography / grid | 新测 decision===ran 且 side===sideOf；非法 repair 提前返回 | card-layout + optimizer 绿 |

## 仍未达印刷级 SOTA

- 无真浏览器 E2E；协作 flock 只保证单机。
- 饱和溢出仍堆在 `y = maxY`。浏览器 PNG 仍为 sRGB。
