# 发布与回滚

## 发布模型

正式版本来自 `main` 的明确 SHA。维护者审查并合入功能、文档和发布说明后，可手动运行 **Release** 工作流，或提交下述严格限定的发布请求。普通功能合并和仅推 tag 都不会自动发布。工作流不要求额外 PAT，不修改仓库权限，也不绕过分支保护。

`package.json`、`package-lock.json` 两处版本和客户端 `APP_VERSION` 必须一致。`scripts/prepare-release.mjs` 只同步这些版本及 lockfile 根包的 engines，不重新解析依赖。最终版本提交在 runner 中生成，并在全量检查通过后才推送。

## 发布步骤

1. 在 PR 中更新 `CHANGELOG.md` 的 `## [X.Y.Z] - YYYY-MM-DD` 条目，并新增 `docs/releases/vX.Y.Z.md`（首行以 `# vX.Y.Z ` 开始）。写清变化、未完成、升级和回滚边界。使用正式 x.y.z 版本，不带 v 前缀或预发布后缀。
2. 等待最终 PR commit 的 CI，通过后合入 `main`，记录完整 40 位主干 SHA。不要把本地测试通过或历史 CI 当成该提交的证据。
3. 在 Actions → Release → Run workflow 选择 `main`，填写 `version` 和 `expected_sha`。`cleanup_merged` 默认关闭；维护者明确需要清理时才开启。也可使用下一节的单文件发布请求。
4. 核对工作流结果、Release 页面、tag/commit 以及附件。工作流会独立触发 Pages，从发布 tag 构建；Pages 的成功状态需另行核对。

使用 GitHub CLI 的等价调用（先替换占位值）：

```bash
gh workflow run release.yml --ref main \
  -f version=X.Y.Z \
  -f expected_sha=FULL_REVIEWED_MAIN_SHA \
  -f cleanup_merged=false
```

本地预演版本修改（会修改工作区，不会提交或发布）：

```bash
npm run test:release
npm run release:prepare -- X.Y.Z
git diff -- package.json package-lock.json src/lib/feedback-links.ts
```

## 单文件发布请求

当使用的维护工具支持提交文件但不支持 workflow_dispatch 时，可以在完成 PR 审查、合并和 CI 核验之后，仅新增或更新 `.github/release-request.json`，通过一个独立的 main 提交发起同样的发布流程：

```json
{
  "version": "0.1.3",
  "reviewed_base_sha": "REPLACE_WITH_THE_40_CHARACTER_MAIN_SHA",
  "cleanup_merged": false
}
```

示例 SHA 必须替换，版本也必须对应已经审查的日志与说明。`reviewed_base_sha` 必须严格等于本次 push 前的主干 SHA；这次 push 的累计差异只能包含请求文件，不能夹带代码或文档变化。发布目标为该请求提交的 SHA，版本同步仍在 runner 中进行。布尔值不接受字符串，非法版本、主干移动或无关文件变化都会停止流程。

仓库的分支保护继续适用；若保护要求 PR，则通过只修改请求文件的 PR 提交，并在合并前确认主干基线没有变化。不得为触发发布关闭保护。普通源代码 PR 不应更新此文件；重复请求同一已存在 tag 会失败，不会覆盖已有发布。

## 发布闸门与产物

工作流核验版本格式、主干 SHA、tag 未被占用、版本同步、CHANGELOG 和说明文件；随后串行运行发布工具测试、类型检查、Lint、全量测试、生产依赖高危审计、完整生产构建、Chromium 回归与静态构建。任一失败不进入发布步骤。

发布前再次检查远端 main 没有移动，并原子推送版本提交与 tag；不强推 main。Release 先以 draft 创建并上传附件，再公开为 latest。附件包括根路径静态站 ZIP/TAR.GZ、`BUILD_INFO.json` 和 `SHA256SUMS.txt`。GitHub 同时提供对应 tag 的源码归档。静态包不是完整 Node 服务；源码构建和自建方式见部署文档。

```bash
# 在存放全部发布附件的目录中执行
sha256sum -c SHA256SUMS.txt
```

`BUILD_INFO.json` 记录确切 commit、构建模式、base path、源码入口和工作流链接。SHA-256 用于完整性核对，不代表密码学签名、独立审计或第三方授权证明。

GitHub 的 `GITHUB_TOKEN` 推送不会自动触发常规 push 工作流，因此本流程自行完成最终版本测试，并显式 dispatch Pages。依据：[GitHub GITHUB_TOKEN 文档](https://docs.github.com/en/enterprise-cloud@latest/actions/concepts/security/github_token)。`contents: write` 用于主干/tag/Release，`actions: write` 仅用于显式触发 Pages；普通 PR CI 维持只读权限。

## 分支清理

开启清理时，仅处理 runner 获取的、已合入发布 commit 的远端分支。删除带精确 tip 租约，分支一旦前移就拒绝；保留 main、HEAD 和 gh-pages。受保护分支由 GitHub 拒绝删除并保留。失败不通过去掉租约或强删来重试。结果写入 workflow summary。

## 失败恢复

主干发生变化、标签已存在或检查失败：查明原因，更新 PR/预期 SHA，再重新执行；不盲目重跑测试求绿。分支保护禁止机器人推进主干时，应先由常规 PR 合入预演生成的版本文件，再以新的主干 SHA 执行，保持保护策略不变。

Git 推送成功但附件上传或公开失败时，tag 可能已经存在。不要删除或移动它；检查该 tag 对应 commit 和该次工作流产物，补齐同一 draft 的附件并核对校验值后再公开。必要时发布新的补丁版本，而不是覆盖旧产物。

Pages 失败不会自动撤销已公开的 Release；排查部署，使用同一 tag 重新运行 pages 工作流的 `source_ref`。不要把 Release 成功写成演示部署已成功。

## 回滚

先导出/备份真实工程与服务端持久目录，再切换旧的已发布 tag，并根据该版本源码重新执行 `npm ci` 与构建。Pages 可在 pages 工作流中指定旧 tag。不要假定未来数据格式一定向后兼容；按对应 Release 的迁移说明处理。

0.1.3 维护改动不引入工程格式或 API 形状迁移，但版本中包含此前合并的功能；回滚应用不能恢复已清理的浏览器数据。任何实际回滚结果应另行留痕。
