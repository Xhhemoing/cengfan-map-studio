MODEL: claude-fable-5-thinking-xhigh

# Round 1 · R1-F2 · SOTA 对标评审：社区 / 宣发 / 非付费会员替代 / 相邻产品能力

- **范围**：蹭饭地图工作室（AGPL-3.0-only 毕业班去向地图编辑器，目标用户为班委/班主任）的社区建设、宣发工具链、会员制替代方案与相邻产品功能，对标高质量开源创意工具与国内教育/社区实践。
- **性质**：仅研究，不改产品代码。
- **硬约束**（来自 `docs/开源与收费边界.md`）：本仓库不得出现支付/套餐/SKU/结算；社区模板的**文件格式与文档**允许进仓，手续费结算不允许；对外不得宣称升学率/就业率/录取率；不得出现真实学生姓名+去向组合。

---

## 0. 现状快照（证据索引）

**文档层（已相当完整）**

| 资产 | 路径 | 状态 |
|------|------|------|
| 宣发总流程（双漏斗、8 周计划、现实 KPI、渠道矩阵） | `docs/宣发/国内互联网宣发总流程.md` | ✅ 质量高，含 P0 阻塞清单 |
| 反馈闭环 SOP（48h SLA、周五 Changelog、征求意见置顶帖模板） | `docs/宣发/反馈收集SOP.md` | ✅ 文本完整 |
| good first issue 候选（7 条，一晚可完成粒度） | `docs/宣发/good-first-issues.md` | ✅ 但尚未真正建帖（文末要求补编号） |
| 投放文案（开发者/用户双版本，CTA 纪律明确） | `docs/宣发/投放文案-开发者社区.md`、`docs/宣发/投放文案-用户侧.md` | ✅ |
| 私域手册（用户群/开发者群分治、Tier 1–3 种子分层、需求收集表、案例投稿模板） | `docs/私域/*` 共 6 份 | ✅ 文本完整，激励承诺无产品落点 |
| KOL 话术/授权/合同 | `docs/KOL/*` 共 3 份 | ⚠️ 有合规残留（见 §4） |
| 案例模板 3 份 + 2 份缺口 | `docs/案例模板/*`；缺口列在 `scripts/宣发流程-素材检查.mjs` L40-41 | ⚠️ 含「本科率 85%」等违规口径 |
| 贡献指南 + Issue/PR 模板 | `CONTRIBUTING.md`、`.github/ISSUE_TEMPLATE/{bug,feature,feedback}.yml`、`.github/PULL_REQUEST_TEMPLATE.md` | ✅ 含隐私提示与支付红线勾选项 |

**工具层（半自动）**

- `npm run promo:check` → `scripts/宣发流程-素材检查.mjs`：仅检查**文件是否存在**，不检查内容合规。
- `npm run promo:content` → `scripts/宣发流程-内容生成.mjs`：静态模板拼接出草稿。
- `npm run promo:report` → `scripts/宣发流程-数据收集.mjs`：KPI 数据**全靠手填** `docs/宣发数据/current.json`（脚本 L86-87 自己承认）。

**产品层（社区钩子基本为零）**

- `src/` 全目录 grep「反馈/意见/征求/github.com/gitee」：**0 命中**（仅 `issues` 作为数据质量变量名出现）。应用内没有任何反馈入口、仓库链接、社区链接。
- 模板系统：`src/lib/template-store.ts` 已有自定义模板（含 `stripStudentData` 隐私剥离，L43-52），但**只存 localStorage**（L28），`src/components/TemplatePicker.tsx` 只有「应用/保存」，无导入导出——模板无法离开这台浏览器，谈不上「社区模板」。
- 可分享文件格式已有两种先例：`.cengfan` 工程包（`src/lib/project-package.ts`，v2）与资源包 JSON（`src/lib/resource-pack.ts`，v1），但**没有独立的模板文件格式**。
- 仓库治理缺件：无 `.github/workflows/`（无 CI）、无 `CODE_OF_CONDUCT`、无 `CHANGELOG.md`（周五「意见→改动」承诺无落地文件）、无 Discussions 模板。
- `docs/宣发复盘/验证报告-2026-08-14.md` 已自证：build 曾坏、GitHub description 为空、无 CI 门禁。

---

## 1. SOTA 能力矩阵

图例：✅ 已达标 / 🟡 部分 / ❌ 缺失。「可进本仓？」按 `docs/开源与收费边界.md` 判定。

| 能力 | SOTA 模式（对标对象） | 蹭饭图现状 | 差距 | 可进本仓？ |
|------|----------------------|-----------|------|-----------|
| **1. 社区模板：可分享文件格式** | Excalidraw `.excalidrawlib`：模板/素材是纯 JSON 文件，社区用 PR 投稿到公开仓，CI 校验后自动进画廊；Figma Community 的 remix 溯源 | ❌ `src/lib/template-store.ts` 模板锁死在 localStorage；只有 `.cengfan`（含学生数据的整工程）可分享 | 缺「不含名单、只含样式/布局」的独立模板文件格式与导入/导出 UI | ✅ 边界文档 §3 明示「模板文件格式、内置/示例模板、贡献模板的文档」允许进仓 |
| **2. 社区模板：投稿与展示通道** | Excalidraw libraries 仓：PR 投稿 → 脚本校验 → 静态画廊；Penpot Hub 的官方+社区模板分区 | ❌ `docs/案例模板/` 只有 3 份 markdown 说明书，非可导入模板；无投稿目录、无校验脚本、无画廊 | 缺 `docs/社区模板/`（或等价目录）+ 校验脚本 + 应用内「示例/社区模板」入口 | ✅（展示与格式进仓；手续费结算永不进仓） |
| **3. 模板/案例的隐私保障** | Figma/Canva 发布前强制预览与内容审核；教育类工具发布默认去标识 | 🟡 `template-store.ts` 的 `stripStudentData` + `createCustomTemplateFromProject` 显式丢弃 `students`（L170-199），有测试 `template-store.test.ts` | 剥离逻辑只覆盖 localStorage 路径；未来模板导出/投稿路径需同等强制 + 校验「含 students 即拒收」 | ✅ |
| **4. 应用内反馈入口** | Excalidraw 画布内直达 GitHub；VS Code「Report Issue」自动带环境信息；国内工具「意见反馈」进小程序客服 | ❌ `src` 无任何反馈/仓库链接；反馈全靠用户自己找到 GitHub（`docs/宣发/国内互联网宣发总流程.md` L18 承认「贡献入口残缺」是 P0） | 缺帮助菜单/关于面板：提意见（预填环境信息、不预填名单）、用户指南、Changelog 链接 | ✅ |
| **5. 反馈闭环运营** | GitHub Discussions 置顶征求意见 + 48h triage SLA + 每周「你的意见变成了什么」（如 Godot/Blender 周报） | 🟡 SOP 文本一流（`docs/宣发/反馈收集SOP.md`），但仓库无 `CHANGELOG.md`、无标签自动化、Discussions 未开启（总流程 §5 Week0-1 仍是未勾选项） | 承诺（48h、周五公报）无仓内落点，无法审计是否兑现 | ✅ |
| **6. 新贡献者引导** | good-first-issue 计划（Kubernetes/首个 PR 一晚完成）、CONTRIBUTING 分流表、双语欢迎 | 🟡 `CONTRIBUTING.md` 分流表 + `docs/宣发/good-first-issues.md` 7 条候选，粒度正确 | Issue 未实际创建（无编号）；无 CI 使「一晚 PR」能自助验证；无 CODE_OF_CONDUCT（`CONTRIBUTING.md` 的「行为」节太薄） | ✅ |
| **7. 非付费「会员」/角色阶梯** | 开源贡献者阶梯（contributor→reviewer→maintainer）；All Contributors 规范（文档/设计/答疑与代码同等致谢）；Figma Community 创作者主页署名 | 🟡 `docs/私域/用户群运营手册.md` §四 有 Tier 1–3 分层与「核心贡献者角色/证书」承诺；`docs/私域/开发者群运营手册.md` 明确「不要发空头证书」 | 承诺全部无仓内实体：无致谢清单、无案例墙署名机制、无模板作者署名字段；「每月专属模板定制」接近付费会员话术，需改写为公开产物 | ✅（署名/致谢/角色进仓；任何「专属付费权益」不进仓） |
| **8. 产品内协作角色** | Figma/Penpot 的 viewer/editor 显式角色 | 🟡 `PRODUCT.md` L32 已要求显式参与者角色；`USER_GUIDE.md` §二.5 已有「可编辑/仅查看」邀请凭证 | 角色是协作房间层的，与「社区身份」无关但可复用其 UI 语汇；按 `docs/design/DESIGN-CONTRACT.md` L119 不得凭房间 ID 获得编辑权 | ✅ |
| **9. 宣发内容生产工具** | 营销资产 lint（品牌词/禁用词检查）、从产品真实截图流水线出图 | 🟡 `promo:content` 能出草稿、`promo:check` 只查文件存在；草稿模板里仍有违规残留（见 §4） | 缺「内容合规 lint」：禁用词、能力漂移词（宣称产品没有的功能）自动拦截 | ✅ |
| **10. 宣发效果度量** | Plausible/自建计数的 Demo 打开与导出埋点（可自托管、无 PII）；GitHub API 自动拉 Star/Issue | ❌ `scripts/宣发流程-数据收集.mjs` 全手填；KPI 表（总流程 §7）里「Demo 打开/导出数」无任何数据来源 | 缺只读 GitHub API 采集 + （可选、默认关闭的）本地导出计数；注意隐私默认（名单不出浏览器是核心卖点，README L6） | ✅（只读统计脚本可进；不得引入上报真实名单的埋点） |
| **11. 可分享 Demo** | Excalidraw/Penpot 免安装即用是获客根基；国内班级纪念册工具全部是「打开即用」小程序/H5 | ❌ 总流程 §0 P0 第一条：无 HTTPS Demo；现网 `121.5.16.236:8787` 不能对外 | 静态可运行构建（去协作/去 AI）+ 部署文档属产品工程范围 | ✅（部署脚本/静态构建进仓；域名/备案是仓外运营） |
| **12. 国内镜像与可达性** | 国内开源项目标配 Gitee 镜像 + README 双链 | 🟡 `docs/宣发/Gitee镜像清单.md` 步骤完整，README L72 已链该文档 | 镜像未建（文档内仍是 `<你的用户名>` 占位符） | ✅（文档进仓；建仓是仓外操作） |
| **13. 治理与发布纪律** | CI 必跑 lint+test；发布 notes 点名贡献者；语义化版本 | ❌ 无 `.github/workflows/`；`docs/宣发复盘/验证报告-2026-08-14.md` §三 已把「npm run check 必须进 CI」列为第一缺口 | CI、CHANGELOG、发布流程三缺 | ✅ |
| **14. 案例墙 / UGC 展示** | Figma Community 精选页；美篇/初页类工具的「优秀作品」信息流；README 案例墙 | 🟡 `docs/私域/案例投稿模板.md` 有投稿格式；`docs/KOL/内容授权协议.md` 有授权链路；无展示实体 | 缺 README/docs 案例墙页面（脱敏 PNG + 署名）与「投稿→授权→上墙」的仓内流程文件 | ✅（展示进仓；「优秀作品获实体海报定制」这类奖励口径见 §6 反模式） |
| **15. 教育场景内容合规** | 国内教育内容平台对升学率类宣称强监管；SOTA 是把红线写进 lint 与模板 | 🟡 红线在多处文档反复声明（总流程 §9 等），但案例模板/KOL 话术/生成脚本仍有残留（§4 列表） | 缺机器可查的单一红线清单 | ✅ |

**对标国内班级纪念册/毕业墙工具的差异化结论**：这类工具（小程序形态的班级相册、毕业墙 H5）赢在「免安装 + 模板即开即用 + 班级群裂变」，输在「数据入平台、VIP 解锁、打印生意」。蹭饭图的 SOTA 位置应当是「Excalidraw 式的本地优先 + 文件格式开放 + PR 制社区模板」，把「名单不出浏览器」（README L6）打成对班主任的第一信任卖点，而不是模仿小程序的会员裂变。

---

## 2. 可测试的验收标准

### 2.1 社区（模板 + 贡献）

| # | 验收标准 | 测法 |
|---|---------|------|
| C1 | 存在独立的社区模板文件格式（建议 `.cengfan-template`，JSON，带 `version`/`name`/`author?`/`baseTemplateId`/`document`/`scene?` 字段），与 `.cengfan` 工程包（`src/lib/project-package.ts`）明确区分 | vitest：序列化→解析 round-trip；版本字段缺失/未知版本给出可读错误（对齐 `parseResourcePack` 的既有风格） |
| C2 | 模板文件**结构性排除**学生数据：导出路径复用 `stripStudentData`；导入路径遇到任何层级的 `students` 键即整体拒绝并提示 | vitest：构造含 `students` 的恶意模板文件，断言拒收；现有 `src/lib/template-store.test.ts` 扩展 |
| C3 | `TemplatePicker`（或后继组件）有「导出模板 / 导入模板」入口，且导入失败信息可读（非静默） | 组件测试：断言按钮存在、错误态文案渲染 |
| C4 | 仓内有社区模板投稿目录（如 `docs/社区模板/`）+ 校验脚本（`node scripts/validate-community-template.mjs <file>`），投稿规则写进 `CONTRIBUTING.md` | 脚本有自测；对 3 个内置示例模板跑通过、对含名单样例跑失败 |
| C5 | `docs/宣发/good-first-issues.md` 的 7 条候选全部建为真实 Issue 并回填编号（文件 L106 的自我要求） | 人工核对：每条有 GitHub 编号链接 |
| C6 | 有 `CODE_OF_CONDUCT.md`（可从 `CONTRIBUTING.md` 「行为」节扩写，含「不贬低学校/学生/去向」条款）且 README/CONTRIBUTING 链接它 | 链接检查脚本或人工 |

### 2.2 宣发工具链

| # | 验收标准 | 测法 |
|---|---------|------|
| P1 | 新增 `promo:lint`：扫描 `docs/宣发*`、`docs/脚本库/`、`docs/案例模板/`、`docs/KOL/`、`scripts/宣发流程-内容生成.mjs`，命中禁用词（`升学率|就业率|录取率|本科率|985 占比|一眼看清全班未来`）即非零退出并打印文件:行号 | vitest 给 lint 函数喂正反样例；CI 挂钩 |
| P2 | `promo:lint` 同时做**能力漂移检查**：维护一份产品能力清单（如 `docs/宣发/能力清单.md`：导出=PNG/SVG/.cengfan，地图=中国），文案宣称清单外能力（当前实锤：「导出 PDF」「世界地图」，见 §4）即告警 | 对现存文案跑出已知违规，修复后归零 |
| P3 | `promo:check` 除文件存在性外，调用 `promo:lint`；全绿才提示「可发」 | 脚本退出码测试 |
| P4 | `promo:report` 的 GitHub 侧数据（Star/Issue/PR 数）改为 `gh` 或 GitHub REST 只读拉取，手填仅剩平台后台类数据 | 脚本在无网时优雅降级为手填并明确标注数据来源 |
| P5 | 仓库有 CI（`.github/workflows/ci.yml`）：PR 必跑 `npm run lint` + 相关 vitest + `promo:lint`（文档改动时） | PR 上可见检查项 |

### 2.3 非付费「会员」/角色（会员制替代）

| # | 验收标准 | 测法 |
|---|---------|------|
| M1 | 仓内有单一致谢机制（README「贡献」节 + `docs/社区/贡献者名录.md` 或 All-Contributors 清单），明确「文档/模板/脱敏数据/答疑与代码同等致谢」（呼应 `CONTRIBUTING.md` L15-22） | 文件存在且被 README 链接；无外部贡献者时只放规则不放空表（good-first-issues #7 的要求） |
| M2 | 社区模板文件格式含可选 `author`/`attribution` 字段，应用内展示模板来源署名（昵称，不含学校/学生信息） | vitest：字段解析；组件测试：署名渲染 |
| M3 | `docs/私域/用户群运营手册.md` §四 的 Tier 激励全部改写为**仓内可兑现物**：Changelog 点名、案例墙署名、README 致谢；删除或改写「每月专属模板定制」「实体海报定制」类无落点/越界承诺 | 文档 diff 审查：不再出现无实体承诺（开发者群手册 L44「不要发空头证书」已是正确基调，向用户群手册对齐） |
| M4 | 「角色」不解锁任何产品功能：全体用户功能集相同；协作房间的 editor/viewer 是项目权限而非会员等级（`docs/design/DESIGN-CONTRACT.md` L119 邀请授权原则） | 代码审查：不存在按身份/等级开关功能的分支 |

### 2.4 反馈闭环

| # | 验收标准 | 测法 |
|---|---------|------|
| F1 | 应用内有「帮助/反馈」入口：链接到 Issue 模板选择页、用户指南、Changelog；Bug 预填仅含系统/浏览器/版本，**绝不**预填项目数据 | 组件测试：断言链接 href 与预填内容白名单 |
| F2 | 仓库根有 `CHANGELOG.md`，结构对齐 `docs/宣发/反馈收集SOP.md` §4 的周报格式（收到 N 条 / 已改 / 明确不做+原因 / 感谢） | 文件存在；每个发布周期新增一节 |
| F3 | Issue 标签集按 SOP §2 建齐（`user-feedback`、`dev-feedback`、`good first issue`、`help wanted`、`needs-repro`、`wontfix`、`duplicate`）且 Issue 模板的 labels 字段与之一致（现状：`feedback.yml` 用 `user-feedback` ✅，`bug.yml`/`feature.yml` 已有 `bug`/`enhancement` ✅） | `gh label list` 对照 |
| F4 | 48h SLA 可审计：维护者对「非自己开的」Issue 首响时间可从时间戳复盘（SOP §3 承诺）；连续 2 周超时应在周报里说明 | 复盘时用 `gh` 拉取核对 |
| F5 | 需求收集表（`docs/私域/需求收集表.md`）的「周日转录成 Issue」有留痕：转录 Issue 带 `user-feedback` 标签与来源标注 | 抽查 Issue 列表 |

---

## 3. 「只加文档、没有产品钩子」会在 SOTA 评审中直接挂掉的点

1. **反馈漏斗断头**：SOP 承诺 48h 回复（`docs/宣发/反馈收集SOP.md`），但应用内 0 个入口（`src` grep 0 命中）。班主任在本地浏览器里用工具，永远不会「顺路」走到 GitHub。SOTA 评审第一问就是「用户在产品里卡住时，下一次点击是什么」——现在答案是「关掉页面」。
2. **「社区模板」名不副实**：边界文档特批了模板文件格式进仓（`docs/开源与收费边界.md` §3），但产品里模板出不了 localStorage（`src/lib/template-store.ts` L252-277）。没有文件格式与导入导出，`docs/私域/案例投稿模板.md` 收上来的只能是 PNG 截图，社区无法「用别人的模板」，与 Figma/Excalidraw 的差距是类别级的，不是程度级的。
3. **激励承诺空转**：用户群手册许诺「核心贡献者角色/证书/专属模板定制」（`docs/私域/用户群运营手册.md` §四），仓内无任何署名、致谢、案例墙实体。开发者群手册自己都警告「不要发空头证书」（`docs/私域/开发者群运营手册.md` L44）。空头激励比没有激励更伤社区信任。
4. **周五 Changelog 无载体**：双漏斗的「主转化器」（SOP §4：「没有这篇，就不要抱怨没人提意见」）依赖一个不存在的 `CHANGELOG.md` 与未开启的 Discussions。
5. **KPI 不可测**：总流程 §7 的核心指标「Demo 打开次数 / 有效试用（导出过图）」没有任何数据源；`promo:report` 手填 JSON 等于自我汇报。评审会认定 KPI 体系是装饰。
6. **文案与产品脱节无人拦截**：文档宣称「导出 PDF」（`docs/私域/毕业季-checklist.md` L13、`docs/KOL/合作话术.md` L97、案例模板多处）与「世界地图模板」（`docs/案例模板/国际部-12人.md` L15），而产品导出只有 PNG/SVG/.cengfan（README L84、`USER_GUIDE.md` §二.4），地图模板 ID 列表无世界地图（`src/lib/template-store.ts` L29）。只加文档会持续制造这种漂移；没有 `promo:lint` 这类产品侧钩子，每次评审都会重新挂在同一处。
7. **无 CI 使 good-first-issue 承诺失效**：新人「一个晚上完成」的前提是 PR 能自助验证。无 `.github/workflows/`，首个 PR 的反馈完全依赖维护者手跑，48h SLA 会被验证成本吃掉（`docs/宣发复盘/验证报告-2026-08-14.md` 已把 CI 列为第一缺口）。

---

## 4. 隐私 / AGPL / 内容政策验收闸门

### 4.1 内容政策闸门（当前实锤违规，修复是 gate 前提）

| 违规 | 位置 | 处置 |
|------|------|------|
| 「本科率：85%」 | `docs/案例模板/普通高中-68人.md` L10 | 删除或改为省份分布口径。注意 `docs/宣发/good-first-issues.md` L60 声称口径已于 2026-08-15 修完——案例模板漏网，说明需要 P1 的机器 lint 而非人工承诺 |
| 「平均录取学校排名：Top 50（QS）」+ 衍生用途「留学咨询案例」 | `docs/案例模板/国际部-12人.md` L11、L31 | 录取排名是录取率的近亲口径；「留学咨询案例」与教育营销监管红线贴脸，建议删除 |
| Tier 1 话术承诺「预计带来 500+ GitHub Star」与「您粉丝中 985 去向分布」专属数据 | `docs/KOL/合作话术.md` L44、L74-80 | 文件头部（L3）已要求删除 Star 许诺，但正文未删干净；「985 去向分布」违反用户侧文案自己的禁令（`docs/宣发/投放文案-用户侧.md` L71「不要写 985 占比」） |
| 标题公式「985 vs 普本，一眼看清全班未来」 | `docs/宣发政策-小红书与社交平台.md` L66 | 分层对比口径，等价于升学率宣称，删除 |
| 生成脚本内嵌 `#985` 标签与「某 985 高校附属中学」案例、「领导当场表扬」话术 | `scripts/宣发流程-内容生成.mjs` L97、L113、L52 | 脚本模板与禁用词清单对齐；这是 §2.2-P1 lint 的第一批测试样例 |

**闸门定义（内容）**：`promo:lint` 对上述禁用词/能力漂移词零命中；对外任何图片素材姓名打码（总流程 §9）；案例/示例数据虚构且声明虚构（README L30 已示范正确写法）。

### 4.2 隐私闸门

1. **名单不出端**：默认路径下学生数据只在 IndexedDB/localStorage（README L103）；任何新增网络功能（统计、模板分享、反馈预填）不得携带 `students` 或姓名字段。测法：对新增出站 payload 做 schema 断言。
2. **模板/资源文件格式结构性无名单**：导出剥离 + 导入拒收双保险（§2.1-C2）；`.cengfan` 工程包含名单，因此**工程包不进社区投稿通道**，投稿只收模板文件与脱敏 PNG——这条要写进投稿文档。
3. **AI 边界**：仅在用户显式开启「智能识别名单」时外发文本（README L111），社区/宣发功能不得默认接入 AI。
4. **反馈预填白名单**：Issue 预填只允许版本/系统/浏览器（§2.4-F1）。
5. **群与 Issue 的名单拦截**：SOP 与群规已有「删除+提醒」流程（`docs/私域/用户群运营手册.md` §五场景2），gate 是把同样规则写进 Issue 模板首屏（现状 `bug.yml` L9 已有 ✅）。

### 4.3 AGPL / 许可闸门

1. 全仓许可口径统一为 AGPL-3.0-only：`LICENSE`、`package.json` L5、README L109 现已一致 ✅；gate 是任何新文档不得回退「MIT/可闭源商用」表述（边界文档 §5 明令）。
2. 外部贡献合入前确认贡献者接受 AGPL 再分发（边界文档 §1；`CONTRIBUTING.md` L76 已声明「提交即授权」✅）。
3. 社区模板文件随仓分发即随 AGPL（边界文档 §3）；投稿文档必须向作者讲清这一点，且署名字段不可被移除（对齐 `docs/KOL/内容授权协议.md` §三的署名义务）。
4. 视觉参考物许可隔离：`docs/design/DESIGN-CONTRACT.md` Changelog（2026-08-08）已标记 Animal Island UI 为 CC-BY-NC-4.0 仅参考——gate 是社区模板校验时同样检查内嵌图片素材来源声明（投稿模板加「素材已获授权/自制」勾选项）。
5. **支付红线扫描**：PR 模板已有勾选项（`.github/PULL_REQUEST_TEMPLATE.md` L10）；gate 升级为 CI 关键词扫描（`微信支付|预支付|sku|套餐价格|商户号`，边界文档 §4 给出的清单）。
6. **边界待澄清项**：`docs/KOL/合同模板.md` §二含 KOL 服务费支付条款（支付宝/微信账户、滞纳金）。这是营销采购合同模板而非产品计费代码，按边界文档字面（禁的是「支付、套餐、订单、兑换码、模板手续费结算」的**实现**）不算违规，但它是全仓唯一出现支付账户字样的文件，建议在文件头加一行「本文件是线下商务合同模板，与产品收费无关，产品支付代码永不进仓」以免评审误判，或移出仓库。

---

## 5. Top 5 SOTA 对齐的仓内功能（含可度量的 done-when）

按「先把漏斗接通、再放大流量」排序，全部在边界文档允许范围内。

### F1. 社区模板文件格式 + 导入导出（对标 Excalidraw `.excalidrawlib`）
- **改动面**：`src/lib/` 新增 `template-package.ts`（复用 `resource-pack.ts` 的版本化/校验风格与 `template-store.ts` 的 `stripStudentData`）；`TemplatePicker.tsx` 加导入/导出；`CONTRIBUTING.md` 与新建 `docs/社区模板/README.md` 写投稿规则。
- **Done-when**：①round-trip、拒收含 `students` 文件、未知版本报错三类 vitest 全绿；②手动验收：A 浏览器导出模板 → B 浏览器导入并应用到含名单项目，名单不变、样式生效；③投稿校验脚本对首批 ≥3 个内置模板文件通过；④`promo:check` 增加「社区模板目录存在」检查项。

### F2. 应用内「帮助与反馈」入口
- **改动面**：`StudioTopbar.tsx` 或 `GlobalSettingsScreen.tsx` 加帮助菜单：提意见（Issue 模板链接）、用户指南、Changelog、版本号（`package.json` version 注入）。
- **Done-when**：①组件测试断言四个链接与 href；②预填内容白名单测试（不含任何项目数据）；③断网时入口仍可见且提示「需联网打开」；④上线后 4 周内出现 ≥1 条来源标注为应用内入口的 Issue（对照总流程 §7「非自己开的 Issue ≥15」）。

### F3. 宣发合规 lint（`promo:lint`）
- **改动面**：`scripts/` 新增 lint 脚本 + `docs/宣发/能力清单.md`（单一事实源：导出格式、地图范围、模板数）；接入 `promo:check` 与 CI。
- **Done-when**：①对 §4.1 五处实锤违规全部报出（作为回归测试固定下来）；②修复后全仓零命中；③`npm run promo:check` 在有违规时非零退出；④vitest 覆盖禁用词/能力漂移/白名单（如「不写升学率」这类否定句不误报——现有文档大量出现禁用词的合规用法，lint 需支持行内豁免标记）。

### F4. CHANGELOG + CI 门禁（反馈闭环与贡献自助化的载体）
- **改动面**：根目录 `CHANGELOG.md`（首条即写明周报结构，对齐 SOP §4）；`.github/workflows/ci.yml` 跑 `npm run lint` + 改动关联 vitest + `promo:lint`；good-first-issues 7 条建帖回填编号。
- **Done-when**：①PR 页面出现必过检查；②连续 2 个周期 CHANGELOG 有「收到 N/已改/不做+原因/感谢」四要素；③首个外部 good-first-issue PR 无需维护者手跑验证即可判断可合（CI 绿）；④`docs/宣发复盘/验证报告-2026-08-14.md` 列的「build 曾坏、无 CI」缺口关闭。

### F5. 案例墙 + 贡献者名录（非付费会员的仓内兑现物）
- **改动面**：`docs/社区/案例墙.md`（脱敏 PNG + 署名 + 场景标签，入口链自 README）+ README「贡献与致谢」节（good-first-issues #7）+ 投稿流程串联既有 `docs/私域/案例投稿模板.md` 与 `docs/KOL/内容授权协议.md`；同步改写用户群手册 §四 的激励为这些实体。
- **Done-when**：①案例墙有 ≥1 个真实（或明确标注虚构演示的）脱敏案例，姓名零暴露；②每条案例有署名与授权留痕（协议编号或 Issue 链接）；③用户群手册不再含无实体承诺；④8 周 KPI「真实案例 ≥5」（总流程 §7）有了可指向的落点页面。

---

## 6. 必须拒绝的反模式（评审一票否决）

| 反模式 | 为什么拒 | 依据 |
|--------|---------|------|
| 付费 VIP / 会员等级 / 模板付费解锁 / 「专业版」功能开关 | 支付与套餐永不进本仓；免费角色不得演化为收费 SKU 的仓内前置 | `docs/开源与收费边界.md` §2、§4 |
| 学校统付 / 年级打包授权 / 「联系我们获取校园版报价」 | 出图是班级自付行为，明确「不做」 | 边界文档 §2 表格右列 |
| 印刷服务 / 官方打印套餐 / 「实体海报定制」奖励 | 「不做印刷生意」；注意 `docs/KOL/合作话术.md` L128「实体海报定制奖励」与 `docs/宣发政策-小红书与社交平台.md` L107「小礼品」已是擦边表述，应改为署名/致谢类奖励 | 边界文档 §2 |
| 闭源 SaaS 口径（「我们托管、无需源码」）或回退 MIT 商用话术 | AGPL-3.0-only 下修改后托管必须开源；旧 MIT 口径已作废 | 边界文档 §1、§5 |
| 支付 SDK / 商户号 / 兑换码 / 模板手续费结算代码，包括写进 `.env.example` | 强制红线，PR 直接拒 | 边界文档 §4；`.github/PULL_REQUEST_TEMPLATE.md` L10 |
| 把导出按钮/核心功能做成付费锁或注册墙 | 核心导入/布局/导出保持可自建 | 边界文档 §2 |
| 升学率/就业率/录取率/本科率/985 占比等任何比率宣称与分层对比 | 合规红线 + 平台限流风险；§4.1 的存量违规须先清零 | 总流程 §9；`docs/宣发/投放文案-用户侧.md` L71 |
| 真实姓名+去向同框（案例墙、Issue、群文件、宣发图） | 隐私红线 | README L112；总流程 §9 |
| KOL 合同承诺 Star 数 / 「粉丝去向数据分析」 | 既不可兑现又违反数据口径红线 | `docs/KOL/合作话术.md` L3 自我禁令 vs L44/L74 残留 |
| 拉人裂变解锁（「邀请 3 人进群解锁模板」） | 国内小程序会员套路，与本地优先、AGPL 免费自建的定位冲突，且把社区变成流量池 | 定位依据：README L6、边界文档 §5 |
| 默认开启的遥测/埋点（尤其携带名单或去向字段） | 摧毁「名单默认在本地」的第一信任卖点；统计只允许显式可关、无 PII | README L6、L111 |
| 双真相源（Gitee 独立收 Issue、复制一份互相打架的宣发计划） | 已有明确禁令 | `docs/宣发/Gitee镜像清单.md` §4；`.agents/skills/cengfan-promo/SKILL.md` 任务表第一行 |

---

## 附：本报告引用路径清单

`docs/开源与收费边界.md` · `docs/宣发/国内互联网宣发总流程.md` · `docs/宣发/反馈收集SOP.md` · `docs/宣发/good-first-issues.md` · `docs/宣发/投放文案-开发者社区.md` · `docs/宣发/投放文案-用户侧.md` · `docs/宣发/Gitee镜像清单.md` · `docs/宣发政策-小红书与社交平台.md` · `docs/宣发复盘/验证报告-2026-08-14.md` · `docs/私域/用户群运营手册.md` · `docs/私域/开发者群运营手册.md` · `docs/私域/需求收集表.md` · `docs/私域/案例投稿模板.md` · `docs/私域/每周推送模板.md` · `docs/私域/毕业季-checklist.md` · `docs/KOL/合作话术.md` · `docs/KOL/内容授权协议.md` · `docs/KOL/合同模板.md` · `docs/案例模板/985-附属中学.md` · `docs/案例模板/普通高中-68人.md` · `docs/案例模板/国际部-12人.md` · `docs/脚本库/成果-3版.md` · `docs/design/DESIGN-CONTRACT.md` · `PRODUCT.md` · `README.md` · `USER_GUIDE.md` · `CONTRIBUTING.md` · `.github/ISSUE_TEMPLATE/{config,bug,feature,feedback}.yml` · `.github/PULL_REQUEST_TEMPLATE.md` · `scripts/宣发流程-素材检查.mjs` · `scripts/宣发流程-内容生成.mjs` · `scripts/宣发流程-数据收集.mjs` · `src/lib/template-store.ts` · `src/lib/project-package.ts` · `src/lib/resource-pack.ts` · `src/components/TemplatePicker.tsx` · `package.json` · `.agents/skills/cengfan-promo/SKILL.md` · `.agents/skills/cengfan-data-import/SKILL.md`
