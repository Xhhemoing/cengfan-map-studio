# Round 12 任务简报（进行中）

- **时间**: 2026-08-24
- **前置**: Round 11 已集成：tsc 绿、201 files / 1719 tests
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **分支**: `cursor/agent-sota-polish-cbcd`（禁止新建分支 / commit / stash）

## 本轮真实缺口

1. 连接线穿过其它卡片本体仍可能不报（R11 opus-layout 留下）。
2. `binary-import.ts` 正好 400 行，再改必先拆模块。
3. `matrixToText` / `splitParts` 的 `filter(Boolean)` 会让空单元格错列。
4. 本地 API 的 Host 头 / DNS rebinding 尚未核。
5. 交付以外工作区的焦点与 live region 可能仍不齐。
6. 钉扎坐标进入 cache-key 后的序列化成本只有 bench 形状测试。

## 路径隔离

| 代理 | 允许 |
| --- | --- |
| R12-fable-arch | `src/lib/binary-import.ts`、新建 `src/lib/html-table-parse.ts`（或同类短名）、对应测试。把栈式 HTML 表解析拆出，使 binary-import <400。禁止改 import-headers 语义。 |
| R12-fable-sota | `src/components/workspaces/*.tsx`（Delivery 以外优先：DataUpload / ContentLayout）、对应测试、`USER_GUIDE.md`。只做 a11y/焦点/live region。禁止改布局算法。 |
| R12-opus-layout | `src/lib/layout-health.ts`、`src/lib/connector-geometry.ts`、`src/lib/content-layout-objects.ts`、对应测试。报「引线穿过卡片」。禁止改 card-layout-cache / card-layout 求解器分数。 |
| R12-opus-data | `src/lib/import-data.ts`、`src/lib/import-headers.ts`、`src/lib/data-health.ts`、对应测试。修空单元格 `filter(Boolean)` 错列。禁止改 binary-import（arch 在拆）。 |
| R12-gpt-perf | `scripts/perf-layout-bench.ts`、其测试、`src/lib/layout-perf.ts`、`src/lib/card-layout-cache.ts`。opt-in 观察钉扎 key 成本。禁止 CI 时限。 |
| R12-gpt-server | `server/**`。Host 头校验或其它同级洞。index.ts ≤400。 |

禁止 Playwright、支付、CMYK/ICC、拆 china-universities。
