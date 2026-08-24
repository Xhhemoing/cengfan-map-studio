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
| Round 3 | complete | 2026-08-24 | 2026-08-24 | 协作 hook 化；搜索短路；筛选深链；grid p95 −43%；API 405/路径 |
| Round 4 | complete | 2026-08-24 | 2026-08-24 | App 331 行；布局模块全 ≤400；ThemeToggle a11y；HTML 粘贴表 |
| Round 5 | complete | 2026-08-24 | 2026-08-24 | PosterCanvas 563；scene/migration 拆分；可选房间快照；jsdom 旅程 |
| Round 6 | complete | 2026-08-24 | 2026-08-24 | 核心实现文件压到 ≤400；AgentAssistant a11y；协作 hook/store 再拆 |
| Round 7 | complete | 2026-08-24 | 2026-08-24 | agent-session 拆分；印刷出血导出；出血健康警告；快照 flock |
| Round 8 | complete | 2026-08-24 | 2026-08-24 | 印前体检；交付页出血尺寸；helpers 再拆；损坏快照跳过 |
| Round 9 | complete | 2026-08-24 | 2026-08-24 | App 测试拆分；幽灵卡修复；导入行号/引号；JSON 415；交付 a11y |
| Round 10 | complete | 2026-08-24 | 2026-08-24 | 健康检查真高度/同层重叠；交付出血预览；导入副列回落；CORS X-Request-Id |
| Round 11 | complete | 2026-08-24 | 2026-08-24 | Agent 健康与手摆钉扎；省份连接锚点；嵌套表；join 限流 |
| Round 12 | complete | 2026-08-24 | 2026-08-24 | HTML 表解析拆分；引线穿卡；空单元格对齐；Host 校验 |
| Round 13 | integrating | 2026-08-24 | — | matrixToText 空列；chips listitem；定位穿卡；导入重复折叠 |

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

## Round 3 结论简报

详见 [round3/BRIEF.md](round3/BRIEF.md)。集成：**tsc 绿、174×1484 tests 绿、无 unhandled error**。

## Round 4 结论简报

详见 [round4/BRIEF.md](round4/BRIEF.md)。集成：**tsc 绿、177×1542 tests 绿**。App.tsx **331 行**。

## Round 5 结论简报

详见 [round5/BRIEF.md](round5/BRIEF.md)。集成：**tsc 绿、179×1563 tests 绿**。

## Round 6 结论简报

详见 [round6/BRIEF.md](round6/BRIEF.md)。集成：**tsc 绿、181×1572 tests 绿**。核心 UI/布局/协作实现文件均 ≤400，仅 `agent-session.ts` 与静态数据目录仍超限。

## Round 7 结论简报

详见 [round7/BRIEF.md](round7/BRIEF.md)。集成：**tsc 绿、185×1607 tests 绿**。`agent-session` 已拆；印刷出血导出 + 检查器；同机快照锁。

## Round 8 结论简报

详见 [round8/BRIEF.md](round8/BRIEF.md)。集成：**tsc 绿、187×1635 tests 绿**。印前体检接入交付「印刷检查」；出血时同时显示成品框与媒体框像素；`studio-editor-helpers` 拆到 ≤400；损坏协作快照跳过。分辨率告警只出现在印前体检，不与资源缺失重复。

## Round 9 结论简报

详见 [round9/BRIEF.md](round9/BRIEF.md)。集成：**tsc 绿、199×1658 tests 绿**。App 套件拆分（116 例保持 + 1 debug）；`packSides` 幽灵卡；导入引号换行/物理行号/零宽/残缺 HTML；JSON 415；交付出血成品标题与「见导出设置」。

## Round 10 结论简报

详见 [round10/BRIEF.md](round10/BRIEF.md)。集成：**tsc 绿、200×1699 tests 绿**。健康输入用真实卡高与连接线；同层 card 重叠可报；手摆卡成为求解障碍；交付预览画出出血；导入副列回落与筛选诚实；CORS `X-Request-Id`。

## Round 11 结论简报

详见 [round11/BRIEF.md](round11/BRIEF.md)。集成：**tsc 绿、201×1719 tests 绿**。Agent 健康与交付口径对齐并钉住手摆卡；连接线用分省锚点；嵌套 HTML 表栈式解析；公开 join 限流。

## Round 12 结论简报

详见 [round12/BRIEF.md](round12/BRIEF.md)。集成：**tsc 绿、202×1740 tests 绿**。HTML 表解析拆模块；引线穿卡告警；空单元格列对齐；指定省份读屏宣告；loopback Host 校验。

## 全局成果（十二轮合计）

| 指标 | main 基线 | Round 12 结束 |
| --- | ---: | ---: |
| App.tsx 行数 | 2466 | **333** |
| card-layout 门面 | 1297 | 模块化 + 手摆障碍 |
| DataWorkspace | 705 | 组合器 + 子面板 |
| server/index | 1076 | **398** |
| 测试 | （基线已有大量单测） | **1740 passed / 202 files** |

## 回滚

整分支相对 `main` revert 即可；无项目文件 schema 破坏。协作 leave 后旧 token 变 403。

### Round 3

| failure | cause | fix | recheck |
| --- | --- | --- | --- |
| 全量 1484 通过但 unhandled `window is not defined` | StudioAssistantRail 测试 remove 容器却不 unmount root，跨文件调度残留 | afterEach `flushSync(unmount)` | 174 files / 1484 passed，无 Errors |
| 子代理报告并行中 tsc 红 | 共享工作树中间态 | 回收后主调度 tsc app+node 0 error | tsc 复跑 |

### Round 2

| failure | cause | fix | recheck |
| --- | --- | --- | --- |
| 全量 1429 通过，无集成失败 | 子代理曾报告 PosterCanvas.performance 超时 | opus-layout 修复 clampCardPosition 穷举（1068ms→4.9ms） | 全量 vitest 173 files passed |
| tsc 曾报 card-layout-space 进行中错误 | 并行编辑中间态 | 回收后 tsc app+node 0 error | 主调度复跑 tsc |
