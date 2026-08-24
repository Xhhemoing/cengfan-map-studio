# Round 10 任务简报（进行中）

- **时间**: 2026-08-24
- **前置**: Round 9 已集成：tsc 绿、199 files / 1658 tests
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **分支**: `cursor/agent-sota-polish-cbcd`（禁止新建分支 / commit / stash）

## 仍未达印刷级 SOTA（本轮可推进的真实缺口）

1. 健康检查把每张卡高度写成 **180**，且 `checkLayoutHealth` 同 z 重叠直接 `continue` → 手工叠卡不报。
2. `listContentLayoutIssues` **不传 connectors** → `connector-conflict` 产品路径不可达。
3. 交付预览舞台仍按成品框渲染，出血只在文案里。
4. 重复表头时主列为空不回落到同名副列。
5. `GlobalDataScreen` 的 `issueFilter` 会把质量面板骗成「数据状态良好」。
6. CORS `Allow-Headers` 未包含 `X-Request-Id`，浏览器带该头会预检失败。

## 路径隔离（严禁跨组改文件）

| 代理 | 允许 |
| --- | --- |
| R10-fable-arch | `src/lib/studio-editor-helpers.ts`、新建 `src/lib/content-layout-objects.ts`、对应测试、`src/App.debug.test.tsx`、`src/test-utils/**` |
| R10-fable-sota | `src/components/workspaces/DeliveryWorkspace.tsx`、其测试、`USER_GUIDE.md` |
| R10-opus-layout | `src/lib/layout-health.ts`、其测试、`src/lib/card-layout*.ts`、`src/lib/card-layout-manual.ts`、对应测试。禁止 bench 脚本 |
| R10-opus-data | `src/lib/import-headers.ts`、`src/lib/import-data.ts`、`src/lib/data-health.ts`、`src/lib/student-data.ts`、`src/lib/binary-import.ts`、`src/components/GlobalDataScreen.tsx`、`src/components/DataQualityPanel.tsx`、对应测试 |
| R10-gpt-perf | `scripts/perf-layout-bench.ts`、其测试、`src/lib/layout-perf.ts`、`src/lib/card-layout-cache.ts`、`src/components/canvas/useCardLayoutWorker.ts`（仅阈值/探测） |
| R10-gpt-server | `server/**` |

静态目录 `china-universities` / `university-emblems` / `china-locations` 禁止拆。禁止 Playwright、支付、CMYK/ICC。
