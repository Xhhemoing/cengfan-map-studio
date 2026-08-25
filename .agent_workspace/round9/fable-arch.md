MODEL_SLUG: claude-fable-5-thinking-xhigh

# Round 9 — R9-fable-arch：拆分超大测试文件 `src/App.test.tsx`

## 目标与范围

`src/App.test.tsx` 原为 1930 行、116 个测试实例的单文件套件。本轮按 describe/主题拆成聚焦文件，不改产品行为、不动产品源码（仅测试与测试工具）。未触碰：DeliveryWorkspace、print-preflight、resource-health、server/、card-layout*、支付、china-universities/emblems 数据。未做任何 git commit/stash/branch 操作。

## 拆分结果（新文件均与 App.test.tsx 同目录同风格命名）

| 文件 | 行数 | 测试数 | 内容 |
| --- | --- | --- | --- |
| `src/App.test.tsx`（保留缩减） | 115 | 18 | delivery issue target 解析（9）＋外壳模式/legacy 开关/会话恢复（9） |
| `src/App.export.test.tsx` | 99 | 5 | 最终导出阶段：入口、SVG/PNG/工程包失败恢复、资源包确认弹窗 |
| `src/App.students.test.tsx` | 136 | 8 | 学生数据中心编辑、行↔图钉联动、粘贴文本导入 |
| `src/App.persistence.test.tsx` | 127 | 6 | 浏览器持久化边界：draft/mirror 权威性、强制保存、pagehide、无后台定时器 |
| `src/App.collaboration.test.tsx` | 219 | 5 | 增量协作房间：创建/加入、角色、只读、已关闭 |
| `src/App.import.test.tsx` | 159 | 5 | 工程包导入（背景/贴图/旧字体修复）＋素材面板与 SVG 画布导入 |
| `src/App.cards.test.tsx` | 168 | 9 | 展示框/板块样式：canonical scene、连接线、分组、位置冻结、参考卡样式 |
| `src/App.navigation.test.tsx` | 205 | 12 | 五阶段工作台导航：上传/地图/展示框工作台、排版问题定位 |
| `src/App.settings.test.tsx` | 266 | 10 | 全局设置全屏分区、字体排版应用、右侧属性面板、撤销/重做 |
| `src/App.workflow.test.tsx` | 289 | 23 | 原 describe「App workflow guidance」＋「Stage slot contract (T0)」「Stage overview (T2)」「Topbar action layering (T4)」整块搬移 |
| `src/App.shell.test.tsx` | 226 | 15 | 原 describe「Top workflow and left assistant rail」「Docked AI assistant integration」「Shell CSS contract」「Responsive editor shell」整块搬移＋顶栏动作 2 例 |
| `src/test-utils/app-harness.tsx` | 127 | — | 共享挂载/交互 helper（见下） |

合计 116 个测试实例，与拆分前完全一致（18+5+8+6+5+5+9+12+10+23+15 = 116）。**无合并、无删除、无新增测试**；每个 `it` 的主体逐字搬移（含 `30_000`/`40_000` 超时参数与原注释）。既有 `src/App.debug.test.tsx`（1 个测试）未改动。

## 共享 harness（`src/test-utils/app-harness.tsx`）

从原 App.test.tsx **逐字提取**：`mountApp`、`renderApp`、`renderPublicApp`、`renderLegacyApp`、`saveWorkspaceMirror`、`click`、`openRailAdvancedTab`、`openGlobalSettingsSection`、`openPeopleData`、`workflowStage`、`openGlobalData`、`leaveFocusedWorkspace`、`closeGlobalSettings`、`changeInput`、`changeSelect`。

唯一结构变化：原文件顶层的 `beforeAll`（预载 lazy 的 GlobalSettingsScreen / DataUploadWorkspace）与 `afterEach`（卸载 root、清 localStorage、`vi.useRealTimers`、`vi.restoreAllMocks`）包进导出函数 `installAppTestHarness()`，每个测试文件顶层调用一次。这样即使将来 vitest 配置改为 `isolate: false`（模块缓存跨文件复用），钩子注册也依然显式、逐文件生效，不依赖模块副作用。

## describe 重命名说明（测试全名变化，数量不变）

原 1330 行的巨型 describe「App student editing」被按主题拆到 8 个文件，各文件用能准确描述内容的 describe 名（如 `App final export stage`、`App incremental collaboration rooms`、`App browser persistence boundaries` 等）；原名本身已名不副实（内含协作、导入、全局设置等）。整块搬移的 7 个 describe（workflow guidance、T0/T2/T4、assistant rail、Docked AI、Shell CSS、Responsive shell）保持原名。影响：按「describe > it 全名」过滤历史 CI 记录时，原「App student editing」下的用例全名有变；`it` 标题全部未改。

## 验证纪律（failure → cause → fix → recheck）

1. **基线**：拆分前 `npx vitest run src/App.test.tsx` → 1 文件 116 passed（30.98s）。以此作为数量与通过性锚点。
2. **失败/偏差 → 根因 → 修复 → 复检**：拆分过程中自查发现一次逐字搬移偏差——`App.shell.test.tsx` 的「opens real advanced feature detail states from the rail」里把原 `closeGlobalSettings(container)` 手误展开成了内联 `click(...global-settings-done...)`。根因：从原文手抄时替换了 helper 调用。修复：恢复为从 harness 导入并调用 `closeGlobalSettings`，与原文一致。复检：该文件随全套件重跑通过（下条）。除此之外所有检查一次通过，无侥幸重试。
3. **拆分后全量复检**：
   - `npx vitest run src/App.test.tsx src/App.*.test.tsx`（11 个拆分文件 + App.debug）→ **12 files / 117 passed**（117 = 116 拆分套件 + 1 个既有 App.debug 测试）；仅拆分文件时 **11 files / 116 passed**，逐文件计数与上表逐一吻合（verbose 输出核对）。墙钟约 19s，快于拆分前 31s（文件级并行）。
   - `npx tsc --noEmit -p tsconfig.app.json` → 通过（`noUnusedLocals`/`noUnusedParameters` 严格模式下所有新文件导入精确）。
   - `npx eslint` 对 11 个测试文件 + harness → 0 error / 0 warning。

## 验收方式与回滚

- **验收**：复跑上面三条命令即可复现（vitest 116/117、tsc、eslint）。无产品行为改动，无导出格式/API 形状变化。
- **回滚**：纯增量+单文件缩减，`git checkout -- src/App.test.tsx && rm src/App.{cards,collaboration,export,import,navigation,persistence,settings,shell,students,workflow}.test.tsx && rm -r src/test-utils` 即恢复原状。
- 按本轮指令未做任何 commit；工作区中其他文件的改动属于其他 agent，本轮未触碰。
