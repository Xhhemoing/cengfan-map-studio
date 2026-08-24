# R5-opus-data — project-migration 拆分与导入边角收紧

模型：`claude-opus-5-thinking-high-fast`。分支：`cursor/agent-sota-polish-cbcd`（未提交，按指令不 commit）。

## 结果概览

`src/lib/project-migration.ts` 601 行 → 拆为 1 个门面 + 5 个模块，**非测试模块全部 ≤ 400 行**：

| 文件 | 行数 | 职责 |
| --- | ---: | --- |
| `project-migration.ts` | 136 | 公共入口 `migrateProjectPayload` + canvas/cards/guests 版本适配 + 组装 |
| `project-migration-helpers.ts` | 74 | 通用取值助手（`asRecord`/`asString`/`clamp`/`isOneOf`/`safePosition`/`stringFromSources`）与 `MigrationContext` |
| `project-migration-fields.ts` | 52 | 枚举词表与顶层字段适配（templateId / dataView / grouping / preset / visibleFields / noWrapFields / version） |
| `project-migration-students.ts` | 57 | 学生名单迁移 |
| `project-migration-map.ts` | 161 | v2 地图适配（provinceStyles、贴图统一尺寸、renderSource、mapScale 兼容位） |
| `project-migration-elements.ts` | 210 | 文本元素与素材元素适配（含 v1 `regionalAssets` → `assetElements`） |

拆分原则即「版本适配 vs 助手」：助手层（helpers/fields）不含任何版本分支；每个版本分支收敛到它所属的场景切片适配器里（`migrateCanvasSettings` / `migrateMapSettings` / `migrateCardSettings` / `migrateGuestSettings` / `migrateTextElements` / `migrateAssetElements`），统一通过 `MigrationContext { payload, style, defaults, isV2, options }` 取输入。

## 公共 API 稳定性

- `migrateProjectPayload(input, options)` 签名、返回 `ProjectSnapshot` 结构不变。
- `ProvincePosition`、`ProjectMigrationOptions` 仍从 `project-migration.ts` 导出（`export type { ... }` 转出），`project-document.ts` 无需改动，未改。
- 无 schema 变更、无导出格式变更、无支付/套餐相关内容。

## 行为改动（唯一一处，导入边角）

`migrateStudents` 原先要求 `name`、`university`/`school`、`city` **三项都是字符串**，否则整条记录丢弃。这会让「城市待定」「只填了姓名」等部分填写的行在保存/恢复后**静默消失**，与 Round 1 的「导入诚实」方向相反，且未知 schema 版本下风险更大。

现在：记录只要带有 `name`/`university`/`school`/`city` 中**任意一个字符串列**就保留，缺失列降级为空串；`null`、数组、无任何文本列的对象仍然跳过。这是集合的严格放宽——原本会保留的记录一条不少，语义不变；空城市不再走 `resolveCity`，保持空串交给 `data-health` 标为未解析（用户可见），而不是悄悄删人。

未做：HTML 粘贴相关一律未动（R4 已落地）。

## 测试

`src/lib/project-migration.test.ts` 新增 3 条（13 → 16）：

1. **最老快照仍可加载**：无 `schemaVersion`、`template` 而非 `templateId`、`dataView: "student"` 别名、文本用 `text` 字段且无 role、顶层 `regionalAssets`、`school` 字段 —— 断言 v1 画布尺寸、note 文本归位、素材按 `provincePositions` 落点且 scale 转成尺寸。
2. **未知版本不丢学生**：`schemaVersion: 99` + 未知 templateId/dataView，两名学生 id/可见性全保留，`version` 保留，输出 `schemaVersion: 2`。
3. **部分填写行不丢人**：覆盖上面那处导入边角与仍应跳过的非记录项。

## 验证（failure → cause → fix → recheck）

| failure | cause | fix | recheck |
| --- | --- | --- | --- |
| 无（拆分后首次运行即绿） | — | — | — |
| `tsc` 报 `src/lib/studio-journey.test.ts(89,90)` positions 可能 undefined | **非本代理产物**：共享工作树中另一代理新增的未跟踪测试；`CardSettings.positions` 在 HEAD 即为可选（`git show HEAD:src/lib/scene-document.ts` 第 243 行），与本次拆分无关 | 未修（不在本轮所有权内），交由该文件作者处理 | 过滤该文件后 `tsc -p tsconfig.app.json` 0 error |

命令与结果：

- `npx vitest run src/lib/project-migration.test.ts src/lib/project-document.test.ts src/lib/project-package.test.ts` → **3 files / 39 passed**（指定验收命令）
- `npx vitest run src/lib/map-render-source-migration.test.ts src/lib/province-texture-positioning.test.ts` → passed（另两处直接依赖 `migrateProjectPayload` 的测试）
- `npx vitest run src/lib` → **84 files / 719 passed**
- `npx vitest run src` → **156 files / 1303 passed**
- `npx eslint <6 个迁移模块 + 测试>` → 0 problem
- `npx tsc -p tsconfig.app.json --noEmit` → 仅上表所述他人文件的 2 处报错

## 交付与回滚

- 验收方式：上述 vitest 命令 + CI；行为改动只影响「原本会被丢弃的残缺学生行」，可在 UI 数据质量面板复核（残缺行现在会以未解析城市出现）。
- 回滚：还原 `src/lib/project-migration.ts` 到拆分前版本并删除 5 个 `project-migration-*.ts` 即可；无数据、导出格式、API 形状变更，旧项目文件无需迁移。
