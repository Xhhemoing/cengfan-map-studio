# Cycle 3 Round 3 验收

Round 2 已提交：CSS2 残留类、F3b 工作台/默认文件名、USER_GUIDE、P3 源码守卫、AppProjectMode 不再把空 data-message alert 当成缺项目屏。

## Round 3 必须做

| ID | 项 | 文件 |
|----|----|------|
| Empty | 空 live region 必须匹配 `:empty`（JSX 空白文本节点会让空红框露出来） | `DataWorkspace.tsx` + 测试 |
| Tests | 含 `AppProjectMode.test.tsx` 的交叉回归 | 测试；尽量不改产品代码 |
| Browser | 点：帮助→更新日志/版本号；导出工程包文件名；导入失败 alert；顶栏 PNG 文案 | 报告 |
| CSS | 全仓 `template-workspace` 仅允许历史文档 | 报告或最小删除 |
| Leaks | 终扫 | 报告 |

仍不做：promo:lint、Demo、CI、印刷、支付、房间协议、regional 选择器。
