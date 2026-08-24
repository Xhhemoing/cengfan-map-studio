# Round 16 结论简报

- **时间**: 2026-08-24
- **前置**: Round 15 BRIEF（206 files / 1796 tests）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **集成**: `tsc` app+node 0 error；全量 vitest **208 files / 1808 tests passed**（73.43s）

## 相对 Round 15

| 代理 | Round 15 | Round 16 |
| --- | --- | --- |
| R16-fable-arch | containFree 外包冗余 sideOf | `repairPlacement` 直接返回 containFree；等价测试钉住三出口 |
| R16-fable-sota | 仅新皮顶栏撤销播报 | 经典皮 `LegacyEditorChrome` 礼貌 live region（窄屏组外） |
| R16-opus-layout | leftover sideOf；插入序漏扫 | `stackAtMargin` 按 y 升序扫列；像素重合归零（未 clamp 时） |
| R16-opus-data | 文本路径保留空列 | workbook `rawLine` 走 `rowToTabLine`，不再 `filter(Boolean)` 左移列 |
| R16-gpt-perf | 钉扎+健康 bench 已有 | 无产品阈值变更（诚实跳过；重合是正确性不变量） |
| R16-gpt-server | CI tsc+vitest | concurrency cancel-in-progress；`gzip;q=0` 不压缩 |

## 验证链

| failure | cause | fix | recheck |
| --- | --- | --- | --- |
| 饱和棋盘 51% 未 clamp 却压卡 | 插入序单趟漏看已跳过的下方卡 | 列内按 y 升序再扫 | pack 套件 10/10；全量 208×1808 |
| `rawLine` 期望 `浙江大学\t杭州市` | 测试固化了吞前导空列的旧行为 | 期望改为 `\t浙江大学\t杭州市` | binary-import + 相关导入 91 绿 |
| `gzip;q=0` 仍带 Content-Encoding | 只匹配 token 不解析 q | 正质量才接受 gzip | security.test 34 绿 |
| 无集成失败（tsc） | — | — | `tsc -p tsconfig.app.json` / `tsconfig.node.json` 0 error |

## 仍未达印刷级 SOTA

- 无真浏览器 E2E；协作 flock 只保证单机。
- 饱和溢出仍堆在 `y = maxY`；`stackAtMargin` 纵向命中不含 gap（可贴得比 gap 更近）。
- `layeredPack` 缺槽回落仍写死 `side: "right"`。
- 全局设置页 / 闲置 `HistoryControls` 撤销无 live region。
- CI 未跑 eslint。浏览器 PNG 仍为 sRGB。
