# 文档导航

README 用于开始体验，本页按使用、开发、发布与历史资料组织入口。历史计划和 QA 不是当前版本已实现或已发布的证明；正式状态以 GitHub Release 和相应 commit 的验证结果为准。

## 使用与开源社区

| 文档 | 适用场景 |
| --- | --- |
| [项目首页](../README.md) / [用户指南](../USER_GUIDE.md) | 体验、导入名单、编辑与导出 |
| [支持说明](../SUPPORT.md) | 提交脱敏复现，无需加入用户群 |
| [贡献指南](../CONTRIBUTING.md) / [行为准则](../CODE_OF_CONDUCT.md) | 贡献与社区协作 |
| [安全策略](../SECURITY.md) | 私密漏洞报告与部署边界 |
| [许可证](../LICENSE) / [第三方资源说明](../THIRD_PARTY_NOTICES.md) | 代码许可、来源与授权待核验事项 |

## 开发、状态与计划

| 文档 | 内容 |
| --- | --- |
| [开发指南](../DEVELOPER.md) / [仓库约定](../AGENTS.md) | 模块、命令、验证纪律与文件大小约束 |
| [项目现状](PROJECT_STATUS.md) | 分支基线、实际交付与未完成事项 |
| [路线图](ROADMAP.md) | 未来优先级的唯一入口 |
| [产品说明](../PRODUCT.md) / [实施与验收原则](PROJECT_REQUIREMENTS.md) | 产品边界与跨功能要求 |
| [功能架构](../function.md) / [界面设计规划](../frontUI2.md) | 功能与界面背景资料 |
| [设计契约](design/DESIGN-CONTRACT.md) / [品牌色板](品牌色板.md) | 视觉与交互约束 |

## 部署与发布

| 文档 | 场景 |
| --- | --- |
| [发布与回滚](RELEASING.md) / [版本说明](releases/) | 审查 SHA、质量闸门、静态附件、回滚与分支清理 |
| [更新日志](../CHANGELOG.md) | 版本变化，未发布事项与历史记录入口 |
| [公开演示与容器部署](deployment/public-demo.md) | 静态站、GitHub Pages 和单实例 Docker |
| [服务器部署](../DEPLOY-SERVER.md) | 生产配置、持久目录与探针 |
| [反向代理](deployment/reverse-proxy.md) | TLS、SSE 与可信代理边界 |
| [AI 生产部署](deployment/ai-production.md) | 单实例 API/AI 配置与状态文件 |
| [静态部署细节](deployment/static-demo.md) | 静态构建背景资料，以当前主部署指南为准 |

## 验证证据与历史

[QA 目录](qa/) 保存验证记录和限制；[2026-09-25 审查](qa/2026-09-25-project-review.md)、[2026-09-27 实施计划](plans/2026-09-27-review-implementation.md) 与 [对应 QA](qa/2026-09-27-review-implementation.md) 保留为历史依据。当前运行结果在对应 CI/Release 工作流中，不复用历史数字作为新版本结论。

[阶段进展](progress/) 与 [规格/实施计划](superpowers/) 用于追溯决策，不代替 ROADMAP。

## 示例与社区资料

[示例数据](示例数据/)、[案例模板](案例模板/)、[社区资料](社区/) 与 [宣发资料](宣发/) 保留作为使用与协作资源。公开内容必须使用虚构或充分脱敏数据。

`私域/`、`KOL/`、`宣发草稿/`、`宣发复盘/` 为运营历史资料，不是运行依赖或参与贡献的前置条件。

## 维护入口

[项目治理](../GOVERNANCE.md) · [架构导航](ARCHITECTURE.md) · [维护手册](MAINTAINERS.md)

## 维护规则

可执行步骤进入使用/部署指南；计划统一维护在 ROADMAP。新增文档优先加入本页，减少重复说明。临时代理输出、原始验证缓存、机器绝对路径、密钥和真实名单不得提交。
