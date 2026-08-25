# Cycle 3 · 仍在范围内的建议（用户再次批准）

Cycle 1–2 已落地社区钩子与推迟项。本循环只做审计里点名、且不与 #3/#5/#7/#8 冲突的收口。禁止支付。

| ID | 项 | 文件 |
|----|----|------|
| F3 | 工程包文件名走 `buildExportFileName({ kind: "project" })`，保持 `.json` 后缀可导入 | `usePosterExport.ts`、`export-filename.test.ts` |
| A3 | 帮助菜单加 CHANGELOG 链接与版本号（只读常量，不把工程数据塞进 URL） | `feedback-links.ts`、`HelpFeedbackMenu.tsx` |
| D3 | 导入失败用常驻 `role="alert"`，成功仍 `role="status"`；区域不随消息卸载 | `DataWorkspace.tsx` + 测试 |
| CSS | 删除无 TSX 引用的 `.template-workspace*` 规则，并改 `server/styles.test.ts` 对应断言 | `workflow-workspaces.css`、`server/styles.test.ts` |
| P3 | 顶栏「导出 PNG」在任意导出进行中禁用（`exportState==="exporting"`），不只 `exportingPng` | `App.tsx` 两处按钮 |
| Doc | CHANGELOG 昵称上限改为 20（与 `MAX_DISPLAY_NAME_LENGTH` 一致）；Unreleased 记下 F3/A3 | `CHANGELOG.md` |

仍不做：promo:lint、公开 Demo、CI、印刷尺寸、支付、改房间协议让他人昵称实时可见、把 `regional` 加回内置选择器。
