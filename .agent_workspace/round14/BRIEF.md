# Round 14 任务简报（进行中）

- **前置**: Round 13 已验证：tsc 绿、203 files / 1762 tests
- **分支**: `cursor/agent-sota-polish-cbcd`（禁止 commit/stash/新分支）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast

## 真实缺口

1. `resolveStudentLocation` 忽略 `locationScope`，海外行若带残留省份会被当成国内已解析（R13 opus-data 记下，调用方目前先判断才没炸）。
2. `LayoutHealthIssue` 仍靠 id 字符串定位，含冒号的键已缓解但没有结构化 `targets`。
3. 协作仍是单机 flock。
4. 无浏览器 E2E（不要加 Playwright）。
5. 交付/数据以外的 live region 可能还有漏。

## 路径隔离

| 代理 | 允许 |
| --- | --- |
| R14-fable-arch | `src/lib/studio-editor-helpers.ts`、`src/lib/layout-health.ts`、对应测试。给 issue 加可选 `targets` 并让 locate 优先用它。禁止改求解器。 |
| R14-fable-sota | `src/components/workspaces/ContentLayoutWorkspace.tsx`、`MapStyleWorkspace.tsx`、测试、`USER_GUIDE.md`。找一个真实 a11y 洞。禁止 Delivery/DataUpload。 |
| R14-opus-layout | `src/lib/card-layout*.ts` 除 cache。饱和时减少「合法但难看」的交叉（有测试、不改阈值）。禁止 bench 脚本。 |
| R14-opus-data | `src/lib/student-data.ts`、`src/lib/data-health.ts`、测试。让 `resolveStudentLocation` 尊重 `locationScope=overseas`。 |
| R14-gpt-perf | `scripts/perf-layout-bench.ts`、测试、`src/lib/layout-perf.ts`。opt-in，无 CI 时限。 |
| R14-gpt-server | `server/**`。协作 flock 文档化或单机下的真实洞（路径穿越残余）。index.ts ≤400。 |

禁止 Playwright、支付、CMYK、拆 china-universities。
