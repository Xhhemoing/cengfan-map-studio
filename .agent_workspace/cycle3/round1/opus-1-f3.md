# F3 · 工程包文件名走 `buildExportFileName({ kind: "project" })`

## 结论

`usePosterExport.exportProjectPackage` 的下载文件名从写死的 `cengfan-project-<YYYY-MM-DD>.json` 改为
`buildExportFileName({ projectName: getProjectName?.(), kind: "project", date: pack.exportedAt.slice(0, 10) })`，
即 `<项目名>-工程包-<YYYY-MM-DD>.json`。后缀仍是 `.json`，包内容与序列化零改动，
`PROJECT_PACKAGE_FILE_ACCEPT`、`parseProjectPackage`、`projectPackageDisplayName` 一行未动。

## 改动文件

| 文件 | 改动 |
|------|------|
| `src/lib/usePosterExport.ts` | `exportProjectPackage` 内 `const fileName = ...` 由字面量模板改为 `buildExportFileName(...)`；`date` 显式取 `pack.exportedAt.slice(0, 10)`，保证文件名日期与包内 `exportedAt` 同源（不是第二次读时钟）。`buildExportFileName` 早已 import，无新增依赖。`downloadProjectPackage(pack, fileName)`、`setLastExportFileName(fileName)`、状态机与 status 文案均未变，展示名=落盘名的 F2 不变量继续成立。 |
| `src/lib/export-filename.test.ts` | 新增 3 条表格用例（空名回退、非法字符清洗、`project` 忽略 `scale`）+ 2 个用例：缺省 `date` 回退当天；6 组输入下断言输出恒匹配 `/^[^\\/]+-工程包-2026-08-24\.json$/u`（后缀锁）。 |
| `src/lib/usePosterExport.test.tsx`（新增） | 2 个 hook 级用例，`vi.mock("./project-package")` 只替换 `downloadProjectPackage`（其余走 `importOriginal`），`createRoot` + `flushSync` 托管 hook，`vi.setSystemTime("2026-08-24T09:30:00Z")` 固定日期。断言 ① `downloadProjectPackage` 第二实参 = `高三3班-工程包-2026-08-24.json` 且 `lastExportFileName` 相同；② 空白项目名回退 `我的毕业去向图-工程包-2026-08-24.json`，并用 `fileMatchesAccept(new File([...], fileName), PROJECT_PACKAGE_FILE_ACCEPT)` 断言 `true`——这就是"改名后仍可被导入入口选中"的机器可查证据。 |

`export-filename.ts` 未改：`kind: "project"` 分支本来就产出 `${base}-工程包-${date}.json`，规则已满足，不需要为测试做任何调整。

## 验证（failure → cause → fix → recheck）

1. **failure**：首跑 `npx vitest run src/lib/usePosterExport.test.tsx` → `PARSE_ERROR ... Expected ',' or '}' but found 'Identifier'`，`usePosterExport.test.tsx:14`，0 test。
2. **cause**：我把 hook 与其类型写在 top-level await 的动态 `import()` 解构里 —— `const { usePosterExport, type UsePosterExportOptions } = await import(...)` 在解构模式里用 `type` 修饰符不是合法语法（`type` 只能出现在 import 声明中）。动态 import 本身也没必要：`vi.mock` 会被提升到静态 import 之前，静态导入拿到的就是 mock。
3. **fix**：改回静态 `import { downloadProjectPackage, PROJECT_PACKAGE_FILE_ACCEPT } from "./project-package"` 与 `import { usePosterExport, type ... } from "./usePosterExport"`，`vi.mock` 放在 import 之后（提升语义不变）。
4. **recheck**：同一条命令重跑 → `Test Files 1 passed, Tests 2 passed`。

其余检查（均为一次通过，命令与输出）：

- `npx vitest run src/lib/export-filename.test.ts` → **21 passed**（改前 16）。
- `npx vitest run src/lib/project-package.test.ts src/components/workspaces/DeliveryWorkspace.test.tsx` → **19 passed**（确认包格式与交付面板成功条不受影响）。
- `npx tsc --noEmit -p tsconfig.app.json` → 退出码 0，无输出。
- `npx eslint src/lib/usePosterExport.ts src/lib/usePosterExport.test.tsx src/lib/export-filename.test.ts` → 退出码 0，无输出。

**反向证伪**：新 hook 用例在旧实现下必然红——旧代码产出 `cengfan-project-2026-08-24.json`，与断言的 `高三3班-工程包-2026-08-24.json` 不等，所以这两条不是恒真断言。

## 验收方式

- **手动**：打开任一项目 → 项目菜单「导出工程」→ 勾选/不勾选资源包均可 → 下载文件名应为 `<项目名>-工程包-<今天>.json`；交付面板成功条显示同一文件名；把该文件立刻从「导入工程」投回去，应正常识别并弹出替换确认。未命名/空白名项目回退 `我的毕业去向图-工程包-<今天>.json`。
- **自动**：上列四条命令，CI 走 `npm test` + `npm run lint` 即覆盖。

## 破坏性与回滚

**面向用户的文件名变更（轻度破坏性）**：仅下载文件名字符串变化。包体 JSON、`PROJECT_PACKAGE_VERSION`、`serializeProjectPackage` / `parseProjectPackage` / `restoreProjectPackage` 全未触碰，历史导出的 `cengfan-project-*.json` 与 `.cengfan` 文件继续可导入（导入侧按扩展名与内容判定，从不解析文件名语义）。`ProjectWorkbench.exportProject` 走的是自己的 `${project.name}-${updatedAt}.json`，本次不涉及，两处命名仍不一致——若要统一属另一项，不在 F3 范围。

**回滚**：把 `src/lib/usePosterExport.ts` 里那 5 行还原为

```ts
const fileName = `cengfan-project-${pack.exportedAt.slice(0, 10)}.json`;
```

并删除 `src/lib/usePosterExport.test.tsx` 与 `export-filename.test.ts` 中新增的 project 用例即可，无数据迁移。

## 边界声明

未触碰 `App.tsx`、`DeliveryWorkspace` 印刷尺寸/mm/dpi、任何支付相关文件、`PROJECT_PACKAGE_FILE_ACCEPT`、`parseProjectPackage`。未提交、未推送。
