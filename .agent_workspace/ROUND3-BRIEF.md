# Round 3 结论简报

模型来源：2× claude-fable-5-thinking-xhigh、2× claude-opus-5-thinking-high-fast、2× gpt-5.6-sol-xhigh-fast  
验证：`npx vitest run` 目标 14 个文件 **266 passed**；相关文件 ESLint 通过。

## 已落地（本仓允许）

| ID | 能力 | 用户怎么用 |
|----|------|------------|
| A | 应用内「帮助」菜单 | 工作台顶栏与编辑器顶栏 → 使用意见 / 遇到问题 / 功能建议 / 用户指南；Bug 只预填系统与运行方式 |
| B | `.cengfan-template` 交换格式 | 全局设置 → 数据板块 → 数据展示 → 导出/导入模板；拒收名单与收费字段 |
| D | 数据阶段恢复 XLSX 模板下载 | 「数据与素材」主路径可见「下载 XLSX 模板」 |
| E | 协作本地昵称 + 角色文字 | 项目菜单 → 在线协作：昵称写入 localStorage；角色用文字+aria，非账号 |
| F | 导出文件名含项目名与倍率 | PNG `{名}-{n}x.png`，SVG `{名}.svg` |
| G | CHANGELOG + 致谢规则 | 根目录 `CHANGELOG.md`、`docs/社区/贡献者致谢.md`；国际部案例去掉世界地图宣称 |
| H | 空工作台重载示例 | 删光项目后空态按钮「载入示例项目」 |

## 明确未做（冲突或边界）

- C `promo:lint`（PR #8 将删除宣发语料）
- 公开 Demo（#7）、CI（#5）、印刷尺寸（#3）、空名单健康误判（#10）
- 支付/套餐/VIP、账号系统、他人昵称实时可见（需改房间协议）

## 回滚

- 模板格式 `version: 1`，未知版本拒收；去掉 TemplatePicker `exchange` 与 App 的 `onImportTemplateRecord` 即隐藏 B。
- 其余为可选 UI / 纯函数，还原对应文件即可。不改 `.cengfan` 工程包版本。
