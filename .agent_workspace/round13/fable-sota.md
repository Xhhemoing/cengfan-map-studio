# R13-fable-sota — 省份分布 chips 补齐 `role="listitem"`（R12 遗留）

MODEL_SLUG: claude-fable-5-thinking-xhigh

## 改动文件（均在允许清单内）

- `src/components/workspaces/DataUploadWorkspace.tsx`（301 行，≤400；仅 1 处属性改动）
- `src/components/workspaces/DataUploadWorkspace.test.tsx`（409 行，新增 1 个用例，14/14 通过；行数见下方说明）
- `USER_GUIDE.md` **未改**：本轮是纯 ARIA 角色补齐，读屏外无任何可见行为变化，
  且指南中没有描述省份分布网格语义的条目，无一句话可挂靠。
- 按指令未碰 DeliveryWorkspace。

## 洞与修复

- **洞**（R12 报告"留给后续轮的候选洞"原文钉住，R13 简报第 2 条）：
  `DataUploadRail` 的省份分布网格容器带 `role="list"`（aria-label="省份分布"），
  但子级 chip 是裸 `<span>`——ARIA 要求 `list` 拥有 `listitem` 子级，否则读屏
  报出一个空列表/条目数为 0，与可见的 N 个省份 chip 不一致。
- **修复**：每个 chip `<span>` 补 `role="listitem"`（`DataUploadWorkspace.tsx`
  L260，一处属性）。不改 DOM 结构、类名、key 与 `data-overridden`，逐像素一致。
- 同文件另一个 `role="list"`（地图映射问题列表，L273）的子级 `MappingIssueRow`
  **本就有** `role="listitem"`（L45），审计后无需改。

## 测试（新增 1 例）

"exposes every province distribution chip as a listitem of the 省份分布 list"：
用 `rosterWithTwo`（北京市 + 杭州市 → 两个省份）渲染，断言
`[role="list"][aria-label="省份分布"]` 的**全部**直接子级 role 恰为
`["listitem", "listitem"]`（同时钉住条目数）且均为
`.data-upload-workspace__province-chip`。

R12 的 指定省份 持久 polite live region 用例
（"announces an applied province override…"）**原样保留且通过**，本轮未触碰
`data-mapping-announcement` 相关代码。

## 验证（failure → cause → fix → recheck）

1. `npx vitest run src/components/workspaces/DataUploadWorkspace.test.tsx`
   → 14/14 通过（13 旧 + 1 新）。
2. **failure（验证方法本身的坑）**：首跑 `npx tsc --noEmit` 1.3s "通过"，
   快得可疑。**cause**：根 `tsconfig.json` 是 solution-style
   （`"files": []` + references），`--noEmit` 不带 `-b` 时什么都没检查，
   属假阳性通过。**fix**：改跑 `npx tsc -b`（真正遍历
   tsconfig.app/node 两个引用工程）。**recheck**：7.9s，0 错误。
3. `npx eslint` 本轮 2 个文件 → 0 问题。
4. `git diff` 复核：改动恰为组件 1 行 + 测试 11 行，无越界文件
   （工作区其余改动来自并行的 R13 其他代理）。

## 行数说明（400 行规约的已知张力）

测试文件 398 → 409 行，超出"文件超过 400 行拆分"规约 9 行。拆分需要新建
测试文件，与本轮"只许编辑组件、其测试、USER_GUIDE.md"的硬约束冲突，故新用例
已压至最紧（11 行）并在此记录，建议后续集成轮把 locate 场景族
（LocateHarness + 4 个定位用例）拆到独立测试文件。

## 验收方式与回滚

- 验收：数据与素材页右栏「地图映射 · 省份管理」，用读屏（VoiceOver/NVDA）
  进入省份分布区域——应报出"列表，N 项"且逐项可读"某省 X 人（· 已覆盖）"；
  修复前报空列表。视觉上与之前逐像素一致。
- 回滚：纯 ARIA 角色补充，无数据/导出格式/API 形状变更；revert 本轮
  2 个文件即可。

按指令未 commit / 未 push。
