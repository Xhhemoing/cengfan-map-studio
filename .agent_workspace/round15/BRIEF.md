# Round 15 结论简报

- **时间**: 2026-08-24
- **前置**: Round 14 BRIEF（203 files / 1781 tests）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **集成**: `tsc` app+node 0 error；全量 vitest **206 files / 1796 tests passed**

## 相对 Round 14

| 代理 | Round 14 | Round 15 |
| --- | --- | --- |
| R15-fable-arch | `resolveLayoutIssueSelection` 支持 targets，hook 未传 | `use-studio-navigation` 传入 `issue.targets` |
| R15-fable-sota | 仅地图样式轨有撤销播报 | 全局顶栏撤销/重做礼貌 live region |
| R15-opus-layout | leftover `side: "right"` 泄漏 | containFree/stackAtMargin 返回前 `sideOf` |
| R15-opus-data | 仅精确 `"international"` 迁移 | overseas/abroad/海外 归一 |
| R15-gpt-perf | 钉扎+健康 bench 已有 | 无产品阈值变更（诚实跳过） |
| R15-gpt-server | 无 GitHub Actions | `.github/workflows/ci.yml`（tsc + vitest） |

## 仍未达印刷级 SOTA

- 无真浏览器 E2E；协作 flock 只保证单机。
- `stackAtMargin` 单趟扫描在饱和末路仍可能漏看已跳过的卡。
- 浏览器 PNG 仍为 sRGB。
