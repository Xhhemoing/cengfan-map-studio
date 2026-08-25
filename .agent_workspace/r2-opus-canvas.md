# Round 2 Agent C — 合并 `origin/cursor/canvas-render-display-46a1`

目标:把 canvas 渲染分支的 28 个独有提交并入 `cursor/merge-all-branches-e17a`,保留 HEAD 的模块
拆分,移植平移/布局性能改动(MapLayer memo、仿射布局键、冻结布局跳过、PosterCanvas memo)。

## 提交

| 提交 | 内容 |
| --- | --- |
| `76cc652` | 合并提交本身(六处冲突的解决) |
| `76bbe9c` | 拆分对方分支带来的两个超 400 行新文件 |
| `c68d4db` | 按合并后实际行数更新行数闸门清单 |

## 冲突解决

- **`.agent_workspace/PROGRESS.md`** — 保留 ours。
- **`src/App.tsx`** — 保留 HEAD 的 `createEditor*Actions` 拆分。对方分支的内联实现
  (`freezeCardPositionsForMapChange` / `refreshDisplayFramePositions` / `patchScene`)在 HEAD 上
  已经落到 `src/lib/editor-canvas-actions.ts`,直接丢弃。**只移植其中真正的性能钩子**:
  - `captureCardPositions` 的 `useCallback`;
  - 对方分支的 `canvasCallbacksRef`(latest-ref 稳定画布回调)。HEAD 把动作抽成了每次渲染
    新建的 `canvasActions` / `navigationActions` 对象,而 `PosterCanvas` 用
    `arePosterCanvasPropsEqual` 按 `Object.is` 逐 prop 比较,回调不稳定则 memo 恒失效。
    因此改写成 `src/lib/stable-callbacks.ts` 的 `useStableCallbacks`,一次性包住整个动作对象,
    等价覆盖对方分支逐个手写的 8 个 `handleCanvas*`。
- **`src/lib/card-layout-cache.ts`** — 两侧结合,而非二选一:
  - 保留 HEAD 的 `geometryHash`(FNV 风格增量哈希,替代整份 ring 的 `JSON.stringify`);
  - 套用对方分支的 `polygonOrigin` 仿射键 + 按数组身份记忆的 `WeakMap`。
  - 结果:平移时省份几何只序列化一次,每帧只追加 `originX,originY@` 前缀。
- **三个测试文件**(`PosterCanvas.reference-styles`、`useCardLayoutWorker`、`card-layout-cache`)
  — 两侧用例都保留。`reference-styles` 里对方的 `renderProject` 改为登记进 HEAD 的 `mounted`
  清理队列,断言抛出时不再漏挂载的 root。

## 顺带修的两处

1. 对方分支新增的 `useCardLayoutWorker.stale` / `.swr-boundary.round3` 两个测试早于 HEAD 的
   worker `generation` 字段,补上后类型通过。
2. 对方分支的 `DestinationCard.test.tsx`(455 行)与 `scripts/perf-canvas-bench.ts`(494 行)
   越过了在其切出后才落到主线的 400 行闸门。按仓库既有做法**拆分**而不是新增豁免条目:
   抽出 `destination-card-test-harness.tsx` / `perf-canvas-bench-harness.ts`。

## 验证(failure → cause → fix → recheck)

1. **`tsc -b --noEmit` 失败** —— 4 处 `TS2345: Property 'generation' is missing`。
   根因:对方分支的 worker 测试基于旧协议。修:补 `generation`。重跑:0 错误。
2. **`file-size-ratchet` 3 个用例失败** —— 6 个文件越限。根因:闸门在对方分支切出后才落到
   主线,合并把两个新的超限文件和三个增长文件带了进来;同时 `PosterCanvas.tsx` 因对方分支
   抽出图层从 1588 降到 948,闸门要求同一次提交里把记录降下来。修:拆两个新文件 + 更新清单。
   重跑:5 passed。
3. **全量** —— `npm test`:331 文件通过 / 2 跳过,2184 通过 / 2 跳过。
   `npm run lint`:0 错误 / 4 警告(1 个 HEAD 既有,3 个来自对方分支新文件 `ReferenceCardVisual.tsx`)。
   `npm run perf:canvas` 跑通:`posterCanvasMapPanRerender n=24 ≈ 3.7ms`、
   `posterCanvasFrozenMapPanRerender n=24 ≈ 3.7ms`,与对方分支「pan ~4.0ms @24」的结论一致。

## 行数闸门清单变动

| 文件 | 旧 | 新 | 原因 |
| --- | --- | --- | --- |
| `PosterCanvas.tsx` | 1588 | 948 | 对方分支抽出图层,闸门要求同步降低 |
| `MapLayer.tsx` | 475 | 606 | 平移期缓存投影与省份路径 |
| `styles.css` | 3798 | 3820 | 参考卡片样式 |
| `App.tsx` | 933 | 936 | `useCallback` + `useStableCallbacks` 导入 |
| `collaboration-client.ts` | 754 | 760 | **非本次合并引入**,来自并行合入的 `public-static-demo` |

画布两个大文件净减约 509 行。

**偏离记录:** Round 11 的「闸门更新必须随合并提交本身,不得事后 chore」纪律这次没做到 ——
合并提交 `76cc652` 落地后,另一个 agent 已在其上合入 `public-static-demo`(`f9560ab`),
按「不得 amend / force push」的约束只能追加 `c68d4db`。

## 回滚

- 全部回退:`git revert -m 1 76cc652` 并 `git revert 76bbe9c c68d4db`。
- 只回退回调稳定化(若发现事件在 commit 与 effect 之间取到上一帧闭包):
  把 `src/App.tsx` 里两处 `useStableCallbacks(...)` 去掉、删除 `src/lib/stable-callbacks.ts`,
  再把 `App.tsx` 的闸门条目改回 934。PosterCanvas 的 memo 会退化为恒失效,但行为不变。
- 数据/导出格式/API 形状:本次合并未改动,无迁移风险。
