# Cycle 3 Round 2 攻坚

Round 1 已提交：D3 导入 alert、F3 工程包文件名、A3 帮助 Changelog/版本、CSS 清理 `.template-workspace*` 规则块、P3 PNG 任意导出禁用、Doc 昵称 20。

## Round 2 必须做（文件所有权互斥）

| ID | 项 | 文件 |
|----|----|------|
| Audit | 交叉核验六项是否真落地；列出剩余 in-scope | 仅报告，不改产品代码 |
| Docs | USER_GUIDE 补帮助→更新日志、工程包文件名；核 CHANGELOG 与代码 | `USER_GUIDE.md`（CHANGELOG 仅修残留漂移） |
| CSS2 | `src/styles.css` 分组选择器里残留的 `.template-workspace` 类名删掉，保留同组其它工作区类 | `src/styles.css`、必要时 `server/styles.test.ts` |
| F3b | 工作台导出与 `downloadProjectPackage` 默认名对齐 `buildExportFileName({ kind: "project" })` | `ProjectWorkbench.tsx`、`project-package.ts` + 测试 |
| Tests | 交叉回归 + 顶栏 PNG 在 `exportState==="exporting"` 禁用（能测则测） | 测试文件；尽量不改 `App.tsx` |
| Leaks | 支付/PII/名单进 URL 复扫 | 仅报告，真泄漏才改对应文件 |

仍不做：promo:lint、公开 Demo、CI、印刷尺寸、支付、改房间协议、把 `regional` 加回选择器。
