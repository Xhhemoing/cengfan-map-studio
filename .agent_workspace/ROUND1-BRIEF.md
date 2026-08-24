# Round 1 结论简报

模型来源：2× claude-fable-5-thinking-xhigh、2× claude-opus-5-thinking-high-fast、2× gpt-5.6-sol-xhigh-fast  
仓库快照：`cursor/feature-expansion-research-c710` @ `3811e17` + Round 1 报告  
日期：2026-08-24

## 一句话

文档层的社区/宣发/私域已经接近完整，产品层几乎没有钩子；「会员」在本仓只能做成非付费角色与致谢，不能做成套餐。Round 2 必须收敛出一份**避开在途 PR、不碰支付、可测可回滚**的落地清单，供 Round 3 实现。

## 已实现（基线）

| 面 | 事实 |
|----|------|
| 核心编辑器 | 导入 / 布局 / 导出 PNG·SVG·`.cengfan`、工作台示例播种、AI 助手（含测试）均已落地 |
| 协作 | `owner/editor/viewer` + 一次性邀请 + 只读/关闭，服务端有测试；房间内存 30min TTL |
| 模板 | 6 个内置地图模板 + localStorage 自定义模板，已有 `stripStudentData` |
| 宣发文档 | 总流程、投放文案、私域 6 份、KOL、案例模板 3 份、`promo:check/content/report` 脚本 |
| GitHub 元数据 | description 与 7 个 topics **已经填好**（宣发总流程里「为空」的说法过时） |
| 收费边界 | `src/` `server/` `package.json` **无支付 SDK**；`.gitignore` 已挡 `.local-commercial/` |

## 遗留缺陷（跨报告共识）

1. **应用内零反馈入口**：`src/**` 无 github/反馈/意见外链；SOP 写「若已做」，总流程却当成既有入口。
2. **社区模板名不副实**：模板锁死 localStorage，没有独立交换格式；边界文档 §3 已特批格式进仓。
3. **主路径关掉 XLSX 模板下载**：`App.tsx` `hideTemplateDownload: true`，对应用户指南 FAQ 第一条。
4. **宣发脚本不可作门禁**：`promo:check` 只查文件存在、退出码恒 0；`promo:report` 缺 `docs/宣发数据/` 仍 exit 0；零测试。
5. **合规残留**：案例模板「本科率 85%」、KOL「+500 Star」、内容脚本 `#985`、多处宣称「导出 PDF / 世界地图」（产品没有）。
6. **协作显示名硬编码** `COLLABORATION_DISPLAY_NAME = "本机协作者"`；成员 UI 退化成 clientId 切片。
7. **治理缺口**：无 `.github/workflows/`、无 `CHANGELOG.md`、Discussions 未开、good-first-issues 未建帖。
8. **死资产**：根目录 `demo.html` 不进构建；示例 CSV/工程包在 `docs/` 不在 `public/`；`WorkflowGuide` / `GlobalDataScreen` 非测试引用为 0。
9. **文档漂移**：`AGENTS.md` 写 `src/server` 实为 `server/`；`function.md` 仍写已删除的 `/admin` 与 React 18。

## 性能 / 工程瓶颈（本轮不作为主攻，但要避开）

- `src/App.tsx` ~2466 行，新 UI 不要继续堆进 App。
- 无 CI（开放 PR #5 已在做顺序 CI）。
- 公开 Demo / Pages（开放 PR #7）。
- 印刷尺寸与案例模板收口（开放 PR #3）。
- 工作流入口重排与 UX（#9、#10）、窄屏侧栏（#6）、仓库清理（#8）。

## 明确不得做

- 支付、SKU、套餐、订单、兑换码、VIP、模板手续费结算、导出付费锁、学校统付、印刷接单。
- 账号系统 / 持久化会员。
- 重复开放 PR 范围（尤其 #3、#5、#7、#8、#9、#10）。
- 把真实名单/工程包发到 Issue 或「社区分享」。
- 在 Gitee 镜像未建好前宣称国内镜像已上线。

## 会员机制的合法形态（开源替代）

| 付费会员想买的感觉 | 本仓替代 |
|--------------------|----------|
| 身份 | 房间角色 owner/editor/viewer + 本地昵称（非账号） |
| 被认可 | CHANGELOG 点名、贡献者名录、模板 `author` 署名 |
| 专属模板 | 免费社区模板文件交换，不含价格字段 |
| 优先支持 | 48h SLA 运营承诺，不是代码开关 |

## Round 2 攻坚重点（必须产出可实施规格，仍以调研/设计为主，可写失败测试与探针，不要大面积改产品 UI）

锁定 **Round 3 候选包**（按优先级）：

| ID | 项 | 侵入性 | 避开冲突 |
|----|----|--------|----------|
| A | 应用内「提意见 / 帮助」跳转入口（零 PII，预填环境元数据） | 低 | 新表面，勿改六阶段导航 |
| B | 社区模板独立文件格式 + 导入/导出 + 拒收 `students` | 中 | 新格式，记录回滚 |
| C | `promo:lint`（禁用词 + 能力漂移）及对现有违规文案的修复清单 | 低 | 脚本+文档 |
| D | 恢复数据阶段 XLSX 模板下载；导入结果 `aria-live` | 极低 | 只改 hide 开关与 a11y |
| E | 协作本地昵称 + 角色文字标签（API 零改动） | 低–中 | 勿改房间协议 |
| F | 导出文件名含项目名/倍率 + 成功结果条 | 低 | 勿做印刷尺寸（#3） |
| G | CHANGELOG.md + 贡献者致谢规则（非付费会员替代） | 低 | 勿做仓库大清理（#8） |
| H | 工作台「重新载入示例」；空名单不再判健康 | 低 | 勿做公开 Demo（#7） |

Round 2 各代理必须：交叉核验上述 8 项的文件级设计；标出测试文件与验收断言；标出与开放 PR 的 diff 冲突风险；给出 Round 3 的「先写失败测试再实现」顺序。不要实现支付，不要做世界地图/PDF 导出。
