# Round 13 结论简报

- **时间**: 2026-08-24
- **前置**: Round 12 BRIEF（202 files / 1740 tests）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **集成**: `tsc` app+node 0 error；全量 vitest **203 files / 1762 tests passed**

## 相对 Round 12

| 代理 | Round 12 | Round 13 |
| --- | --- | --- |
| R13-fable-arch | `matrixToText` 仍可能丢掉空格 | 空单元格以 tab 占位，不再左移 |
| R13-fable-sota | chips `role=list` 无 listitem | 每枚 chip `role=listitem` |
| R13-opus-layout | 穿卡 id 碰巧能定位 | 最长片段匹配；含冒号的分组键可定位 |
| R13-opus-data | 导入查重弱于健康面板 | 导入键 NFKC + 姓名规范化，与健康对齐 |
| R13-gpt-perf | 无健康检查 bench | 合成矩形/折线的 layout-health 形状报告 |
| R13-gpt-server | Host 校验已有 | 明确允许 loopback 带端口形式 |

## 仍未达印刷级 SOTA

- 无真浏览器 E2E；协作非多机；饱和压盖无法物理消除。
- `resolveStudentLocation` 仍可能忽略 `locationScope`（海外行目前靠调用方先判断）。
- 浏览器 PNG 仍为 sRGB。
