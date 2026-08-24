# Round 13 任务简报（进行中）

- **时间**: 2026-08-24
- **前置**: Round 12 已集成：tsc 绿、202 files / 1740 tests
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **分支**: `cursor/agent-sota-polish-cbcd`（禁止新建分支 / commit / stash）

## 本轮真实缺口

1. `binary-import` 的 `matrixToText` 仍可能 `filter(Boolean)` 丢掉空单元格（R12 opus-data 记下，当时 arch 在拆文件）。
2. 省份分布 chips：`role="list"` 无 `listitem` 子节点。
3. 引线穿卡已报，但点击定位是否跳到对应卡未核。
4. Host 校验后，合法 `localhost:port` / `[::1]` 是否被误伤未再扩测。
5. 协作仍非多机；不要假装 flock 是分布式锁。
6. 无 Playwright；不要加，除非本机已有浏览器且用户要求（没有）。

## 路径隔离

| 代理 | 允许 |
| --- | --- |
| R13-fable-arch | `src/lib/binary-import.ts`、对应测试。只修 `matrixToText` 空单元格，复用 import-data 的列对齐语义。禁止再拆 html-table-parse。 |
| R13-fable-sota | `src/components/workspaces/DataUploadWorkspace.tsx`、其测试、`USER_GUIDE.md`。chips `list`/`listitem`。禁止改 DeliveryWorkspace。 |
| R13-opus-layout | `src/lib/layout-health.ts`、`src/lib/studio-editor-helpers.ts`、`src/hooks/use-project-health.ts`、对应测试。让 `connector-crosses-card` 能 `onLocate` 到卡片。禁止改求解器。 |
| R13-opus-data | `src/lib/data-health.ts`、`src/lib/student-data.ts`、对应测试。找剩余静默错数据。禁止改 import-data（除非测试需要）。 |
| R13-gpt-perf | `scripts/perf-layout-bench.ts`、其测试、`src/lib/layout-perf.ts`。opt-in 测 `checkLayoutHealth` 含穿卡检查的成本形状。禁止 CI 时限。 |
| R13-gpt-server | `server/**`。补 Host 校验对 `localhost`/`127.0.0.1`/`[::1]` 带端口的回归；index.ts ≤400。 |

禁止 Playwright、支付、CMYK/ICC、拆 china-universities。
