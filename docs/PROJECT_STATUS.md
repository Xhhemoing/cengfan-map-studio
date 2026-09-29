# 项目现状与整理记录

基线审查日期：2026-09-29。审查入口 commit：`05e459881faa5ff66f82f89ab2482b29443f851b`。正式发布情况始终以 [GitHub Releases](https://github.com/Xhhemoing/cengfan-map-studio/releases) 为准，不能仅凭文档中的版本标题判断已发布。

## 分支收口

本次开始时仓库共有 3 个分支，无开放 PR。两个非主干分支均已完整进入主干历史，没有独有提交，不需要再制造重复的合并提交。

| 分支 | 核验 tip | 相对基线 main |
| --- | --- | --- |
| `feat/review-delivery-roster-20260927` | `174e8c819557ecedfb96e4a3557dca00c5bf373e` | ahead 0 / behind 13 |
| `fix/ui-consistency-20260927` | `5c761b2fe7ef6009173344b20262c96c389bbd15` | ahead 0 / behind 9 |

本次维护分支使用 `chore/open-source-v0.1.3`。发布流程可选择清理已合并分支：仅删除其提交已是发布 commit 祖先、且远端 tip 仍等于快照的分支；主干、`gh-pages`、变动中的分支和受保护分支不会被无条件删除。真实删除结果记录在 Release workflow summary，不以这份静态文档代替执行证据。

## 已合并能力与此次改动

主干已经包含顶栏一致性改进，以及 [PR #53](https://github.com/Xhhemoing/cengfan-map-studio/pull/53) 的导出输入冻结、源工程分享提示、名单差异预览与安全提交。此前路线图仍称 PR #53 尚未合并，现已纠正。

本次维护补齐 README、贡献/支持/安全/行为规范、第三方来源边界、版本同步回归、受控 Release、静态发布包、校验值与发布说明。移除临时源码归档工作流，清理 CI 中已失效的分支入口。没有重写编辑器或改变学生工程格式。

## 质量与验证边界

PR CI 检查发布工具测试、类型、Lint、全量 Vitest 和构建；Release 对同步后的最终版本再次检查，并执行生产依赖审计及真实 Chromium 回归。结果、跳过项与警告以运行日志及 `release-evidence` / `test-results` 为准。没有执行完整人工可用性研究、跨所有浏览器回归或独立安全审计。

既有维护债包括部分大文件、Lint/构建 warning、低内存设备的高分辨率导出，以及第三方历史素材授权清单。新增 CODEOWNERS 不等于已启用分支保护；本次未修改仓库权限、分支保护或私密漏洞报告设置。

## 下一步

可操作问题清单 [#54](https://github.com/Xhhemoing/cengfan-map-studio/issues/54)、导出就绪/保存状态 [#55](https://github.com/Xhhemoing/cengfan-map-studio/issues/55)、确认中心与局部修复 [#56](https://github.com/Xhhemoing/cengfan-map-studio/issues/56) 继续留在路线图。左右栏改版、完整 RenderPlan、多规格交付和账号级持久协作不因本次发布而视为完成。
