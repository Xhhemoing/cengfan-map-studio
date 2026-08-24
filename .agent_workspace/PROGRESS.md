# 蹭饭地图工作室 — SOTA 多轮打磨进度

- **专属分支**: `cursor/agent-sota-polish-cbcd`（云环境要求 `cursor/<name>-cbcd` 前缀/后缀）
- **目标**: 将编辑器、布局求解、数据导入、服务端、测试与可访问性打磨到 SOTA
- **调度**: Parent Orchestrator；每轮 6 并发子代理（2×fable / 2×opus-fast / 2×gpt-sol）
- **循环**: Round 1 → Round 2 → Round 3，不允许空转；每轮必须落地代码 + 测试 + 进度文档

## 循环状态

| 轮次 | 状态 | 开始 | 结束 | 说明 |
| --- | --- | --- | --- | --- |
| Round 1 | complete | 2026-08-24 | 2026-08-24 | 拆 God 组件 / 布局求解 / 导入诚实 / API 4xx / a11y / 性能基线 |
| Round 2 | complete | 2026-08-24 | 2026-08-24 | App 再拆 −747 行；连接线搜索复活；hidden 卡清零；leave 撤 token |
| Round 3 | in_progress | 2026-08-24 | — | SOTA 打磨与最终验收 |

## Round 1 结论摘要

详见 [round1/BRIEF.md](round1/BRIEF.md)。集成验证：**tsc 绿、eslint 源码绿、526 tests / 40 files 通过**。

关键行数：App.tsx 2466→1883；card-layout 门面 1297→280；DataWorkspace 705→289；server/index 1076→400。

## Round 2 文件所有权

| 代理 | 模型 slug | 主攻 | 允许改动的路径 |
| --- | --- | --- | --- |
| R2-fable-arch | claude-fable-5-thinking-xhigh | 继续拆 App / skip-link | `src/App.tsx`, `src/hooks/**`, `src/lib/studio-*.ts`, `src/components/studio-editor/**`（新建）, `src/App.test.tsx`（仅因抽取而改 import） |
| R2-fable-ux | claude-fable-5-thinking-xhigh | 三阶段工作区 a11y | `src/components/workspaces/**`, `src/components/inspector/**`, `src/components/canvas/PosterCanvas.tsx`（仅 a11y 属性，禁止改布局算法调用）, 对应测试 |
| R2-opus-layout | claude-opus-5-thinking-high-fast | 布局质量第二刀 | `src/lib/card-layout*.ts`, `src/workers/**`, `src/lib/layout-health.ts`, `src/lib/destination-layout.ts`, 对应测试。禁止改 bench 脚本。 |
| R2-opus-data | claude-opus-5-thinking-high-fast | 数据契约与深链 | `src/lib/import-data.ts`, `src/lib/data-health.ts`, `src/lib/student-data.ts`, `src/components/DataQualityPanel.tsx`, `src/components/data-workspace-*.tsx`, `src/components/DataWorkspace.tsx`, 对应测试 |
| R2-gpt-perf | gpt-5.6-sol-xhigh-fast | worker 阈值与重绘 | `scripts/perf-layout-bench.ts`, `src/lib/layout-perf.ts`, `src/lib/card-layout-cache.ts`, `src/components/canvas/PosterCanvas.performance.test.tsx`, `src/components/canvas/useCardLayoutWorker.ts`（仅阈值/探测） |
| R2-gpt-server | gpt-5.6-sol-xhigh-fast | API 边角与 SSE | `server/**` |

## 验证纪律记录

### Round 1

| failure | cause | fix | recheck |
| --- | --- | --- | --- |
| 无集成失败 | — | 子代理内部已各自闭环（抽屉初始焦点、空表 toMatchObject、leave 期望、自伤 8x 性能回退） | 主调度 `tsc` + 526 vitest 全绿 |
| `package-lock.json` 被 npm 改写 libc 字段 | 某代理误跑 install 改锁 | `git checkout -- package-lock.json` | lockfile 与 HEAD 一致 |

## Round 2 结论简报

详见 [round2/BRIEF.md](round2/BRIEF.md)。集成：**tsc 绿、全量 173×1429 tests 绿**。

## 验证纪律记录（续）

### Round 2

| failure | cause | fix | recheck |
| --- | --- | --- | --- |
| 全量 1429 通过，无集成失败 | 子代理曾报告 PosterCanvas.performance 超时 | opus-layout 修复 clampCardPosition 穷举（1068ms→4.9ms） | 全量 vitest 173 files passed |
| tsc 曾报 card-layout-space 进行中错误 | 并行编辑中间态 | 回收后 tsc app+node 0 error | 主调度复跑 tsc |
