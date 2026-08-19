# 参与蹭饭图

先选身份，再动手。中文 Issue 完全欢迎。

| 我是 | 请去 | 不要去 |
|------|------|--------|
| 班主任 / 班委 / 想出图 | [用户指南](USER_GUIDE.md)、用户群、[反馈问卷流程](docs/宣发/反馈收集SOP.md) | 直接开 PR |
| 想提产品意见的开发者 | [Issue 模板](https://github.com/Xhhemoing/cengfan-map-studio/issues/new/choose)、[征求意见 SOP](docs/宣发/反馈收集SOP.md) | 用户群里问安装 |
| 想改代码 / 文档 / 模板 | 下面「开发流程」 | 不经 Issue 直接做大功能 |

国内克隆见 [Gitee 镜像清单](docs/宣发/Gitee镜像清单.md)。开发约定见 [AGENTS.md](AGENTS.md)。模块说明见 [DEVELOPER.md](DEVELOPER.md)。

---

## 什么样的贡献都算

- 使用后留下一句真实劝退点（导入 / 布局 / 导出）
- 文档、案例模板、脱敏示例、宣发配图步骤
- Bug 修复、测试、性能、UI
- 新功能：**先开 Issue 讨论**，避免做完无法合并

标了 `good first issue` 的任务按设计应能在一个晚上做完。候选列表：[docs/宣发/good-first-issues.md](docs/宣发/good-first-issues.md)。

---

## 开发流程

```bash
git clone https://github.com/Xhhemoing/cengfan-map-studio.git
cd cengfan-map-studio
npm install
npm run dev          # 前端 5173 + API 8787
```

公开演示站（无 Node API）见 [docs/deployment/public-demo.md](docs/deployment/public-demo.md)。

1. 在 Issue 下评论「我来做」（大功能必须先有 Issue）。
2. Fork，分支用 `fix/短名` 或 `feat/短名`。
3. 能测的逻辑先写测试再改代码（见 AGENTS.md 验证纪律）。
4. 提交前：

```bash
npx vitest run <你改动相关的测试文件>
npm run lint
```

全量 `npm test` 很重，不要默认并行开很多套。

5. 按 PR 模板发 PR：改了什么、怎么验收、如何回滚。

---

## Issue 怎么写才有人回

48 小时内会有人回复。请带上：

- 你是使用者还是开发者
- 系统 / 浏览器 / `npm run dev` 还是生产构建
- 期望 vs 实际；能的话附脱敏截图
- **不要**贴真实学生姓名 + 去向

功能建议说明：场景（开学/毕业/校庆）、现在的绕法、没有这个功能是否完全没法出图。

---

## 行为

- 不贬低学校、学生或去向。
- 不在仓库里提交真实名单。
- 代码与文档默认中文用户可读；标识符保持现有英文风格。

维护者会对「不做」的建议写明原因。这不是冷漠，是为了让你下次还愿意提。

---

## 许可证

提交即表示你将贡献按 **AGPL-3.0-only** 授权给本项目，与 [LICENSE](LICENSE) 一致。说明见 [docs/开源与收费边界.md](docs/开源与收费边界.md)。

不要在本仓库提交支付、套餐、商户密钥或收费后台。
