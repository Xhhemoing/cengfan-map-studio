# Round 3 / Agent D — `fix-round1-issues-2c89` 逐条落地审计

- **审计对象:** `origin/cursor/fix-round1-issues-2c89` @ `8f2f3c7`，相对 `origin/main` 27 条 unique commit，共 76 个编号问题（I-01…I-14-05）。
- **审计基准:** `HEAD` = `cursor/merge-all-branches-e17a` @ `74d7d65`（审计开始时），`origin/main` 之后 494 条提交、已完成 App.tsx 拆分。
- **方法:** 对分支每个改动文件取 `origin/main...branch` 的 diff，抽出可判定的符号/字符串/常量作为标记，逐个在 HEAD 上检索实现与测试；不做 merge、不做 merge-tree。
- **结论概览:** 76 条中 **13 条已在 HEAD**（多为其它分支以不同实现覆盖）、**19 条缺失且可移植**、**44 条缺失但依赖 App.tsx / 多模块重接线**。本轮实际移植 **3 条**。

> 该分支是对**拆分前**的 App.tsx 单体写的。HEAD 的 `src/App.tsx` 只剩 923 行，编辑器状态与副作用已散到 `src/lib/editor-*.ts`、`src/components/editor/*`、`src/components/workspaces/*`。凡是分支改在 App.tsx 里的逻辑，在 HEAD 上都没有对应位置，必须重写而不是搬运——这是第三档存在的唯一原因。

---

## 一、已在 HEAD（13 条）

这些问题 HEAD 已修，多数不是同一份代码，而是别的分支用另一种实现覆盖了同一个用户症状。

| 编号 | 问题 | HEAD 上的实现 |
| --- | --- | --- |
| I-11 | 展示框样式阶段缺实时预览 | `ReferenceCardStyleWorkspace.tsx` 已内嵌 `PosterCanvas` |
| I-2-09 | 纯预览渲染红色虚线选择框 | `MapLayer.tsx:511` 用 `!exportMode && onSelectProvince` 门控，`MapDataLayer.tsx:390` 同理 |
| I-3-04 | 数据阶段丢失 XLSX 模板下载入口 | `DataUploadWorkspace` 不再传 `hideTemplateDownload`，并有专门的 `DataUploadWorkspace.template-download.test.tsx` |
| I-3-08（导出侧） | 导出文件名不带项目名 | 新增 `src/lib/export-filename.ts`，口径为「项目名-工程包-YYYY-MM-DD」（导入侧仍缺，见第二档） |
| I-4-04 | Excel 缺必填字段的行被静默丢弃 | `binary-import.ts` 的 `MISSING_ROW_FIELDS_REASON`，缺字段行进 `unparsed` |
| I-4-06 | 参考样式切不回标准/票券 | `card-templates.ts:135` 已显式写回 `presentation ?? "standard"` |
| I-4-07 | 项目菜单缺「导出 PNG」 | `ProjectMenu.tsx:184` 已有该动作 |
| I-5-04 | 加入方版本号停在 v0 | `useCollaborationRoom.ts:482/485` 两条分支都 `setRoomVersion` |
| I-6-04 | 暗色下实时预览标题不可读 | `--editor-surface-raised` 变量已定义并被 `--studio-surface` / `--surface-panel` 引用 |
| I-7-05 | 创建者 accessToken 经 GET 房间泄露 | `server/collaboration.ts:137` 的 `publicParticipant` 已显式挑 `id/displayName/role` |
| I-12-01 | Excel 缺必填列按位置回退错位解析 | `binary-import.ts:245` 整表降级为 `unparsed` 并给出补列提示 |
| I-14-01（lint 部分） | `forgetRoomAccess` 声明前访问 | HEAD 已是模块级函数（`useCollaborationRoom.ts:213`） |
| I-01（工作台侧） | 「新建项目」清空覆盖当前项目 | `ProjectWorkbench.tsx:162` 走 `createEmptyProject()` 新建记录（编辑器内的「新建项目」仍是清空确认，见第三档） |

另有 **I-03**（导出工程确认框在分阶段 UI 不渲染）属于**已用别的方式解决**：HEAD 的分阶段 UI 不再走确认对话框，`DeliveryWorkspace` 把「是否包含素材字体」做成了就地开关，`ExportProjectDialog` 只在旧版编辑器里挂载。原始诉求（导出前能选是否带资源）成立，不需要移植。

---

## 二、缺失且可移植（19 条）

判定口径：改动落在 ≤2 个文件、不依赖 App.tsx 的状态编排、能配套写出会红会绿的测试。

### 本轮已移植（3 条）

| 编号 | 问题 | 落地 | 提交 |
| --- | --- | --- | --- |
| I-8-01 | 协作删除增量同步产生幽灵操作，被删学生会被其他成员复活 | `collaboration-operations.ts` + 测试 | `8b73853` |
| I-3-08（导入侧） | 重新导入自家导出文件，项目名变成「项目名-工程包-2026-08-23」 | `project-package.ts` + `project-package-file-name.test.ts` | `b599da1` |
| I-2-02 | 新建项目一进交付检查就自报「水印超出画布安全边距」 | `scene-document.ts` + `layout-health-input.test.ts` | `d6dd0a8` |

三条的四步证据链见第四节。另有 `bcfbd52` 是为满足仓库的 `file-size-ratchet` 行数闸门做的收敛，不改行为。

### 未移植但可移植（16 条）

按性价比排序，标注影响面与需要动的文件。

| 编号 | 问题 | 需要动 | 备注 |
| --- | --- | --- | --- |
| I-2-04 | 地图表达切换会改写 `fillMode`，省份↔城市往返永久丢失默认渐变 | `catalog-usage.ts` + 其测试 | 需翻转 `catalog-usage.test.ts:116` 现有断言（HEAD 明确 pin 了 heat→`fillMode:"heat"`）。这是产品口径分歧，不是纯 bug，建议先定夺 |
| I-2-08 | 名单为空时步骤条 3/4 就预先显示 ✓ | `workflow-progress.ts` + 其测试 | 需翻转 `workflow-progress.test.ts:28/29/87` 三条断言，同样是被 HEAD 显式 pin 过的行为 |
| I-06 | 交付检查把「标题压在地图上」当遮挡问题报出来 | `layout-health.ts` + 其测试 | 只取「`back.kind === "map"` 时 continue」这半条即可，1 文件。另一半（中文 `label`）要所有调用方传名字，属第三档 |
| I-4-02 / I-6-05 | 目录自动带出的省份被误标为「省份覆盖」待检查项 | `data-health.ts`（+ `DataUploadWorkspace.tsx` 才算完整） | 新增 `isProvinceOverride`；只改 `data-health` 是 1 文件，连 chip 一起是 2 文件 |
| I-10-04 | 查看者拿到编辑邀请也升不了级：本地旧凭证优先于用户新填的 | `useCollaborationRoom.ts:621` + 其测试 | 单点改「显式填入的 inviteToken 优先」 |
| I-3-05 | 多色调色板按名字哈希取色，京/沪/粤撞色 | `MapDataLayer.tsx` | 改为按有数据省份的序号轮转，哈希留作兜底 |
| I-3-01 | 工作台项目卡片菜单不支持点外/Esc 关闭 | `ProjectCard.tsx`（+ `ProjectGrid.tsx` 传 `onCloseMenu`） | 与编辑器 `ProjectMenu` 同一套规则 |
| I-2-05 | 编辑器项目菜单不支持点外/Esc 关闭，外点还会穿透误触下层 | `ProjectMenu.tsx` | 需把 `<details>` 改成受控 `open`，改动集中在一个组件 |
| I-8-02（别名部分） | 「毕业去向」表头认不出是录取院校 | `binary-import.ts` 的 `HEADER_ALIASES` | 补「毕业去向/去向院校/去向学校/类型」四个别名，1 文件。按内容改判那部分（`refineIndexesByContent`）体量更大，可分开 |
| I-12-04 | OCR 文本抹掉冒号，带标签的行整行被当表头跳过 | `binary-import.ts` + `import-data.ts` | 两处配套：保留冒号 + `splitParts` 把冒号纳入分隔符，缺一会回归 |
| I-12-02 | 协作成员展示名取 `clientId` 前 6 字，恒为「collab」无法区分 | `ProjectMenu.tsx` | 改取尾部随机段，一行 |
| I-07（回弹部分） | 数值输入越界后无效文字残留在输入框 | `DeferredInput.tsx` | 一行 `setDraft(externalValue)`。**但这是共享组件，所有 DeferredInput 消费者的草稿行为都会变**，落地前要把现有相关用例过一遍 |
| I-2-07（去重部分） | 连续新建项目都叫「未命名项目」 | `project-store.ts` | 新增 `uniqueProjectName`；接到工作台是另一处改动 |
| I-5-05 | 6 处硬编码 `#1c4d43`，暗色下选中态不可读 | `styles.css` | 引入 `--editor-accent-ink` 变量替换 |
| I-7-04 | 硬编码 `#245d57` / `#40586b` / `#4d6072` 在暗色主题下不可读 | `styles.css` | HEAD 上这些色值仍有 37/1/8 处 |
| I-4-01 | 240px 右栏下导出「工程包」按钮被裁切 | `workflow-workspaces.css` | HEAD 是固定 `1fr 1fr 1fr`，改 `repeat(auto-fit, minmax(96px, 1fr))` |

**单独说明 I-09（替换全部取消后残留替换摘要）:** 改动确实只有 1 文件，但 HEAD 的 `DataWorkspace.import-recognition.test.tsx:208-209` **明确断言取消后仍显示「当前 1 条 / 新 2 条」**，且这条摘要被接进了 `DataMessageRegions` 的读屏 live region。移植等于推翻另一个分支刻意 pin 的无障碍行为，超出「小而独立」的范围，本轮不动，留作产品裁决项。

---

## 三、缺失但需要 App.tsx / 多模块重写（44 条，不移植）

这些问题的修复在分支上落在 App.tsx 的状态与副作用编排里，或需要跨 5 个以上文件重新接线。HEAD 拆分后没有对应位置，照搬只会把单体结构带回来。

**壳层与阶段编排（12 条）**
`I-02` 工作区会话按项目 id 隔离（HEAD 的 `loadWorkspaceSession` 有 `key` 参数但 `App.tsx:149` 仍传全局 key）、`I-04` 各阶段挂共享导出 ref + 数据阶段导出提示、`I-05` 全局状态条 StatusToast（HEAD 的 `statusMessage` 只在旧版右栏 `LegacyEditorInspector` 显示，分阶段 UI 完全看不到）、`I-08` 未上传图片时禁用「上传图片地图」、`I-10` 透明度滑条 historyGroup 合并、`I-12` 省份查找框换行、`I-2-03` 「无画布」导出错误跨阶段残留、`I-2-06` 左栏与抽屉共享 AI 面板 context、`I-2-07` 顶栏项目名就地重命名（HEAD `StudioTopbar` 完全没有项目名槽位）、`I-3-02` 项目名独立网格列、`I-3-06` 内容阶段添加文本框/备注入口、`I-3-09` 项目菜单合并两个「保存到本机」。

**数据面板写入拒绝链路（6 条）**
`I-10-03` `commitProject`/`commitProjectTransaction` 返回布尔、`I-11-01` 眼睛/全部显示被拒时就地报错、`I-11-02` 被拒文案按查看者/只读/已关闭区分、`I-7-02` 新增学生校验失败就近 `role=alert`、`I-4-05` 本地规则无命中时「已完成」与「未识别」矛盾、`I-10-02` 一键导入回显未识别计数。
这一串是同一条链：回调签名要从 `void` 改成 `boolean | void`，再从 `App.tsx` 一路穿到 `GlobalSettingsScreen` → `DataWorkspace`，牵动 6+ 文件与全部调用点，不是「小而独立」。

**AI 会话身份（9 条）**
`I-13-01` 空草稿不持久化、`I-13-03` 跨项目「已应用」幽灵、`I-13-04` / `I-14-05` 步骤标签中文化（分支新增 `agent-step-labels.ts` 151 行 + `SCENE_DOMAIN_PROPS` 对照表）、`I-14-01` 会话按项目 id 绑定、`I-14-02` 应用后可开新对话。
HEAD 的 `agent-conversation-store.ts` 仍是 `SCHEMA_VERSION = 1`、无 `projectKey`。分支把它升到 v2 并改写了 `loadAssistantConversationState` 的整个恢复分支，同时要求 `AgentAssistant` / `StudioAssistantRail` / `App` 三层透传 `projectKey`——属于带持久层迁移的架构改动。

**协作身份与房间生命周期（4 条）**
`I-12-03` clientId 持久化 + 换邀请就地更新角色（HEAD 服务端已有 `/members` 刷新端点，但客户端没有 `refreshRoomMember`，且 `join` 分支只更新 `lastSeenAt` 不更新 role）、`I-13-02` 协作浮层回填最近房间码、`I-14-03` 关房全路径清凭证、`I-14-04` 导出工程对话框支持 Esc。前三条都要新增 `app-constants` 键位并改 `useCollaborationRoom` 的多条路径。

**画布渲染与度量（7 条）**
`I-5-03` / `I-9-01` 空嘉宾占位与空嘉宾框不进 PNG/SVG、`I-6-02` 手动定位卡片作为占位障碍、`I-6-03` 抽 `card-metrics` / `guest-metrics` 共享真实渲染尺寸（分支新增 208 + 127 行）、`I-6-01` ContentLayoutRail 透传素材删除/复制/层级、`I-5-06` `mapStyleAssetPanelProps` 补 `onCreateDecoration`、`I-5-01` / `I-5-02` 数据质量与表头识别的样式。
`export-poster.ts` 那半条（剔除 `data-editor-placeholder`）单独看只有 1 行，但**没有 PosterCanvas 侧打标记就完全无效**，而 HEAD 的 `PosterCanvas.tsx` 相对分支已被重写（分支在该文件 −400 行），必须重做而不是搬。

**导入提示（4 条）**
`I-9-02` / `I-10-01` `parseLocationScope` 返回可读提示并在确认面板与一键导入两条路径回显、`I-4-03` 表头行改判、`I-8-02` 按内容改判去向列。
其中类型链要从 `import-data.ts` 的 `ImportCandidate.warnings` 一路改到 `ai-client.ts` 的 `ParseDataResult`、`DataWorkspace` 的 `reviewRows` 与确认面板计数——分支自己就为此打了一条修 tsc 的补丁（`49c2f63`）。

**其它（2 条）** `I-01`（编辑器内「新建项目」仍是清空确认）、`I-7-01` 刷新丢失未保存编辑（分支新增 `project-draft-mirror.ts` 82 行 + `PROJECT_AUTOSAVE_DEBOUNCE_MS` 防抖落盘 + pagehide 镜像，全部挂在 App 的保存生命周期上；HEAD 对应逻辑在 `editor-save-lifecycle.ts`，形状不同）。

---

## 四、本轮移植的验证证据链

按 AGENTS.md 的 failure → cause → fix → recheck 记录。

### I-8-01 协作幽灵操作（`8b73853`）

1. **failure —** 新增 3 条用例（幽灵 upsert / 数组 undefined / 删除后不复活）。在原实现上 `git checkout src/lib/collaboration-operations.ts` 后跑，3 条全红（`3 failed | 12 passed`）。
2. **cause —** `structurallyEqual` 与 `diffCollaborationDocument` 的 `visit` 都用 `Object.hasOwn` 判定键存在。序列化会丢掉值为 `undefined` 的键，所以文档经 restore 往返后与 baseline 只差这类键时被判成真实改动，产生幽灵 `array-upsert`；该 upsert 在 rebase 重放时把远端已删除的学生复活并回传。
3. **fix —** 两处统一改成 JSON 语义：值为 `undefined` 的键视同不存在，数组里的 `undefined` 视同 `null`。HEAD 原有的键序无关比较与循环引用保护未动。
   > 第一版只改了 `structurallyEqual`，数组两条转绿但对象那条仍报幽灵 `delete`——因为 `visit` 是另一处独立的键存在性判定。补上 `visit` 后才全绿。
4. **recheck —** `collaboration-operations` / `collaboration-convergence` / `collaboration-send` 共 31 条通过。

### I-3-08 导入侧还原项目名（`b599da1` + `bcfbd52`）

1. **failure —** 以 `projectPackageFileName` 的真实输出作输入的往返用例报 `expected '三年二班蹭饭图-工程包-2026-08-24' to be '三年二班蹭饭图'`。
2. **cause —** HEAD 补齐了导出侧命名（`export-filename.ts`）却没动导入侧，`projectPackageDisplayName` 只剥扩展名。
3. **fix —** 剥掉与导出侧互逆的 `-[工程包-]YYYY-MM-DD` 后缀，兼容早期只带日期的文件；名字本身是日期串（无前导连字符）时不误剥。
4. **recheck —** 相关 4 个测试文件 49 条通过。

### I-2-02 默认水印越界（`d6dd0a8`）

1. **failure —** 新增用例跑真实的 `buildProjectLayoutHealthInput` + `checkLayoutHealth`，报 `text-watermark` overflow。
2. **cause —** 体检口径下水印底边 = `y + fontSize * 0.3` = 958.6，超过 `height - safeMargin` = 1000 − 48 = 952。
3. **fix —** `y` 由 955 调整为 948（底边 951.6）。
4. **recheck —** 把 `y` 改回 955 该用例立即转红，改回 948 转绿；layout-health / layout-health-input / scene-document / project-document 共 43 条通过。

### 闸门修复（`bcfbd52`）

1. **failure —** `npm test` 的 `scripts/file-size-ratchet.test.ts` 两条红：`project-package.ts` 从 397 涨到 405 越过 400 行硬上限；`project-package.test.ts`(+11) 与 `scene-document.ts`(+2) 超过 allowlist 记录值。
2. **cause —** 仓库对每个文件记了只降不升的行数闸门，我的三条移植同时顶到了硬上限与 allowlist。
3. **fix —** 不改行为也不动 allowlist：`project-package.ts` 注释与正则内联回到 399 行；导出名往返用例移到本就负责导出文件名的 `project-package-file-name.test.ts`；`scene-document.ts` 去掉说明性注释，理由与不变量交由 `layout-health-input.test.ts` 的用例承担。
4. **recheck —** ratchet 与 5 个相关测试文件共 70 条通过。

### 全量

```
npx tsc -b --pretty false   → 0 error
npm run lint                → 0 error，5 warning（均为改动前既有，不在本次改动文件内）
npm test                    → 351 passed | 2 skipped (353 files)，2411 passed | 2 skipped (2413 tests)
```

---

## 五、交付与回滚

- **验收方式:** 本轮 3 条移植都是纯逻辑改动，已由单元测试覆盖，且每条都验证过「回退实现即转红」。合入后跑 CI 的 `tsc + lint + vitest` 即为验收；不需要手动网页验收。
- **破坏性变更:** 无。
  - `projectPackageDisplayName` 改的是**导入时的显示名推导**，不改导出格式、不改包结构，旧包与新包都能导入。
  - 协作 diff 只减少操作条数（不再发幽灵 upsert / delete），线上协议形状不变，与未升级的成员互通不受影响。
  - 水印默认 `y` 只影响**新建**项目；已存项目的文本坐标存在工程数据里，不会被改写。
- **回滚方案:** 三条互不依赖，可单独 `git revert`。若同时回滚，按 `bcfbd52 → d6dd0a8 → b599da1 → 8b73853` 逆序 revert 即可回到 `74d7d65`；`bcfbd52` 只做行数收敛，单独 revert 会让 ratchet 重新报红，不要跳过它。
- **本次未做:** 未 merge 该分支、未 push、未开始任何 merge/rebase。分支上剩余 73 条问题的处置见第二、三档。

## 六、给下一轮的建议

1. **先做第二档里的 6 条纯 lib 改动**（I-06 半条、I-4-02、I-10-04、I-8-02 别名、I-2-07 去重、I-12-02），都是 1 文件 + 1 测试，互不冲突，可并行分派。
2. **I-2-04 与 I-2-08 需要产品先定夺**——它们要翻转 HEAD 上被显式 pin 的断言，属于两个分支的口径分歧而非缺陷，不该由执行方单方面决定。I-09 同理。
3. **第三档里最值钱的是 AI 会话身份那 9 条**（跨项目串会话是用户最容易撞上的），但它带持久层 v1→v2 迁移，应该单独立项并自带迁移测试，不要混在别的合并里。
4. **不要再尝试整支 merge 这条分支。** 19 个冲突文件 / 74 个 hunk 的预测是对着拆分前的形状算的；HEAD 拆分后 `App.tsx`、`PosterCanvas.tsx`、`binary-import.ts` 三个重灾区都已改写，实际冲突只会更难解，而且解完会把单体结构带回来。逐条移植是唯一正确的路径。
