MODEL: gpt-5.6-sol-xhigh-fast

# Round 2 合规探针 R2-G2：`promo:lint` 规则与证据

核查日期：2026-08-24。范围是内容政策、产品能力漂移和开源仓收费边界；未改产品 UI、未写支付代码、未提交或推送。

## 1. 结论

- 指定关键词扫描共命中 **36 行**：Round 3 必须修复 9 行、保留的政策讨论 26 行、误报 1 行。
- 指定的精确词形会漏掉 **13 行实际问题**，主要因为仓库写成 `PNG/PDF`、`PNG + PDF`、`500+ GitHub Star`、`985 去向分布`。扩展探针最终报出 **22 个可执行修复点**。
- 当前指定范围内没有实际 `会员`、`VIP`、`sku`、`微信支付` 或套餐功能；`套餐`、`sku`、`微信支付` 的命中都在边界政策中。不能据此证明全仓永远没有支付实现，生产门禁还必须扫描 `src/`、`server/`、包清单和环境变量样例。
- 不能把禁词做成无上下文的全仓零命中：政策文件必须能写“禁止升学率”和“微信支付不得进仓”。应采用“规则 + 文件角色 + 显式豁免”，而不是简单 `rg` 返回非零。

## 2. 指定扫描命令与计数

等价的复现命令：

```bash
rg -n --no-heading \
  '升学率|就业率|录取率|本科率|导出 PDF|世界地图|会员|VIP|套餐|sku|微信支付|\+500 Star|#985' \
  docs/ scripts/ README.md USER_GUIDE.md DEVELOPER.md function.md
```

聚合结果：

```text
docs/          31 行
scripts/        3 行
README.md       2 行
USER_GUIDE.md   0 行
DEVELOPER.md    0 行
function.md     0 行
合计           36 行
```

### 2.1 must-fix in Round 3（9/36）

| 位置 | 命中 | 判定与修复方向 |
|---|---|---|
| `docs/案例模板/普通高中-68人.md:10` | `本科率：85%` | 内容口径违规；改为人数、城市或省份分布。 |
| `docs/案例模板/国际部-12人.md:7` | `含世界地图切换` | 产品没有世界地图；删除能力宣称或下线该案例。 |
| `docs/案例模板/国际部-12人.md:15` | `切换「世界地图」模板` | 同上。 |
| `docs/案例模板/国际部-12人.md:24` | `布局：世界地图` | 同上。 |
| `docs/案例模板/国际部-12人.md:36` | `切换世界地图` | 同上。 |
| `docs/脚本库/成果-3版.md:25` | `#985` | 对外标签分层；删除该标签。 |
| `docs/脚本库/成果-3版.md:65` | `世界地图` | 未实现能力；删除或明确写成未来需求，不能写操作步骤。 |
| `docs/私域/毕业季-checklist.md:13` | `导出 PDF` | 产品只直接导出 PNG/SVG；改为“导出 PNG/SVG”。 |
| `scripts/宣发流程-内容生成.mjs:113` | `#985` | 生成器会持续产出违规标签；从模板源删除。 |

### 2.2 leave（policy discussion，26/36）

这些行在说明“禁止什么”或记录合规规则，不是对外效果承诺：

| 位置 | 保留理由 |
|---|---|
| `docs/开源与收费边界.md:29` | “不做官方印刷套餐”的边界表。 |
| `docs/开源与收费边界.md:34` | 明确“不接支付、不上套餐后台”。 |
| `docs/开源与收费边界.md:52` | 明确套餐、订单、结算不得进仓。 |
| `docs/开源与收费边界.md:68` | 用 `微信支付`、`sku`、`套餐价格` 举拒绝示例。 |
| `docs/开源与收费边界.md:76` | 对外解释支付与套餐不在开源仓。 |
| `docs/案例模板/普通高中-68人.md:12` | 明确“对外不写升学率”。 |
| `docs/案例模板/985-附属中学.md:11` | 明确“不宣称升学率”。 |
| `docs/脚本库/成果-3版.md:21` | 写作约束“不写升学率”。 |
| `docs/宣发/good-first-issues.md:38` | 贡献任务中的禁用口径。 |
| `docs/宣发/good-first-issues.md:52` | 贡献任务中的“禁止写就业率”。 |
| `docs/宣发/good-first-issues.md:58` | 合规任务标题。 |
| `docs/宣发/good-first-issues.md:60` | 回归检查说明。 |
| `docs/宣发/投放文案-用户侧.md:71` | 明确“不要写升学率、985 占比、就业率”。 |
| `docs/宣发/国内互联网宣发总流程.md:25` | 把升学率列为待清理阻塞。 |
| `docs/宣发/国内互联网宣发总流程.md:106` | 明确不要用“预计 +500 Star”许诺。 |
| `docs/宣发/国内互联网宣发总流程.md:114` | 平台“不要做”示例。 |
| `docs/宣发/国内互联网宣发总流程.md:265` | 合规总则。 |
| `docs/宣发政策-小红书与社交平台.md:71` | 明确禁止把分布写成升学率。 |
| `docs/宣发政策-小红书与社交平台.md:157` | 敏感数据禁令。 |
| `docs/宣发政策-小红书与社交平台.md:164` | 支付与套餐代码不进仓的声明。 |
| `docs/私域/用户群运营手册.md:19` | 群规禁止讨论升学率、就业率。 |
| `docs/私域/案例投稿模板.md:12` | 投稿约束“不要写升学率”。 |
| `scripts/宣发流程-内容生成.mjs:107` | 生成模板中的口径提醒；语义不是宣称。Round 3 可把提醒移到代码注释，避免流入草稿。 |
| `scripts/宣发流程-内容生成.mjs:207` | 知乎模板的禁止口径。 |
| `README.md:30` | 截图合规声明。 |
| `README.md:112` | 内容红线。 |

### 2.3 false positive（1/36）

| 位置 | 原因 |
|---|---|
| `docs/私域/用户群运营手册.md:42` | `投票：世界地图 / 国际部模板 / 导出 Word` 是需求投票候选，不是在宣称现有能力；规则应识别“投票/候选/需求”语境。 |

校验和：`9 + 26 + 1 = 36`，覆盖指定扫描的每一行。

## 3. 精确关键词漏掉的实际问题

补充执行了变体扫描：

```bash
rg -n -i '\+?\s*500\s*\+?\s*(GitHub\s*)?Star|985\s*(占比|去向|高校|附属|vs)|(导出|生成|输出).{0,12}PDF|PDF.{0,12}(导出|打印)|世界地图|全球地图|微信支付|套餐价格|\bsku\b|\bvip\b|会员' docs/ scripts/
```

指定精确表达式之外，Round 3 还应修复以下 **13 行**：

| 规则 | 位置 |
|---|---|
| PDF 能力漂移 | `docs/KOL/合作话术.md:97` |
| PDF 能力漂移 | `docs/宣发草稿/小红书-痛点-2026-08-14.md:18` |
| PDF 能力漂移 | `docs/宣发草稿/截图计划-小红书配图清单.md:65` |
| PDF 能力漂移 | `docs/案例模板/985-附属中学.md:19` |
| PDF 能力漂移 | `docs/脚本库/成果-3版.md:17` |
| PDF 能力漂移 | `docs/脚本库/痛点-3版.md:42` |
| PDF 能力漂移 | `scripts/宣发流程-内容生成.mjs:50` |
| PDF 能力漂移 | `scripts/宣发流程-内容生成.mjs:85` |
| PDF 能力漂移 | `scripts/宣发流程-内容生成.mjs:105` |
| PDF 能力漂移 | `scripts/宣发流程-内容生成.mjs:150` |
| 985 分层数据 | `docs/KOL/合作话术.md:75` |
| 985 分层数据 | `docs/宣发执行流程-4周启动计划.md:152` |
| 不可兑现 Star 许诺 | `docs/KOL/合作话术.md:80` |

因此当前可执行修复基线是 **22 行**（指定扫描 9 行 + 变体扫描 13 行）。

另有两类 Round 1 已指出、应纳入规则但不属于用户给定词形：

- `docs/案例模板/国际部-12人.md:11`：`平均录取学校排名：Top 50（QS）`，属于录取结果排名营销口径。
- `docs/案例模板/国际部-12人.md:31`：`留学咨询案例`，与上述排名口径组合后形成教育咨询营销素材；建议删除该用途。

宽松 PDF 正则还会误报 `USER_GUIDE.md:91` 的“导出 SVG 后再转图片/PDF”。这是合法的外部转换说明，不是产品直接导出 PDF，必须作为反例测试。

## 4. Round 3 `promo:lint` 规则清单

| ID | 阻断规则 | 核心匹配 | 允许语境 |
|---|---|---|---|
| `CP001` | 升学/就业结果比例宣称 | `升学率\|就业率\|录取率\|本科率` | 政策文件或带显式豁免的“禁止/不宣称”说明。 |
| `CP002` | 教育层级比较与标签 | `#\s*985\b`、`985\s*(占比\|去向分布)`、`985\s*(vs\|对比)\s*(普本\|双非)` | 政策中的反例；普通文件名“985-附属中学”不应仅因名称自动失败。 |
| `CP003` | 结果排名/煽动性分层 | `平均录取学校排名`、`Top\s*\d+.*(QS\|US News)`、`一眼看清全班未来` | 仅政策反例。 |
| `CAP001` | 伪称直接导出 PDF | `导出/支持/选项` 与 `PDF` 同行，或 `PNG[/+、]PDF` | “导出 SVG 后再转换为 PDF”这种明确外部转换说明。 |
| `CAP002` | 伪称世界地图 | `世界地图\|全球地图` 且同行含 `支持/切换/布局/模板/使用方法` | “投票/候选/需求/未支持”语境。 |
| `PROM001` | 不可兑现的 Star 许诺 | `预计/保证/承诺/带来` 附近出现 `+500 Star`、`500+ GitHub Star` 等 | KPI 复盘或“不要许诺”的政策讨论。 |
| `BILL001` | 会员/套餐商品化 | 发布内容中的 `会员\|VIP\|套餐`；尤其与 `付费/等级/权益/专属/购买/解锁` 共现 | 边界政策、明确的非付费角色说明。 |
| `BILL002` | 支付实现进入开源仓 | `sku\|微信支付\|支付宝 SDK\|预支付\|商户号\|套餐价格\|兑换码\|模板手续费结算` | `docs/开源与收费边界.md` 等政策文字；实现文件没有豁免。 |

实现要求：

1. 不用“出现禁词即失败”的单正则。先按文件角色分成 `publishable`、`policy`、`implementation`。
2. 混合文件使用显式同行豁免，例如 `promo-lint:allow CP001 -- 合规规则引用`；豁免必须带规则 ID 和理由。
3. 不以行号维护白名单，行号会随编辑漂移。豁免绑定原文或同行注释。
4. `scripts/promo-lint.mjs` 和测试 fixture 含规则样本，应从内容输入排除；不能把整个 `scripts/` 静默排除。
5. 输出稳定排序的 `path:line:column [RULE_ID] message`，便于本地、CI 和编辑器定位。
6. 不提供自动修复；合规文案需要人工确认语义。

## 5. 精确 CLI 规格

`package.json`：

```json
{
  "scripts": {
    "promo:lint": "node scripts/promo-lint.mjs"
  }
}
```

命令：

```text
npm run promo:lint
npm run promo:lint -- --format=pretty
npm run promo:lint -- --format=github
npm run promo:lint -- --format=json
npm run promo:lint -- --format=pretty "docs/案例模板/**/*.md"
```

参数语义：

- 无位置参数：扫描默认输入。
- 有位置参数：用给定文件/目录/glob 替代默认内容输入，但 `BILL002` 的实现边界扫描仍执行；避免通过缩小路径绕过支付红线。
- `--format=pretty`：默认 `path:line:column [ID] message`。
- `--format=github`：输出 GitHub Actions annotation。
- `--format=json`：输出稳定 JSON 数组，供测试消费。
- 未知参数、无效 glob、文件读取失败均视为工具错误，不得静默跳过。

默认输入 globs：

```text
内容与能力：
  docs/**/*.{md,txt,json}
  scripts/**/*.{mjs,js,ts}
  README.md
  USER_GUIDE.md
  DEVELOPER.md
  function.md

收费实现附加扫描：
  src/**/*.{ts,tsx,js,jsx}
  server/**/*.{ts,tsx,js,jsx}
  package.json
  package-lock.json
  .env.example
  vite.config.*

排除：
  scripts/promo-lint.mjs
  scripts/**/__fixtures__/**
  scripts/**/*.test.*
  node_modules/**
  dist/**
  .git/**
  .agent_workspace/**
```

`package-lock.json` 应解析包名和脚本字段，不应对 integrity Base64 做普通 `VIP` 子串扫描。

退出码：

| 码 | 含义 |
|---|---|
| `0` | 无阻断问题；政策引用和已验证豁免不计错误。 |
| `1` | 至少一个 `CP/CAP/PROM/BILL` 阻断问题。 |
| `2` | 参数、配置、glob、读取或内部错误；不能用 `0` 掩盖未完成扫描。 |

## 6. 测试用例

建议使用独立 fixture，不把“当前仓库仍有违规”固化成永远失败的单元测试。

| 用例 | 输入摘要 | 期望 |
|---|---|---|
| `CP001-positive` | `本科率：85%` | exit 1，报 `CP001`。 |
| `CP001-policy` | 政策文件：`禁止宣称升学率` | exit 0。 |
| `CP002-hashtag` | `#毕业季 #985` | exit 1，报 `CP002`。 |
| `CP002-segmentation` | `985 vs 普本`、`985 去向分布` | exit 1，报 `CP002`。 |
| `CP003-ranking` | `平均录取学校排名 Top 50（QS）` | exit 1，报 `CP003`。 |
| `CAP001-slash` | `一键导出高清 PNG/PDF` | exit 1，报 `CAP001`。 |
| `CAP001-plus` | `导出 PNG + PDF + 项目包` | exit 1，报 `CAP001`。 |
| `CAP001-conversion` | `导出 SVG 后再转图片/PDF` | exit 0。 |
| `CAP002-claim` | `切换世界地图模板` | exit 1，报 `CAP002`。 |
| `CAP002-request` | `投票：世界地图 / 国际部模板` | exit 0。 |
| `PROM001-variant-a` | `预计 +500 Star` | exit 1。 |
| `PROM001-variant-b` | `预计带来 500+ GitHub Star` | exit 1。 |
| `PROM001-policy` | `不要用“预计 +500 Star”许诺` | exit 0。 |
| `BILL001-positive` | `VIP 会员套餐解锁高清导出` | exit 1，报 `BILL001`。 |
| `BILL002-script` | 实现文件含 `wechatPaySku` 或 `微信支付` | exit 1，且不允许 inline 豁免。 |
| `BILL002-policy` | 边界文档：`微信支付、sku 不得进仓` | exit 0。 |
| `line-location` | 前置两行后放违规 | 输出准确 `:3:列号`。 |
| `json-format` | 两个不同规则违规 | JSON 稳定排序，含 path/line/column/rule/message。 |
| `read-error` | 不存在或不可读路径 | exit 2。 |
| `clean-corpus` | 仅合规内容 | exit 0。 |

集成顺序：

1. 先写上述失败测试和 22 行当前基线快照。
2. 实现规则后，当前仓库应 exit 1 并稳定报出 22 个修复点。
3. 修正文案源与已生成草稿；同一命令重跑应 exit 0。
4. 让 `promo:check` 先调用 `promo:lint`；lint 非零时不得打印“可发”。
5. CI 用 `npm run promo:lint -- --format=github`。

## 7. 原型与验证证据

只读/探针原型位于：

```text
.agent_workspace/round2/probes/promo-lint-prototype.mjs
```

验证链：

```text
failure:
  初版运行 exit 1，报 29 行，其中误报政策文件和 USER_GUIDE.md:91。

cause:
  仅靠同行“不/禁止”判断，识别不了表格和章节语境；
  “导出……PDF”宽正则误把“导出 SVG 后再转 PDF”当直接导出。

fix:
  原型加入政策文件角色和 SVG→PDF 外部转换反例；
  世界地图需求投票按“投票/候选/需求”语境放行。

recheck:
  node --check .agent_workspace/round2/probes/promo-lint-prototype.mjs
  => exit 0

  node .agent_workspace/round2/probes/promo-lint-prototype.mjs
  => exit 1，稳定报 22 violation(s)
```

第二个 exit 1 是预期门禁结果：当前语料尚未修复。原型不属于生产 `scripts/`，Round 3 应按第 4–6 节规格重新实现并测试。

## 8. Round 3 文案修复原则

- 比率：删掉比例和排名，改为人数、城市或省份分布。
- 世界地图：不实现产品 UI；删除现成功能描述，需求投票可保留。
- PDF：直接导出能力统一写 PNG/SVG；需要 PDF 时只能明确为“导出 SVG 后由外部工具转换”。
- `#985` 与分层对比：删标签、删“985 vs 普本”、删粉丝 985 去向分析。
- Star：把数量许诺改成“征集真实使用反馈/案例署名”，KPI 表可作为内部复盘保留。
- 收费：本轮没有实际计费命中；继续禁止会员权益、VIP、套餐、SKU、微信支付及任何支付实现进入开源仓。
