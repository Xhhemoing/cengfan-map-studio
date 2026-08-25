# Round 2 — Agent B (fable) — 遗留 NITS 分级裁定

**Model:** claude-fable-5-thinking-xhigh
**审计基线:** `cursor/verify-merged-code-e17a` @ `4b30a69`（含 export 修复 `70f95b9`，merge 基线 `388eafc`，合并前 main = `897a2a6`）。写报告期间分支因并行 Round 2 提交前移（`19ffd72`，export 测试装置修正）；本报告全部取证针对不可变提交（`897a2a6` / `388eafc` / `1d6d064` / 各分支 tip），结论不受影响。
**任务:** 把 Round 1 遗留 NITS 分为 **MUST-FIX-FOR-MERGE-CORRECTNESS / COSMETIC / OUT-OF-SCOPE**，重点裁定两问：
1. 未接线 consent 模块随树出货是否构成"虚假声明"风险；
2. `WorkflowStepper` 第六步「素材」是合并解决错误还是预存双路径。

**方法:** 纯只读取证（git 考古 + 符号级检索 + 用户面文档全扫），零代码改动。本轮无任何检查失败，故无 failure→cause→fix→recheck 链条需要记录。

---

## 总裁定

| # | NIT | 分级 | 一句话理由 |
|---|---|---|---|
| 1 | `DataImportConsent` / `print-bleed` / `use-studio-preferences` 未接线 | **OUT-OF-SCOPE**（接线属产品工作）；虚假声明风险今天为**零**，前瞻风险低（见 §A） | 全部用户面（README / CHANGELOG / USER_GUIDE / docs/宣发 / UI 文案）零处声称这三个能力已存在 |
| 2 | `WorkflowStepper` 第六步「素材」 | **OUT-OF-SCOPE**（预存，且对用户完全不可见）；清理属 COSMETIC | 非合并解决错误——三方（旧 main / 源分支 / 合并结果）字节级一致，且自诞生起就是视觉裁剪 + `aria-hidden` + `pointer-events:none` 的隐藏 DOM（见 §B） |
| 3 | `scripts/perf-canvas-bench.ts` 的 `Student` vs `PreparedBatchStudent` 类型错配 | **COSMETIC** | 文件确系合并才进入 main（旧 main 无此文件），但错误继承自源分支自身历史（R1 opus 已用 worktree 证伪"拆分提交制造"），运行时正确（`tsx` 不查类型，`npm run perf:canvas` 可跑），且 `scripts/` 不在任何 tsconfig program 内，不污染 `npm run typecheck` |
| 4 | 7 个零引用孤儿组件（`AssetLibraryPanel` 等）+ `WorkflowGuide` | **OUT-OF-SCOPE** | R1 已在合并**两个父提交**上分别检索证明孤立预存；本轮复核 `AssetLibraryPanel` 在 `897a2a6` 即无消费者。合并没有制造也没有义务清理 |
| 5 | 5 个 lint warnings（0 errors） | **COSMETIC** | 4 处预存风格（`ReferenceCardVisual` ×3、`DataWorkspace` exhaustive-deps）；`DataImportConsent.tsx:24` react-refresh 虽在合并新增文件里，但属同类 DX 告警，对未接线模块无实际影响，接线时拆 hook 即消 |
| 6 | `.agent_workspace/r1-opus-r12.md` fenced block 内的引用型冲突标记 | **COSMETIC** | 现有 CI 只有 `ci.yml` / `pages.yml`，均无 conflict-marker grep，今天不炸任何东西；若日后加此检查需排除 `.agent_workspace/` |
| 7 | `use-studio-preferences` 与 `App.tsx` 双实现潜伏冲突 | **OUT-OF-SCOPE**（今天是安全死代码） | 接线时的硬约束（两外壳必须同切，否则面板宽度双源互覆），模块自身 docstring 已写明；不接线就不触发 |
| 8 | （本轮新增浮出）`README.md:123` 隐私措辞 vs `importDirectly` AI-first 行为 | **OUT-OF-SCOPE**（预存，非合并引入），但建议列为**最高性价比后续跟进**（一行文档改动） | 见 §A.3 —— 这才是仓库里唯一真实存在的"声明与行为张力"，且与 consent 模块无关、先于合并存在 |

**MUST-FIX-FOR-MERGE-CORRECTNESS：本轮遗留 NITS 中为空。** 唯一达到该级别的缺陷（export 插队吞 PNG）已由 `70f95b9` 修复并合入本隔离分支，不在本轮清单内。

---

## §A. 问题一：未接线 consent 模块出货 = 虚假声明风险？

**结论：不构成。今天不存在任何一条用户可见的虚假声明；风险是前瞻性的且已有书面护栏。不升级为 MUST-FIX。**

### A.1 声明面全扫——零命中

对 `DataImportConsent` / `useAiUploadConsent` / `loadAiParseConsent` 及"同意 / 征得 / 出血 / 裁切 / 偏好"词汇族做全仓检索：

- **生产代码消费者：0**（引用方仅模块自身、其测试、`.agent_workspace/` 审计记录）。
- **README.md / CHANGELOG.md / USER_GUIDE.md：** 零处提及导入同意闸门、印刷出血、工作台偏好。合并新增的 53 行 CHANGELOG（`888eafc` 侧带入，逐行读过）只声明了模板交换、导出结果条、工程包文件名、帮助菜单四项"新增"——**全部已接线**（R1 fable-sota 已逐项验证 PRESENT）。README 合并改动里唯一的印刷相关句「A3 / A2 / 展板尺寸用厘米说话」指向的是 `print-size.ts`（已接线，`CanvasInspector` 尺寸预设），**不是**未接线的 `print-bleed.ts`——两者名近实异，验收时勿混。
- **docs/宣发 与 promo skill：** 检索「智能识别 / 大模型 / 同意」零命中；`cengfan-promo/SKILL.md` 不含从代码生成功能清单的流程，宣发侧无自动放大渠道。

### A.2 库内自述一致且诚实

摘取提交 `1d6d064` 的信息**明文声明**三者未接线（"先落地、后接入""接入是后续任务"），并给出回滚方案（revert 或直接删文件，无引用方）。`.agent_workspace/round-merge-all-r2.md` 亦预警"误认为已交付会漏验收"。审计链上没有人声称它已交付。

**唯一前瞻风险点：** `DataImportConsent.tsx:1-3` 的 docstring 用现在时描述自己（"送出前必须先拿到用户的明确同意"），未标注"未接线"。未来写 CHANGELOG/宣发的人若只读该文件，可能误报能力。护栏建议（本轮不执行，属文档一行改动）：接线前在 docstring 首行加「⚠ 尚未接线」；且下个 CHANGELOG 周期在列"新增"前对照接线证据，勿把 consent 列入。

### A.3 真正的声明张力在别处，且预存

`README.md:123`：「开启「智能识别名单」才会把文本发给已配置的大模型」。
事实：`DataWorkspace.tsx` 的 `importDirectly`（「一键识别并导入」按钮，L460-495）**AI 优先**——先 `requestAiParse` 送出粘贴原文（含学生姓名），失败才退本地解析。即"不点智能识别也会送模型"，README 该句不准确。

**为何不归罪合并：** 该 README 行由合并前最后一个 main 提交 `897a2a6` 自己加入；`importDirectly` 的 AI-first 逻辑在 `897a2a6:src/components/DataWorkspace.tsx:330` 逐字已在。合并对两者均零改动。**分级 OUT-OF-SCOPE**（非合并正确性问题），但它是 consent 接线成为"排第一的后续任务"（R1 fable-arch NIT-1）的真实动机；短期最小止血是改写 README 该句（例如「智能识别名单」与「一键识别并导入」都会把文本发给已配置的大模型）——一行、无代码、可独立交付。

---

## §B. 问题二：`WorkflowStepper` 第六步是合并解决错误吗？

**结论：不是。三重 git 证据判定为预存双路径；且比 Round 1 表述更弱——该步骤对用户根本不可见。分级 OUT-OF-SCOPE，清理属 COSMETIC。**

### B.1 三方字节级一致（排除合并解决错误的全部形态）

| 检查 | 命令 | 结果 |
|---|---|---|
| 文件起源 | `git log --follow -- src/components/WorkflowStepper.tsx` | 创建于 `08818db`/`9e691e2`（"add global data workbench"），此后**零改动** |
| 合并是否改它 | `git diff 897a2a6 388eafc -- WorkflowStepper.{tsx,test.tsx}` | **空 diff** |
| 源分支是否曾想改/删它（合并丢改动的形态） | `git diff 897a2a6...origin/cursor/optimize-studio-ux-7077 -- WorkflowStepper.*` | **空 diff**——源分支自己保留六步版原样 |
| 旧 main 是否已有「素材」步 | `git show 897a2a6:...WorkflowStepper.tsx` | L11 `{ id: "assets", label: "素材" }` 原样存在 |

即：合并既没改错该文件，也没丢掉源分支的意图——源分支的设计本来就是"新五阶段模型（素材并进内容，`workflow-stages.ts:19-22` 注释明言）+ 保留旧六步组件"。

### B.2 "仍显示第六步"是过度表述——它是隐藏 DOM

`LegacyEditorTopbar.tsx:74-78` 把 `WorkflowStepper` 包在 `<div className="topbar-workflow__legacy" aria-hidden="true">` 内；`styles.css:1272` 对该 class 施加经典视觉裁剪（`position:absolute; 1px×1px; clip:rect(0 0 0 0); pointer-events:none`）。三重隐藏：**视障用户读不到（aria-hidden）、明眼用户看不见（clip）、点不到（pointer-events:none）**。组件 docstring 自述"含隐藏的 legacy 步骤条"；`App.shell-layout.test.tsx:204-206` 用断言钉住"新五阶段 stepper 存在 + legacy 槽 aria-hidden"。该隐藏样式在 `897a2a6:styles.css:1267` 即逐字存在，与组件同源同代。

所以用户面**只有一条**导航路径（五阶段 `WorkflowStageStepper`），「素材」第六步从未对任何用户呈现过；README 合并改动甚至已把文案对齐五阶段模型（"素材库主入口在「内容」阶段"）。留着这块死 DOM 的动机是旧 App 内联分支的结构逐字兼容（docstring 明言）；何时移除是产品/清理决策，不是合并正确性问题。

---

## 交付纪律记录

- **验收方式：** 本轮为只读审计，交付物即本报告；结论可由报告内引用的 git/rg 命令逐条复现（HEAD `4b30a69`）。
- **代码改动 0、提交 0、push 0**（遵守任务约束"Do not push"；报告文件按 Round 1 惯例留待父代理统一收纳提交）。
- **回滚：** 无可回滚内容。若后续按 §A.3 改 README 一行，回滚即 revert 该行。
