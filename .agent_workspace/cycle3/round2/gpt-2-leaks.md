MODEL: gpt-5.6-sol-xhigh-fast

# C3R2-G2 合规复扫

日期：2026-08-24。分支：`cursor/feature-expansion-research-c710`。

范围：Cycle 3 Round 1 提交 `4aa8f89`、指定必读文件、反馈链接与社区模板相邻代码，以及扫描时工作区内已出现的 Round 2 改动（`ProjectWorkbench.tsx` / 测试、`project-package.ts` / 测试、`styles.css`、`App.export-busy.test.ts`）。未改产品代码。

## 命令

```bash
git status --short --branch
git show --stat --oneline 4aa8f89
git show --format= --name-only 4aa8f89

git show --format= --unified=0 4aa8f89 |
  rg -n '^\+.*(支付|套餐|SKU|订单|兑换码|VIP|付费|收费|payment|pricing|price|sku|coupon|checkout|subscription|invoice|billing|settlement)' -i
git show --format= --unified=0 4aa8f89 |
  rg -n '^\+.*(students|roster|student|名单|roomId|roomCode|房间号|房间码|token|ticket)' -i
git show --format= --unified=0 4aa8f89 |
  rg -n '^\+.*((import|from|require\()[^[:space:]]*.*package\.json|APP_VERSION)' -i
git show --format= --unified=0 4aa8f89 | rg -n '^\+.*regional' -i

rg -n -i \
  '支付|套餐|SKU|订单|兑换码|VIP|付费|收费|payment|pricing|price|sku|coupon|checkout|subscription|invoice|billing|settlement' \
  src/**/*.{ts,tsx,js,jsx}
rg -n \
  'searchParams\.set|new URL\(|href=|CHANGELOG_URL|ISSUE_.*URL|buildIssueUrl' \
  src/**/*.{ts,tsx}
rg -n -i \
  '(学生|student|students|roster|名单|房间号|房间码|room(Id|Code)?|token|ticket).{0,120}(CHANGELOG_URL|buildIssueUrl|issues/new|searchParams|href)|(CHANGELOG_URL|buildIssueUrl|issues/new|searchParams|href).{0,120}(学生|student|students|roster|名单|房间号|房间码|room(Id|Code)?|token|ticket)' \
  src/**/*.{ts,tsx}

rg -n -i 'students|"guests"|price|pricing|sku|payment|套餐|支付|订单|收费|付费|vip' \
  src/lib/template-package.ts src/lib/template-exchange-actions.ts src/components/TemplateExchange.tsx
rg -n \
  'TEMPLATE_PACK_TOP_LEVEL_KEYS|createTemplatePack|serializeTemplatePack|assertNoStudentData|assertNoCommercialFields|projectTemplateDocument|projectScene' \
  src/lib/template-package.ts
rg -n -i 'price|pricing|sku|students|rejects|refuses|COMMERCIAL_FIELD_REJECTED|STUDENT_DATA_DETECTED|serializeTemplatePack' \
  src/lib/template-package.test.ts

rg -n \
  '(import|from|require\()[^\n]*package\.json|package\.json[^\n]*(import|from|require)' \
  --glob '*.{ts,tsx,js,jsx,mjs,cjs}' .
rg -n 'APP_VERSION' --glob '*.{ts,tsx,js,jsx,mjs,cjs}' .

rg -n -i '"regional"|'\''regional'\''|regional\s*:' src/components/**/*.{ts,tsx}
rg -n 'templates=|\["original",\s*"cartoon",\s*"grain",\s*"q",\s*"scenery"\]' src/App.tsx
rg -n -i 'templates=\{?[^\n]*regional|<option[^>]*regional|value=["'\''{]regional|id:\s*["'\'']regional["'\'']' \
  src/**/*.{ts,tsx}

git diff -- src/components/ProjectWorkbench.tsx src/components/ProjectWorkbench.test.tsx \
  src/lib/project-package.ts src/lib/project-package.test.ts src/styles.css src/App.export-busy.test.ts
rg -n -i \
  '支付|套餐|SKU|订单|兑换码|VIP|付费|收费|students|roster|名单|roomId|roomCode|房间号|房间码|token|CHANGELOG_URL|buildIssueUrl|package\.json|APP_VERSION|regional' \
  src/components/ProjectWorkbench.tsx src/components/ProjectWorkbench.test.tsx \
  src/lib/project-package.ts src/lib/project-package.test.ts src/styles.css src/App.export-busy.test.ts
```

## 结果

| 检查项 | 证据与判定 | 结论 |
|---|---|---|
| 支付 / 套餐 / SKU / 订单 / 兑换码 / VIP 付费 | Cycle 3 新增行的命中只在任务边界和代理报告中。`src/` 实现命中只剩 `template-package.ts` / `template-exchange-actions.ts` 的拒绝规则及测试；未发现支付依赖、下单、兑换、权益或结算实现。`useCollaborationRoom.ts` 的 `subscription` 是 SSE 生命周期注释，不是付费订阅。 | **keep** |
| 名单、房间号、token 进入 Issue / Changelog URL | `CHANGELOG_URL` 是无 query/hash 的静态仓库地址。Issue URL 参数白名单只有 `template`、`labels`、`env`、`where`，实际写入只有模板、粗粒度系统/浏览器与运行方式。敏感词命中均为防泄漏注释、否定测试；`collaboration-client.ts` 的 `ticket` query 是协作 API，不是 Issue/Changelog。 | **keep** |
| 社区模板含 `students` 或 `price` / `sku` | 顶层 schema 白名单不含这些字段；导入递归拒绝 `students` 和收费字段；导出先投影文档、移除 `guests`，序列化前再次检测 `"students"` / `"guests"` 与收费字段。相关正向命中均是防御代码和拒绝用例。 | **keep** |
| `APP_VERSION` import `package.json` | 全仓未找到 `package.json` 的源码 import/require。`APP_VERSION` 仅在 `feedback-links.ts` 定义为字符串字面量；测试通过 Node `readFileSync` 校验漂移，不会进入客户端导入图。 | **keep** |
| `regional` 回到用户可见选择器 | `App.tsx` 三处用户可见内置模板列表均精确为 `original/cartoon/grain/q/scenery`；组件中无 `regional` 选项。其余命中是历史工程兼容、类型、资源或 `regionalAssets` 数据通路。Cycle 3 新增行只有“禁止加回”的任务文字。 | **keep** |
| Round 2 当前改动 | F3b 文件名对齐及测试、CSS 清理和 PNG busy 测试的当前 diff 未引入上述 URL、收费、模板字段、版本导入或 `regional` 选择器。工程包及其测试本来就含名单/空名单数据，但没有进入 Issue/Changelog URL，也不属于社区模板通道。 | **keep** |

## 结论

**keep**：未发现 Cycle 3 文件里的真实泄漏，不需要 `fix`。按任务约束未改产品代码，也未运行测试（只有真实泄漏并修复对应文件时才跑该文件测试）。未实现 `promo:lint`，未触碰 Demo、CI、印刷，也未提交或推送。
