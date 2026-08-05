# 画布渲染与交互性能设计

## 背景

当前 `PosterCanvas` 在一次 React render 中同时完成地图投影、可见学生派生、卡片文本排版、障碍区域构造和 `solveCardLayout`。卡片拖拽预览虽然已经合帧，但预览状态仍由 `PosterCanvas` 根组件持有，会重新协调整棵 SVG。布局器基准显示 36 张卡片约 66-82ms，100 张约 72-83ms，400 张约 245-291ms；默认预览又被限制为 20 FPS，高帧档为 30 FPS。

## 目标

- 拖拽预览只更新对应交互节点，不重新计算或重建静态 SVG 图层。
- 视觉属性、选择状态和拖拽预览不触发布局求解。
- 结构性布局变化使用精确请求键缓存，并在浏览器中交给 Web Worker 计算。
- 保持 `ProjectDocument` 为唯一业务状态；布局缓存、Worker 响应和拖拽预览均为可丢弃派生状态。
- 保持 SVG 为最终导出场景，保持现有 `/prototype`、撤销/重做、协作和导出行为。
- 预览档位改为高帧 60 FPS、标准 30 FPS、省电 10 FPS；固定档允许 5-60 FPS。

## 非目标

- 不将 SVG 编辑器整体替换为 Canvas/WebGL。
- 不修改项目文档 schema，不新增第二套持久化工程模型。
- 不在拖拽过程中写入历史、持久化或协作操作。

## 方案

### 1. 精确布局请求与缓存

从 `PosterCanvas` 的大 `destinationCards` 派生块中拆出 `preparedCards`、`CardLayoutInput[]`、`CardLayoutBounds` 和 `CardLayoutOptions`。缓存键只包含卡片 id、锚点、尺寸、布局边界、障碍几何和布局选项；不包含背景色、连接线颜色、字体颜色、选择状态或拖拽预览。使用有上限的模块级 LRU，避免重复请求无限增长。

### 2. Worker 边界

新增纯消息协议：主线程发送 `{ requestId, key, cards, bounds, options }`，Worker 调用 `solveCardLayout` 后返回 `{ requestId, key, result }`。Hook 丢弃过期响应；Worker 不可用或导出模式使用同步求解。布局键变化时保留上一份同 id 结果，Worker 完成后原子替换，避免输入时主线程长任务。

### 3. 交互隔离

将卡片和嘉宾拖拽预览移动到独立组件。`pointermove` 只记录 ref 并由 `requestAnimationFrame` 更新 overlay transform；`pointerup` 通过现有事务回调提交一次最终位置。静态地图、卡片内容、文字、素材图层使用 `memo` 和稳定派生 props，预览更新不能让它们重渲染。

### 4. 帧率设置

默认和高帧模式采用 rAF 作为调度上限；标准、省电和固定模式保留定时节流。归一化范围改为固定档 5-60 FPS，现有低帧持久化值继续兼容。

## 验收指标

- 100 张卡片拖拽时，浏览器 `pointer-to-transform` p95 不超过 24ms。
- 拖拽 2 秒期间没有超过 50ms 的主线程长任务。
- 视觉属性或选择变化不会增加布局求解计数。
- Worker 过期响应不能覆盖最新布局结果。
- 画布 focused 测试、类型检查、构建和 `scripts/perf-layout-bench.ts` 均通过；现有 SVG/PNG 导出快照和交互语义保持不变。
