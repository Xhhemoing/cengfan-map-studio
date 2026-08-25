# Doc · CHANGELOG 昵称上限 16→20 与 Cycle 3 意图记录

MODEL: claude-fable-5-thinking-xhigh

## 改动内容（仅 `CHANGELOG.md`，共 3 处）

### 1. 指定项：0.1.0 昵称上限 16 → 20

0.1.0「协作本地昵称与角色文字标签」条目中「不超过 16 字符」改为「不超过 20 字符」。
事实依据：`src/lib/collaboration-identity.ts` L11 `MAX_DISPLAY_NAME_LENGTH = 20`，且按码点截断
（`Array.from(cleaned).slice(0, 20)`），「20 字符」表述与实现一致。全仓 `rg "16 字符"` 仅剩
`.agent_workspace/round2/fable-2-acceptance.md` 两处——那是历史轮次的规格存档（当时规格确为 ≤16，
实现落地成 20），存档不改。

### 2. Unreleased 新增「进行中（本周期收口，尚未合入）」小节

按 CYCLE3-BRIEF Doc 行「Unreleased 记下 F3/A3」+ 任务指令补 D3，共 3 条，全部用「将」的意图表述，
不声称已发布：

- F3：工程包导出文件名将包含项目名（「项目名-工程包-日期.json」，后缀保持 `.json`）。
- A3：帮助菜单将新增「更新日志」链接并显示版本号（只读常量，不进 URL）。
- D3：导入失败提示将升级为常驻 `role="alert"`，成功维持 `role="status"`，区域不随消息卸载。

**写作时点核对**：三项代码此刻均已落在本工作区（未提交）——F3 见 `usePosterExport.ts` 已改走
`buildExportFileName({ kind: "project" })`，A3 见 `feedback-links.ts` 的 `CHANGELOG_URL`/`APP_VERSION`，
D3 见 `DataWorkspace.tsx` 双常驻区域；各自报告在本目录。但因**均未 commit**，按任务要求选用
「进行中/尚未合入」措辞，宁可少说不越界。

> **给合并者**：整轮一起 commit 时，这 3 条应从「进行中」小节移入 Unreleased 的「新增 / 修复」
> （F3、A3 → 新增；D3 → 修复），小节标题与引导句一并删除。小节引导句里已写明此约定。

### 3. 顺带纠偏：0.1.0「提意见 / 帮助」条目的三处不实描述

原文声称帮助菜单「可跳转……本更新日志，并显示当前版本号」且链接携带「应用版本」。经
`git show HEAD:` 核对（该文件自 1f2ea3b 创建后无任何提交改动）：0.1.0 及所有已提交状态下，
菜单**没有**更新日志链接、**没有**版本号显示；`buildIssueUrl` 只携带 `env`（操作系统 + 浏览器）与
`where`（运行方式），**从不**携带应用版本——A3 报告（`opus-2-a3.md`）亦确认本轮未改此函数。三处修正：

- 删「与本更新日志，并显示当前版本号」（两者本轮 A3 才补上，避免与新加的「进行中」条目自相矛盾）；
- 「（操作系统 / 浏览器 / 应用版本）」→「（操作系统 / 浏览器 / 运行方式）」；
- 句末加「纠偏」括注说明原描述有误、正在后续周期补齐，指向上方「进行中」小节。

**为何越出指定项**：任务主题是 doc accuracy；若只加 A3「进行中」条目而不动 0.1.0 原句，同一文件会
出现「0.1.0 已有更新日志链接」与「本周期将新增更新日志链接」的自相矛盾。就地纠偏有仓库先例
（ac6b6fa 同样就地校正了 0.1.0 的导出文件名描述）。不认可可单独回退该行（见回滚）。

## 验证（failure → cause → fix → recheck）

本项为纯文档改动，无失败→修复循环。证据：

1. **事实核对**：上述每处修改均对照代码/git 历史逐条核实（`collaboration-identity.ts` L11、
   `git show HEAD:src/lib/feedback-links.ts`、`git show HEAD:src/components/HelpFeedbackMenu.tsx`、
   `git show ac6b6fa`、工作区在场的 F3/A3/D3 diff）。
2. **断言扫描**：`rg CHANGELOG` 于测试文件——唯一读取本文件内容的断言是 A3 新增的
   `feedback-links.test.ts` L137 `toContain("# 更新日志")`，标题行未动。
3. **复跑**：`npx vitest run src/lib/feedback-links.test.ts` → **Test Files 1 passed，Tests 23 passed**
   （含读取 CHANGELOG.md 的存在性守卫）。

## 交付与回滚

- **边界**：只改 `CHANGELOG.md`（ALLOWED 范围内），外加本报告。未触碰任何代码、测试、CSS；
  未 commit、未 push（遵指令）。无数据、导出格式、API 形状变更。
- **回滚**：还原 `CHANGELOG.md` 单文件即可；若仅不认可第 3 处纠偏，单独还原 0.1.0
  「应用内提意见 / 帮助入口」一行即可，与其余两处无耦合。
- **验收方式**：人工比对 CHANGELOG 与代码事实（上限 20、`buildExportFileName` 项目名命名、
  帮助菜单链接、`role="alert"`）；自动侧由 `npm test` 中 A3 的 CHANGELOG 存在性守卫覆盖。
