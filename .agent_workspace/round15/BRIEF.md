# Round 15 任务简报（进行中）

- **前置**: Round 14 已验证：tsc 绿、203 files / 1781 tests
- **分支**: `cursor/agent-sota-polish-cbcd`（禁止 commit/stash/新分支）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast

## 真实缺口

1. `use-studio-navigation.ts` 调用 `resolveLayoutIssueSelection(project, issue.id)` **没传 `issue.targets`**（R14 只加了可选参数）。
2. App 顶栏全局撤销/重做没有 live region（R14 只修了地图样式轨）。
3. `containFree` / `stackAtMargin` 把未放置卡的 `side: "right"` 占位符带出（R14 记下）。不要把「重心落到别的象限」误判成 bug。
4. `project-migration-students.ts` 把非 `"international"` 的 scope（如手写 `"overseas"`）一律迁成中国去向。
5. 无 GitHub Actions workflow 目录时不要发明 CI；可补一个最小 vitest+tsc workflow **仅当仓库完全没有 CI**。先确认 `.github/`。
6. 禁止 Playwright、支付、CMYK、拆 china-universities。

## 路径隔离

| 代理 | 允许 |
| --- | --- |
| R15-fable-arch | `src/hooks/use-studio-navigation.ts`、对应测试、`src/lib/studio-editor-helpers.ts`（仅当接线需要）。把 `issue.targets` 传进 resolve。 |
| R15-fable-sota | `src/App.tsx`、`src/components/**` 里顶栏撤销按钮所在文件、`src/App.workflow.test.tsx`、相关测试。给全局撤销/重做加礼貌 live region。禁止 Delivery/DataUpload/MapStyle（MapStyle 已有）。 |
| R15-opus-layout | `src/lib/card-layout-pack.ts`、`src/lib/card-layout-modes.ts`、对应测试。`containFree`/`stackAtMargin` 返回前重算 `side`。禁止 cache。 |
| R15-opus-data | `src/lib/project-migration-students.ts`、`src/lib/project-migration.ts`、对应测试。识别 `overseas`/`abroad`/`海外` 为 international。 |
| R15-gpt-perf | `scripts/perf-layout-bench.ts`、测试、`src/lib/layout-perf.ts`。opt-in 形状，无 CI 时限。 |
| R15-gpt-server | `server/**` 或 `.github/workflows/**`。若完全没有 CI，加最小 `vitest run` + `tsc` workflow；若已有则找一个真实 server 洞。index.ts ≤400。 |
