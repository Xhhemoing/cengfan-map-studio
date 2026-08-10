# 项目全方面优化设计

> 日期:2026-08-08 | 状态:已批准(用户)

## 背景

用户要求"全部方面"优化项目。体检发现最紧急问题不是性能,而是 **`npm run build` 已失败**(tsc 4 处错误)。工作区有 69 个未提交文件,经确认属于进行中的 `unified-editor-shell-mui` 改造计划(计划文档明确要求不提交、不动无关文件),因此本次优化**不触碰改造相关文件、不创建 commit**。

## 基线(体检证据)

| 项 | 现状 |
|---|---|
| build | ❌ tsc 4 错误:__mui_probe.test.tsx(rootSelector)、StudioUi.tsx(Button color)、university-emblems.test.ts(node:fs 类型) |
| lint | ❌ 1 错误:FixedFrameEditor.tsx effect 内同步 setState |
| test | ❌ 2 失败:__mui_probe.test.tsx(断言正则多空格)、search-catalog.test.ts(全量跑失败/单跑通过,24s 慢测试) |
| bundle | 主 JS 1.6MB 未压缩;xlsx 已分 chunk 493KB;MUI 已装未重建 |
| perf | 布局 worker 已启用,400 卡 257ms(有基准脚本) |
| 结构 | App.tsx 2960 行(规范 400)、PosterCanvas 1443、card-layout.ts 1293 |

## 方案(已批准:方案 A — 先止血后优化)

### 阶段 0 — 止血,恢复安全网(最高优先)
1. 修 4 处 tsc 构建错误(最小改动)
2. 修 lint 错误
3. 修 2 个失败测试(search-catalog 先查根因,禁止盲目重试)
4. 验收:`npm run build` + `npm run lint` + `npm test` 全绿

### 阶段 1 — 工作区策略决策
未完成 MUI 改造:冻结(默认)或顺带收尾。影响阶段 3 的 App.tsx 拆分范围。

### 阶段 2 — Bundle 优化
manualChunks 分包(react/mui/lucide/d3 分离)、确认 xlsx 懒加载、排查意外入包库。

### 阶段 3 — 结构优化
App.tsx 2960 行按 400 行规范拆分(与阶段 1 决策协调)。

### 阶段 4 — 性能
以现有基准为锚,评估布局求解与渲染可优化点。

## 约束
- 不触碰 `unified-editor-shell-mui` 改造相关文件(StudioUi.tsx 类型修复除外——它自身是构建错误源)
- 不创建 commit(计划禁止)
- 每个阶段结束跑对应检查,报告证据
