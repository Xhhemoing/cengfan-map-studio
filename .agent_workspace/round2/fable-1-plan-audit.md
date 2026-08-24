MODEL: claude-fable-5-thinking-xhigh

# Round 2 · R2-F1 计划交叉审计：A–H 裁决与 Round 3 锁定顺序

> 输入：`.agent_workspace/ROUND1-BRIEF.md` + `round1/` 全部 6 份报告 + `docs/开源与收费边界.md`。
> 方法：本轮全部关键断言都用 `rg` / 读文件 / `gh api`（只读）/ 实跑目标测试重新验证过，未验证的一律标注。只写本报告，不实现产品 UI，不提交，不碰支付。

---

## 0. 先说三个 Round 1 简报之后出现的新事实（直接改变裁决）

1. **在途 PR 名单已变：新增 #11 与 #12。** 简报只列了 #3–#10；实际 `gh pr list` 现在还有 [PR #11「SOTA 多轮打磨」](https://github.com/Xhhemoing/cengfan-map-studio/pull/11)（**89 个文件**：`src/App.tsx` −768 行、`DataWorkspace.tsx` 拆成 5 个 `data-workspace-*` 子组件、`server/index.ts` 1076→400 拆成 `server/*-routes.ts`、`card-layout` 拆成 11 个模块）与 [PR #12](https://github.com/Xhhemoing/cengfan-map-studio/pull/12)（本调研分支自身）。**#11 是全仓最大的冲突源，任何 Round 3 排序必须以它为第一约束**，简报的冲突分析对此完全空白。
2. **PR #8 的真实内容比简报预估的严重得多。** 简报只提醒 G「勿做仓库大清理（#8）」；实拉 #8 的 121 个文件补丁证实它**整体删除**：全部 `docs/宣发|私域|KOL|脚本库|宣发草稿|宣发复盘/*`、三个 `scripts/宣发流程-*.mjs`、`package.json` 里 `promo:check/content/report` 三条命令、`.agents/skills/cengfan-promo/SKILL.md`、`demo.html`、`function.md`、`frontUI2.md`、`docs/superpowers/`；并且**已经顺手修掉**案例模板里「本科率：85%」与「平均录取学校排名：Top 50（QS）」两处违规（见 #8 对 `docs/案例模板/普通高中-68人.md`、`国际部-12人.md` 的 patch）。这直接判了候选 C 的死刑（见 §1-C）。
3. **简报开放问题 7 的「预存在测试失败」已过时。** 本轮实跑：`npx vitest run src/lib/map-content-bounds.test.ts`（11 passed）、`src/App.test.tsx`（114 passed）、`template-store/template-document/stage-overview` 三件套（20 passed）。**Round 3 起点是绿色基线**，不需要先修旧账。

---

## 1. A–H 逐项裁决

结论速览：**keep = A、B、E、G；slim = D、F、H；drop = C**。

### A 应用内「提意见 / 帮助」跳转入口 —— **KEEP（组件先行、挂载后置）**

- **事实核验**：`rg "https?://" src/ -g '*.tsx'` 至今零命中（本轮复跑属实）；`.github/ISSUE_TEMPLATE/{bug,feature,feedback,config}.yml` 齐备。反馈漏斗断头成立。
- **PR 冲突**：挂载点 `src/components/StudioTopbar.tsx` 被 **#6** 改（新增 `statusChip` 插槽，纯增量，低危）；`src/components/workbench/WorkbenchHeader.tsx` **不在任何开放 PR 里**（已逐一比对 #3–#11 文件清单）——首选挂载点。注意 **#7** 会往 `ProjectWorkbench.tsx` 注入 `PROJECT_SOURCE_URL = "https://github.com/Xhhemoing/cengfan-map-studio"`（`src/lib/public-base-path.ts`，仅 public-demo 构建显示横幅）：A 不与它重复——A 指向 issue chooser / 用户指南，用途不同；若 #7 先合入，A 直接复用该常量，否则自建常量文件（零冲突）。
- **隐私**：预填只允许版本/系统/浏览器白名单，测试断言渲染结果不含任何 `project` 派生文本（`bug.yml` 第 9 行的脱敏警告是既有依据）。
- **AGPL**：无涉。侵入性：一个纯展示组件 + 两处一行挂载。
- **微调**：新 UI 文案不得硬编码六阶段名称——**#9 正在把阶段改名为「名单→地图→版式→内容→交付」**（改 `src/lib/workflow-stages.ts`），涉及阶段名一律引用常量。

### B 社区模板独立文件格式 + 导入/导出 —— **KEEP（Round 3 主菜）**

- **边界**：`docs/开源与收费边界.md` §3 原文特批「模板文件格式、内置/示例模板、贡献模板的文档」进仓；同文 §4 禁价格/结算字段。格式 schema 用键白名单实现「结构性无价格字段」。
- **事实核验**：`src/lib/template-store.ts:43-52` `stripStudentData`、`:115` `sanitizeCustomTemplateRecord`、`:254` localStorage 默认适配器，全部属实——导出剥离与导入拒收的地基现成。
- **PR 冲突**：**`template-store.ts`、`template-document.ts`、`TemplatePicker.tsx` 不被任何开放 PR 触碰**（已逐清单核对）——lib 层零冲突。两个风险点：① `TemplatePicker` 的唯一活宿主是 `GlobalSettingsScreen.tsx:300`（「数据板块」分区 → 「数据展示」页签），该文件被 #11 小改（+6/−3，低危）；② App 侧保存模板的接线区（`src/App.tsx:1123-1177`）被 **#11 重写**（patch 中可见 `已保存模板：` 一带被搬进 hooks）——**Round 3 的 UI 接线保持在 TemplatePicker 内部收口，不去 App.tsx 加新 handler**，导入/导出直接在组件内完成文件读写即可做到 App 零改动。
- **隐私双保险**：导出强制过 `stripStudentData`；导入遇到**任意层级** `students` 键整体拒收（fable-2 C2 的断言设计沿用）。
- **回滚**：新格式带 `version` 字段、拒绝未知版本；不动 `.cengfan` 工程包与资源包版本（`project-package.ts`/`resource-pack.ts` 列入禁触区）。这是唯一需要按 `AGENTS.md` 交付纪律登记回滚方案的项。

### C promo:lint + 违规文案修复清单 —— **DROP（移出 Round 3，改为 #8 裁决后的条件项）**

- **致命冲突**：C 的整个作用对象与 **#8 正面相撞**。#8 删掉 lint 要扫的全部语料（宣发/私域/KOL/脚本库文档）、删掉 `promo:*` 三条 npm 命令与三个脚本、删掉 promo skill。若 #8 合入，`promo:lint` 无处安放也无物可扫；若 #8 被拒，C 才重新有意义。**在 #8 未裁决前做 C 是纯浪费**，且简报把 C 标成「避开冲突：脚本+文档」是错误评估。
- **违规修复清单同样被 #8 吸收大半**：五处实锤违规（fable-2 §4.1）中「本科率 85%」「QS Top 50」已被 #8 的案例模板 patch 修掉；「KOL +500 Star」「`#985` 脚本」「小红书标题公式」所在文件被 #8 整体删除。
- **残值**：#8 版本的 `国际部-12人.md` 仍保留「世界地图切换」「布局：世界地图 + 手动微调」「留学咨询案例」——能力漂移（产品无世界地图，`MAP_TEMPLATE_IDS` 六个 id 已核实无 world）与教育营销擦边在**存活文件**里仍在。处置：写进 Round 3 交付说明，作为给维护者的 #8 评审意见（一条 review comment 的量），不立项。

### D 恢复 XLSX 模板下载 + 导入 aria-live —— **SLIM（拆两半：开关先行、a11y 后置）**

- **事实核验**：`src/App.tsx:1668` `hideTemplateDownload: true` 属实；按钮在 `DataWorkspace.tsx:504`；主皮肤下唯一残余入口是 `GlobalSettingsScreen` →「数据板块」→「人员数据」深层路径（该组件可从 `App.tsx:1391/1402/1405` 打开，见 §5-3 对「不可达」说法的修正）。
- **PR 冲突（简报低估）**：简报标「极低」，只对代码量成立，不对冲突面成立——D 触碰的是全仓最拥挤的文件：`App.tsx`（#5/#6/#9/#10/#11 全改）、`DataWorkspace.tsx`（#6/#10/#11，且 **#11 把它拆掉**）、`DataUploadWorkspace.tsx(+test)`（#9/#10/#11 全改）。已核实两点：① #11 的 App.tsx patch **不含** `hideTemplateDownload` 行，翻转布尔值可干净 rebase；② 导入消息 `<p className="panel-note data-message">`（`DataWorkspace.tsx:578`）被 #11 **搬进新组件** `data-workspace-import-state/panel`——aria-live 改在旧位置必然冲突。
- **裁决**：前半（删 `hideTemplateDownload: true`）保留且前置，断言放**新建测试文件**（勿动 `DataUploadWorkspace.test.tsx`，三个 PR 在改它）；后半（`role="status"`/`aria-live`）**推迟到 #11 落地后**在新组件上加，属一属性改动。

### E 协作本地昵称 + 角色文字标签 —— **KEEP（会员替代的产品面，API 零改动成立）**

- **事实核验**：`src/lib/app-constants.ts:11` 硬编码「本机协作者」、`useCollaborationRoom.ts:249,294` 传常量、`ProjectMenu.tsx:136` 退化成 `成员 ${clientId.slice(0,6)}`、服务端 `server/index.ts:530-531,595-596` 本就要求 `displayName` 必填但 `RoomMember`（`collaboration-client.ts:11-16`）不回传该字段——全部属实。本地昵称方案确实**零服务端改动**。
- **PR 冲突**：新 lib 文件零冲突；`app-constants.ts`、`useCollaborationRoom.ts` 不被任何开放 PR 触碰（#11 拆的是 `server/collaboration.ts`，不动客户端 hook）；`ProjectMenu.tsx` 被 **#10** 改 +4/−1（在导出区加「导出 PNG」按钮，成员列表区未动）——同文件不同区域，中低危。**注意 #10 会新建 `ProjectMenu.test.tsx`**，E 的组件断言要用别名测试文件（如 `ProjectMenu.identity.test.tsx`）避免撞新文件。
- **隐私/产品红线**：昵称只入 localStorage 与房间内存态（30min TTL），**不进 `ProjectDocument`、不进工程包**；不得宣称账号身份（`PRODUCT.md` 明令）。要在文案里说明「昵称对同房间成员可见」——昵称会随 create/join 出端，与现状常量同路径，无新增外发面。
- **收窄**：只做「我」的昵称与角色文字标签双通道展示；`RoomMember` 增 `displayName` 的全链路档（服务端契约变更）明确留在 Round 3 之外——#11 正在重写 `server/` 路由层，现在动房间协议是双倍冲突。

### F 导出文件名含项目名/倍率 + 成功结果条 —— **SLIM（只留文件名半条）**

- **事实核验**：`usePosterExport.ts:69`（`我的毕业去向图.svg`）、`:146`（`.png`）属实；`rg "我的毕业去向图" src` 仅 2 处生产代码、无测试断言旧名——改名无回归阻力。`usePosterExport.ts`、`export-poster.ts` **不被任何开放 PR 触碰**。
- **结果条撞车（简报未标）**：`DeliveryWorkspace.tsx` 是 **#3 + #10 双 PR 热点**——#3 在导出设置区插入打印尺寸提示（`describeExportPrintHint`），#10 在检查区插入 `role="status"` 的「检查全部通过：N 人 · 覆盖 M 个省市」状态行。再往同区域塞导出成功结果条 = 三方合并。且 #10 的状态行已部分覆盖「用户不确定出没出图」的诉求。
- **裁决**：保留「`buildExportFileName({projectName, kind, scale})` 纯函数 + `usePosterExport` 接线」（零冲突、可测），**结果条推迟到 #3/#10 落地后**再评估是否仍有缺口。不做打印尺寸（#3 已做，且边界文档 §2 禁印刷业务方向的扩张）。

### G CHANGELOG.md + 贡献者致谢规则 —— **KEEP（收窄为纯新增文件）**

- **事实核验**：根目录无 `CHANGELOG.md`；`DEVELOPER.md:152` 要求发布时更新它（矛盾属实）。注意 **#8 恰好删掉 DEVELOPER.md 的整个「发布流程」节**，也删掉定义周报格式的 `docs/宣发/反馈收集SOP.md`——G 的格式说明必须**内联写在 CHANGELOG 头部**，不能引用 SOP 路径。
- **PR 冲突**：`CHANGELOG.md` 与新建 `docs/社区/贡献者致谢.md` 均为**纯新增文件，零 diff 冲突**。收窄条件：**本轮不改 README（#3/#7/#8/#10 四个 PR 在改）、不改 CONTRIBUTING（#7/#8 在改）**，回链等那批 PR 落地后补。
- **边界**：致谢是「非付费会员」的合法兑现物（边界文档 §2 不涉、fable-2 M1/M3 的设计沿用：文档/模板/答疑与代码同权致谢；无外部贡献者时只放规则不放空表）。不做 #8 范围内的任何文档清理。

### H 工作台「重新载入示例」+ 空名单不判健康 —— **SLIM（前半保留，后半必须排到 #10 之后）**

- **事实核验**：播种只在 store 为空时发生（`ProjectWorkbench.tsx:67-75` `seededRef`），删光后无重载入口，属实；`stage-overview.ts:111-113` 空名单推 `data-clean` 属实。
- **后半直接撞 #10（简报未标）**：#10 的 patch **恰好改写同一个 `data-clean` 分支**（加「下一步：地图」动作卡），且**没有修 total=0 误判**——#10 合入后空名单会显示「名单数据健康 · 下一步：地图」，问题反而更显眼。修复必须基于 #10 的新代码写（`stage-overview.test.ts` 也被 #10 加了 35 行）。
- **前半的挂载点注意**：`ProjectWorkbench.tsx` 渲染区约 190 行处被 **#7** 插入 public-demo 横幅；「重新载入示例」按钮放 `WorkbenchHeader.tsx`（无 PR 触碰）或空态区，避开那一带；测试写新文件，勿动 `ProjectWorkbench.test.tsx`（#7 在改）。
- **裁决**：前半 keep（低危）；后半改为「#10 合入后的 total:0 补丁」，与 D 后半同批。

---

## 2. 冲突矩阵：热点文件 × 开放 PR

各 PR 一句话范围（标题以 `gh pr list` 实拉为准）：#3 印刷尺寸与案例模板（含**新增**普高文科/职高两份案例）、#5 CI（`.github/workflows/ci.yml`）与旧编辑器移除、#6 首屏体积与窄屏侧栏、#7 公开 Demo（Pages/静态构建/`public-base-path`）、#8 仓库清理（删全部宣发资产）、#9 功能入口重排（六阶段改名）、#10 studio UX（stage-overview 下一步卡 + Delivery/ProjectMenu 微调）、**#11 SOTA 重构（App/DataWorkspace/server/card-layout 大拆分）**。

| 文件 / 区域 | 被谁改 | 对 Round 3 的含义 |
|---|---|---|
| `src/App.tsx` | #5 #6 #9 #10 #11 | **头号禁区**。任何候选的 App 接线都压到最小（D 只翻一个布尔）或干脆不做（B 在组件内收口） |
| `src/App.test.tsx` | #5 #6 #9 #10 | 新断言一律放新测试文件 |
| `DataWorkspace.tsx` 及其拆分 | #6 #10 #11 | #11 拆成 `data-workspace-*`；aria-live（D 后半）等它 |
| `DataUploadWorkspace.tsx(+test)` | #9 #10 #11 | 同上 |
| `DeliveryWorkspace.tsx(+test)` | #3 #10 | F 结果条推迟 |
| `ProjectMenu.tsx` | #10（+新建其 test） | E 用别名测试文件 |
| `ProjectWorkbench.tsx(+test)` | #7 | H 前半避开横幅插入区 |
| `StudioTopbar.tsx` | #6 | A 首选 WorkbenchHeader 挂载 |
| `stage-overview.ts(+test)` | #10 | H 后半排 #10 之后 |
| `workflow-stages.ts` / `stage-metadata.ts` | #9 #10 | 阶段名只引用常量 |
| `server/*` 全部 | #11 | 房间协议/路由一律不碰 |
| `package.json`(scripts 区) | #5 #8 | 不加新 npm script（C 已 drop，无需求） |
| README / USER_GUIDE / CONTRIBUTING | #3 #7 #8 #10 | 本轮零改动 |
| `docs/宣发|私域|KOL/*`、`demo.html`、promo 脚本 | #8（整体删除） | 不新增不修改，等裁决 |
| **零 PR 触碰（安全区）** | — | `template-store.ts`、`template-document.ts`、`TemplatePicker.tsx`、`usePosterExport.ts`、`export-poster.ts`、`app-constants.ts`、`useCollaborationRoom.ts`、`WorkbenchHeader.tsx`、`CHANGELOG.md`（不存在） |

---

## 3. 锁定的 Round 3 实施顺序（先写失败测试再实现）

基线已实测为绿（§0-3），动工前只需复跑本表涉及的目标文件。**全程不跑并行全量校验（`AGENTS.md`），每项完成后 `npx vitest run <该项文件>` + 收尾一次 `npm run lint`。**

| 序 | 项 | 先写的失败测试（新文件） | 实现文件 | 验收断言 |
|---|---|---|---|---|
| 1 | G | 无（纯文档） | 新增 `CHANGELOG.md`、`docs/社区/贡献者致谢.md` | 格式四要素（收到/已改/不做+原因/感谢）内联自述；不引用 #8 待删路径；不改 README/CONTRIBUTING |
| 2 | E | `src/lib/collaboration-identity.test.ts`（默认回落/读写/超长截断/storage 不可用降级） | 新 `src/lib/collaboration-identity.ts`；改 `app-constants.ts`、`useCollaborationRoom.ts`（各 ≤3 行）、`ProjectMenu.tsx` 成员区；组件断言放 `ProjectMenu.identity.test.tsx` | 昵称+角色文字标签双通道；不进 ProjectDocument/工程包；服务端零改动 |
| 3 | F-slim | `src/lib/export-file-name.test.ts`（项目名/倍率/非法字符/空名回落） | 新 `src/lib/export-file-name.ts`；`usePosterExport.ts` 两处接线 | 三风格连导文件名互不覆盖；不动 DeliveryWorkspace |
| 4 | B | `src/lib/template-package.test.ts`（round-trip / 任意层级 `students` 拒收 / 未知 `version` 拒收 / 键白名单拒 `price|sku|结算` 类键） | 新 `src/lib/template-package.ts`；`TemplatePicker.tsx` 加导入/导出按钮（组件内收口文件 I/O，App 零改动）；新 `TemplatePicker.test.tsx` | 导出过 `stripStudentData`；格式带版本号；回滚方案写入 PR（拒未知版本即回滚面） |
| 5 | A | `src/components/FeedbackLink.test.tsx`（href/`rel="noopener noreferrer"`/aria/渲染不含 project 派生文本） | 新 `FeedbackLink.tsx`；挂 `WorkbenchHeader.tsx`（一行） | 预填仅环境元数据白名单；StudioTopbar 挂载等 #6 |
| 6 | D-前半 | 新测试文件断言数据阶段渲染「下载 XLSX 模板」按钮（当前失败） | 删 `App.tsx:1668` 的 `hideTemplateDownload: true`（一行） | 手动下载一次确认双 sheet；若 #11 先合入则在新结构上重做同一行 |
| 7 | H-前半 | 新测试文件断言删光项目后出现「重新载入示例」 | `WorkbenchHeader.tsx` 或空态区 + `createSampleProject()` 复用 | 避开 #7 横幅插入区 |
| 8 | 合流批（**#9/#10/#11 落地后**） | `stage-overview.test.ts` 加 `total: 0` 用例；aria-live 断言 | H-后半（基于 #10 的 data-clean 新代码）；D-后半（#11 的 `data-workspace-import-state`）；F 结果条缺口复评；A 的 StudioTopbar 挂载 | 每项单独小 PR，rebase 即回滚 |

**明确不碰（Round 3 全程）**：`server/collaboration.ts`、`server/index.ts` 及 #11 的全部 `server/*-routes` 拆分面；`card-layout*`、`PosterCanvas`、`connector-geometry`、`DisplayFrameSubcanvas`；`project-package.ts` / `resource-pack.ts` 版本；`vite.config.ts` / `main.tsx` / `scripts/build.mjs`（#7 领地）；`.github/workflows/`（#5 领地）；六阶段导航结构与 `GlobalSettingsScreen` 拆除（#9/#10/#11 + frontUI2 既有计划）；宣发文档语料与 promo 脚本（#8 领地）；`demo.html`（#8 删除中）；案例模板补缺（#3 已含普高文科/职高两份，**gpt-1 的 easy-win #1/#2 不得执行**）；支付/套餐/SKU/结算一切（边界文档 §4）。

---

## 4. 会员替代确认：E+G 是仓内「会员」工作的全部

- 复核 `rg -i '会员|订阅|套餐|vip' src/ server/ scripts/`：有效命中仅 `server/collaboration.ts:389` 的 SSE「订阅回调」（技术语义）与 gpt-2 已定性的 `tokenfreevip.cc.cd` AI 域名。**仓内不存在任何账号、等级、权益开关代码**；唯一身份机制是房间角色 `owner/editor/viewer`（已实现带测试）。
- 对照简报「会员机制的合法形态」四行：身份 → **E**（本地昵称+角色标签，消费既有角色数据）；被认可 → **G**（CHANGELOG 点名 + 致谢名录）+ **B 的可选 `author` 署名字段**（属格式定义，非结算，fable-1 灰区判定成立）；专属模板 → **B**（免费文件交换，键白名单挡价格字段）；优先支持 → 运营承诺（48h SLA），**无代码落点，正确**。
- 结论：**E+G（B 的署名字段作为附属）即仓内「会员」工作的全集**，且全部不触发边界文档 §4 触发词。任何超出此范围的「会员」提案（等级、兑换码、专属解锁、拉人裂变）按 fable-2 §6 反模式表一票否决。

---

## 5. Round 1 失实 / 过时 / 被遗漏的断言（均已实证）

1. **「预存在 4 个测试失败」已过时**（简报开放问题 7 / fable-1 §6.7）：`map-content-bounds.test.ts` 11 passed、`App.test.tsx` 114 passed（本轮实跑）。基线是绿的。
2. **简报冲突分析缺 #11**：#11（2026-08-24 更新，89 文件）重构了 A/D/E/H 全部要碰的宿主文件，是比 #3–#10 任何一个都大的冲突源。简报按 `3811e17` 快照写成，属信息过时而非推理错误，但**不注入此事实的 Round 3 排序会全部作废**。
3. **opus-2「`GlobalSettingsScreen` 近乎不可达」言过其实**（`round1/opus-2-editor-gaps.md` G4/G19④）：`App.tsx:1391/1402/1405` 三处主皮肤动作可打开它（canvas/cards/advanced 分区），打开后左侧分区导航可达全部六区，`TemplatePicker`（cards 区「数据展示」页签）两步可达。准确说法是「**深、无直达入口**，且 data 分区无主路径直接打开动作」。这不推翻 D（主路径隐藏仍成立），但 B 的 UI 挂点可用性比 Round 1 评估的好。
4. **简报把 C 标为「避开冲突：脚本+文档」是错误评估**：C 与 #8 的冲突是**范围级正撞**（§1-C 证据），不是 diff 级擦碰。同理 fable-1 的 P1-4（`promo:report` 接 GitHub API）目标脚本正被 #8 删除。
5. **gpt-1 §10 easy-win #1/#2（补两份案例模板）已被 #3 抢跑**：#3 文件清单含 `docs/案例模板/普高文科-55人.md`、`职高-80人.md`。gpt-1 报告未对照开放 PR，执行即制造重复。
6. **opus-1「UI 里连一条外链都没有」即将过期**：现状属实（本轮复核零命中），但 #7 合入后 `ProjectWorkbench` 在 public-demo 构建下会渲染 GitHub 源码链接。引用该结论排期的项（A）已在 §1-A 消化。
7. **fable-2 §4.1 违规清单的存续状态需更新**：5 处实锤中 2 处被 #8 patch 修复、2 处随文件被 #8 删除，仅「世界地图」能力漂移在 #8 后仍存活于 `国际部-12人.md`。「违规修复清单」作为 Round 3 工作项不再成立。
8. **准确性正面确认**（抽查未倒）：`App.tsx:1668` 开关、`app-constants.ts:11` 硬编码、`ProjectMenu.tsx:136` clientId 切片、`usePosterExport.ts:69/146` 固定文件名、`stage-overview.ts:111-113` 空名单误判、宣发脚本零 `process.exit`、`.gitignore:24-25` 挡商业目录、`package.json` license AGPL-3.0-only、GitHub description + 7 topics 已填 / Discussions 未开 / 仅 Issue #2、`AGENTS.md` 与 data-import SKILL 的 `src/server` 路径漂移（实际为根级 `server/`）——全部属实。

---

## 附：本轮验证手段清单

`gh pr list/view` + `gh api pulls/{3,5,6,7,8,9,10,11}/files`（含分页与 patch 级比对）；`gh api repos/...`（元数据）；`gh issue list`；`rg` 复核 §5 全部断言；实跑 `npx vitest run` × 5 个测试文件（安装依赖 `npm ci` 5s 缓存命中，全绿）。工作区除本报告与 `PROGRESS.md` 外无改动，未提交未推送。
