# Round 9 结论简报

- **时间**: 2026-08-24
- **前置**: Round 8 BRIEF
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast（六路均交付工作树改动）
- **集成验证**: 见主调度后续记录（tsc + 全量 vitest）

## 相对 Round 8

| 代理 | 项 | Round 8 | Round 9 |
| --- | --- | --- | --- |
| R9-fable-arch | `src/App.test.tsx` | 1930 行 / 116 tests | **115 行** + 10 个聚焦文件 + `src/test-utils/app-harness.tsx`；测试实例 116 保持 |
| R9-fable-sota | 交付预览 | 标题为成品像素 | 出血>0 时标题「成品尺寸」+ 导出更大说明；`export-resolution` 定位按钮 `aria-disabled`、「见导出设置」 |
| R9-opus-layout | `packSides` | 按下标回查，~12% 盘出现幽灵卡 | `{ card, placement }` 配对；新增 `card-layout-modes.test.ts` |
| R9-opus-data | 导入/数据健康 | 引号换行撕记录；`sourceLine` 滤空后错位；零宽省份吞告警；残缺 HTML 表丢行 | RFC4180 行合并；物理行号；`trimImportCell` 口径；HTML 容错 |
| R9-gpt-perf | 布局 bench | 有 CI p95 时限 | 去掉时限；opt-in `cacheKeyGeneration`（400 卡序列化，观测性报告） |
| R9-gpt-server | JSON body | 任意 Content-Type 可进 `readJson` | 仅 `application/json` / `application/*+json`，否则 **415** |

## 纪律

- App 套件拆分未改产品源码；`it` 标题保持；`App.debug.test.tsx` 未并入 harness（既有 1 例）。
- 印刷：trim = 画布；出血向外扩；`export-resolution` 无画布定位对象。
- 布局：去掉无调用方的 `placeSide` 导出，避免按下标回查复发。
- 导入：未闭合引号在 32 行内不吞整段粘贴。
- 未引入 Playwright / CMYK / ICC。

## 回滚

- 测试拆分：还原 `src/App.test.tsx` 并删除 `src/App.{cards,collaboration,export,import,navigation,persistence,settings,shell,students,workflow}.test.tsx` 与 `src/test-utils/`。
- 其余为增量行为修正；JSON 415 对未设 JSON Content-Type 的客户端是破坏性 API（本仓库 fetch 均已带 `application/json`）。

## 仍未达印刷级 SOTA

- 无真浏览器 E2E、无 CMYK/ICC。
- 协作锁只保证单机。
- 饱和几何压盖无法物理消除。
- 求解器看不到手动拖动；卡片高度仍按约 180px 近似；connector-conflict 健康项可能不可达。
- 交付预览舞台仍按成品框渲染（出血只在导出与文案中体现）。
