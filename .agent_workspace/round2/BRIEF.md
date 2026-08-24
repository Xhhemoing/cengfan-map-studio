# Round 2 结论简报

- **时间**: 2026-08-24
- **前置**: Round 1 BRIEF；本轮 6 代理全量注入该简报
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **集成验证**: `tsc` app+node 0 error；**全量 vitest 173 files / 1429 tests passed**（62.6s）

## 相对 Round 1 的演进

| 维度 | Round 1 | Round 2 |
| --- | --- | --- |
| App.tsx | 1883 行 | **1136 行（再 −747）** stage slots + legacy chrome 组件化；skip-link 接到 `#studio-stage` |
| 布局 | 连接线搜索名义存在 | **修复空转**：省界轨道挤掉画布轨道导致 34/34 卡 0 候选；搜索以 pack 结果为种子且只接受更好解 |
| 饱和策略 | 叠卡压低 overlap 计数 | **隐藏卡片优先于 overlap 对数**：200/400 卡 hidden 83–250 → **0** |
| 拖拽钳制 | 无索引穷举，真地图 ~1068ms/帧 | 障碍索引 + AABB 记忆 + 近邻 branch-and-bound → **~4.9ms/帧** |
| 数据契约 | DataIssue.id 可选 | `listDataIssues` → `ResolvedDataIssue[]`；质量问题可聚焦对应行 |
| 导入 | 别名引擎 | 合并单元格、引号 CSV、模糊表头、漏行诚实报告 |
| Worker | 一律走 worker | **&lt;24 卡主线程**；24 卡 worker 冷启动 p95 ~24ms |
| API | 4xx+requestId | leave 撤 token；SSE 心跳+安全头；AI 校验；`Cache-Control: no-store` |

## 潜在边界风险

1. **grid 400 卡 p95**：R1 ~7ms → R2 ~98ms。连接线搜索修好后 grid 不再是廉价货架。质量换时间，需 Round 3 确认是否应对 grid 模式短路搜索。
2. **34 省矩形障碍 / 60 卡**：搜索跑满却打不赢 pack 种子（约 2.1× 变慢、质量不变）。应「先试一个插入序，无改进则停」。
3. **饱和 overlap 对数未降**（仍 83/276/…）——有意为之，避免叠卡。产品若更在意「最少压盖」需再议。
4. Inspector 选中后抢焦点：已用 pointer-down 守卫，但触摸笔/辅助设备组合需 Round 3 手测。
5. 协作 leave 撤 token 是契约收紧：旧客户端若 leave 后仍用原 token 写，会从「成功」变 403。
6. App.tsx 仍 1136 行，超 AGENTS.md 400 行纪律；协作 debounce 仍留在 App。

## 与 SOTA 验收的差距

- 未做浏览器 E2E（无可靠 GUI 会话），键盘路径仅单测。
- 布局在极端饱和仍有几何压盖（不可避免），缺「打印出血/CMYK」专业输出。
- 协作仍是进程内存。
- 无视觉回归快照。
- `MAX_OPTIMIZED_CARDS=80`：100+ 卡搜索从不赢过 pack，保持 80 是对的，但缺自适应「有候选才搜」。

## Round 3 攻坚

1. grid/无改进搜索短路，把「质量不变却变慢」的格子打掉。
2. App 再拆协作 hook；helpers 覆盖缺口。
3. 导入+质量面板深链的边角（过滤后行不在 DOM）。
4. 画布键盘多选/框选是否要做（可能超范围，先评估）。
5. 全量测试 + lint + 小规模 bench 对照 R2 baseline。
6. 文档：USER_GUIDE 补 skip-link 与 OCR 诚实性（若改用户可见行为）。
