# Cycle 2 Round 2 — CHANGELOG Unreleased 补录（fable-2）

MODEL: claude-fable-5-thinking-xhigh

## 做了什么

### CHANGELOG.md（Unreleased）

按记录规则（新增 / 修复分组）补录 Cycle 2 全部六项用户可见改动，均对照 `793d80b` 的实际代码 diff 核实后撰写，无虚构：

| 条目 | 分组 | 代码依据 |
|------|------|----------|
| 内容阶段「整体模板与交换」 | 新增 | `ContentLayoutWorkspace.tsx` 新增 `<details aria-label="整体模板与交换">` 挂 TemplatePicker + TemplateExchange；此前 TemplateExchange 仅在 `GlobalSettingsScreen.tsx`（全局设置 → 数据展示）；`App.tsx` 的 `mergeImportedTemplate` 20 个上限提示 |
| 导出成功结果条 | 新增 | `DeliveryWorkspace.tsx` `exportState === "success"` 结果条（`role="status"`）显示「已导出 {fileName}」+「再次导出」；`usePosterExport.ts` 暴露 `lastExportFileName`，PNG / SVG / 工程包三路均设置 |
| 空名单警告 | 修复 | `stage-overview.ts`：`h.total === 0` 推 `data-empty` warning 卡「还没有名单」；`data-clean` 增加 `h.total > 0` 前置条件 |
| 导入 aria-live | 修复 | `DataWorkspace.tsx`：导入消息与替换摘要移入常驻 `role="status" aria-live="polite" aria-atomic="true"` 区块 |
| 项目菜单协作标签 | 修复 | `ProjectMenu.tsx` summary aria-label 「打开项目菜单」→「打开项目与协作菜单」（小屏下协作仅此入口） |
| 文档路径纠偏 | 修复 | 原有条目保留未动 |

- 「记录规则」小节（含 AGPL-3.0-only 与不含支付功能声明）原样保留；新条目中模板交换重申「结构性排除学生数据，永远免费交换」。
- 未附 Issue / PR 链接：这批改动来自本仓库直接提交，无对应 Issue / PR，规则为「尽量附」，不虚构链接。

### USER_GUIDE.md（最小改动，1 行）

- Excel FAQ（第四节 Q1）已与现状一致——表头「学生姓名 / 录取院校 / 城市 / 去向类型」、前三项必填、别名识别、模板下载均已写明，**未改写**。
- 第二节「3. 素材库」已有「模板」条目，按指示在该行追加一句指向：「整体模板的切换、保存与社区模板导入导出，见『内容与排版』阶段右侧栏的『整体模板与交换』」。仅此一处，其余未动。

## 边界确认

- 只改 `CHANGELOG.md` 与 `USER_GUIDE.md` 两个文件（外加本报告）。
- 未发明功能：每条描述均能对应到 `793d80b` diff 中的具体代码行为；工程包导出文件名 `cengfan-project-<日期>.json` 是原有默认值（`project-package.ts` 默认参数），非本轮变化，故未写入。
- 未提交、未推送（按指令留给上游统一处理）。

## 遗留观察（不在本轮范围）

- Round 2 攻坚清单第 1 条：内容阶段模板列表硬编码 5 个系统模板 id（`original/cartoon/grain/q/scenery`），疑漏 `regional`——属代码问题，不由 CHANGELOG 掩盖，留待对应实现轮处理。
- 0.1.0 条目称工程包按「项目名-去向图-日期」命名，但编辑器内工程包导出实际为 `cengfan-project-<日期>.json`（工作台导出才带项目名）——历史描述与现状的出入，建议后续轮核对。
