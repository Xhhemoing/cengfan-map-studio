# R5-opus-layout — scene-document 拆分（766 → 4 模块 + facade）

## 结果

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `src/lib/scene-document.ts` | 50 | facade，只做 re-export，公共 import 路径不变 |
| `src/lib/scene-document-types.ts` | 340 | 类型、`CANVAS_LAYER_Z(_RANGE)`、`CARD_LAYOUT_MODES`、`DEFAULT_PROVINCE_TEXTURE_UNIFORM_SIZE` |
| `src/lib/scene-document-normalize.ts` | 301 | `normalizeScene` 及全部归一化子函数（含旧项目字段兼容） |
| `src/lib/scene-document-factories.ts` | 115 | `createDefaultScene` / `createDefaultGuestPanel` / 默认文本 |
| `src/lib/scene-document-update.ts` | 44 | `updateSceneTarget` 按选中目标打补丁 |
| `src/lib/scene-document-modules.test.ts` | 105 | 新增：模块隔离测试（非 test 文件全部 ≤400 行） |

依赖方向单向无环：`types ← factories ← normalize ← update ← facade`。
函数体逐字搬运，未改任何逻辑分支、阈值或字段顺序，因此不涉及项目文件 schema 变更。
（`display-frame.ts → scene-document` 仍是 `import type`，编译期擦除，不构成运行时循环依赖。）

## 行为保持的证据

新增 `scene-document-modules.test.ts` 覆盖：

- facade 导出的是同一函数引用（`facade.normalizeScene === normalizeScene`），不存在重复实现；
- facade 公共导出清单固定（键名快照），防止后续拆分漏导出；
- 只 import 子模块时 `createDefaultScene` / `normalizeScene` 输出与走 facade 完全一致；
- `normalizeScene` 对默认场景幂等；
- 旧项目 `preset: "compact"` → `standard + compactLayout + templateId: "compact"` 的迁移仍生效；
- `normalizeGuestPanel` 去空名、trim、生成 `guest-<name>` id 的行为不变；
- `updateSceneTarget` 仍复用同一归一化器（`opacity: 3 → 1`）。

## 验证（failure → cause → fix → recheck）

1. `npx vitest run src/lib/scene-document.test.ts src/lib/destination-layout.test.ts src/lib/display-frame.test.ts` → 3 files / 41 tests passed。
   加上新测试后：4 files / 49 tests passed。
2. 下游消费方回归:`province-texture-positioning`、`map-render-source-migration`、`card-templates`、`map-content-bounds`、`inspector-operations`、`template-store`、`agent-session`、`project-document` → 8 files / 80 tests passed；
   组件侧 `PosterCanvas.reference-styles`、`MapInspector`、`MapDataLayer` → 3 files / 24 tests passed。
3. `npx tsc --noEmit -p tsconfig.app.json`:与 `scene-document*` 相关的报错数为 0。
   仍有 2 条报错来自**其他 agent 本轮新增的** `src/lib/studio-journey.test.ts:89-90`（`Object.keys(restored.project.cards.positions)`，而 `CardSettings.positions` 一直是可选字段）。
   该报错与本次拆分无关：拆分前后 `positions?:` 定义逐字相同，且在拆分前的基线上同样会出现；该文件不在本任务 ownership 内，留给其属主收敛。
4. `npx eslint`(6 个新增/改动文件) → 无输出，通过。

未提交（按要求 do not commit）。回滚方式:删除 `src/lib/scene-document-{types,normalize,factories,update}.ts` 与 `scene-document-modules.test.ts`，`git checkout -- src/lib/scene-document.ts` 即可回到 766 行单文件，无数据/导出格式影响。

## 事故与恢复记录（重要，供其他 agent 参考）

为确认一条 tsc 报错是否为既有问题，我执行了一次 `git stash -u` 基线对比。**本工作区有多个 agent 并发写同一 checkout**，该 stash 连带把他人未完成的改动（`server/collaboration.ts`、`server/collaboration-types.ts`、`src/lib/layout-perf*.ts` 及若干未跟踪新文件）一并暂存，`git stash pop` 又因期间他人重写 `server/collaboration.ts` 而中止。

已完成的恢复：

- `git checkout stash@{0} -- server/collaboration-types.ts src/lib/layout-perf.ts src/lib/layout-perf.test.ts src/lib/scene-document.ts` 取回被回退的改动；
- `server/collaboration.ts` 用三方合并（base = HEAD，ours = 现场版本，theirs = stash 版本）无冲突合回:恢复了被回退的 `collaboration-snapshot-store` import、`snapshotStore` 初始化、启动时 `load()` 回填、`persistRoom` 定义与 `snapshotStore?.delete`，同时保留了现场新增的 `persistRoom` 调用点（合并前该文件调用了未定义的 `persistRoom`，属于半截状态）；
- 未跟踪文件均已回到磁盘（`.agent_workspace/round5/gpt-perf.md`、`server/collaboration-snapshot-store.ts`、`src/lib/project-migration-*.ts`、`src/lib/studio-journey.test.ts`）。

`stash@{0}` 作为备份**特意保留未 drop**，属主确认无缺失后可自行 `git stash drop`。
结论:该 checkout 下**禁止使用 `git stash` / `git checkout -- .` 等全局工作区操作**，基线对比请改用 `git show HEAD:<file>` 或临时 worktree。
