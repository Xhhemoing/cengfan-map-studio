# Round 3 closeout — 项目变更与仍不完善项

**HEAD:** `60e63fc`（PR #44 merge-all + PR #45 verify overlay）  
**门禁（多代理实测一致）：** 2419 passed / 2 skipped；`tsc` 0；lint 0 error / 5 warning；`npm run build` 成功（主 chunk ~1.66 MB）；Pages HTTP 200。

调度：3 轮 × 6 云端子代理。子代理输出均声明所用 slug，无静默降级。

## 矛盾定谳（以源码为准）

| 议题 | 定谳 |
| --- | --- |
| `DataImportConsent` | 模块与测试 PRESENT；生产引用 0。`DataWorkspace.tsx:391` 与 `:471` 直接 `requestAiParse`。fable-product R1「已有同意流程」作废。 |
| `FAILURE_MARKERS` | `import-message.ts:7` 仍为 6 词 `失败/没有/请先/不能为空/校验问题/无法`。不含「过大/超时」。R2 fable-sota「已补齐」作废。 |
| Excel 表头 | 主路径 `binary-import.ts` `HEADER_ALIASES`；粘贴走 `import-data.ts`。两套词表不一致。「毕业去向」两处均无。 |
| `statusMessage` | 唯一渲染 `LegacyEditorInspector`。交付阶段 PNG/SVG **另有** `DeliveryWorkspace` 的 `exportState` 通道，并非全部导出静默。 |
| `ExportProjectDialog` | 仅 `App.tsx:817` legacy 分支。五阶段顶栏「导出工程」置 state、无弹层；还会把「工程包包含资源」勾选静默翻回 true。 |

## 已落地（用户可感知）

- 编辑器拆分 + 默认五阶段（名单→地图→版式→内容→交付）；旧三栏需手动开关。
- 导入：粘贴/OCR/Excel worker（25MB/30s）、表头识别、live region（部分失败词）、模板下载。
- 导出：PNG 代次三计数（`70f95b9`）+ 被顶掉的 PNG 失败仍 `reportStatus`（`ea38982`）；交付页成功/失败/重试诚实。
- 协作 JSON `undefined` 键语义（`8b73853`）；工程包文件名日期后缀互逆（`b599da1`）；默认水印回安全边距（`d6dd0a8`）。
- 画布性能与印刷厘米提示、A3/A2 预设、持久化失败分类（写路径）、AI 助手确认应用（保守模式）。

## 明确不要做

- 整支合并 `sota-campaign-6231`（112）或 `agent-sota-polish-cbcd`（62）。
- 批量导入静默把「北大」改写成「北京大学」。
- 为消 4 条遮挡告警去改默认海报构图；应改 `layout-health` 对 `back.kind === "map"` 豁免。

## 发布口径

班委今天可以：本地识别名单 → 调地图/排版 → **交付阶段**导出 PNG/SVG/工程包。

本周对真实班级名单 **NO-SHIP**，直到：

1. 「一键识别并导入」接上同意闸门（默认 AI 优先上送姓名）。
2. 五阶段顶栏「导出工程」要么弹出对话框，要么隐藏并指向交付页按钮。

其余为 P1/P2，不阻塞「先给班委试用交付导出」，但阻塞「宣传已可备份工程/已隐私合规」。

## 仍不完善（排序）

| ID | 级 | 用户症状 | 证据 |
| --- | --- | --- | --- |
| A | P0 | 「一键识别并导入」把名单原文发给模型，不问同意 | `DataWorkspace.tsx:471`；`DataImportConsent` 零生产引用 |
| B | P0 | 顶栏「导出工程」无弹层、无文件、无报错；可把资源勾选翻回 | `App.tsx:817` vs `ProjectMenu.tsx:299` |
| C | P1 | 跨阶段 `reportStatus` 默认 UI 不可见（素材/模板/工程包导入/被顶掉的 PNG 失败行） | `App.tsx:890` 仅 legacy |
| D | P1 | IndexedDB `list()` 读失败当空库，工作台可能播种示例 | `project-store.ts:713-714` + `ProjectWorkbench` 空列表播种 |
| E | P1 | 本机旧房间令牌压过新粘贴邀请码，升不了权 | `useCollaborationRoom.ts:621-622` |
| F | P1 | 新建/示例一进交付即 4 条「遮挡地图」 | `layout-health.ts` 无 map-back 豁免 |
| G | P1 | 房间 30 分钟 TTL 事前不说 | `DEFAULT_ROOM_TTL_MS`；UI 仅事后过期文案 |
| H | P2 | 「文件过大/解析超时」进 polite 绿区 | `FAILURE_MARKERS` 6 词 |
| I | P2 | `print-bleed` / `useStudioPreferences` 死模块 | 仅测试引用 |
| J | P2 | Excel 不认表头「毕业去向」 | `binary-import.ts` 395/400 |
| K | P2 | AI 不能写 `mapBoundaryMargin` | `agent-session.ts` 白名单 |
| L | P3 | 文档仍写「一键智能排版」；`App.debug.test` `expect(true)`；主包 1.66MB；5 条 eslint warning | 见 R3 SOL-DRIFT |

可摘取、勿整支合：`frontend-ux-polish-05ab`（12，含状态条+导出弹层）、`fix-round1-issues-2c89`（27，邀请码/遮挡/表头）、`fix-advanced-settings-editable-05ab`（3）。`file-size-ratchet` 使 `App.tsx`/`DataWorkspace.tsx` 接线必须先拆文件。
