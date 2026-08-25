# Round 3 Agent B — HEAD leak / 宣发-deletion audit

MODEL: cursor-grok-4.6-high-fast

Date: 2026-08-25. Read-only. No product code changed.

| Item | Value |
|---|---|
| HEAD | `74d7d6538a93059c5222353c087d7f05509ab966` (`74d7d65` — `docs(agent): Round 2 merge-all conclusion briefing`) |
| Branch | `cursor/merge-all-branches-e17a` |
| Policy | `docs/开源与收费边界.md` §4 (payment / SKU / merchant keys must not enter this AGPL repo) |
| Normalize | `origin/cursor/normalize-repo-content-1fd7` @ `933b4d0` — `chore(repo): 清理本地 agent、隐私与宣发材料` |

## Verdict

**No real student roster / PII leak. No payment, billing, or merchant-key implementation. No accidental committed `.env` secrets.**

**Do not merge `normalize-repo-content-1fd7` as-is.** Its deletions would remove 宣发 docs, screenshots, skill, and `promo:*` scripts that **HEAD still uses** as first-class product/community surfaces (README images, AGENTS skill, CONTRIBUTING / Issue contact links, `npm run promo:*`).

| Check | Finding | Action |
|---|---|---|
| Real student rosters / PII | Only fictional / surname-masked samples | keep |
| Payment / billing / merchant keys | Policy + reject-guards only; no SDK, no keys | keep |
| Accidental `.env` secrets | Tracked `.env.example` only; values empty | keep |
| normalize vs HEAD 宣发 | Would delete / relocate docs HEAD still links and scripts | **do not auto-merge** |

Gray notes (not payment/PII leaks): public VPS IP `121.5.16.236` in `DEPLOY-SERVER.md` and the 宣发总流程; local path `/home/ubuntu/work/蹭饭图` in `DEPLOY-SERVER.md` / `function.md`; blank KOL contract payment *clauses*; default AI proxy host `tokenfreevip.cc.cd` (LLM fallback, not billing).

---

## 1. Student rosters / PII

Searched HEAD for real names + destinations, phones, mainland ID numbers, emails, WeChat IDs, and roster files (`*.csv` / `*.xlsx` / `*.cengfan`).

### What exists (synthetic)

| Path | Contents | Why not a leak |
|---|---|---|
| `src/lib/project-data.ts` `sampleStudents` | 12 literary names: 林舟 / 陈宁 / 苏禾 / 顾言 / 沈青 / 唐诺 / 程川 / 江月 / 温然 / 陆迟 / 周野 / 许棠 + well-known universities | Built-in demo; reused by `createSampleProject()` and tests |
| `docs/示例数据/示例项目.cengfan` | Same 12 students, `kind: cengfan-project-package` v2, exported 2026-08-14 | Matches sampleStudents |
| `docs/示例数据/毕业名单-脱敏.csv` | 《百家姓》surnames + `*` / `**` + rotating university list | Explicitly masked; not a class list |
| `蹭饭图-学生数据导入模板.xlsx` | Sheet1 empty data row; Sheet2 example `林舟 / 北京大学 / 北京市` | Blank import template |
| Tests / fixtures | Same 林舟 / 苏禾 / 沈青 / 何遥 set | Test doubles |
| `docs/案例模板/*.md` | School *types* and headcounts (国际部 12 人, 985 附中 47 人, 普高 68 人). 国际部 says「全部为虚构示例」 | No individual names |
| `docs/宣发草稿/配图/*.png` | README demo screenshots of the sample project | Same fictional roster |

### What was not found

- No `1[3-9]xxxxxxxxx` mobile numbers, no 18-digit ID numbers, no real `@email` of students or teachers.
- No filled WeChat / QQ IDs. 私域 / 反馈 SOP only have *optional*「微信号（选填）」form fields.
- No extra `.xlsx` / `.csv` class dumps. `docs/宣发数据/` is absent (promo report skeleton only).
- Community template path (`src/lib/template-package.ts`) recursively rejects `students` / `guests` on import and export.

`src/components/collaboration/RoomRoster.tsx` is the **collaboration-room participant list** (local nicknames), not a student roster.

---

## 2. Payment, billing, merchant keys

Policy: `docs/开源与收费边界.md` — 支付、套餐、订单、兑换码、模板手续费结算 must not enter this Git repo. `.gitignore` already lists `.local-commercial/` and `.local-billing/`. Neither directory is tracked.

| Probe | Result |
|---|---|
| `package.json` dependencies / devDependencies | No Stripe / WeChat Pay / Alipay / PayPal / Paddle / Lemon Squeezy |
| `src/` + `server/` implementation | No checkout, SKU catalog, order, redeem-code, VIP entitlement, merchant API |
| `src/lib/template-package.ts` | **Rejects** `price|pricing|sku|payment|…|vip|plan` keys and CJK `价格/套餐/结算/手续费/支付/订单` |
| `.env.example` | No `mch_id` / 商户号 / `STRIPE_` / WeChat pay vars (compliant with §4) |
| Tracked `*secret*` / `*merchant*` / `*.pem` | None |

Hits that are **not** product billing:

- `docs/开源与收费边界.md` and `.github/PULL_REQUEST_TEMPLATE.md` — policy text.
- `docs/KOL/合同模板.md` §二 — blank KOL *service-fee* template (`乙方支付宝/微信/银行账户：________________`). Offline vendor contract, empty accounts. Still not product settlement code.
- `server/ai/llm-client.ts` `DEFAULT_AI_BASE_URL = "https://tokenfreevip.cc.cd/v1"` and `TOKENFREE_BASE_URL` — OpenAI-compatible LLM proxy hostname. Keys come from env (`AI_API_KEY` / `TOKENFREE_API_KEY`) and are empty in-repo.
- `AI_BUDGET_RECEIPT_SECRET` — agent-loop receipt HMAC, not a payment merchant secret. `.env.example` leaves it blank.

---

## 3. Accidental `.env` secrets

| Check | Result |
|---|---|
| `git ls-files` env-like | Only `.env.example` |
| Worktree `.env` / `.env.local` / `.env.production` | Absent |
| `git log --all -- .env` (excluding example) | Empty |
| HEAD tree `*.pem` / `id_rsa` / `credentials.json` | None |
| Hardcoded `sk-…` / `sk_live` / `AKIA…` / `ghp_` / PEM private keys | None |

`.env.example` (HEAD) documents `AI_*`, `DEEPSEEK_API_KEY=`, `AI_BUDGET_RECEIPT_SECRET=`, commented `WORKSPACE_API_TOKEN=`. All secret values are empty. `DEPLOY-SERVER.md` uses placeholders (`sk-你的新密钥`, `<已生成40字符随机串>`), not live keys.

`.gitignore` ignores `.env` and `.env.*` with `!.env.example`.

---

## 4. Would normalize-repo-content delete 宣发 docs HEAD still uses?

**Yes.** Compare `HEAD...origin/cursor/normalize-repo-content-1fd7`: 93 deletes, 12 renames, 16 modifies. Every deleted promo path is still present on HEAD.

### 4.1 Promo / 宣发 paths normalize deletes (all ON HEAD)

**Skill + scripts (HEAD `package.json` still wires them):**

- `.agents/skills/cengfan-promo/SKILL.md`
- `scripts/宣发流程-素材检查.mjs` ← `npm run promo:check`
- `scripts/宣发流程-内容生成.mjs` ← `npm run promo:content`
- `scripts/宣发流程-数据收集.mjs` ← `npm run promo:report`

**Canonical 宣发 set (AGENTS / skill / promo:check required):**

- `docs/宣发/国内互联网宣发总流程.md`
- `docs/宣发/投放文案-开发者社区.md`
- `docs/宣发/投放文案-用户侧.md`
- `docs/宣发/反馈收集SOP.md`
- `docs/宣发/Gitee镜像清单.md`
- `docs/宣发/good-first-issues.md`
- `docs/宣发/README.md`
- `docs/宣发执行流程-4周启动计划.md`
- `docs/宣发政策-小红书与社交平台.md`
- `docs/宣发草稿/小红书-痛点-2026-08-14.md`
- `docs/宣发草稿/截图计划-小红书配图清单.md`
- `docs/宣发复盘/验证报告-2026-08-14.md`
- `docs/脚本库/{痛点,成果,情感}-3版.md`
- `docs/私域/` (6 ops manuals — `promo:check` marks them **required**)
- `docs/KOL/{合作话术,合同模板,内容授权协议}.md`

**Screenshots HEAD README embeds** — normalize *renames* (does not keep the old path):

`docs/宣发草稿/配图/{01,02,06,07}-*.png` → `docs/screenshots/…`

HEAD `README.md` still points at `docs/宣发草稿/配图/`. A deletion-only apply **breaks the README images**. A full normalize merge rewrites those four `<img>` tags, but also **strips** the Gitee / 宣发-calendar links.

### 4.2 HEAD call sites that would go stale or 404

| HEAD consumer | What it needs | If normalize lands |
|---|---|---|
| `AGENTS.md` L32 | `cengfan-promo` skill + `docs/宣发/国内互联网宣发总流程.md` | Normalize rewrites this section to「不要提交宣发投放…」and drops the skill |
| `.agents/skills/cengfan-promo/SKILL.md` | 总流程、投放文案、`docs/脚本库/`、`promo:*` | File deleted |
| `package.json` `promo:check/content/report` | The three `scripts/宣发流程-*.mjs` | Scripts deleted; npm scripts removed |
| `scripts/宣发流程-素材检查.mjs` | Required: 总流程、两份投放文案、反馈 SOP、私域 6 份、`CONTRIBUTING.md` | Those required files deleted |
| `README.md` | 4 images under `docs/宣发草稿/配图/` + Gitee清单 + 总流程 | Images move only if README rewrite is taken; links removed |
| `CONTRIBUTING.md` / `DEVELOPER.md` | 反馈 SOP、Gitee清单、good-first-issues | Links deleted; normalize rewrites the tables |
| `.github/ISSUE_TEMPLATE/config.yml` | `…/blob/main/docs/宣发/反馈收集SOP.md` | Target deleted (404 for the “宣发与征求意见说明” contact link) |
| `docs/KOL/合作话术.md` | 总流程 | File itself deleted |
| `docs/产品/市场化与实用化优化.md` | `frontUI2.md` | `frontUI2.md` deleted |
| `src/lib/workflow-stages.ts` comment | Aligns stage names with `function.md` | `function.md` deleted (comment-only; runtime OK) |

### 4.3 Other normalize deletes (not 宣发, still on HEAD)

Useful cleanup candidates, **not** required by HEAD runtime: `graphify-out/**` (~90k lines), `.learnings/**`, `.hermes.md`, `docs/superpowers/**`, `docs/progress/**`, `docs/qa/**`, `docs/CODE_REVIEW_2026-08-03.md`, `demo.html`.

`function.md` / `frontUI2.md` are still living design baselines on HEAD (`workflow-stages.ts`, `docs/产品/市场化与实用化优化.md`, CHANGELOG). Deleting them is not a leak fix; it is a doc-policy change.

### 4.4 Merge implication

Round 2 already recorded this conflict (`/.agent_workspace/round-merge-all-r2.md`): normalize vs HEAD 宣发 → **不自动合**.

This re-audit confirms it against current HEAD `74d7d65`:

- Taking **only** normalize’s deletes: README images, `promo:*`, AGENTS skill, Issue SOP link, and CONTRIBUTING/DEVELOPER 宣发 links all break.
- Taking the **whole** normalize branch: those surfaces are rewritten away. That is an intentional “repo is editor-only” policy from 2026-08-19, and it **contradicts** HEAD’s current AGENTS / README / CONTRIBUTING / `package.json` promo workflow.

**Recommendation:** keep HEAD 宣发 tree. If a later cleanup is wanted, cherry-pick non-promo deletes (`graphify-out/`, learnings, superpowers) only. Do not delete `docs/宣发/**`, `docs/宣发草稿/配图/**`, `docs/私域/**`, `docs/脚本库/**`, `cengfan-promo`, or `scripts/宣发流程-*.mjs` while HEAD still references them.

---

## 5. Adjacent (not in the four asked buckets)

- `DEPLOY-SERVER.md` + 宣发总流程 publish VPS `121.5.16.236:8787` and host path `/home/ubuntu/work/蹭饭图`. Not a student/merchant secret; it is infra disclosure. Normalize’s AGENTS rewrite lists「服务器 IP」as something not to commit.
- `docs/案例模板/普通高中-68人.md` still says「本科率：85%」— promo-compliance residue, not PII.
- `docs/KOL/合作话术.md` still contains a「GitHub Star：+200-500」body line despite its own header saying to delete that promise.

---

## Method (evidence)

```text
git rev-parse HEAD
git ls-tree -r -z --name-only HEAD
git diff --name-status HEAD...origin/cursor/normalize-repo-content-1fd7
git ls-files  | filter .env / xlsx / csv / cengfan
rg  (src|server|package.json|.env.example)  for payment / keys / phones / IDs
read  project-data.ts, 毕业名单-脱敏.csv, 示例项目.cengfan, 导入模板.xlsx,
      .env.example, docs/开源与收费边界.md, cengfan-promo/SKILL.md
```

No tests run (read-only; no leak to fix). No product files edited.
