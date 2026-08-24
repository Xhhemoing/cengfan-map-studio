MODEL: claude-fable-5-thinking-xhigh

# Cycle 2 · Round 2 审计报告（fable-1）

审计对象：提交 `793d80b`（Cycle 2 Round 1 六路落地）+ 当前工作树。所有结论均以源码为准逐条复核，未盲信简报。未提交、未推送、未碰支付。

## 1. regional 模板 — 判定：按设计排除，**不要**加进任何选择器

- `src/lib/project-data.ts:20-21`：类型注释明确写着 “`regional` remains readable for historical projects but is not shown as a new built-in preset.” 类型联合保留 `regional` 只为读取历史项目。
- 三处用户可见的内置模板列表（`src/App.tsx:1634`、`:1843`、`:2106`）全部使用硬编码五元组 `["original","cartoon","grain","q","scenery"]`，一致地排除 `regional`。
- `MAP_TEMPLATE_IDS`（`src/lib/template-store.ts:29`）与 `TEMPLATE_IDS`（`src/lib/project-migration.ts:29`）保留 6 个 id 是**校验/迁移读取路径**，必须继续含 `regional`，否则历史项目和旧模板文件会被拒收——这不是“选择器漏了一个”。
- `createSystemTemplate("regional")` 仍可构造（名称已标注「地域特色（旧版）」，`template-document.ts:165-174`），供历史项目回退取默认值。
- **裁决**：Round 1 简报「Round 2 攻坚」第 1 条（模板 id 列表是否漏 regional）到此关闭：不漏，属有意设计。任何后续轮次不得把 `regional` 加入 TemplatePicker / ContentLayoutRail / 全局设置的模板网格。

## 2. 六项落地核验（逐条到 file:line）

| ID | 判定 | 源码证据 |
|----|------|----------|
| D2 | ✅ 已落地 | `src/components/DataWorkspace.tsx:577-580` 常驻 `<div role="status" aria-live="polite" aria-atomic="true" class="panel-note data-message">`，替换摘要与消息为内部 `span.data-message__line`；`src/styles.css:461-464` `:empty` 视觉隐藏但留在 a11y 树（`position:absolute` + `clip-path`，非 `display:none`），空态不占栅格间距 |
| F2 | ✅ 已落地 | `src/lib/usePosterExport.ts:38,70`（状态）、`:81/:108/:159`（导出开始清空）、`:88/:122/:172`（成功写入真实落盘名）；工程包显式传名 `cengfan-project-${exportedAt.slice(0,10)}.json`（`:119-120`）与 `downloadProjectPackage` 默认值（`src/lib/project-package.ts:219`）逐字相同，展示名=落盘名成立；`DeliveryWorkspace.tsx:31,96,113` 成功条 + 「再次导出」；`App.tsx:1781` 透传 |
| H2 | ✅ 已落地 | `src/lib/stage-overview.ts:98-100` `total===0` 开头推 `data-empty`/warning/`data-diagnostics`；`:114` 兜底收紧为 `cards.length === 0 && h.total > 0`。边界核过：total>0 但全隐藏（visible=0）时 `data-hidden` info 卡使 `cards.length>0`，不会出假 `data-clean`；`data-diagnostics` 动作走 `App.tsx:1466` 既有 `openDataDiagnostics()`，空名单不崩 |
| B2 | ✅ 已落地 | `src/components/workspaces/ContentLayoutWorkspace.tsx:144-166` `<details aria-label="整体模板与交换">` 挂 TemplatePicker + TemplateExchange，五个必需 props 全有才渲染（`:115-127`），exchange 由 `onImportTemplateRecord` 单独门控；`App.tsx:1843-1863` 只加 rail props，全部复用全局设置既有 handler（`applySystemTemplate`/`saveCurrentTemplate`/`mergeImportedTemplate`/`loadDisplayName`） |
| P2 | ✅ 已落地 | `src/components/ProjectMenu.tsx:103` `aria-label="打开项目与协作菜单"`；回归测试 `ProjectMenu.identity.test.tsx:97` |
| Doc | ✅ 已落地 | 全仓 `*.md` grep `src/server` 仅剩 CHANGELOG 纠偏描述与 `.agent_workspace` 历史归档；`/admin`/`visits` 仅剩「已移除」标注（`function.md:261,382,416`、`DEPLOY-SERVER.md:49`）；`function.md:373` React 19 |

## 3. 独立回归（本轮实测）

- `npx vitest run` 目标 8 文件（DataWorkspace / DataUploadWorkspace / DeliveryWorkspace / stage-overview / StudioAssistantDrawer.integration / ContentLayoutWorkspace / ProjectMenu.identity / TemplatePicker）：**8 passed，75 tests passed**。注意本次运行已包含并行 Round 2 代理对 DeliveryWorkspace / ContentLayoutWorkspace 测试的未提交增强，同样全绿。
- `npx eslint` 覆盖全部六项改动源文件（stage-overview.ts、usePosterExport.ts、DataWorkspace.tsx、ProjectMenu.tsx、ContentLayoutWorkspace.tsx、DeliveryWorkspace.tsx、App.tsx）：**0 errors**。
- `usePosterExport` 无独立单测文件（简报未宣称有），行为经 `DeliveryWorkspace.test.tsx` 间接覆盖，可接受。

## 4. CHANGELOG — 已由并行代理补齐，本报告不重复改

审计中发现工作树内并行 Round 2 代理（`cycle2/round2/fable-2-changelog.md`）已在 `CHANGELOG.md` Unreleased 补全全部五项用户可见条目：新增（B2 整体模板与交换、F2 导出成功结果条）+ 修复（H2 空名单、D2 读屏可感知、P2 协作入口）。内容逐条核对无误、无支付词汇。**为避免同文件冲突，本审计不再重复编辑 CHANGELOG。** Round 2 攻坚第 2 条关闭。

## 5. 发现的问题（均为低严重度，无阻塞 bug）

1. **死 CSS（低）**：`src/components/workflow-workspaces.css:43-46` 的 `.template-workspace__swatch*` 四条规则在全部 `.tsx` 中零引用（旧模板工作区遗留），其中含 `--regional`。不影响行为；后续清理轮可删，不必本轮动。
2. **微小性能噪音（信息级）**：`App.tsx:1863` `templateAuthor={loadDisplayName()}` 每次渲染读一次 localStorage。量级可忽略且与既有写法一致，不建议为此改动。
3. **杂物目录（流程问题，非代码）**：仓库根目录出现未跟踪的 `cycle2/round2/`（空，2026-08-24 15:50 创建），疑似并行代理把报告路径写错了根（正确位置是 `.agent_workspace/cycle2/round2/`）。**合并前应删除，切勿提交**；因可能仍有代理在途写入，本审计未代删，交协调者处理。
4. **工作树在途改动（信息级）**：`CHANGELOG.md`、`USER_GUIDE.md`、`DeliveryWorkspace.tsx`（新增 `aria-busy`）、两个测试文件有并行 Round 2 未提交改动，本轮实测均通过；不属 `793d80b` 审计范围。

## 6. 剩余 SOTA 差距盘点（in-scope vs forbidden）

**仍在允许范围、可作后续轮候选：**

- 浏览器手动验收三条路径（内容阶段展开模板交换 / 导出成功条 / 空项目阶段概览）——Round 2 攻坚第 4 条，测试已覆盖逻辑，真浏览器点击尚未留证。
- 导入**失败**消息仍走 polite `role="status"`（D2 报告有意推迟 assertive 拆分，需给 message 加 tone 字段）——合法的后续增量，不算本轮缺陷。
- `USER_GUIDE.md` 与新 UI 的对齐（并行代理疑似正在做）。
- 死 CSS 清理（见第 5.1 条）。

**仍被简报明令禁止，不得纳入：** promo:lint（撞 PR #8）、公开 HTTPS Demo（#7）、CI（#5）、印刷尺寸（#3）、支付/套餐/VIP（AGPL 边界文档）、房间协议改 displayName（他人昵称实时可见需 API 形状变更）、账号系统。

## 7. 结论

D2/F2/H2/B2/P2/Doc 六项全部在 `793d80b` 真实落地且与简报描述一致；`regional` 排除属设计意图并有源码注释背书，Round 2 不需要也不应该把它加回选择器；CHANGELOG 用户可见条目已由并行代理补齐；未发现中高严重度 bug。本报告零代码改动、零提交。
