# A3 · 帮助菜单加 CHANGELOG 链接与版本号

## 结论

帮助菜单「先自己看看」一节新增 `更新日志` 外链，指向 `https://github.com/Xhhemoing/cengfan-map-studio/blob/main/CHANGELOG.md`；
环境一节新增一行 `版本 v0.1.0`。两者都只读常量：`CHANGELOG_URL` 由既有 `REPO_URL` 拼出（与 `USER_GUIDE_URL` 同一模式），
`APP_VERSION` 是 `feedback-links.ts` 里的字符串字面量，**没有 import package.json**，客户端产物不会因此夹带依赖清单与脚本。

URL 里没有任何工程数据：`CHANGELOG_URL` 是纯路径，无 query、无 hash；版本号是展示文本，不进 `buildIssueUrl`，
`env` / `where` 预填与复制按钮的行为一字未改（复制出的仍是 `系统 + 浏览器`）。这条与 CHANGELOG 0.1.0 里
「跳转链接只携带环境信息」的既有承诺不冲突——本次没有让任何新信息离开本机。

## 改动文件

| 文件 | 改动 |
|------|------|
| `src/lib/feedback-links.ts` | 新增 `CHANGELOG_URL`（模板串 `REPO_URL` + `/blob/main/CHANGELOG.md`）与 `APP_VERSION = "0.1.0"`（含注释说明为什么手抄而不 import package.json，漂移交给测试守）。收口函数 `buildIssueUrl` / `ISSUE_URL_ALLOWED_PARAMS` / `MAX_ISSUE_URL_LENGTH` 均未动。 |
| `src/components/HelpFeedbackMenu.tsx` | 「先自己看看」一节在 `用户指南` 与 `全部反馈入口` 之间插入 `<HelpLink href={CHANGELOG_URL} label="更新日志" hint="GitHub" />`——复用既有 `HelpLink`，自动带 `target="_blank"`、`rel="noopener noreferrer"` 与「新窗口打开」的 aria-label。`.help-menu__environment` 内在环境行之后、隐私说明之前插入 `<small>版本 v{APP_VERSION}</small>`。 |
| `src/lib/feedback-links.test.ts` | 新增 `describe("CHANGELOG_URL")` 2 条（等于 `${REPO_URL}/blob/main/CHANGELOG.md` 且 `search`/`hash` 为空；`readFileSync(process.cwd()/CHANGELOG.md)` 含 `# 更新日志` 的存在性守卫）+ `describe("APP_VERSION")` 2 条（与 package.json `version` 相等、形如 `x.y.z`；不含姓名 / `http` / `?=&/@`）。并把 `CHANGELOG_URL` 加进既有「carries no project, roster or room data」的 URL 清单，直接吃到 512 长度上限与名单正则。 |
| `src/components/HelpFeedbackMenu.test.tsx` | 既有第一条用例补 `expect(labels).toContain("更新日志")`；新增 2 条:①「links the changelog and shows which version the reader is running」断言 href **contains `CHANGELOG.md`**、等于完整常量、`search` 为空，且 `.help-menu__environment` 文本含 `版本 v${APP_VERSION}`；②「keeps the changelog link and the version label free of roster data」对 href、aria-label、版本区文本三者同时断言无 `林舟/北京大学/students/roster/roomId/room=/token/cengfan-project` 与编码花括号引号。 |

CSS 未改：`.help-menu__popover section` 本就是 `display: grid; gap: 6px`，新 `<small>` 直接继承
`.help-menu__environment small` 的 muted 样式；新链接落进既有 `.help-menu__popover a` 规则。因此没有动 `styles.css`，
也不会给同循环的 CSS 清理项添噪声。

## 验证（failure → cause → fix → recheck）

本项没有出现失败→修复的循环：指定命令首跑即绿。

- `npx vitest run src/lib/feedback-links.test.ts src/components/HelpFeedbackMenu.test.tsx` → **Test Files 2 passed，Tests 33 passed**（改前 24）。
- `npx tsc --noEmit -p tsconfig.app.json` → 退出码 0，无输出。
- `npx eslint src/lib/feedback-links.ts src/lib/feedback-links.test.ts src/components/HelpFeedbackMenu.tsx src/components/HelpFeedbackMenu.test.tsx` → 退出码 0，无输出。

为了不让「绿」变成恒真断言，做了两次反向证伪（都已还原，最终态是上面那条 33 passed）：

1. **删掉 `<HelpLink ... 更新日志 />` 一行** → `npx vitest run src/components/HelpFeedbackMenu.test.tsx` 红 3 条：
   `offers the four feedback and help destinations`、`links the changelog and shows which version...`、
   `keeps the changelog link and the version label free of roster data`（`Tests 3 failed | 7 passed`）。还原后复跑全绿。
2. **把 `APP_VERSION` 改成 `"0.9.9"`** → `npx vitest run src/lib/feedback-links.test.ts` 红 1 条：
   `stays in sync with the package version it is hand-copied from`（`1 failed | 22 passed`）。还原后复跑全绿。

即：链接在、版本对，才可能绿。

## 验收方式

- **手动**：任一页面点顶栏「帮助」→「先自己看看」下应出现「更新日志」，点击在新标签打开仓库 CHANGELOG.md；
  弹层底部环境区应显示三行：`Windows 10/11 + Chrome 128`（带复制按钮）、`版本 v0.1.0`、隐私说明。
  右键复制「更新日志」链接地址，应是干净的 `.../blob/main/CHANGELOG.md`，无 `?`。工作台与编辑器两处菜单表现一致（同一组件）。
- **自动**：上列三条命令；CI 走 `npm test` + `npm run lint` 即覆盖。

## 破坏性与回滚

**无破坏性**：没有改数据结构、导出格式、API 形状或任何已存在链接的 URL。既有 Issue 预填参数、复制文本、
菜单 DOM 契约（`.help-menu` / `.help-menu--workbench` / `summary[aria-label="帮助与反馈"]`）全部保持，
新增的只是一个 `<a>` 与一个 `<small>`。

**唯一的长期维护成本**：`APP_VERSION` 与 package.json 手抄同步。这是刻意的取舍（避免把 package.json 打进
客户端 bundle），并已有测试守着——版本号一改，`npm test` 立刻红，提示同步。发版流程需要顺手改这一行。

**回滚**：删掉 `feedback-links.ts` 的两个常量、`HelpFeedbackMenu.tsx` 的两行 JSX 与两处 import，
以及两份测试里新增的 4 条用例与 2 处断言即可，无数据迁移、无用户可见残留。

## 边界声明

只改了 ALLOWED 的四个文件（CSS 未用到，故未改）。未触碰 `App.tsx`、`ProjectWorkbench.tsx`、`DataWorkspace.tsx`、
`usePosterExport.ts`、`workflow-workspaces.css`、`server/styles.test.ts`（分属同循环的 F3 / D3 / CSS / P3），
未改 `CHANGELOG.md`（Doc 项），未涉及支付。**未提交、未推送**。
