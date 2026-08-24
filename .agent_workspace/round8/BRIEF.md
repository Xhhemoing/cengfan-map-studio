# Round 8 结论简报

- **时间**: 2026-08-24
- **前置**: Round 7 BRIEF
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast（R8-fable-sota harness 失败，交付接线由主调度补完）
- **集成验证**: 见主调度 tsc / vitest 记录

## 相对 Round 7

| 项 | Round 7 | Round 8 |
| --- | --- | --- |
| studio-editor-helpers.ts | 401 | **215 门面** + transactions 118 + templates 87 |
| 印前体检 | 无 | `runPrintPreflight`：缺字体后果、位图有效 dpi、透明出血、导出倍率 |
| 资源健康 | 仅缺失 | 可选 `low-print-resolution`；交付「资源缺失」栏已过滤，避免与印前重复 |
| 交付页 | 像素尺寸按画布×倍率 | 出血时同时显示成品框与媒体框；「印刷检查」含 object-in-bleed + 印前项 |
| 协作快照 | flock | `load()` 跳过截断/损坏 JSON，好房间仍加载 |
| 性能台账 | 布局 bench | 出血 PNG 尺寸 + 48 资源印前 fixture（无 CI 时限） |

## 纪律

- 分辨率口径以印前体检为准（随 PNG 倍率浮动下限）；资源模块仍保留纯函数供复用。
- `object-in-bleed` 从排版问题拆到印刷检查；缺字体仍只在字体栏。
- 未引入 Playwright / CMYK / ICC。

## 回滚

还原 Round 8 文件即可。`printBleedMm` schema 仍属 Round 7；印前体检为纯增量，无导出格式破坏。

## 仍未达印刷级 SOTA

- 无真浏览器 E2E、无 CMYK/ICC。
- 协作锁只保证单机。
- 饱和几何压盖无法物理消除。
- 交付预览画布标题仍是成品框尺寸（导出像素在右侧设置区）。
