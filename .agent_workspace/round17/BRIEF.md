# Round 17 结论简报

- **时间**: 2026-08-24
- **前置**: Round 16 BRIEF（208 files / 1808 tests）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **集成**: `tsc` app+node 0 error；全量 vitest **210 files / 1831 tests passed**（72.82s）

## 相对 Round 16

| 代理 | Round 16 | Round 17 |
| --- | --- | --- |
| R17-fable-arch | 缺槽回落 `side: "right"` | `slotPlacements` 用 `space.sideOf(seat)` |
| R17-fable-sota | 仅顶栏/经典皮撤销播报 | 全局设置页 + `HistoryControls` 礼貌 live region |
| R17-opus-layout | 按 y 升序但命中不含 gap | `stackAtMargin` 占用含 gap，与 `hits(..., gap)` 对齐 |
| R17-opus-data | workbook rawLine 留空列 | 无分隔符不再用 `-` 切姓名；`、` `|` `；` 走保列路径 |
| R17-gpt-perf | 诚实跳过 | opt-in `stackAtMargin` 间隙残差观测（无 CI 时限） |
| R17-gpt-server | `gzip;q=0` | `Accept-Encoding: *` 可 gzip；显式 q=0 仍拒绝 |

## 验证链

| failure | cause | fix | recheck |
| --- | --- | --- | --- |
| 新卡贴进 gap 带 | 命中用像素、推进加 gap | 判定与推进共用 gap | pack 12/12；card-layout* 全绿 |
| `玛丽-克莱尔 巴黎高师 巴黎` 错列 | unlabeled 把 `-` 当分隔符 | 只在空格包围的 hyphen 处切 | import-data 套件绿 |
| `gzip;q=0, *` 仍压缩 | 未处理通配 | 显式 gzip 拒绝则通配无效 | security.test 谈判表绿 |
| 无集成失败 | — | — | tsc 0；210×1831 |

## 仍未达印刷级 SOTA

- 无真浏览器 E2E；协作 flock 只保证单机。
- 饱和溢出仍堆在 `y = maxY`（有意不改 clamp 堆底）。
- CI 仍未跑 eslint。浏览器 PNG 仍为 sRGB。
- 粘连的 `名-校-市` 无空格行改为未识别，而不是猜切。
