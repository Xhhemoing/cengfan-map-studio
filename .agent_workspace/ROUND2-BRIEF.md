# Round 2 结论简报

模型来源：2× claude-fable-5-thinking-xhigh、2× claude-opus-5-thinking-high-fast、2× gpt-5.6-sol-xhigh-fast  
日期：2026-08-24  
相对 Round 1：在途 PR 新增 **#11（89 文件大拆分）** 与本分支 **#12**；PR #8 会删掉全部宣发脚本/文档。

## 演进对比

| 项 | Round 1 简报 | Round 2 裁决 | 原因 |
|----|--------------|--------------|------|
| A 提意见/帮助 | P0 | **KEEP** | 漏斗断头仍成立；WorkbenchHeader 无 PR 触碰 |
| B 社区模板格式 | P1 主菜 | **KEEP** | lib 层零冲突；边界文档 §3 特批 |
| C promo:lint | P0 脚本 | **DROP** | 与 #8 范围级正撞；违规修复大半被 #8 吸收 |
| D 模板下载 + aria-live | 极低 | **SLIM** | 必须同时改 App **和** DataUploadWorkspace 硬覆盖；aria-live 推迟（#11 搬组件） |
| E 协作昵称+角色 | P1 | **KEEP** | API 零改动；他人昵称实时可见列入剩余差距 |
| F 导出文件名 + 结果条 | 低 | **SLIM** | 只做文件名纯函数；结果条撞 #3/#10 |
| G CHANGELOG+致谢 | 低 | **KEEP** | 纯新增文件；不改 README/CONTRIBUTING |
| H 重载示例 + 空名单健康 | 低 | **SLIM** | 只做重载示例；`total===0` 推迟（撞 #10） |

## 潜在边界风险

- **#11** 是最大冲突源：禁止把新逻辑堆进 `App.tsx` / 拆 `DataWorkspace` / 动 `server/` 路由。
- 模板交换格式必须：拒未知 version、任意层级 `students` 拒收、`price/sku` 拒收、导出清空 `scene.guests`（嘉宾姓名泄漏面）。
- 反馈 URL 只允许环境元数据白名单，禁止项目/名单进入 query。
- 昵称只进 localStorage + 房间内存，不进 `ProjectDocument`。
- 不宣称账号身份；角色不只靠颜色。

## SOTA 验收差距（本轮发货后仍在）

- 无 HTTPS Demo（#7 拥有）、无 CI（#5）、无 Discussions（仓外设置）、无 promo:lint（等 #8 裁决）、他人昵称不可见（需 API 形状）、空名单健康误判（等 #10）。

## Round 3 锁定实现包与文件所有权（禁止越界）

实施顺序建议：G → E → F → B → A → D → H（可并行，因文件已隔离）。

| Agent | 项 | **只许改这些路径** |
|-------|----|-------------------|
| R3-F1 | E | `src/lib/collaboration-identity.ts`（新）、`src/components/collaboration/*`（新）、`src/lib/app-constants.ts`、`src/lib/useCollaborationRoom.ts`、`src/components/ProjectMenu.tsx`、对应 `*.identity.test.*`（新）。**禁止** App.tsx / server/ |
| R3-F2 | G + 存活合规 | `CHANGELOG.md`（新）、`docs/社区/贡献者致谢.md`（新）、`docs/案例模板/国际部-12人.md`（删世界地图宣称）、`USER_GUIDE.md`（FAQ 表头与真实模板对齐）。**禁止** README / CONTRIBUTING / 宣发脚本 |
| R3-O1 | B | `src/lib/template-package.ts`（新）、`src/lib/template-exchange-actions.ts`（新）、`src/components/TemplateExchange.tsx`（新）、`src/lib/template-store.ts`（仅 export sanitizer）、`src/components/TemplatePicker.tsx`（可选 `exchange` 插槽）、`src/components/GlobalSettingsScreen.tsx`、测试。**禁止** App.tsx / project-package.ts |
| R3-O2 | A + D前半 | `src/lib/feedback-links.ts`（新）、`src/components/HelpFeedbackMenu.tsx`（新）、`src/components/workbench/WorkbenchHeader.tsx`、`src/App.tsx` **仅两处**：① `projectActionsNode` 插入帮助菜单 ② 删除 `hideTemplateDownload: true`；`src/components/workspaces/DataUploadWorkspace.tsx` 删除硬编码 `hideTemplateDownload`；测试。**禁止** aria-live、六阶段导航、usePosterExport |
| R3-G1 | F前半 | `src/lib/export-filename.ts`（新+测）、`src/lib/usePosterExport.ts`、`src/App.tsx` **仅** `usePosterExport({` 调用处加 `getProjectName: () => projectNameRef.current`。**禁止** DeliveryWorkspace 结果条、印刷尺寸 |
| R3-G2 | H前半 | `src/components/workbench/ProjectGrid.tsx`（空态加按钮，**不改**现有 `<p>` 文案）、`src/components/ProjectWorkbench.tsx`（handler）、新测试文件。**禁止** stage-overview.ts、WorkbenchHeader、ProjectWorkbench.test.tsx |

硬规则：无支付/SKU；先写失败测试再实现；目标 `npx vitest run <文件>` + 相关 lint；完成报告写 failure→cause→fix→recheck。
