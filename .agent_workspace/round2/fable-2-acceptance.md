MODEL: claude-fable-5-thinking-xhigh

# Round 2 · R2-F2 · 候选包 A–H 验收规格、回滚方案与剩余 SOTA 差距

- **输入**：`ROUND1-BRIEF.md`（候选包 A–H）+ `round1/fable-2-sota.md`（SOTA 矩阵与闸门）；全部文件/行号已对当前工作区源码复核（2026-08-24）。
- **性质**：仅设计。不实现产品功能、不提交、不涉及支付。
- **用法**：每项给出 Done-when（用户可见 + 测试断言）、隐私闸门（URL / 文件 / 遥测三栏）、回滚（文件与格式版本）、只发这一项时的 SOTA 剩余差距。附录给出三份机器可查规格：promo:lint 词表与能力清单、社区模板格式版本化、反馈 URL 查询参数白名单。

## 0. 全局约定（适用 A–H 全部）

1. **遥测零基线**：本仓当前没有任何埋点，这是「名单不出浏览器」（README L6）的信任基石。A–H 任何一项都不得新增网络上报——包括导出计数、点击统计、错误上报。所有「遥测」栏的缺省答案是**禁止新增**，下文只写各项特有的额外约束。
2. **验证纪律**（AGENTS.md）：每项的测试断言即「先写失败测试」的靶子；Round 3 实现顺序 = 先让下述断言以失败态存在，再实现，再复跑同一断言。§9 给出每项的失败测试锚点速查。
3. **回滚纪律**：涉及文档合规修复的项（C、G）必须拆成两个 commit——合规修复独立于功能，回滚只撤功能 commit，合规修复永不回滚。
4. **格式基线**（回滚参照系）：`cengfan-project-package` v2（`src/lib/project-package.ts` L9）、`cengfan-resource-pack` v1（`src/lib/resource-pack.ts` L4）、localStorage 自定义模板 key `cengfan-map-studio:custom-templates`（`src/lib/template-store.ts` L28）。**A–H 任何一项都不得改动这三者的形状**，这样单项回滚永远不需要数据迁移。

---

## A. 应用内「提意见 / 帮助」跳转入口

**涉及文件**：新增 `src/components/HelpFeedbackMenu.tsx`（+ 同名测试）、新增 `src/lib/feedback-links.ts`（纯函数构造 URL，+ 测试）；挂载点 `src/components/StudioTopbar.tsx`（编辑器）与 `src/components/workbench/WorkbenchHeader.tsx`（工作台）。不改六阶段导航（避开 #9/#10）。

**Done-when（用户可见）**
- 编辑器顶栏与工作台头部各出现一个「帮助」入口；菜单含四项：**提意见**（GitHub Issue 模板选择页或预填 bug 模板）、**用户指南**（USER_GUIDE.md）、**更新日志**（G 合入前退化为 README「反馈」节链接）、**版本号**（`package.json` version 只读展示，当前 0.1.0）。
- 点击「提意见」在新标签打开 `https://github.com/Xhhemoing/cengfan-map-studio/issues/new/...`（README L21/L93 已用同一仓库地址），预填仅含环境信息。
- 断网时入口仍渲染（不禁用），附「需联网打开」提示。

**Done-when（测试断言）**
- `HelpFeedbackMenu.test.tsx`：四个链接存在；href 前缀等于仓库常量；`target="_blank"` 且 `rel="noreferrer"`；mock `window.fetch`，交互全程 0 次调用（证明零上报）。
- `feedback-links.test.ts`：`buildFeedbackUrl()` 的 query key 集合 ⊆ 附录三白名单；向函数所在模块喂含 20 名学生的 project fixture 时**类型层面不可行**（函数签名不接收 project/students，见附录三）；对构造结果 `decodeURIComponent` 后断言 fixture 中任一学生姓名/院校/城市 `not.toContain`；URL 总长 ≤ 512。

**隐私闸门**
- **URL 禁入**：students 任何字段、项目名、项目 id、roomId、邀请/访问 token、localStorage/IndexedDB 内容、AI 会话内容、完整 User-Agent 字符串（可含设备型号）。允许项见附录三。
- **文件**：本项不落任何本地文件。
- **遥测**：菜单渲染与点击均不发出网络请求；「提意见」是纯 `<a>` 跳转，不 POST。

**回滚**
- 删除 2 个新文件 + 还原 StudioTopbar / WorkbenchHeader 两处挂载 diff。零存储 key、零格式变化，单 commit revert 即净。

**只发 A 的 SOTA 剩余差距**
- 对标 VS Code「Report Issue」：缺自动诊断收集（错误日志、崩溃上下文）与应用内表单（不离开应用完成提交）。
- 反馈是单向的：用户看不到自己意见的状态；48h SLA 仍是运营口头承诺，无 CHANGELOG 载体（缺 G）、Discussions 未开（仓外设置）。
- 对标 Excalidraw：缺画布内 what's-new / 更新公告位。漏斗从「断头」变为「接通但无回声」。

---

## B. 社区模板独立文件格式 + 导入/导出 + 拒收 students

**涉及文件**：新增 `src/lib/template-package.ts` + `template-package.test.ts`；`src/components/TemplatePicker.tsx`（当前只有应用/保存，L14-59）加「导出模板 / 导入模板」；上层接线经 `DataPresentationPanel.tsx` → App 回调；新增 `docs/社区模板/README.md`（投稿规则 + AGPL 随仓分发声明 + 素材授权勾选项）；新增 `scripts/validate-community-template.mjs` + `scripts/validate-community-template.test.ts`（`vite.config.ts` L57 的 include 已覆盖 `scripts/**/*.test.ts`）。格式规范全文见附录二。

**Done-when（用户可见）**
- 模板区每个自定义模板有「导出模板」，区块顶部有「导入模板」；导出得到 `<模板名>.cengfan-template.json`。
- A 浏览器导出 → B 浏览器导入后模板出现在「我的模板」，应用到含名单项目：名单逐条不变、样式生效、`guests.people`（嘉宾名单）不被模板覆盖为非空。
- 导入失败给出可读中文错误（非静默、非仅 console），错误文案区分：非 JSON / 不是模板文件 / 是工程包（引导走工程导入）/ 版本过新 / 含学生数据。
- 首批 ≥3 个内置模板导出为社区模板文件放入 `docs/社区模板/`，校验脚本对其全部通过。

**Done-when（测试断言，`template-package.test.ts`）**
1. round-trip：create → serialize → parse 深等价（exportedAt 除外）。
2. 在顶层、`document` 下、`scene` 下、数组元素内四个位置分别注入 `students` 键 → parse 整体拒收（不是剥离后部分导入）。
3. `formatVersion` 为 2 / 0 / `"1"`（字符串）/ 缺失 → 拒收，文案含版本号与「请升级应用」。
4. `kind` 为 `cengfan-project-package` → 专用文案「工程包含名单，社区通道不收工程包」。
5. 含 `price` / `sku` / `pricing` / `fee` / `套餐` / `价格` 键 → 拒收（边界文档 §4 前置防线）。
6. 导出产物运行时断言：序列化字符串不含 `"students"` 子串（`visibleFields` 里的 `"name"` 是字段名而非数据，测试需证明不误伤）；`scene.guests.people === []`。
7. 顶层出现白名单外未知键 → 拒收（封闭 schema，防夹带）。
8. `author` 可缺省；超 30 字符拒收或截断（二选一，实现时定死并测死）。
- 组件级（TemplatePicker 新测试）：两个按钮存在；喂坏文件后错误文案渲染在 DOM。
- 脚本级：`node scripts/validate-community-template.mjs fixtures/valid.json` exit 0；对含名单样例 exit 1 且打印原因。

**隐私闸门**
- **文件禁入**：`students`（导出剥离 + 导入拒收双保险，复用 `stripStudentData`，`template-store.ts` L43-52）；`scene.guests.people` 非空（**新发现的泄漏面**：`applyCustomTemplateToProject` L290 会把 `scene.guests` 整体覆盖进项目，而现有 `isSceneDocument` 不校验 guests——嘉宾/寄语姓名可能是真人，必须导出置空 + 导入强制置空）；价格/SKU 字段。
- **需用户确认后才可入文件**：`background.imageSrc`、`regionalAssets` 内嵌图片（dataURL 可能含合影/人像）与 `textElements` 自由文本（可能含班级名、人名）——导出对话框列出将包含的全部文本与图片素材，勾选「素材已获授权、不含真实名单」方可导出（对齐 `docs/KOL/内容授权协议.md` 署名义务与 round1 §4.3-4）。
- **URL / 遥测**：纯文件交换，不做分享链接、不上报导入导出事件。
- **投稿通道**：`docs/社区模板/README.md` 与 `CONTRIBUTING.md` 明写只收 `.cengfan-template.json` + 脱敏 PNG，永不收 `.cengfan` 工程包。

**回滚**
- 删除 `template-package.ts(.test)`、TemplatePicker diff、`docs/社区模板/`、校验脚本。
- **格式版本**：`cengfan-community-template` v1 冻结；回滚后野外已流出的模板文件成为孤儿但无害（无导入口的旧版应用本就打不开它们）。格式规范文档保留并标注 deprecated，解释野外文件。
- **硬约束**：localStorage `CUSTOM_TEMPLATES_KEY` 与 `CustomTemplateRecord` 形状零改动（验收时 diff 检查），因此回滚不触碰任何用户既有模板，无迁移。
- 若 G 已合入，回滚事件记入 CHANGELOG。

**只发 B 的 SOTA 剩余差距**
- 对标 Excalidraw libraries：缺公开画廊/精选页、PR 投稿的 CI 自动校验（依赖在途 #5，本项只交付可手跑的脚本）、应用内浏览社区模板、安装计数、remix 溯源。
- `author` 有字段无展示面（创作者主页/案例墙缺，属 G/后续）。
- 交换仍靠「文件传来传去」：没有 URL 分享，对班主任群场景摩擦仍高——这是隐私优先的刻意取舍，但与 Figma Community 的差距仍是类别级。

---

## C. promo:lint（禁用词 + 能力漂移）与存量违规修复

**涉及文件**：新增 `scripts/宣发流程-文案检查.mjs`（核心为可导出纯函数）+ `scripts/promo-lint.test.ts` + `scripts/__fixtures__/promo-lint/`（正反样例）；新增 `docs/宣发/能力清单.md`；`package.json` 加 `"promo:lint"`；`scripts/宣发流程-素材检查.mjs`（现状 L101-150 恒 exit 0）末尾串联 lint 并透传退出码。词表全文见附录一。扫描范围：`docs/宣发**`、`docs/私域/`、`docs/KOL/`、`docs/案例模板/`、`docs/脚本库/`、`docs/宣发政策*`、`scripts/宣发流程-内容生成.mjs`、README。

**Done-when（用户可见 / 维护者可见）**
- 修复前基线：对当前仓库跑 `npm run promo:lint` 报出全部已知违规（≥6 处，清单见附录一 §A1.4），输出 `文件:行号:命中词:类别`，exit 1。
- 修复后：全仓 0 命中，exit 0；`npm run promo:check` 在有违规时非零退出（终结「退出码恒 0」缺陷）。
- 合规否定句（如投放文案-用户侧 L71「不要写 985 占比」）通过行内豁免标记 `<!-- promo-lint-allow: 985占比 -->` 保留原文。

**Done-when（测试断言，`promo-lint.test.ts`）**
- 正样例（违规原文拷贝为 fixture，**永久保留**作回归）逐词命中，含类别与行号。
- 反样例（能力清单内的合规说法：「导出 PNG/SVG」「中国地图」）0 命中。
- 豁免语义：带词豁免只作用于当行/紧邻下一行；无标记的否定句**仍报**（宁误报 + 人工豁免，不漏报）。
- 退出码：有命中 1，无命中 0；lint 模块静态断言不引入 `http/https/fetch`（零网络）。

**隐私闸门**
- **文件/输出**：lint 只读本地文件；命中行输出截断至 80 字符（防止把文档中示例名单整行打进 CI 日志）。
- **URL / 遥测**：零网络调用；违规修复清单与 fixture 不得含真实学生数据（现有违规文本本身是虚构案例口径，拷贝前复核）。

**回滚**
- **两个 commit**：(1) 存量文案修复（普通高中-68人、国际部-12人、KOL 合作话术、小红书政策、内容生成脚本、毕业季 checklist）；(2) lint 脚本 + 能力清单 + package.json。回滚只 revert (2)；(1) 是合规修正，永不回滚。
- 删 (2) 后 `promo:check` 退回存在性检查，行为与今日一致，无格式/数据面。

**只发 C 的 SOTA 剩余差距**
- 静态词表非语义：改写成「升学表现优异」「全班去向含金量」可绕过；SOTA 需人工评审兜底（SOP 已有，但无强制）。
- 不扫图片内文字（宣发截图、海报上的口径）。
- 未进 CI：#5 在途，本项只在文档写明挂钩点（PR 触碰 docs/宣发** 时跑 promo:lint），不自建 workflow 以避冲突。
- `promo:report` 仍全手填、KPI 无数据源（round1 P4/P10 不在本项）；能力清单靠人工维护，与代码无自动同步。

---

## D. 恢复数据阶段 XLSX 模板下载 + 导入结果 aria-live

**涉及文件**：`src/App.tsx` L1668（`DataUploadWorkspace` 传参处去掉 `hideTemplateDownload: true`，**保留** `hideDataExpression: true`）；`src/components/workspaces/DataUploadWorkspace.tsx` L128（去掉写死的 `hideTemplateDownload`）；`src/components/DataWorkspace.tsx`（`message` 状态的渲染容器加 `role="status"` + `aria-live="polite"`；下载按钮本体 L504-507 已有 `aria-label="下载学生数据 XLSX 模板"`，无需改）。

**Done-when（用户可见）**
- 数据阶段主路径出现「下载学生数据 XLSX 模板」按钮，点击得到模板文件（对应 USER_GUIDE FAQ 第一条）。
- 用读屏时，导入完成后自动播报「从{来源}识别到 N 条候选…」，无需焦点移动。

**Done-when（测试断言）**
- `DataWorkspace.test.tsx`：默认渲染（不传 hide）断言按钮存在；消息容器具 `aria-live="polite"`；触发导入后容器文本更新。
- App 级（`AppProjectMode.test.tsx` 或 DataUploadWorkspace 测试）：数据阶段 DOM 中 `[aria-label="下载学生数据 XLSX 模板"]` 非空——锁在集成层，防上层再次隐藏。
- 回归断言：数据阶段 `hideDataExpression` 仍为 true（只放开模板下载，不动其他裁剪）。
- 播报文本断言：向含学生 fixture 的导入流程断言 `message` 不含任何学生姓名（现状消息只含计数与来源，测试锁死这个性质）。

**隐私闸门**
- **文件**：XLSX 模板只含表头与虚构占位（遵循 `.agents/skills/cengfan-data-import/SKILL.md` 模板规范），生成纯本地（xlsx 库），零网络。
- **URL**：无。**遥测**：下载与导入不上报；aria-live 播报只含计数/来源，永不朗读名单内容。

**回滚**
- 还原两处布尔开关 + 移除一个 aria 属性，单 commit revert；零格式、零存储变化。这是 A–H 中回滚面最小的一项。

**只发 D 的 SOTA 剩余差距**
- 导入向导 a11y 仍不完整：表头识别结果表格（DataWorkspace L517-537）无读屏语义结构、错误行无焦点管理。
- 模板只有 XLSX，无 CSV 模板下载；示例数据仍在 `docs/` 不在 `public/`（Round1 缺陷 8，不在本项）。
- 主路径工作流重排、首次引导属 #9/#10，禁入。

---

## E. 协作本地昵称 + 角色文字标签（API 零改动）

**涉及文件**：新增 `src/lib/collaboration-nickname.ts` + 测试（localStorage key `cengfan-map-studio:collab-nickname`；清洗：trim、剔除换行、≤16 字符）；`src/lib/app-constants.ts` L11 的 `COLLABORATION_DISPLAY_NAME` 降级为缺省值；`src/lib/useCollaborationRoom.ts` L249（createRoom）与 L294（join）改传本地昵称；`src/components/ProjectMenu.tsx` 协作弹层加昵称输入框，成员行渲染升级（L130-138）。

**硬边界（与简报「勿改房间协议」一致，已核实）**：`RoomMember` 在服务端（`server/collaboration.ts` L18-23）与客户端（`src/lib/collaboration-client.ts` L11-16）都**不含** `displayName`——成员列表看不到他人昵称是协议事实。本项刻意不给 RoomMember 加字段：`displayName` 参数服务端本就接收（server 测试通篇在传），客户端只是把写死的「本机协作者」换成用户昵称。**他人昵称显示 = 协议改动 = 明确出界，列入剩余差距。**

**Done-when（用户可见）**
- 协作弹层可设置/修改昵称，刷新后保留；未设置时行为与今日完全一致（缺省「本机协作者」）。
- 成员列表：自己一行显示「我（{昵称}）」；每行都有角色文字（创建者/编辑者/仅查看），他人仍为「{角色} · 成员 {clientId 前 6 位}」（现状 L136 的裸切片升级为角色前置的可读文案）。
- 输入框旁提示「建议使用昵称，不要填写真实姓名+班级」。

**Done-when（测试断言）**
- `collaboration-nickname.test.ts`：读写 round-trip、超长截断、纯空白回退缺省、损坏值容错。
- `App.test.tsx` 既有房间用例（L401 起）扩展：mock fetch 断言 `/api/rooms` 与 `/join` 请求体 `displayName` === 所设昵称；未设置时 === `"本机协作者"`。
- ProjectMenu 渲染断言：`[aria-label="房间成员"]` 内自己行含昵称、每行含角色文字。
- **API 零改动的证据**：`server/**` 零 diff，`server/collaboration.test.ts`、`server/index.test.ts` 原样通过。

**隐私闸门**
- **出端面**：昵称是本项唯一新增出端字段，仅在用户显式建房/加入时随既有 API 发出（该通道今日已在发常量）；≤16 字符上限兼作「防止把名单文本塞进昵称」的结构约束。
- **文件禁入**：昵称不进 `.cengfan` 工程包、不进社区模板文件、不进 PNG/SVG 导出（测试：设置昵称后导出工程包 fixture，断言序列化不含昵称字符串）。
- **URL / 遥测**：昵称不进任何 URL（含 A 的反馈链接）；无上报。

**回滚**
- 删 nickname 模块 + 还原 `useCollaborationRoom` 两处传参 + ProjectMenu diff；localStorage 残留 key 无读取方、无害。服务端零改动 = 零服务端回滚面。房间协议版本不存在变更。

**只发 E 的 SOTA 剩余差距**
- 对标 Figma/Penpot：他人昵称、在线状态、多人光标、头像色全缺——都卡在 RoomMember 无 displayName 的协议缺口上（后续轮的协议增量 + 内存房间 30min TTL 的持久化问题一并考虑）。
- owner 无成员管理 UI（改角色/踢人）；昵称纯本机，不随房间迁移；「社区身份」与房间角色仍是两套语汇（PRODUCT.md L32 的显式角色要求只满足了文字标签部分）。

---

## F. 导出文件名含项目名/倍率 + 成功结果条

**涉及文件**：新增 `src/lib/export-filename.ts` + 测试（纯函数 `buildExportFilename({ projectName, kind, date, pngScale })`）；`src/lib/usePosterExport.ts`（L69 SVG、L146 PNG 的写死「我的毕业去向图」，L92 工程包默认名；`UsePosterExportOptions` 增 `projectName`，App.tsx L252 `projectNameRef` 已有数据源）；`src/components/workspaces/DeliveryWorkspace.tsx`（L110 已有 `role="alert"` 错误条，对称新增 `role="status"` 成功条）。**不做印刷尺寸（#3 在途）。**

**文件名规范**：`${sanitize(projectName || "蹭饭地图")}-去向图-${YYYYMMDD}${kind === "png" && scale > 1 ? `@${scale}x` : ""}.{png|svg}`；工程包 `${sanitize(name)}-工程包-${YYYYMMDD}.json`（**后缀保持 .json 不变**——`PROJECT_PACKAGE_FILE_ACCEPT` 与 `projectPackageDisplayName` 已兼容 .json/.cengfan，改后缀属格式面变化，禁入）。sanitize：`/\:*?"<>|` 与控制字符替换为 `-`，折叠空白，总长 ≤ 80 字符。

**Done-when（用户可见）**
- 导出 PNG 2× 得到形如 `高三2班-去向图-20260824@2x.png` 的文件；SVG / 工程包同规则；未命名项目回退「蹭饭地图」。
- 导出成功后交付面板出现结果条：「已导出 {文件名}」+「再次导出」；失败条行为不变（现有 `retryLastExport` 复用）。

**Done-when（测试断言）**
- `export-filename.test.ts`：倍率后缀只在 png 且 >1 时出现；非法字符清洗；超长截断；空名回退；日期格式。
- Hook/App 级：mock `downloadDataUrl` / `downloadText` / `downloadProjectPackage`，断言 filename 实参符合规范且含项目名。
- DeliveryWorkspace 渲染断言：`exportState === "success"` 时 `[role="status"]` 含文件名；`"error"` 时成功条不渲染；两条不同时出现。

**隐私闸门**
- **文件名禁入**：roomId、任何 token、学生姓名/字段。项目名是用户自主命名且文件留在本地，允许。
- **URL**：无。**遥测**：导出成功/失败**不上报**——总流程 §7 的「导出数」KPI 诱惑正在此处，明确拒绝（round1 反模式「默认遥测」）；结果条是纯本地 UI。

**回滚**
- 还原 usePosterExport 三处固定文件名 + 删 helper + 删成功条。`.cengfan`/`.json`/PNG/SVG 的**内容**零变化（纯文件名层），任何时期导出的文件在任何版本都照常导入。

**只发 F 的 SOTA 剩余差距**
- 印刷尺寸/出血/DPI 预设（#3 范围，禁入）；导出历史与「最近导出」列表缺；复制到剪贴板、系统分享缺；PDF 明确不做（能力清单）；导出前预览对比（透明底效果等）缺。

---

## G. CHANGELOG.md + 贡献者致谢规则（非付费会员替代）

**涉及文件**：新增根 `CHANGELOG.md`（首条即示范 SOP §4 四要素：收到 N 条 / 已改 / 明确不做+原因 / 感谢）；新增 `docs/社区/贡献者名录.md`（规则先行：文档/模板/脱敏数据/答疑与代码同等致谢，呼应 CONTRIBUTING L15-22；无外部贡献者时只放规则不放空表，遵守 good-first-issues #7）；README 增「贡献与致谢」节链接两者；改写 `docs/私域/用户群运营手册.md` §四（Tier 激励 → 仓内实体：Changelog 点名、案例墙署名、名录致谢；删「每月专属模板定制」「实体海报定制」「证书」类空头/越界承诺，向开发者群手册 L44「不要发空头证书」的正确基调对齐）；`docs/宣发/反馈收集SOP.md` §4 补指向 CHANGELOG.md 作为周报载体。**不做仓库大清理（#8）、不建 CI（#5）。**

**Done-when（用户可见 / 社区可见）**
- 根目录有 CHANGELOG.md，首条记录本轮 A–H 变更并演示四要素结构。
- README 有「贡献与致谢」节；A 的帮助菜单「更新日志」链接从退化态切到 CHANGELOG.md（若 A 同轮）。
- 用户群手册 §四 的每条激励都指向一个仓内实体文件或流程。

**Done-when（测试断言 / 机器可查）**
- `promo:check` 增加 CHANGELOG.md 与 贡献者名录 存在性检查项（沿用其既有模式）。
- 若 C 同轮：把「专属模板定制」「实体海报」「证书」加入越权承诺词表（附录一 §A1.2），文档 diff 后 grep 0 命中并被 lint 锁死回归。
- 人工验收（运营纪律，写进 SOP）：连续 2 个周期 CHANGELOG 新增含四要素的条目；感谢条目均带 Issue/PR 链接留痕。

**隐私闸门**
- **文件禁入**：用户真实姓名（一律 GitHub ID / 自选昵称）、学校全名+个人的组合、从 Issue 转述意见时不得引用原文中的名单内容。
- **URL / 遥测**：纯文档，无。

**回滚**
- **两个 commit**：(1) 用户群手册合规改写（不回滚）；(2) CHANGELOG + 名录 + README 节（可回滚，删 2 文件 + 还原 README）。A 的更新日志链接退回 README 锚点。零代码、零格式。

**只发 G 的 SOTA 剩余差距**
- 无自动化：all-contributors bot、release-please/语义化版本发布流全缺；周报纪律无 CI 审计（48h SLA 复盘仍靠 `gh` 手拉，round1 F4）。
- Discussions 未开、good-first-issues 7 条未建帖回填编号（仓外/运营操作）。
- 案例墙（round1 F5）不在本项：致谢有了「名录」，还没有「作品展示」这个更强的被认可载体。

---

## H. 工作台「重新载入示例」+ 空名单不再判健康

**涉及文件**：`src/components/workbench/WorkbenchHeader.tsx` + `src/components/ProjectWorkbench.tsx`（现状 L62-81 只在 `list.length === 0` 时播种一次，`seededRef` 拦截后续）加「载入示例项目」动作——语义为**任何时候点击都新建一份**示例（`createSampleProject()` 新 id、名称带序号/时间戳防混淆），绝不覆盖/删除既有项目；`src/lib/stage-overview.ts` L110-112（现状 `cards.length === 0` 时无条件推「名单数据健康 · {N} 人 · 无缺失、无重复、全部可定位」，`h.total === 0` 时输出「0 人 · 健康」）改为：total 为 0 时推 `id: "data-empty"`、severity 非 "ok"、文案「还没有名单——先导入表格或手动添加」并带跳转 action；核对 App.tsx 的 `workflowProgress.roster.status` 派生（`deriveWorkflowStageProgress`，`workflow-stages.ts` L59-65 仅透传，源头在 App 的 progress 计算），空名单不得判 data 阶段 ready/complete。**不做公开 Demo（#7）。**

**Done-when（用户可见）**
- 工作台已有项目时也能一键获得新示例项目，原项目全部原样。
- 空名单项目的阶段总览/助手抽屉显示「还没有名单」引导卡，而非「名单数据健康 0 人」；数据阶段进度不因空名单打勾。

**Done-when（测试断言）**
- `stage-overview.test.ts`：`total === 0` → 卡片 `id === "data-empty"` 且 `severity !== "ok"`；`total > 0` 且无问题 → 维持 `"data-clean"` 现行为。
- **现存反向固化必须翻转**：`StudioAssistantDrawer.integration.test.tsx` L48 的 fixture 正是「0 人 · 无缺失…severity: ok」——先把它改成失败态再实现（天然的 failure → cause → fix → recheck 链条起点）。
- `ProjectWorkbench.test.tsx`：已有 N 项目时点「载入示例」→ `store.list()` 为 N+1，原项目内容未变；连点两次得两份、id 不同。
- `workflow-stages.test.ts` / App 级：`students === []` 时 data 阶段 progress 非 complete。

**隐私闸门**
- **文件**：示例名单必须全虚构且项目名标注「示例」（复核 `createSampleProject` 现有数据，对齐 README L30 的「虚构声明」写法）；动作纯 IndexedDB 本地，零网络。
- **破坏性红线**：按钮语义是「新增示例」不是「重置」，永不删除/覆盖用户项目——这是本项唯一可能造成数据损失的歧义点，验收时用连点测试锁死。
- **URL / 遥测**：无。

**回滚**
- 还原 Workbench diff + stage-overview 分支 + 两处测试 fixture。存储格式零变化（StoredProject / ProjectPackage v2 不动）；用户已点出的示例项目按普通项目自行删除即可，无迁移。

**只发 H 的 SOTA 剩余差距**
- 对标 Figma/Canva 空态：交互式引导（教程覆盖层）、多套场景示例（小班/大班/国际部）、从空态直达模板画廊仍缺。
- 「示例 → 换成自己名单」的路径还差 D（模板下载）与导入向导 a11y 才完整；公开免安装 Demo（#7）是真正的获客空态，本项只优化已安装者的空态。

---

## 附录一 · promo:lint 词表与能力清单（C 的机器可查规格）

### A1.1 禁用词（合规红线，error 级，零容忍）

| 类别 | 词/正则 |
|------|---------|
| 比率宣称 | `升学率`、`就业率`、`录取率`、`本科率`、`一本率`、`二本率`、`重本率`、`名校率`、`升本率` |
| 排名口径 | `录取排名`、`平均排名`、`录取.{0,6}(QS|Top ?\d+)`、`平均录取学校排名` |
| 分层对比 | `985 ?占比`、`211 ?占比`、`双一流占比`、`#985`、`985 ?vs ?普本`、`一眼看清全班未来`、`清北(人数|率)` |
| 越权承诺 | `预计.{0,12}(Star|星标)`、`保证.{0,8}(涨粉|爆款)`、`领导当场表扬`、`(稳过|保过|提分)` |
| 支付红线（边界文档 §4） | `微信支付`、`预支付`、`sku`、`套餐价格`、`商户号`、`兑换码`、`付费解锁`、`VIP ?会员` |

### A1.2 越权激励词（G 相关，error 级）

`专属模板定制`、`实体海报(定制)?`、`证书`（激励语境；「授权协议」内的法律用语加行内豁免）。

### A1.3 能力漂移词（error 级，除非能力清单先更新）

`导出 ?PDF`、`PDF ?导出`、`支持 ?PDF`、`世界地图`、`全球地图`、`海外地图模板`、`小程序`、`App ?下载`、`iOS ?版`、`安卓版`、`云端保存`、`自动云同步`、`账号注册`、`会员专属`。

### A1.4 已知违规回归 fixture（修复前原文拷贝，永久保留）

1. `docs/案例模板/普通高中-68人.md`「本科率：85%」
2. `docs/案例模板/国际部-12人.md`「Top 50（QS）」「留学咨询案例」「世界地图」
3. `docs/KOL/合作话术.md`「预计带来 500+ GitHub Star」「985 去向分布」「实体海报定制」
4. `docs/宣发政策-小红书与社交平台.md`「985 vs 普本，一眼看清全班未来」
5. `scripts/宣发流程-内容生成.mjs`「#985」「某 985 高校附属中学」「领导当场表扬」
6. `docs/私域/毕业季-checklist.md`「导出 PDF」（同词在 `docs/KOL/合作话术.md` L97 也有）

### A1.5 能力清单（`docs/宣发/能力清单.md`，宣发口径单一事实源）

| 维度 | 有 | 没有（文案宣称即 lint 报错） |
|------|----|------------------------------|
| 导出 | PNG（1–3 倍率）、SVG、`.cengfan` 工程包 | PDF、打印服务 |
| 地图 | 中国省级地图 | 世界地图、海外地图模板 |
| 平台 | 现代浏览器网页 | 小程序、iOS/安卓 App |
| 数据 | 本地 IndexedDB/localStorage，名单默认不出浏览器 | 账号系统、云端保存、自动同步 |
| 协作 | 临时房间（内存、30min TTL）、owner/editor/viewer、一次性邀请 | 持久房间、成员昵称互见（E 合入后仍只有本机昵称） |
| 模板 | 6 内置 + 本地自定义（B 合入后：社区模板文件导入导出） | 付费/专属模板 |
| AI | 仅显式点击「智能识别名单」时外发文本 | 默认 AI、后台上报 |

维护规则：任何功能 PR 改变上表即须同 PR 更新本文件；lint 的漂移词表与本文件同处维护，配一致性测试（词表里的「没有」项必须能在本文件找到对应行）。

## 附录二 · 社区模板文件格式版本化规范（B 的机器可查规格）

### A2.1 格式定义（`cengfan-community-template` v1）

```json
{
  "kind": "cengfan-community-template",
  "formatVersion": 1,
  "exportedAt": "ISO-8601",
  "name": "1..40 字符",
  "author": "0..30 字符，可选，仅昵称",
  "baseTemplateId": "original|cartoon|grain|q|scenery|regional",
  "scope": "visual|layout",
  "document": "TemplateDocument（复用 isTemplateDocument 校验）",
  "scene": "SceneDocument，可选；guests.people 必须为 []"
}
```

顶层键为**封闭集合**（上表 9 键），出现集合外键一律拒收——隐私优先：未知字段是夹带通道。格式演进不靠「同版本加可选字段」，只靠升 `formatVersion` + 迁移函数（`migrateV1toV2` + 双版本测试）。

### A2.2 解析规则（错误优先级即判定次序）

1. JSON 解析失败 → 「模板文件不是有效的 JSON」（对齐 `parseResourcePack` 文案风格）。
2. `kind === "cengfan-project-package"` → 「这是工程包（含名单）。请在工程导入处使用；社区模板通道不收工程包」。其余 kind 不符 → 「不是蹭饭图模板文件」。
3. `formatVersion` 非正整数 → 拒收；`> 1` → 「模板版本 v{N} 过新，请升级应用后导入」。**拒收未知版本，绝不尽力解析。**
4. 深度扫描（对象与数组所有层级）命中键名 `students` → 整体拒收「模板包含学生数据，已拒绝导入」。不剥离、不部分导入。
5. 命中键名 `price|prices|sku|pricing|fee|payment|价格|套餐|结算` → 拒收（支付红线前置防线；社区模板永远免费交换，格式层面无价格字段可放）。
6. `document` 未过 `isTemplateDocument`、`baseTemplateId`/`scope` 非法 → 拒收并指明字段。
7. `scene.guests.people` 非空 → 拒收「模板不携带嘉宾名单」（同时导入侧强制置空作双保险）。

### A2.3 导出规则

`stripStudentData`（template-store.ts L43-52 复用）→ `scene.guests.people = []` → 顶层白名单投影 → **落盘前运行时断言**：序列化不含 `"students"` 子串，失败即抛、不产出文件。`textElements` 文本与内嵌图片（`background.imageSrc`/`regionalAssets`）走导出确认清单（见 B 隐私闸门）。

### A2.4 三格式关系（写进 `docs/社区模板/README.md`）

| 格式 | 版本 | 含名单？ | 社区投稿？ |
|------|------|---------|-----------|
| `cengfan-project-package` | v2 | 是 | **永不** |
| `cengfan-resource-pack` | v1 | 否（素材/字体） | 视素材授权 |
| `cengfan-community-template` | v1 | 结构性排除 | 是（唯一通道，AGPL 随仓分发，署名字段不可移除） |

### A2.5 回滚与冻结

v1 自合入即冻结；功能回滚时格式文档保留并标 deprecated（解释野外文件）；localStorage 模板存储（key 与 `CustomTemplateRecord` 形状）与本格式解耦，任何回滚不需用户侧迁移。

## 附录三 · 反馈 URL 查询参数白名单（A 的机器可查规格）

**Base**：`https://github.com/Xhhemoing/cengfan-map-studio/issues/new`；模板选择页 `/issues/new/choose` **必须零参数**。

### A3.1 允许的 query key（封闭集合，出现集合外键即测试失败）

| key | 允许值 | 说明 |
|-----|--------|------|
| `template` | 枚举 `bug.yml` / `feature.yml` / `feedback.yml` | 现有三模板 |
| `labels` | 枚举 `bug` / `enhancement` / `user-feedback` | 与模板 labels 字段一致（SOP §2 标签集） |
| `title` | 常量前缀 `[Bug] ` 等 | 不拼接任何运行时数据 |
| `where` | bug.yml 的 `where` 下拉枚举值之一 | GitHub issue forms 按字段 id 预填 |
| `env` | `{OS 家族} + {浏览器名} {主版本} · 应用 v{package.json version}` | 从 UA 解析三段，**不放完整 UA**（可含设备型号） |

**明确禁用的 key**：`body`（自由文本注入通道，一律不用——所有自由描述让用户在 GitHub 表单里自己写）、`assignees`、`projects`、`milestone`。

### A3.2 值与结构规则

- 所有值 `encodeURIComponent`；URL 总长 ≤ 512，超长优先截断 `env`。
- **类型层面隔绝**：`buildFeedbackUrl` 的参数类型只含 `{ appVersion, browser, os, template }`——签名里没有 project/students/roomId，评审看签名即可验证名单进不了 URL。
- 三栏总禁入表（A/E/F 共用）：学生任何字段、项目名与项目 id、roomId、邀请/访问 token、localStorage/IndexedDB 内容、AI 会话、完整 UA、昵称。

### A3.3 测试

key 集合 ⊆ 白名单；fixture 学生姓名/院校/城市 decode 后 not-in-URL；长度上限；chooser 零参数；`env` 值正则匹配三段格式。

## 9. Round 3「先写失败测试」锚点速查

| 项 | 第一条失败测试（新建或翻转） | 文件 |
|----|------------------------------|------|
| A | query key 白名单断言（函数尚不存在，红） | `src/lib/feedback-links.test.ts` |
| B | 注入 `students` 的恶意文件拒收断言 | `src/lib/template-package.test.ts` |
| C | 附录 A1.4 六处违规 fixture 命中断言 | `scripts/promo-lint.test.ts` |
| D | 主路径 `[aria-label="下载学生数据 XLSX 模板"]` 非空 | `DataWorkspace.test.tsx` + App 级 |
| E | `/api/rooms` 请求体 `displayName === 昵称` | `App.test.tsx` 房间用例扩展 |
| F | `buildExportFilename` 倍率/清洗断言（函数尚不存在，红） | `src/lib/export-filename.test.ts` |
| G | promo:check 存在性检查 CHANGELOG.md（红） | `promo:check` 输出断言（或人工） |
| H | **翻转既有固化**：`0 人 · 无缺失 … severity ok` 改为非 ok 期望 | `StudioAssistantDrawer.integration.test.tsx` L48 + `stage-overview.test.ts` |

## 10. 全部合入后仍存在的 SOTA 总差距（供 Round 3 之后规划）

1. **协议级**：RoomMember 无 displayName → 多人在场感（他人昵称/光标/在线态）缺；房间内存 30min TTL 无持久化。
2. **分发级**：无 HTTPS 公开 Demo（#7 在途）、Gitee 镜像未建、社区模板无画廊与 CI 投稿管线（依赖 #5）。
3. **度量级**：KPI 无隐私安全的数据源（只读 GitHub API 采集属 round1 P4，未入本包）；48h SLA 无审计自动化。
4. **治理级**：CI（#5）、CODE_OF_CONDUCT、good-first-issues 建帖回填、Discussions 开启均在包外。
5. **语义级**：promo:lint 是词表不是审读；导出无印刷规格（#3）。

以上差距全部有明确归属（在途 PR / 仓外运营 / 后续轮协议设计），不存在「无人认领」项。
