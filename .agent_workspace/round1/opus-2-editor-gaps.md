# R1-O2：编辑器「其他部分」可落地缺口调研

> 角色：Round 1 研究员 R1-O2（仅调研，不实现、不提交）
> 范围：核心画布 / PosterCanvas 布局算法之外的产品与编辑器面
> 基线：分支 `cursor/feature-expansion-research-c710`，HEAD `3811e17`
> 读过：`function.md`、`frontUI2.md`、`USER_GUIDE.md`、`PRODUCT.md`、`CONTRIBUTING.md`、`README.md`、`docs/开源与收费边界.md`、`docs/宣发/*`、`docs/superpowers/plans+specs`、`.agents/skills/*`、`src/App.tsx`、`src/components/**`、`src/lib/**`、`server/collaboration.ts`

---

## 0. 结论摘要

三条最值得本轮做的判断：

1. **产品的「社区/宣发闭环」在应用内是断的。** `docs/宣发/反馈收集SOP.md:11` 自己写着入口包括「应用内『反馈』（若已做）」——事实是没做：`rg "帮助|反馈|意见|github"` 在 `src/**`、`index.html`、`src/styles.css` 里**零命中**。`.github/ISSUE_TEMPLATE/{bug,feature,feedback}.yml` 与 `USER_GUIDE.md` 都已就绪，缺的只是编辑器里那一个入口。这是投入产出比最高、且与本轮「配合社区/宣发」主题最贴的缺口。
2. **数据导入的关键抓手在主路径上被关掉了。** `src/App.tsx:1668` 给数据阶段传了 `hideTemplateDownload: true`，于是 `src/components/DataWorkspace.tsx:504` 的「下载 XLSX 模板」按钮在**用户实际走的那条路径上不可见**；唯一还显示它的 `GlobalSettingsScreen.tsx:286` 路径已经近乎不可达。而 `USER_GUIDE.md:81` 的第一条 FAQ 恰好就是「Excel 导入失败？检查字段名」。改一个布尔值就能补上。
3. **仓库里有两块「按计划做完但已被架空」的界面**：`src/components/WorkflowGuide.tsx`（313 行 + 测试）和 `src/components/GlobalDataScreen.tsx` + `src/components/global-data/*`，非测试引用为 0。它们仍然吃 lint / 测试时间，也会误导后续 agent。

另外必须先说清楚**不要碰**的部分（详见 §4）：`src/lib/card-layout.ts`、`src/lib/connector-geometry.ts`、`src/components/canvas/PosterCanvas.tsx` 的布局与渲染语义，以及任何支付/套餐/结算（`docs/开源与收费边界.md:52`）。

---

## 1. 缺口清单

侵入性口径：**低** = 单文件/单组件 + 新增测试；**中** = 跨 2–4 个模块或需要改数据契约的可选字段；**高** = 触及服务端契约、工程包格式或布局算法。

### 1.1 社区 / 帮助 / 反馈

#### G1 应用内没有「提意见 / 反馈」入口

| 项目 | 内容 |
|---|---|
| 当前文件 | `src/components/StudioTopbar.tsx:36-41`（topbar action 插槽）、`src/components/ProjectMenu.tsx:89-193`（项目菜单四个 section）、`src/components/workbench/WorkbenchHeader.tsx:16-24` |
| 缺失行为 | 编辑器与项目工作台都没有指向 `https://github.com/Xhhemoing/cengfan-map-studio/issues/new/choose` 的入口，也没有区分「使用者 / 开发者」的分流文案 |
| 用户影响 | `docs/宣发/反馈收集SOP.md:9-13` 设计的三类入口只落地了两类；宣发把用户引到产品后，产品把用户丢回 GitHub 搜索。开发者漏斗的主转化器（SOP §4「意见变成了什么」）缺上游 |
| 可测性 | 高。组件测试断言 `aria-label`、`href`、`target="_blank"`、`rel="noopener noreferrer"`；关键断言是**不预填任何工程/名单内容**（PII 红线，见 `.github/ISSUE_TEMPLATE/bug.yml:9`） |
| 侵入性 | 低。新增一个纯展示组件 + 挂到 `StudioTopbar` 的 `projectActions` 与 `WorkbenchHeader` |

#### G2 没有应用内帮助 / 用户指南 / 快捷键说明

| 项目 | 内容 |
|---|---|
| 当前文件 | 无。`USER_GUIDE.md` 只存在于仓库；`frontUI2.md:863` 明文规定「所有快捷键只在 tooltip 或帮助中展示」，但「帮助」这个面从来没建 |
| 缺失行为 | 撤销/重做/Esc 等快捷键（`function.md:394` 记录已实现）无处可查；`USER_GUIDE.md:7-20` 的「3 分钟上手」在产品里没有对应物 |
| 用户影响 | 班主任/班委是非技术用户，`npm run dev` 之后没有任何自解释入口；`USER_GUIDE.md:12` 承诺的「首次进入自动放入示例」只解决了一半 |
| 可测性 | 高。抽屉打开/Esc 关闭/焦点返回触发按钮，`src/components/StudioEditorShell.tsx:111-134` 已有 MUI `Drawer` 的现成范式与测试写法 |
| 侵入性 | 低–中。新增抽屉组件；内容建议为静态常量（快捷键表 + 五步流程 + 指南外链），不引入 markdown 渲染依赖 |

#### G3 示例数据 / 示例工程在应用内拿不到

| 项目 | 内容 |
|---|---|
| 当前文件 | `docs/示例数据/毕业名单-脱敏.csv`、`docs/示例数据/示例项目.cengfan` 均不在 `public/`（`public/` 只有 `logo.*`、`qrcode-github.png`、`emblems/`）；根目录 `蹭饭图-学生数据导入模板.xlsx` 同理 |
| 缺失行为 | 用户无法在应用内「载入示例名单」试一次导入；示例项目只在 store 为空时自动播种（`src/components/ProjectWorkbench.tsx:69-72`），删光之后没有「重新生成示例」入口 |
| 用户影响 | 宣发硬规则要求「用户主 CTA 不是 `git clone`」（`.agents/skills/cengfan-promo/SKILL.md:12`），但没有 Demo 时，产品内也没有零门槛试用路径 |
| 可测性 | 中。工作台按钮 + `createSampleProject()` 调用可用内存 store 断言（`src/components/ProjectWorkbench.test.tsx` 已有同类测试） |
| 侵入性 | 低 |

### 1.2 数据导入 / 模板下载

#### G4 XLSX 模板下载在数据阶段被隐藏（回归级）

| 项目 | 内容 |
|---|---|
| 当前文件 | `src/App.tsx:1668` `hideTemplateDownload: true`；按钮定义在 `src/components/DataWorkspace.tsx:504-511`，实现在 `downloadImportTemplate`（`DataWorkspace.tsx:238-250`）与 `src/lib/binary-import.ts` 的 `createImportTemplateSheets` |
| 缺失行为 | 用户在「数据与素材」阶段看不到模板下载；仅 `GlobalSettingsScreen.tsx:286` 那条已被 `frontUI2.md:891` 判定要撤销的并行导航里还留着 |
| 用户影响 | 直接对应 `USER_GUIDE.md:81` 的头号 FAQ「Excel 导入失败」。`.agents/skills/cengfan-data-import/SKILL.md:10-13` 要求走「现有下载入口」，产品却把它藏了 |
| 可测性 | 高。`src/components/workspaces/DataUploadWorkspace.test.tsx` 加一条 `aria-label="下载学生数据 XLSX 模板"` 存在性断言即可 |
| 侵入性 | 极低（删一个 prop，或把按钮提到 `data-upload-workspace__header`） |

#### G5 Excel 表头识别只能「看」不能「改」

| 项目 | 内容 |
|---|---|
| 当前文件 | `src/components/DataWorkspace.tsx:517-536`（识别回显）、`src/lib/binary-import.ts`（`parseExcelWorkbookRows` / `columnMappings` / `unmappedHeaders` / `missingRequiredFields`） |
| 缺失行为 | 识别错列或缺必填列时，用户只能回 Excel 改表头重传，不能在界面上把「未使用」的列手工指派给 `name/university/city/locationScope` |
| 用户影响 | 学校导出的名单表头千奇百怪；一次识别失败＝一次流失。SKILL §3 只要求「可读错误」（已满足），但修复路径依赖用户自己改源文件 |
| 可测性 | 高。映射覆盖是纯函数：给定 matrix + 用户覆盖 → 候选列表；`src/lib/binary-import.test.ts` 已有表头别名/缺列用例可扩展 |
| 侵入性 | 中（纯函数加一个 `overrides` 参数 + 一段 UI） |

#### G6 导入结果消息不进无障碍状态区

| 项目 | 内容 |
|---|---|
| 当前文件 | `src/components/DataWorkspace.tsx:577-578`：`<p className="panel-note data-message">{message}</p>`，无 `role="status"` / `aria-live` |
| 缺失行为 | 「已导入 N 条 / 识别失败 / 模板下载失败」对屏幕阅读器不可感知 |
| 用户影响 | 违反 `frontUI2.md:874-877`（导入/导出/上传必须有明确进行中、成功、失败状态） |
| 可测性 | 高（断言 role） |
| 侵入性 | 极低 |

### 1.3 交付 / 导出 / 打印

#### G7 导出文件名固定，不含项目名与倍率

| 项目 | 内容 |
|---|---|
| 当前文件 | `src/lib/usePosterExport.ts:69`（`我的毕业去向图.svg`）、`:146`（`我的毕业去向图.png`）；对照 `src/components/ProjectWorkbench.tsx:157` 的工程包导出已经用了 `${project.name}-${日期}` |
| 缺失行为 | 三种风格连导会互相覆盖（浏览器自动加 `(1)`）；文件名不带 `2x`、不带班级名 |
| 用户影响 | `USER_GUIDE.md:111`「导出 3 种风格供投票」是明写的班委场景，当前会得到三个难以分辨的文件 |
| 可测性 | 高。把文件名生成抽成纯函数并断言（`src/lib/export-poster.ts` 旁） |
| 侵入性 | 低（需要把项目名传进 `usePosterExport`，App 已持有 `projectNameRef` 类信息） |

#### G8 导出完成后没有结果条

| 项目 | 内容 |
|---|---|
| 当前文件 | `src/lib/usePosterExport.ts:147-148` 仅 `setExportState("success")` + 一句 status；`src/components/workspaces/DeliveryWorkspace.tsx:110` 只在 `error` 时渲染提示块 |
| 缺失行为 | `frontUI2.md:637-643` 规定成功后保留上下文并显示轻量结果条「已导出 xxx-2x.png ［再次导出］」 |
| 用户影响 | 用户不确定文件到底出没出、出到哪；只能去下载目录找 |
| 可测性 | 高（组件测试断言成功态渲染 + 再次导出回调） |
| 侵入性 | 低 |

#### G9 只有屏幕像素预设，没有打印尺寸口径

| 项目 | 内容 |
|---|---|
| 当前文件 | `src/lib/grid.ts:3-8`（4 个预设：1080 方图 / 1500×1000 / 1920×1080 / 1080×1920）、`src/components/inspector/CanvasInspector.tsx:38-54`、`src/components/workspaces/DeliveryWorkspace.tsx:113`（只显示最终像素） |
| 缺失行为 | 没有 A4/A3/展板等物理尺寸预设，也没有「当前倍率下等效多少 mm @300dpi」的换算提示 |
| 用户影响 | `USER_GUIDE.md:20/105` 把「直接打印 / 做成展板」当主卖点，用户却无法判断 1500×1000@2× 够不够印 A3 |
| 可测性 | 高（px↔mm@dpi 是纯函数） |
| 侵入性 | 低。**注意边界**：只做尺寸口径提示，不做印刷服务（`docs/开源与收费边界.md:29`「不做印刷厂业务、官方印刷套餐」） |

#### G10 交付阶段缺「保存到本机 / 协作与迁移」，项目菜单反而重复导出

| 项目 | 内容 |
|---|---|
| 当前文件 | `src/components/workspaces/DeliveryWorkspace.tsx:117-121` 只有 PNG/SVG/工程包；`src/components/ProjectMenu.tsx:96-105` 仍提供 PNG 倍率 + 导出 SVG |
| 缺失行为 | `frontUI2.md:618-635` 规定交付第二组＝保存到本机/导出工程/导入工程，第三组＝协作与迁移折叠区；`frontUI2.md:912` 明确「项目菜单只放工程级打开/新建/导入，不再重复 PNG/SVG」 |
| 用户影响 | 同一动作两处入口、状态不同步；协作只能在项目菜单深处找到 |
| 可测性 | 中（组件测试 + 需同步改现有断言） |
| 侵入性 | 中（挪入口会牵动多个既有测试选择器） |

#### G11 水印是硬编码文本，没有集中开关

| 项目 | 内容 |
|---|---|
| 当前文件 | `src/lib/scene-document.ts:410` 默认文本元素 `text-watermark`（内容 `CENGFAN MAP STUDIO`）、`scene-document.ts:16` role 定义、`src/styles.css` `.watermark` 样式 |
| 缺失行为 | 只能在画布上选中那行小字改（`TextInspector`）；交付阶段没有「水印：显示/隐藏/改为班级署名」的一键位置 |
| 用户影响 | 想换成「XX 中学 2026 届」或去掉时找不到；这是每张成品都要做一次的动作 |
| 可测性 | 高（现有文本元素模型，patch 断言即可） |
| 侵入性 | 低（不改数据模型，只加一个针对既有 role 的快捷控件） |

### 1.4 协作角色与非账号身份

#### G12 成员只显示 clientId 前 6 位，`displayName` 全链路被丢弃

| 项目 | 内容 |
|---|---|
| 当前文件 | `src/components/ProjectMenu.tsx:130-141`（`成员 ${member.clientId.slice(0,6)}`）、`src/lib/app-constants.ts:11`（`COLLABORATION_DISPLAY_NAME = "本机协作者"` 硬编码）、`src/lib/useCollaborationRoom.ts:249,294`（创建/加入都传这个常量）、`src/lib/collaboration-client.ts:11-16`（`RoomMember` 无 `displayName`）、`server/collaboration.ts:224-229,299`（member 记录只存 clientId/role/joinedAt/lastSeenAt） |
| 缺失行为 | 服务端**请求体里 `displayName` 是必填**（`server/index.ts:530-531`、`:595-596`），但只落到 participant，不进 member 列表，也不经 SSE 回传。角色（owner/editor/viewer）已完整，缺的正是「非账号身份」 |
| 用户影响 | 班委三四个人同房间时看不出谁是谁；只读/关闭房间这类房主动作缺少「对谁生效」的可读上下文 |
| 可测性 | 高。`server/collaboration.ts` 有独立单测；客户端 `ProjectMenu` 组件测试可断言昵称与角色标签 |
| 侵入性 | **两档**：<br>① 低——纯本地身份：昵称存 `localStorage`（沿用 `src/lib/theme.ts:33-49` 的读写范式），显示「我（班主任）」，把常量换成用户可编辑值，不动服务端；<br>② 中——全链路：`RoomMember` 增 `displayName` 可选字段 + SSE 回传，需同时改 `server/collaboration.ts`、`src/lib/collaboration-client.ts`、UI。**注意**这是服务端契约变更，需在 PR 写回滚方案 |

#### G13 没有「角色标签」这种非权限身份

| 项目 | 内容 |
|---|---|
| 当前文件 | 同上；`CollaborationRole` 仅 `owner/editor/viewer`（`src/lib/collaboration-client.ts`） |
| 缺失行为 | 用户语境里的身份是「班主任 / 班委 / 摄影 / 家长」，与权限正交。`.github/ISSUE_TEMPLATE/*.yml` 里的「我是」下拉已经在用这套词汇 |
| 用户影响 | 权限词汇（编辑者/仅查看）对班级用户不自解释 |
| 可测性 | 高（枚举 + 展示，纯前端） |
| 侵入性 | 低（若与 G12① 合并，只是本地偏好的一个字段） |

### 1.5 模板与社区模板

#### G14 展示框模板库没有「非内置」通路

| 项目 | 内容 |
|---|---|
| 当前文件 | `src/lib/card-templates.ts:10` `builtin: boolean`（12 条全部 `true`）、`:112 listCardTemplates()` 无入参、`:116 getCardTemplateById`、消费方 `src/components/workspaces/ReferenceCardStyleWorkspace.tsx:2` 与 `src/components/inspector/CardsInspector.tsx:6` |
| 缺失行为 | `builtin` 标志形同虚设；无法导入一个「模板包」JSON 文件把社区模板并进选择器 |
| 用户影响 | `CONTRIBUTING.md:18` 把「案例模板」列为一等贡献，`docs/开源与收费边界.md:42` 明确允许「模板文件格式、内置/示例模板、贡献模板的文档」进本仓，但产品没有落点 |
| 可测性 | 高。解析/校验/去重/合并全是纯函数；恶意字段过滤（只允许白名单 `CardSettings` 键）可单测 |
| 侵入性 | 中。新增 `src/lib/card-template-pack.ts` + 导入 UI；需决定是否随工程包/资源包序列化（建议先只做「会话内 + localStorage」，不改 `project-package` 版本） |
| 收费红线 | 只做**文件导入**，不做商店、不做作者结算、不做价格字段（`docs/开源与收费边界.md:44,52`） |

#### G15 自定义模板不能删除/重命名，保存 UX 靠 prompt + confirm

| 项目 | 内容 |
|---|---|
| 当前文件 | `src/App.tsx:1123-1128`（`window.prompt` 取名 + `window.confirm` 决定 visual/layout）、`:1177` `[record, ...customTemplates].slice(0, 20)` 静默丢弃最旧的；`src/components/TemplatePicker.tsx:44-56` 只有「应用」与「保存」 |
| 缺失行为 | 无删除、无重命名、无覆盖已有模板；「点确定＝视觉样式，点取消＝布局倾向」是极不可发现的交互；到 20 条上限时无提示 |
| 用户影响 | 攒了十几个「我的地图版式 1/2/3」之后无法清理，第 21 个悄悄顶掉第 1 个 |
| 可测性 | 高（`src/lib/template-store.ts` 有 `template-store.test.ts`；组件测试可覆盖删除确认） |
| 侵入性 | 低–中 |

### 1.6 项目工作台 / 上手

#### G16 项目卡片没有真实缩略图，列表没有搜索与排序

| 项目 | 内容 |
|---|---|
| 当前文件 | `src/components/workbench/ProjectCard.tsx:19-22`（CSS 假图：`workbench-card-preview__map` + `__pin`）、`src/components/workbench/ProjectGrid.tsx`、`src/components/ProjectWorkbench.tsx:181`（只按 `updatedAt` 排序） |
| 缺失行为 | 无缩略图、无搜索框、无按名称/人数排序、无标签或归档 |
| 用户影响 | 「导出 3 种风格供投票」+「归档项目包下次复用」（`USER_GUIDE.md:111-112`）意味着一个班会有多个近似项目，卡片全长一个样 |
| 可测性 | 搜索/排序：高（纯函数）。缩略图：低（需 SVG→dataURL 渲染，jsdom 下难测） |
| 侵入性 | 搜索/排序低；缩略图中–高（要在保存时生成并塞进 `StoredProject`，等于扩 store 结构）——**建议本轮只做搜索/排序** |

#### G17 重命名/删除/新建仍用原生 `prompt` / `confirm`

| 项目 | 内容 |
|---|---|
| 当前文件 | `src/components/ProjectWorkbench.tsx:123`（`window.prompt`）、`:146`（`window.confirm`）、`src/App.tsx:1183`（新建项目 confirm）、`src/lib/usePosterExport.ts:118`（导入工程 confirm） |
| 缺失行为 | 原生弹窗不受主题控制、移动端体验差、无法展示影响摘要（`function.md:289` 要求高影响动作先给预览/摘要） |
| 用户影响 | 「导入工程将替换当前画布和 N 条名单」这类关键确认只有一行系统弹窗 |
| 可测性 | 中（改成组件后可直接断言，反而比 mock `window.confirm` 更好测） |
| 侵入性 | 中（要同步改多处现有测试的 `window.confirm = vi.fn()` 写法） |

### 1.7 空态 / 错误态 / 无障碍

#### G18 空名单被判为「名单数据健康」

| 项目 | 内容 |
|---|---|
| 当前文件 | `src/lib/stage-overview.ts:110-112`：`missingRequired/duplicate/unresolved/hidden` 全 0 时无条件推 `data-clean`（severity `ok`，文案「N 人 · 无缺失、无重复、全部可定位」）。`total = 0` 时输出「0 人 · …健康」 |
| 缺失行为 | 与 `WorkflowStageStepper` 同屏显示的进度状态相矛盾（`src/lib/workflow-progress.ts` 对空名单给 `empty`＝未开始）；`frontUI2.md:328-342` 规定的空工程三起点（粘贴名单 / 上传 Excel / 手动添加）+ 一行真实格式示例也没实现 |
| 用户影响 | 新用户第一屏拿到一个绿色「健康」的空项目，得不到任何下一步指引 |
| 可测性 | 高。纯函数；现有 `src/lib/stage-overview.test.ts:48` 的「healthy roster」用例用的是 `total: 10`，**`total: 0` 分支完全没覆盖**，可以直接加新用例而不必改旧断言 |
| 侵入性 | 低（`dataCards` 加一个前置分支 + 一张带 `{kind:"data-diagnostics"}` 动作的卡） |

#### G19 死代码与并行入口

| 项目 | 内容 |
|---|---|
| 当前文件 | ① `src/components/WorkflowGuide.tsx`（313 行）+ `WorkflowGuide.test.tsx`：非测试引用 **0**；② `src/components/GlobalDataScreen.tsx` + `src/components/global-data/GlobalDataNavigation.tsx` + `GlobalDataStatus.tsx` + 测试：非测试引用 **0**（`App.tsx:1206` 的 `openGlobalData` 只是切到 `data` 阶段，并不渲染该屏）；③ `src/components/WorkflowStepper.tsx` 在 `App.tsx:1938` 以 `aria-hidden="true"` 渲染；④ `GlobalSettingsScreen`（353 行）仍是第二套平行导航 |
| 缺失行为 | `frontUI2.md:891-902` 明确要求不再向用户暴露第二套平行导航；②是 `docs/superpowers/plans/2026-08-02-global-data-workbench.md` 交付后被六阶段外壳架空的产物 |
| 用户影响 | 对用户无直接影响；对维护与 agent 有：容易改错文件、拖慢 `npm test` |
| 可测性 | 删除类改动靠现有全量测试兜底 |
| 侵入性 | ①②低（纯删除，需确认 `skin=classic` 分支不引用）；④高（`GlobalSettingsScreen` 仍是 `canvas/map/cards/guests/typography/advanced` 六个面板的唯一宿主，**本轮不建议动**） |

### 1.8 海外去向（世界地图，仅评估已部分存在的部分）

#### G20 海外去向只有一个「海外」聚合组

| 项目 | 内容 |
|---|---|
| 当前文件 | `src/lib/layout.ts:60-87`（`internationalGroup` 恒为单组 `{key:"海外", title:"海外"}`，四种 grouping 都直接拼在末尾）、`src/components/DataWorkspace.tsx:443`（海外时 `searchOptions` 返回 `[]`，城市是自由文本如「美国·波士顿」）、`src/lib/data-health.ts:20` 有 `international` issue 类型 |
| 缺失行为 | 不能按国家/地区聚合（12 人国际部会挤在一张「海外 12」卡里）；无「海外去向不进中国地图」的画布内说明（只有 `GlobalDataScreen.tsx:105` 那句提示，而该屏已不可达） |
| 用户影响 | `docs/案例模板/国际部-12人.md` 是三大主推案例之一，`USER_GUIDE.md:70-73` 也把国际部单列 |
| 可测性 | 高（`src/lib/layout.ts` 分组是纯函数，`layout.test.ts` 已有） |
| 侵入性 | 按国家分组：低（从自由文本 `国家·城市` 里取 `·` 前段作为分组键，配一个开关）。**真正的世界地图：高，明确不做**（要新 geojson + 新投影 + 新锚点体系，等于第二套画布） |

### 1.9 皮肤 / 主题偏好

#### G21 皮肤与主题只在编辑器可切，工作台只读

| 项目 | 内容 |
|---|---|
| 当前文件 | `src/lib/theme.ts:33-49`（skin 持久化已完备）、`src/components/ProjectWorkbench.tsx:34-40`（`loadStudioSkin()`/`loadThemeMode()` 只读，无 setter、无 `SkinSelector`）、`src/components/SkinSelector.tsx`、`src/App.tsx:1532,1976` |
| 缺失行为 | 工作台读取偏好但不提供切换；`classic` 皮肤实际是 `App.tsx:1927+` 的整套 legacy shell，而非「皮肤」 |
| 用户影响 | 小（偏好本身工作正常）。真实风险是 `classic` 分支让 `App.tsx` 停在 2466 行，违反 `AGENTS.md`「文件超过 400 行拆分」 |
| 可测性 | 工作台切换器：高。收敛 classic：需要大量回归 |
| 侵入性 | 工作台加切换器：低。**收敛 classic 分支：高，本轮不做**（`docs/superpowers/plans/2026-08-05-atelier-skin-and-collaboration-plan.md` 明确 Classic 要保留为持久偏好） |

---

## 2. 文档已规定但未发货的清单

按「规格出处 → 现状」列出，这些是本轮最容易被接受的改动，因为需求已在仓库内达成过共识。

| # | 规格出处 | 规定内容 | 现状 | 对应缺口 |
|---|---|---|---|---|
| 1 | `docs/宣发/反馈收集SOP.md:11` | 班主任/班委入口包含「应用内『反馈』（若已做）」 | 未做，`src/**` 零命中 | G1 |
| 2 | `frontUI2.md:863` | 快捷键只在 tooltip 或帮助中展示 | 无「帮助」这个面 | G2 |
| 3 | `frontUI2.md:328-342` | 空工程名单页三个起点 + 一行真实格式示例 `张三 浙江大学 杭州` | `DataWorkspace` 无空态分支；`stage-overview` 反而报「健康」 | G18 |
| 4 | `frontUI2.md:637-643` | 导出成功后轻量结果条「已导出 xxx-2x.png ［再次导出］」 | 只有 status message，且文件名不含倍率 | G7 / G8 |
| 5 | `frontUI2.md:618-635` | 交付页第二组保存/工程、第三组协作与迁移折叠区 | 交付页只有三个导出按钮 | G10 |
| 6 | `frontUI2.md:912` | 项目菜单不再重复 PNG/SVG | `ProjectMenu.tsx:96-105` 仍在重复 | G10 |
| 7 | `frontUI2.md:891-902` | 不再保留独立「全局设置」中心 | `GlobalSettingsScreen` 仍是平行导航 | G19④（本轮不做） |
| 8 | `frontUI2.md:872-877` | 导入/导出/上传必须有明确进行中/成功/失败状态 | `DataWorkspace.tsx:578` 的消息无 `role` | G6 |
| 9 | `.agents/skills/cengfan-data-import/SKILL.md:10-13` | 「下载模板」调用现有下载入口 | 主路径上入口被 `hideTemplateDownload` 关掉 | G4 |
| 10 | `docs/开源与收费边界.md:42` | 开源仓可以有「模板文件格式、内置/示例模板、贡献模板的文档」 | `card-templates.ts` 的 `builtin` 标志无第二种取值，无导入通路 | G14 |
| 11 | `function.md:238` | 交付第三屏含资源包导入导出 | 资源包只在 `AssetPanel` 里（`App.tsx:2232`），交付页没有 | G10 |
| 12 | `docs/superpowers/plans/2026-08-02-global-data-workbench.md` | 全屏 `GlobalDataScreen`（overview/roster/quality/mapping/presentation） | 交付过，但已被六阶段外壳架空，现为死代码 | G19② |
| 13 | `docs/superpowers/plans/2026-08-04-data-import-workbench.md` | XLSX 模板下载 + 可解释表头识别 | 两者都实现了，但模板下载入口在主路径被隐藏、识别结果不可纠正 | G4 / G5 |
| 14 | `docs/superpowers/plans/2026-08-06-collaboration-room-experience.md` + `server/index.ts:530` | 创建/加入房间 `displayName` 必填 | 客户端硬编码「本机协作者」，服务端 member 记录不落该字段 | G12 |

---

## 3. Top 8 可落地改进（与社区 / 宣发互补）

按「宣发闭环价值 ÷ 侵入性」排序。每条给出改哪、怎么验收、回滚代价。

### #1 应用内「提意见」入口（G1）

- **改**：新增 `src/components/FeedbackLink.tsx`（纯展示），挂进 `StudioTopbar` 的 `projectActions`（`src/App.tsx:1527-1536`）与 `WorkbenchHeader`。菜单三项：使用意见 → `feedback.yml`、Bug → `bug.yml`、功能建议 → `feature.yml`，各带一行分流文案（对应 `CONTRIBUTING.md:5-9` 的身份表）。
- **红线**：绝不预填工程内容或名单；`rel="noopener noreferrer"`；文案里复述 `bug.yml:9` 的「不要粘贴真实学生姓名 + 去向」。
- **验收**：组件测试断言三个链接的 `href`/`aria-label`/`rel`，以及「渲染结果不包含任何 `project` 派生文本」。手动：点开跳到正确模板。
- **回滚**：删组件 + 撤插槽，零数据影响。
- **为什么排第一**：`docs/宣发/反馈收集SOP.md` 的整套 SLA/看板/周报都建立在「有人提」上，而目前产品侧没有任何触发点。这是唯一一条能直接抬高宣发漏斗转化的编辑器改动。

### #2 恢复数据阶段的 XLSX 模板下载（G4）

- **改**：删掉 `src/App.tsx:1668` 的 `hideTemplateDownload: true`，或把按钮上提到 `DataUploadWorkspace` 的 header 区（`src/components/workspaces/DataUploadWorkspace.tsx:112-122`）。
- **验收**：`DataUploadWorkspace.test.tsx` 新增按钮存在性断言；手动跑一次下载确认两个 sheet（学生数据 / 填写说明）都在。
- **回滚**：一行还原。
- **附带**：顺手把 `USER_GUIDE.md:82` 的 FAQ 改成「点『下载 XLSX 模板』照着填」。

### #3 空名单空态：`stage-overview` + 数据阶段起点（G18）

- **改**：`src/lib/stage-overview.ts` 的 `dataCards` 前置 `if (h.total === 0)` 分支，返回 `{ id: "data-empty", question: "先导入名单", severity: "info"|"warning", action: {kind:"data-diagnostics"} }`；数据阶段空态渲染 `frontUI2.md:336-340` 的格式示例一行。
- **验收**：`src/lib/stage-overview.test.ts` 新增 `total: 0` 用例（现有 `:48` 用例用的是 `total: 10`，**不会被破坏**）。
- **回滚**：纯函数分支，直接撤。
- **配套价值**：宣发截图的第一帧就是空项目；现在那一帧写着「名单数据健康」。

### #4 应用内帮助抽屉（G2）

- **改**：`src/components/HelpDrawer.tsx`，复用 `StudioEditorShell.tsx:111-134` 的 MUI `Drawer` 范式。内容三段：五步流程（对齐 `WORKFLOW_STAGES`，`src/lib/workflow-stages.ts:18-24`）、快捷键表（撤销/重做/Esc，见 `function.md:394`）、外链（USER_GUIDE / CONTRIBUTING / 反馈）。
- **验收**：打开/Esc 关闭/焦点返回触发按钮；快捷键表与实际绑定一致（可加一条测试，从常量表驱动，避免文档漂移）。
- **回滚**：删组件 + 撤按钮。
- **与 #1 合并**：建议同一个入口按钮下分「帮助」与「提意见」，只占一个 topbar 位。

### #5 协作身份：本地昵称 + 角色标签（G12① + G13）

- **改**：新增 `src/lib/collaborator-identity.ts`（读写 `localStorage`，范式照抄 `src/lib/theme.ts:33-49`），字段 `{ nickname, roleLabel }`，`roleLabel` 取自「班主任 / 班委 / 同学 / 家长 / 其他」枚举。把 `src/lib/app-constants.ts:11` 的硬编码换成该值；`ProjectMenu` 成员列表显示「我（班主任·小林）」，他人仍回落到 `成员 xxxxxx`。
- **为什么先做本地档**：全链路需要动 `server/collaboration.ts` 的 member 结构（服务端契约变更，按 `AGENTS.md` 交付纪律要写回滚方案）。本地档零契约风险，且已经解决「我是谁」这半个问题；全链路留给 Round 3 评估。
- **验收**：`collaborator-identity.test.ts`（含 storage 不可用时的降级，参照 `theme.ts` 的 try/catch）+ `ProjectMenu` 组件测试。
- **红线**：昵称是本机偏好，**不进 `ProjectDocument`、不进工程包、不进协作 payload**（`docs/superpowers/plans/2026-08-05-atelier-skin-and-collaboration-plan.md` 的皮肤约束同理适用）。

### #6 社区模板包导入（G14）

- **改**：新增 `src/lib/card-template-pack.ts`：`parseCardTemplatePack(text) → CardTemplate[]`，只接受白名单 `CardSettings` 键、强制 `builtin: false`、`id` 加 `pack:` 前缀避免与内置冲突；`listCardTemplates(custom?)` 加可选入参；`ReferenceCardStyleWorkspace` 加一个「导入模板包」文件选择器与「社区模板」分组。
- **不做**：商店、评分、作者结算、任何价格字段（`docs/开源与收费边界.md:44,52`）。文件从哪来由用户自己决定（GitHub、用户群）。
- **验收**：纯函数单测覆盖合法包/非法键/重复 id/超大文件；组件测试覆盖导入后出现在选择器。
- **回滚**：不改 `project-package` 版本 → 只需删 UI 与 lib；已导入的模板存 `localStorage`，清掉即可。
- **配套宣发**：这条给了 `CONTRIBUTING.md:18`「贡献模板」一个真实落点，可直接变成一条 `good first issue`（`docs/宣发/good-first-issues.md` 现有 7 条全是文档类，缺代码类）。

### #7 导出文件名 + 成功结果条（G7 + G8）

- **改**：抽 `buildExportFileName({ projectName, kind, scale })` 纯函数；`usePosterExport` 接收项目名；`DeliveryRail` 在 `exportState === "success"` 时渲染结果条（文件名 + 再次导出）。
- **验收**：文件名纯函数单测（含非法字符、空项目名回落）；`DeliveryWorkspace.test.tsx` 成功态断言。
- **回滚**：低。
- **配套宣发**：「导出 3 种风格供投票」是 `USER_GUIDE.md:111` 明写的班委场景，也是小红书素材脚本里的常用桥段。

### #8 自定义模板管理 + 删除死代码（G15 + G19①②）

- **改 A**：`TemplatePicker` 加删除/重命名（带二次确认）、到 20 条上限时明确提示而非静默丢弃（`src/App.tsx:1177`）；把 `window.confirm` 决定 visual/layout 换成显式单选。
- **改 B**：删除 `src/components/WorkflowGuide.tsx(+test)`、`src/components/GlobalDataScreen.tsx(+test)`、`src/components/global-data/*`；删除前用 `rg` 复核 `skin=classic` 分支（`src/App.tsx:1927+`）无引用。
- **验收**：`npm run lint` + 全量 `npx vitest run`（删除类改动必须跑全量，不能只跑相关文件）。
- **回滚**：git revert；删除的文件在历史里可取回。
- **为什么捆一起**：都属于「模板/界面维护面」，一个 PR 讲得清；且 B 能立刻降低后续 Round 的误改概率。

**未进 Top 8 但值得 Round 2 复议**：G5（表头映射可纠正，价值高但侵入中）、G9（打印尺寸口径，价值中侵入低，可作为 #7 的搭车项）、G20（海外按国家分组，纯函数但要先确认「国家·城市」文本约定）、G16 的搜索/排序半条。

---

## 4. 本轮不要碰

| 不碰 | 位置 | 理由 |
|---|---|---|
| 卡片自动布局 / 避让 / 回退策略 | `src/lib/card-layout.ts`、`card-layout-cache.ts`、`card-layout-worker-protocol.ts`、`src/components/canvas/useCardLayoutWorker.ts` | `function.md:361` 明确列为「不改变」；且刚在 `8217dc3`/`20f3186` 调过，回归面大 |
| 连接线几何 / 地图渲染 / 投影 | `src/lib/connector-geometry.ts`、`src/lib/map-alignment.ts`、`src/components/canvas/PosterCanvas.tsx`、`MapLayer.tsx`、`MapDataLayer.tsx` | 本次任务定义即「不重写 PosterCanvas 布局」；性能测试 `PosterCanvas.performance.test.tsx` 对改动敏感 |
| 展示框子画布拖拽 | `src/components/workspaces/DisplayFrameSubcanvas.tsx`、`src/lib/display-frame.ts` | `5013191` 刚修完 RAF 预览抖动，属于易碎区 |
| 支付 / 套餐 / 订单 / 兑换码 / 模板手续费结算 | 任何位置 | `docs/开源与收费边界.md:52` 硬禁止；G14 只做文件导入，不得引入价格、作者分成、商店字段 |
| 工程包 / 资源包格式版本 | `src/lib/project-package.ts`、`resource-pack.ts`、`project-migration.ts` | `function.md:361`「不改变」；G14 因此建议只落 `localStorage`，不升包版本 |
| 协作 API 形状与房间语义 | `server/collaboration.ts`、`server/index.ts` 的 rooms 分支、`src/lib/collaboration-operations.ts` | G12 全链路档需要改 member 结构 → 本轮只做本地昵称，避免服务端契约变更 |
| `GlobalSettingsScreen` 的拆除 | `src/components/GlobalSettingsScreen.tsx`（353 行） | 虽然 `frontUI2.md:891` 要求撤销，但它仍是六个 inspector 面板的唯一宿主，拆除＝重排信息架构，超出「完善其他部分」的范围 |
| `classic` 皮肤分支的收敛 | `src/App.tsx:1927-2466` | `docs/superpowers/plans/2026-08-05-atelier-skin-and-collaboration-plan.md` 要求 Classic 作为持久偏好保留；收敛需独立计划 |
| 世界地图 / 新投影 | — | G20 只做「海外按国家分组」这一纯函数级改动；真世界地图＝第二套画布，属于 Round 3 之后的独立立项 |
| AI agent 循环与预算回执 | `server/ai/**`、`src/lib/agent-*.ts` | 与本轮主题无关，且 `docs/superpowers/plans/2026-08-05-non-ai-optimization.md:12` 就把它列为禁改区 |

---

## 5. 证据与验证建议

**本报告的每条结论都来自静态阅读，未运行测试**（角色限定为调研）。落地时按 `AGENTS.md` 的 failure → cause → fix → recheck 执行，并注意：

- 涉及删除死代码（G19①②）必须跑**全量** `npm test`，不能只跑相关文件——`WorkflowGuide.test.tsx` 与 `GlobalDataScreen.test.tsx` 会一并消失，需确认没有别的测试间接依赖其 CSS 类名或选择器。
- G18 改 `stage-overview.ts` 时，`src/lib/stage-overview.test.ts:48` 的「healthy roster」用例用的是 `total: 10`，新增 `total: 0` 分支**不会**破坏它；但 `src/components/StudioAssistantRail.test.tsx` 可能断言了卡片数量，需复核。
- G4 改 `hideTemplateDownload` 会让数据阶段多出一个按钮，`DataUploadWorkspace.test.tsx` 里若有「按钮数量」类断言需同步。
- G7 改导出文件名的阻力比预期小：`rg -n "我的毕业去向图" src` 只命中 `usePosterExport.ts:69` 与 `:146` 两处生产代码，**没有测试断言该文件名**，所以可以先补一条覆盖测试再改。
- 重操作走 `scripts/run-heavy.mjs`（`npm test` / `npm run lint` 已封装），不要并行开多套全量校验。

**关键事实核对表**（供其他 Round 1 代理交叉验证）：

| 断言 | 验证命令 |
|---|---|
| 应用内无帮助/反馈/GitHub 入口 | `rg -n "帮助\|反馈\|意见\|github" src index.html src/styles.css` → 0 命中 |
| 模板下载在数据阶段被隐藏 | `rg -n "hideTemplateDownload" src` → 仅 `App.tsx:1668` 置 true |
| `WorkflowGuide` 死代码 | `rg -n "WorkflowGuide" --glob '!WorkflowGuide*' src` → 0 命中 |
| `GlobalDataScreen` 死代码 | `rg -n "GlobalDataScreen" --glob '!*.test.*' src` → 仅自身与 `global-data/GlobalDataNavigation.tsx` 的类型引用 |
| 协作昵称硬编码 | `rg -n "COLLABORATION_DISPLAY_NAME" src` → `app-constants.ts:11` 定义，`useCollaborationRoom.ts:249,294` 使用 |
| 卡片模板全为内置 | `rg -n "builtin" src/lib/card-templates.ts` → 12 处 `builtin: true`，无 false |
| 画布尺寸预设只有像素 | `rg -n "CANVAS_SIZE_PRESETS" -A 6 src/lib/grid.ts` |
