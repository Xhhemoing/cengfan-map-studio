MODEL: gpt-5.6-sol-xhigh-fast

# Round 1 R1-G2：边界与 GitHub 现实核查

核查时间：2026-08-24。仅做只读探测，未实现、未提交、未推送。

## 1. 边界合规状态

**结论：产品代码与依赖层面通过；仓库材料层面有一处需澄清的灰区。**

- `docs/开源与收费边界.md` 明确规定：当前不接支付、不上套餐后台；支付、套餐、订单、兑换码、模板手续费结算不得进入本仓；核心导入、布局、导出不得加付费锁。
- `.gitignore` 已包含 `.local-commercial/`、`.local-billing/`，与边界文档一致。
- `package.json` 的 dependencies/devDependencies 中没有微信支付、支付宝、Stripe、PayPal、Paddle、Lemon Squeezy 等计费 SDK。证据：`rg -ni '@stripe|stripe|wechat|weixin|alipay|支付宝|微信支付|paypal|paddle|lemonsqueezy' package.json` 无结果。
- 全仓检索式 `rg -ni '微信|支付宝|sku|套餐|预支付|vip|会员|stripe|order' .` 的有效命中主要是：
  - 边界、宣发、私域和合同文档中的政策/联系方式；
  - `order` 在代码中表示 CSS 排序、图层顺序或布局顺序，不是订单；
  - `vip` 在 `server/ai/{llm-client.ts,agent-routing.ts}` 及测试中来自 `tokenfreevip.cc.cd` AI 域名，不是会员或计费功能；
  - `package-lock.json` 的 `vip` 命中是 integrity Base64 片段；
  - `src/`、`server/`、`scripts/` 对 `支付|收费|套餐|订单|结算|商户|金额|费用|报酬|佣金|抽成` 的实现检索没有产品计费代码。
- 灰区：`docs/KOL/合同模板.md:37-53` 含“费用另计”“报酬与支付”“支付宝/微信/银行账户”。它是 KOL 服务采购合同，不是产品收款或结算实现，因此不构成计费 SDK 违规；但与“收费/结算材料不进仓”的宽泛表述容易混淆，后续应明确其仅属宣发供应商报酬，且不要把真实账户信息提交进仓。

## 2. GitHub 现实与可发现性缺口

命令证据：

```text
$ gh api repos/Xhhemoing/cengfan-map-studio \
    --jq '{description,topics,has_discussions,homepage,visibility,html_url,open_issues_count}'
{"description":"毕业班去向地图编辑器：导入 Excel 出图。AGPL-3.0 开源。",
 "has_discussions":false,
 "homepage":null,
 "topics":["china","education","graduation","map","opensource","react","vite"],
 "visibility":"public", ...}
```

- Description：已填写，无缺口；`docs/宣发/国内互联网宣发总流程.md` 中“description / Topics 为空”的阻塞描述已过时。
- Topics：已填写 7 个，无当前缺口。
- Discussions：**未开启**，与宣发总流程及反馈 SOP 不一致。
- Homepage：**为空**。至少应在已有公开 Demo 稳定后填 Demo URL；在此之前可填仓库主页，但不能伪造可用 Demo。
- `gh issue list --repo ... --state all --limit 100` 只列出 Issue #2；`gh issue view 2` 确认标题为“征求意见：导入、布局、导出”，状态 OPEN、0 评论、无标签。征求意见入口存在，但互动与分类尚未形成闭环。

### 仓库协作文件

- `CHANGELOG.md`：不存在；但 `DEVELOPER.md:152` 要求更新它，流程与现实矛盾。
- `CONTRIBUTING.md`：存在且较完整，包含身份分流、开发流程、验收、隐私与 AGPL/收费边界。
- `.github/ISSUE_TEMPLATE/`：有 `bug.yml`、`feature.yml`、`feedback.yml`、`config.yml`，覆盖 Bug、功能建议和使用意见，基本可用。
  - Bug 模板明确禁止真实姓名 + 去向，并要求脱敏截图。
  - 功能/意见模板没有同等醒目的名单隐私警告；`feedback.yml` 仅在联系方式占位符中提醒不要留学生信息。
  - `blank_issues_enabled: true` 允许绕过结构化模板，增加真实名单误贴风险。
  - contact links 提到用户群，但只链接文档，没有可验证的群入口。

## 3. Gitee 镜像：文档与现实不一致

`docs/宣发/Gitee镜像清单.md` 是“如何创建”的操作清单，不是已完成镜像清单；其中用户名、仓库 URL 和徽章仍是占位符。

证据：

```text
$ git remote -v
origin  https://github.com/Xhhemoing/cengfan-map-studio (fetch/push)

$ curl -L -o /dev/null -w '%{http_code} %{url_effective}' \
    https://gitee.com/Xhhemoing/cengfan-map-studio
404 https://gitee.com/Xhhemoing/cengfan-map-studio
```

- README 仅链接到这份清单，没有 Gitee 徽章或可克隆的真实 Gitee URL。
- 公开网页检索 `site:gitee.com cengfan-map-studio 蹭饭图 Xhhemoing` 未找到本项目镜像。
- 因此只能判定“仓库内未落地、常见公开地址未发现”，不能排除另一个未记录用户名下有镜像。当前不能对外宣称 Gitee 镜像已就绪。

## 4. 应用内社区入口

检索证据：

```text
$ rg -ni '提意见|意见反馈|反馈|Discussions?|用户群|开发者群|issues/new|github\.com/Xhhemoing/cengfan-map-studio' src
无结果
```

进一步检索 `href|window.open|location.href|github.com|gitee.com`，`src/` 中命中均为 SVG 图片资源或本地导出下载，没有社区外链。

结论：README 有“提意见”Issue 链接，仓库文档有用户群/开发者群说明；**应用 UI 内没有“提意见”、GitHub Discussions 或用户群入口**。不过当前有多个工作流/UX PR 在途，不应另开 UI 改动与其冲突。

## 5. 在途 PR 与重叠边界

命令 `gh pr list --repo Xhhemoing/cengfan-map-studio --state open --limit 100 ...` 返回 8 个开放 PR：

1. #10 `Cursor/optimize studio ux 7077`
2. #9 `按制作流程重排功能入口：名单 → 地图 → 版式 → 内容 → 交付`
3. #8 `清理本地 agent、隐私数据与非程序材料`
4. #7 `支持 Cloudflare Pages / GitHub Pages 公开演示站`
5. #6 `降低编辑器首屏体积，并收口窄屏侧栏`
6. #5 `去掉三栏旧编辑器，并加上顺序执行的 CI 门禁`
7. #4 `chore(env): add Cloud Agent development environment`
8. #3 `市场化与实用化：印刷尺寸、案例模板与产品收口`

避免重复范围：

- 不另做编辑器入口、流程重排、侧栏或一般 UX：与 #9、#10、#6、#5 重叠。
- 不另做公开 Demo/Pages：与 #7 重叠。
- 不另做案例模板、印刷尺寸、产品收口：与 #3 重叠。
- 不在 #8 收口前做仓库材料大清理或隐私文件搬迁。
- 环境与 CI 分别已有 #4、#5。

## 6. 不碰在途 PR 的安全想法

- 外部仓库设置：开启 GitHub Discussions；为仓库补 homepage。无需改产品代码，也不涉及收费。
- 外部镜像：先创建并验证公开 Gitee 镜像，再补真实链接；在镜像存在前不改 README 声称“国内镜像已上线”。
- 反馈闭环：用 Issue #2/Discussions 发不收集名单的单题投票，补 `user-feedback` 等标签与 48h 回复纪律。
- 社区身份替代“会员”：贡献者致谢、模板策展人/隐私审阅志愿者角色、非付费贡献徽章、公开路线投票；不得命名为 VIP、付费会员或权益套餐。
- 免费社区模板：只做 AGPL 下的模板规范、评审与贡献流程，不做购买、上架收费、抽成或结算。
- 隐私安全案例墙：只接受虚构数据或经逐项脱敏的截图；先制定审阅清单，不自动上传工程包。
- CHANGELOG：在 #8 合并/关闭并确认无冲突后，补真实 Changelog 及“意见 → 改动”记录流程。

## 7. 若增加应用内社区分享，主要隐私风险

- 姓名、学校、头像、具体去向、城市组合后可直接识别学生；即使删姓名，小班级与稀有去向也可能被重识别。
- `.cengfan` 工程包、Excel/CSV、导出图和截图可能包含完整名单、隐藏字段、头像或素材元数据；“分享作品”不能默认等同于“分享数据”。
- 公开 Issue/Discussion、群文件和可索引分享链接会造成长期留存、二次传播与搜索引擎收录，删除原帖也未必可撤回。
- 未成年人、同学代上传、班主任代上传场景下，上传者未必有全班成员的公开授权。
- 若社区功能复用 AI 或远端 API，会把当前“默认本地”的隐私承诺变成外传，必须逐次明示目的、接收方、字段与保留期。

安全底线应是：默认仅本地；默认使用虚构样例；分享前逐字段预览和脱敏；禁止原始名单/工程包直接公开；公开链接不默认索引；明确撤回/删除路径。单靠“请勿上传真实信息”的文案不足以控制风险。

## 8. 明确不得实现

- 微信支付、支付宝、Stripe 或其他支付 SDK；预支付、订单、SKU、套餐、VIP/会员付费权益、兑换码、商户后台、抽成与模板手续费结算。
- 给导入、布局、导出、高清图或工程包加付费锁。
- 学校统付、年级授权包、官方印刷套餐或印刷接单。
- 把私有商业层、商户号、支付密钥、真实收款账户写入本仓或 `.env.example`。
- 将真实学生名单、姓名 + 去向、未脱敏截图、Excel/CSV 或 `.cengfan` 工程包发送到 Issue、Discussions、用户群或公开分享链接。
- 在未验证镜像/Demo 之前添加虚假的 Gitee、homepage 或在线体验入口。
- 重复第 5 节列出的开放 PR 范围。
