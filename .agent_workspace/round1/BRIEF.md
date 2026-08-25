# Round 1 结论简报

- **时间**: 2026-08-24
- **分支**: `cursor/agent-sota-polish-cbcd`
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **集成验证**: `tsc` app+node 通过；eslint 源码 0 error；vitest 40 files / **526 tests passed**

## 已实现功能

1. **架构（fable-arch）**: `src/App.tsx` 2466 → **1883 行（−583）**。抽出 `useWorkspacePersistence`、`useStudioChrome`、`studio-editor-helpers` 事务工厂；行为由 App 级 127 测锁定。
2. **A11y（fable-sota）**: 设置抽屉 Escape + 焦点陷阱 + 归还焦点；助手 rail 方向键 Tablist；SearchCombobox `aria-expanded` 与真实列表对齐；分隔条 Escape 取消拖拽；全局 `:focus-visible` 与 `prefers-reduced-motion`；浅色焦点色对比度达标。
3. **布局求解（opus-layout）**: `card-layout.ts` 1297 → **280 行门面**，拆 10 个模块。网格障碍索引、饱和降级阶梯、连接线惩罚不再丢卡。200 卡重叠对 16188 → **706**；含多边形 200 卡 7448ms → **922ms**。Worker 入参校验 + 主线程回退。
4. **导入数据（opus-data）**: DataWorkspace 705 → **289** + 5 子文件。文本/CSV/XLSX 共用表头别名引擎；OCR 文案诚实（只解析粘贴文本）；海外行不强制省份；重复键改为姓名+院校；`DataIssue.id` 稳定。
5. **性能探针（gpt-perf）**: 四模式 × 36–400 卡 p50/p95 基准；`layout-perf` 不变量；CI 小 bench p95&lt;500ms；拖拽 250 次指针合并为一次 transform。最坏 p95 **103ms / 400 卡 quadrant**。
6. **服务端（gpt-server）**: `server/index.ts` 1076 → **400**。JSON null/数组/缺字段一律 4xx+`requestId`；协作 409 重复加入、关闭房间拒绝写、viewer 不可提交、快照 413；AI 大包与非法 message 校验。

## 遗留缺陷

- App.tsx 仍 1883 行：`buildStageSlots` ~250 行 JSX + legacy 经典界面 ~530 行未抽。
- skip-link 工具类已进 CSS，**尚未接到 App 地标**。
- ThemeToggle 文案模式被非本轮 App 测试钉死，未改结构。
- `previewCommands` 疑似死状态（只被写成 `[]`）。
- DataIssue.id 仍是 optional（外部测试字面量），契约未完全收口。
- 协作房间仍是进程内存，重启即丢。
- 真饱和时求解器**宁可卡片压地图也不重叠卡片**（产品策略待确认）。
- 多边形命中仍非边级索引；`MAX_OPTIMIZED_CARDS = 80` 以上不做连接线感知搜索。

## 性能瓶颈

- 400 卡 quadrant p95 ≈ 103ms（可接受，但 200 卡 fallback 仍有数百对重叠）。
- 多边形 hit-test 仍是剩余热点。
- `mapStyleAssetPanelProps` 每渲染重建，未 memo。
- 协作快照近上限时仍有一次 serialize+clone。

## 下轮攻坚重点（Round 2）

1. 继续拆 App：stage slots 组件化、legacy 壳隔离、skip-link 接入、helpers 纯函数单测。
2. 布局质量：边级索引或更聪明的饱和策略；提高优化卡数上限或按密度自适应；产品确认「压地图 vs 重叠」。
3. 工作区 a11y：地图样式 / 内容排版 / 交付三阶段键盘与活区；画布选择与检查器。
4. 数据契约：`DataIssue.id` 必填迁移；导入模糊表头/合并单元格；定位 issue 的 UI 深链。
5. 性能：worker vs 主线程切换阈值实测；画布重绘计数；缓存键稳定性。
6. 服务端：leave 后 token 语义、SSE 心跳、AI 路由单测补洞、生产安全头回归。
