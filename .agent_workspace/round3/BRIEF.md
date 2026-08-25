# Round 3 结论简报

- **时间**: 2026-08-24
- **前置**: Round 2 BRIEF 全量注入 6 代理
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **集成验证**: `tsc` 0 error；全量 vitest **174 files / 1484 tests passed**，无 unhandled exception

## SOTA 收敛

| 项 | 结果 |
| --- | --- |
| App.tsx | 1136 → **798 行**：协作同步 / 场景动作 / 资源库 / 会话 / 快捷键 hooks |
| 布局搜索 | 无候选或连续 2 个插入序打不赢种子则退出；grid 有 `__layoutDebug` 证明不走优化器 |
| 400 卡 grid p95 | 97.9ms → **55.4ms（−43.5%）** |
| layeredPack 400 卡 | 39ms → 5.7ms（延迟物化分组） |
| 饱和 hidden | 随机 600 盘 2126 → **0**（gap:0 cascade 漏洞） |
| 质量问题定位 | 筛选隐藏行时 status +「清空筛选并显示」并 focus |
| 导入 | `单位所在城市` 不再被大学字段抢走；TSV 前导 tab 不再左移列 |
| a11y | 头像 URL 标签、IconButton 图标统一 aria-hidden、描边样式 Escape 关闭 |
| 文档 | USER_GUIDE / README：跳到舞台、不做图片 OCR |
| API | 静态 symlink 越界拒绝；405；非法 UTF-8 JSON 4xx |
| 测试卫生 | StudioAssistantRail 测试 unmount，消除 `window is not defined` 残留调度 |

## 交叉核验

- 全量测试绿（failure：全量 run 曾 unhandled window；cause：rail 测试只 remove 容器不 unmount；fix：flushSync unmount；recheck：174/1484 无 error）。
- 布局与数据代理报告的「共享树 tsc 红」为并行中间态；回收后 tsc 全绿。

## 仍非印刷级 SOTA 的诚实清单

- App.tsx 仍 >400 行（798）；协作仍进程内存。
- 饱和几何压盖无法物理消失，只能保证卡片不完全消失。
- 无 Playwright E2E、无视觉快照、无 CMYK/出血专业输出。
- ThemeToggle 文案模式被 App 测试钉死，本轮未改。
- 16 卡矩形障碍盘上 early-exit 放弃了一次「少 1 次穿卡、多 375px 线长」的改进（有意）。
