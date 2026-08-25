# Round 30 结论简报

- **时间**: 2026-08-25
- **前置**: Round 29 BRIEF（223 files / 1991 tests）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **集成**: `tsc` app+node 0 error；`npx eslint . --max-warnings 0`；全量 vitest **224 files / 2006 tests passed**（78.31s）

## 相对 Round 29

| 代理 | Round 29 | Round 30 |
| --- | --- | --- |
| R30-fable-arch | MapInspector 重置 | AI 预览行 AlertTriangle/Check/ShieldCheck hidden |
| R30-fable-sota | stage-slots 刷新/返回 | WorkflowGuide 导航 Icon hidden + svg 断言 |
| R30-opus-layout | 手摆卡 sideOf | 门面去掉冗余 orderResult；mergePinnedCards marginSeat 兜底 |
| R30-opus-data | HTML numsp/hairsp | HTML `&emsp13;`/`&emsp14;`/`&puncsp;` |
| R30-gpt-perf | 诚实跳过 | cache-key 位置数组序列化（key p50 −0.81%/−1.24%） |
| R30-gpt-server | `::ffff:` 大小写 | 回环 Host 接受 URL 规范化 `::ffff:7f00:1` |

## 验证链

| failure | cause | fix | recheck |
| --- | --- | --- | --- |
| 无集成失败 | — | 子代理路径隔离；perf 有测得的 cache-key 赢 | tsc 0；eslint --max-warnings 0；224 / 2006 |
| Host `[::FFFF:127.0.0.1]` 421 | WHATWG 把映射 IPv4 序列化成两个十六进制组 | 识别 `::ffff:` 后的 `7fxx:yyyy` 为 127/8 | security 套件 48 绿 |
| `苏&emsp13;禾` 姓名含实体 | 命名实体表无三分之一 em / 标点空格 | emsp13/emsp14/puncsp → `" "` | html-table 套件绿 |
| 门面双重 orderResult | packer 已自排序后 facade 再包 | 删 grid/packSides/repackAll 外层包裹；leastBad 保留 | leftover 套件：side === sideOf |

## 仍未达印刷级 SOTA

- 无真浏览器 E2E；协作 flock 只保证单机。
- 饱和溢出仍堆在 `y = maxY`。浏览器 PNG 仍为 sRGB。
- 工作台空状态 `ProjectGrid` / `ContinueEditingCard` 的 Lucide 仍只靠父 span hidden。
