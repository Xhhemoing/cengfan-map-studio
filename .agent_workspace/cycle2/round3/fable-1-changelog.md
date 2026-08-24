# Cycle 2 / Round 3 — CHANGELOG 0.1.0 导出文件名条目纠偏

MODEL: claude-fable-5-thinking-xhigh

## 任务

核对 `CHANGELOG.md` `[0.1.0]`「导出文件名包含项目名」条目与实际代码
（`src/lib/usePosterExport.ts`、`src/lib/export-filename.ts`），修正不实描述。
仅允许改动 `CHANGELOG.md`；不提交、不推送。

## 证据链（failure → cause → fix → recheck）

### Failure（原文与代码不符，共 4 处）

原文（`CHANGELOG.md` [0.1.0] 新增第 4 条）：

> **导出文件名包含项目名**：PNG / SVG / 工程包按「项目名-去向图-日期（PNG 高倍率附 @2x 等后缀）」命名，未命名项目回退「蹭饭地图」；文件名不含房间号、邀请凭证或任何学生字段。

与代码对照的不实点：

1. **工程包不含项目名**：`usePosterExport.ts` 的 `exportProjectPackage`（第 119 行）
   硬编码 `` `cengfan-project-${pack.exportedAt.slice(0, 10)}.json` ``，
   未调用 `buildExportFileName`。`export-filename.ts` 里 `kind: "project"` 分支
   （`${baseName}-工程包-${date}.json`）存在但整个 `src/` 无调用方（已 grep 确认）。
2. **「项目名-去向图-日期」模式不存在**：SVG 实际为 `项目名.svg`
   （`usePosterExport.ts` 第 86 行 + `export-filename.ts` 第 42 行），
   PNG 实际为 `项目名-{倍率}x.png`（第 170 行 + 第 51 行）。
   PNG / SVG 文件名均无「去向图」段、无日期。
3. **后缀格式是 `-2x` 不是 `@2x`，且 1 倍导出也带 `-1x`**：
   `export-filename.ts` 第 51 行 `` `${baseName}-${scale}x.png` ``；
   `export-filename.test.ts` 第 45 行断言无效倍率回退 `甲-1x.png`。
4. **未命名回退是「我的毕业去向图」不是「蹭饭地图」**：
   `export-filename.ts` 第 12 行 `DEFAULT_EXPORT_BASE_NAME = "我的毕业去向图"`。

### Cause

0.1.0 条目按早期设想（统一「项目名-去向图-日期」+ 工程包同规则）撰写，
实际实现落地为：PNG/SVG 走 `buildExportFileName`（项目名 + 倍率后缀），
工程包保留旧的 `cengfan-project-<日期>.json`，CHANGELOG 未随实现回改。

### Fix

`CHANGELOG.md` [0.1.0] 该条改为：

> **PNG / SVG 导出文件名包含项目名**：SVG 按「项目名.svg」、PNG 按「项目名-倍率x.png」（如 2 倍导出为 `项目名-2x.png`）命名，未命名项目回退「我的毕业去向图」；工程包文件名保持 `cengfan-project-日期.json`，不含项目名。所有导出文件名均不含房间号、邀请凭证或任何学生字段。

保留了原文中仍然正确的隐私承诺（文件名不含房间号 / 邀请凭证 / 学生字段），
该承诺对三种导出（含工程包）均成立，故改为「所有导出文件名均不含」。

### Recheck

- `npx vitest run src/lib/export-filename.test.ts` → 16 passed (16)，
  确认 `项目名.svg`、`项目名-2x.png`、`甲-1x.png`、回退「我的毕业去向图」等格式断言与新文本一致。
- 重读修改后的 [0.1.0] 条目，逐句对照 `usePosterExport.ts` 第 86 / 119 / 170 行与
  `export-filename.ts` 第 12 / 42 / 51 行，无剩余不实表述。

## 改动范围

- 修改：`CHANGELOG.md`（[0.1.0] 新增第 4 条，1 行）。
- 新增：本报告文件。
- 未提交、未推送（按任务要求）。

## 遗留观察（未处理，超出本轮范围）

`buildExportFileName` 的 `kind: "project"` 分支（`项目名-工程包-日期.json`）是死代码。
若未来希望工程包文件名也带项目名，改 `usePosterExport.ts` 第 119 行调用该分支即可，
届时 CHANGELOG 应在对应版本如实记录。
