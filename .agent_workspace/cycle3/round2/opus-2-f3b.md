# Cycle 3 Round 2 · F3b 统一剩余工程包下载默认名

MODEL: claude-opus-5-thinking-high-fast
代理：C3R2-O2 ｜ 分支：`cursor/feature-expansion-research-c710` ｜ 未 commit / 未 push

## 1. 做了什么

Round 1 的 F3 只把 `usePosterExport.exportProjectPackage`（编辑器内导出）改成了
`buildExportFileName({ kind: "project" })`，留下两处旧命名。本轮把这两处补齐，
现在**全仓所有工程包落盘名都由 `buildExportFileName` 一处生成**。

| 位置 | 旧文件名 | 新文件名 |
|------|----------|----------|
| `ProjectWorkbench.exportProject`（工作台卡片菜单「导出工程包」） | `${project.name}-${project.updatedAt.slice(0,10)}.json` | `buildExportFileName({ projectName: project.name, kind: "project", date: project.pack.exportedAt.slice(0,10) })` |
| `downloadProjectPackage` 第二参默认值 | `cengfan-project-${pack.exportedAt.slice(0,10)}.json` | `buildExportFileName({ kind: "project", date: pack.exportedAt.slice(0,10) })` → 无项目名时回退「我的毕业去向图-工程包-日期.json」 |

两处细节：

- **项目名取 `StoredProject.name`**，不是 `pack.project`——`ProjectDocument` 没有 `name` 字段
  （`src/lib/project-document.ts`）。工作台的项目名只存在于 IndexedDB 记录层。
- **日期取 `pack.exportedAt` 而非 `updatedAt`**。两者在正常保存流程里同源，但 `StoredProject`
  的 `updatedAt` 会被重命名 / 复制等**不重新打包**的操作刷新（`renameProject` 只改 name + updatedAt，
  `pack` 原样保留），继续用 `updatedAt` 会让文件名日期比包内容新。改用 `exportedAt` 后
  文件名日期严格等于包内容的成包时间，也与 `usePosterExport` 那条路径的取值口径一致。
- 顺带获得项目名清洗：`sanitizeExportBaseName` 会剥掉 `\ / : * ? " < > |`、控制字符、
  首尾 `.`/`-`，截断 40 字符，并把 Windows 保留名（`con`/`nul`/`com1`…）回退成默认名。
  旧的模板字符串直接把 `project.name` 拼进文件名，项目名带 `/` 时会产出非法文件名。

改动只有文件名字符串。`serializeProjectPackage` / `parseProjectPackage` /
`restoreProjectPackage` / `PROJECT_PACKAGE_VERSION`(=2) / `PROJECT_PACKAGE_FILE_ACCEPT`
/ 包体 JSON 一行未动；`usePosterExport.ts`、`App.tsx`、`DeliveryWorkspace` 未触碰。

## 2. 测试

| 文件 | 新增用例 |
|------|----------|
| `src/components/ProjectWorkbench.test.tsx` | 2 条。共用 `stubDownload()`（spy `URL.createObjectURL` / `revokeObjectURL` / `HTMLAnchorElement.prototype.click`，在 click mock 里用 `this.download` 抓真实落盘名）与 `clickExportMenuItem()`（开卡片菜单 → 点「导出工程包」）。① 项目名 `高三3班/毕业`、`pack.exportedAt=2026-08-24`、`updatedAt` **故意设成 2026-09-01**，断言落盘名 `高三3班毕业-工程包-2026-08-24.json`——同时钉死「斜杠被清洗」和「日期来自包而非 updatedAt」；② 项目名为空白 `"   "` 时回退 `我的毕业去向图-工程包-2026-08-24.json`。 |
| `src/lib/project-package.test.ts` | 2 条，新 `describe("downloadProjectPackage")`。① 不传 filename → `我的毕业去向图-工程包-2026-08-24.json`；② 显式传 `高三3班-工程包-2026-08-24.cengfan` 时原样落盘（证明默认值改动没有覆盖调用方的显式命名，`usePosterExport` 走的正是这条路径）。 |

三条新文件名断言全部再套一层
`fileMatchesAccept(new File(["{}"], fileName), PROJECT_PACKAGE_FILE_ACCEPT)`（helper 在
`src/lib/file-accept.ts`，与 `usePosterExport.test.tsx:70` 同一用法），机器可查地证明
改名后的文件仍能被导入入口选中。

**反向证伪**：把两个源文件 `git stash` 回旧实现后重跑，3 条新断言全红——
`高三3班/毕业-2026-09-01.json`、`   -2026-08-24.json`、`cengfan-project-2026-08-24.json`
分别与期望不等。不是恒真断言。

## 3. 验证证据链（failure → cause → fix → recheck）

目标命令**首次即通过**，本项没有 failure→fix 循环：

```
$ npx vitest run src/components/ProjectWorkbench.test.tsx src/lib/project-package.test.ts src/lib/usePosterExport.test.tsx
  Test Files  3 passed (3)   Tests  33 passed (33)

$ npx eslint src/components/ProjectWorkbench.tsx src/components/ProjectWorkbench.test.tsx src/lib/project-package.ts src/lib/project-package.test.ts
  （无输出，exit 0）

$ npx tsc --noEmit
  （无输出，exit 0）
```

全量回归 `npx vitest run`：**177 passed / 1 failed（1434 passed / 1 failed）**。

唯一失败是 `src/components/AppProjectMode.test.tsx:201`
（`expect(container.querySelector('[role="alert"]')).toBeNull()` 收到一个空的
`.data-message--alert` 节点）。

- **cause 判定**：该文件与 F3b 四个允许文件无交集。把我的两个源文件 stash 掉、
  只留他人改动后单跑同一文件，**同样红**——先于本项存在，属并发进行中的
  D3 导入 alert / Tests 项范围，不在 F3b 所有权内，未修改。
- 剩余 177 个测试文件（含 `App.test.tsx`、`local-workspace-entry.test.tsx`、
  `server/index.test.ts`、`template-package.test.ts` 等所有涉及工程包的套件）全绿。
  全仓 grep 确认没有任何测试或产品代码依赖旧默认名字符串 `cengfan-project-<date>.json`。

## 4. 回滚说明

**变更性质：仅面向用户的下载文件名字符串；内容格式零变化。**

- **未变**：包体 JSON 结构、`PROJECT_PACKAGE_VERSION = 2`、`kind: "cengfan-project-package"`、
  `serializeProjectPackage` / `parseProjectPackage` / `restoreProjectPackage` 逻辑、
  `PROJECT_PACKAGE_FILE_ACCEPT`（仍是 `application/json,.json,.cengfan`）、资源包与模板子结构。
- **兼容性**：导入侧只看扩展名与 JSON 内容，**从不解析文件名语义**，因此历史导出的
  `cengfan-project-*.json`、`<项目名>-<日期>.json`、`.cengfan` 文件继续可导入，
  新旧文件可混用。无数据迁移，无需清理用户本地数据。
- **一处可见副作用**：导入后的项目名由 `projectPackageDisplayName(file.name)` 去掉后缀得到，
  所以工作台重新导入自己刚导出的包，项目名会显示为「项目名-工程包-日期」而不是「项目名-日期」。
  这是命名统一的预期结果，不是缺陷。
- **回滚方式**：`git revert` 本次提交即可，或手工还原两行——
  `ProjectWorkbench.exportProject` 改回 `` `${project.name}-${project.updatedAt.slice(0, 10)}.json` ``、
  `downloadProjectPackage` 默认参数改回 `` `cengfan-project-${pack.exportedAt.slice(0, 10)}.json` ``，
  并删掉两个测试文件里的新用例。**无状态、无持久化数据牵连，回滚即刻生效。**

## 5. 交接给 Docs / 后续轮

`USER_GUIDE.md` 与 `CHANGELOG.md` 不在 F3b 允许文件内，本项未改。Round 1 已写入的
"编辑器导出为「项目名-工程包-日期.json」"现在对**工作台导出**也成立，且
`downloadProjectPackage` 的默认名不再是 `cengfan-project-日期.json`。
文档若要精确，建议 Docs 项把描述从"编辑器导出"放宽为"导出工程包（编辑器与工作台）"，
并保留"历史 `cengfan-project-*.json` 仍可导入"这句（仍然为真）。
