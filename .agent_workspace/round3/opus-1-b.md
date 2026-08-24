MODEL: claude-opus-5-thinking-high-fast

# R3-O1 · 项 B 实现报告：社区模板交换格式 `.cengfan-template`

> 角色：Round 3 实现者 R3-O1。**未提交、未推送**（按指令）。工作区与 R3-F1 / R3-F2 / R3-O2 / R3-G1 / R3-G2 共用，本报告只对下列文件负责。

## 1. 交付物

| 类型 | 文件 | 行为 |
|------|------|------|
| 新增 | `src/lib/template-package.ts` | 格式常量、`TemplatePackError`、`createTemplatePack` / `serializeTemplatePack` / `parseTemplatePack` / `readTemplatePackFile` / `templatePackFilename` / `assertNoStudentData` / `assertNoCommercialFields` |
| 新增 | `src/lib/template-package.test.ts` | 34 条断言（往返、名单、嘉宾、商业字段、版本、封闭 schema、文件名、体积闸、accept 互斥） |
| 新增 | `src/lib/template-exchange-actions.ts` | `downloadTemplatePack`、`mergeImportedTemplate`、`describeTemplatePackError` |
| 新增 | `src/lib/template-exchange-actions.test.ts` | 14 条断言 |
| 新增 | `src/components/TemplateExchange.tsx` | 「导出当前模板 / 导入模板文件」+ `role="status"` 回执 |
| 新增 | `src/components/TemplateExchange.test.tsx` | 9 条断言 |
| 新增 | `src/components/TemplatePicker.test.tsx` | 插槽 + 既有行为回归 3 条 |
| 修改 | `src/lib/template-store.ts` | 仅给 `stripStudentData`、`sanitizeCustomTemplateRecord` 加 `export` 与文档注释；**localStorage schema、`CustomTemplateRecord` 形状、任何行为均未变** |
| 修改 | `src/components/TemplatePicker.tsx` | 新增可选 `exchange?: ReactNode`，渲染在「保存当前整体模板」按钮之后；不传 = 现状 UI |
| 修改 | `src/components/GlobalSettingsScreen.tsx` | 三个**可选** props（`customTemplateRecords` / `onImportTemplateRecord` / `templateAuthor`），在 `TemplatePicker` 下挂 `<TemplateExchange>` |
| 修改 | `src/styles.css` | 末尾追加 12 行 `.template-exchange*`，不改既有选择器 |

未触碰：`src/App.tsx`、`src/lib/project-package.ts`、`server/`、README、任何支付/套餐/手续费面。

## 2. 格式（v1，冻结）

```jsonc
{
  "kind": "cengfan-template",       // 常量
  "version": 1,                      // 只接受 1，其它一律拒收，绝不「尽力解析」
  "exportedAt": "2026-08-24T10:00:00.000Z",
  "name": "卡通开学墙",              // ≤60 码点
  "author": "小林",                  // 可选，≤24 码点，仅昵称，不是账号
  "license": "AGPL-3.0-only",       // 授权条款字符串，不是价格
  "baseTemplateId": "cartoon",      // original|cartoon|grain|q|scenery|regional
  "scope": "visual",                // visual|layout
  "document": { /* TemplateDocument */ },
  "scene": { /* 可选：canvas/map/cards/textElements/assetElements，无 guests */ }
}
```

顶层键为**封闭集合**（上述 10 键，`TEMPLATE_PACK_TOP_LEVEL_KEYS`）；出现集合外键 → `UNKNOWN_FIELD` 拒收。文件后缀 `.cengfan-template`，MIME `application/json;charset=utf-8`。

### 出站三闸（导出）

1. `sanitizeCustomTemplateRecord`（复用 `template-store` 同一实现）→ 内部第一步 `stripStudentData` 递归删除任意层级 `students`。
2. `assertNoCommercialFields(sanitized)` → **在白名单投影之前**扫描，命中即抛（否则商业字段会被静默丢弃，用户不知道自己的模板被改过）；随后逐字段白名单拷贝 `document` 的 11 个键与 `scene` 的 5 个键，**`scene.guests` 整体不拷**。
3. `serializeTemplatePack` 在 `JSON.stringify` 之后、`new Blob` 之前正则体检 `/"students"\s*:/` 与 `/"guests"\s*:/`，命中即抛 `STUDENT_DATA_DETECTED`。`downloadTemplatePack` 先 serialize 再建 Blob，因此**含名单的文件永远到不了用户手上**（有专门测试断言 `URL.createObjectURL` 零调用）。

### 入站六闸（导入）

`file.size > 1MB` → `FILE_TOO_LARGE`（在 `file.text()` **之前**）→ JSON 解析 → `kind`（工程包给专用文案）→ `version` → `assertNoStudentData` 递归**拒收**（不剥离、不部分导入）→ `assertNoCommercialFields` → 封闭 schema → 重铸 `id`（`createId("custom")`）与 `createdAt` → `sanitizeCustomTemplateRecord` → 强制 `scene.guests.people = []` 且清空 `customText`。

## 3. failure → cause → fix → recheck

先写测试、后写实现，四条链条都是真实发生的，不是事后补写。

**① failure**：`npx vitest run src/lib/template-package.test.ts src/components/TemplateExchange.test.tsx` → `Failed to resolve import "./template-package"`，2 个文件 0 条用例。
**cause**：TDD 起点，被测模块尚不存在。
**fix**：实现 `template-package.ts` / `template-exchange-actions.ts` / `TemplateExchange.tsx`。
**recheck**：同命令 → 34 + 9 全绿。

**② failure（设计期自查，写实现前用 rg 复核而非等测试报警）**：拟定商业字段词表时把 `order` 列为拒收键。
**cause**：`src/lib/display-frame.ts:59` 的 `order: number` 是 `scene.cards.displayFrame` 的合法字段，词表会让**任何带展示框的正常模板导出失败**——这是最危险的一类误报（用户模板越复杂越容易中招）。
**fix**：拆成「前缀匹配（price/pricing/sku/payment/coupon/checkout/subscription/invoice/billing/purchase/settlement/refund）+ 精确匹配（fee/fees/amount/currency/listed/listing/orderid/pay/paid/vip/plan）+ 中文子串（价格/售价/定价/套餐/结算/手续费/支付/付费/订单/收费/会员费）」，删除裸 `order`。
**recheck**：新增用例 `does not mistake ordinary template fields for commercial fields`（对真实 record 断言不抛）+ 商业字段拒收 6 条，全绿；`rg -i '(price|sku|listed|order|coupon|payment|vip)' src/lib/template-package.ts` 只命中拒收清单，无任何字段定义。

**③ failure（第一版实现的语义漏洞，被测试当场抓住的候选）**：`createTemplatePack` 原本只在**投影之后**跑商业字段扫描。
**cause**：白名单投影会先把 `document.sku` 丢掉，扫描于是永远扫不到 → 用例 `refuses to export a record carrying commercial keys` 期望抛错却不会抛，且真实语义变成「静默改写用户模板」。
**fix**：把 `assertNoCommercialFields(sanitized)` 提到投影之前（代码里留了一行注释说明为什么顺序重要）。
**recheck**：该用例转绿；出站仍保留投影后的第二次扫描作兜底。

**④ failure（全量回归）**：`npx vitest run` → `Test Files 1 failed | 174 passed`，`Tests 7 failed | 1374 passed`。
**cause**：7 条失败全部集中在 `src/components/ProjectMenu.identity.test.tsx`（R3-F1 的项 E 在途文件，报错是 `container.querySelector(".collaboration-display-name")` 返回 `undefined`、`set value` 调用在非 input 上），与本项零交集：本项改动的 `template-store.ts` 两个 `export`、`TemplatePicker` 可选 prop、`GlobalSettingsScreen` 可选 props 均不进协作浮层。
**fix**：不属本项范围，未改（越界修 R3-F1 的文件会造成更难查的冲突）。
**recheck**：`npx vitest run src/lib/template-package.test.ts src/lib/template-exchange-actions.test.ts src/components/TemplateExchange.test.tsx src/components/TemplatePicker.test.tsx src/lib/template-store.test.ts src/lib/project-package.test.ts src/components/DataPresentationPanel.test.tsx src/components/GlobalDataScreen.test.tsx` → 8 文件 84 条全绿；`npx tsc -p tsconfig.app.json --noEmit` 零错误；`npx eslint <本项 10 个文件>` 零告警。

## 4. 指令要求的五条硬断言落点

| 要求 | 用例 | 文件 |
|------|------|------|
| round-trip | `round-trips a custom template through export and import` + `reassigns the record id and creation time on import` | `template-package.test.ts` |
| 拒收 students | 顶层 / `document` / `scene` / 嵌套数组四处各一条，均断言 `STUDENT_DATA_DETECTED`；导出侧另有「三层脏 record 序列化后不含 students 与人名」与「绕过 sanitize 后 serialize 抛错」 | 同上 |
| 拒收 price | `price` / `sku` / `listed` / `价格` 四条 + `document.pricing.amount` 嵌套一条 + 导出侧一条 + 「license 写成 ¥199」一条 | 同上 |
| 拒未知 version | `2` / `"1"` / `0` / 缺失 四条，均要求文案含「升级」 | 同上 |
| guests 剥离 | `omits scene guests so guest names never leave the browser`（pack 无 `guests` 键、序列化不含嘉宾名）+ `imports templates with an empty guest panel`（导入后 `people === []`）+ 组件级导出 Blob 文本不含嘉宾名 | `template-package.test.ts` / `TemplateExchange.test.tsx` |

额外守住的两条边界：`fileMatchesAccept(工程.cengfan, TEMPLATE_PACK_FILE_ACCEPT) === false`（模板入口不抢 `.cengfan` 工程包）、工程包投进模板入口得到 `PROJECT_PACKAGE_REJECTED` 的专用中文文案（引导去「导入工程」）。

## 5. 尚未接通的一步（明确交底，不含糊）

`GlobalSettingsScreen` 的三个新 props 是**可选**的，`src/App.tsx` 在本项范围外（指令 FORBIDDEN，且 R3-O2 / R3-G1 同时持有该文件）。因此当前状态是：**库与组件已完备且全测试覆盖，UI 入口在 App 未传 props 前不渲染**（`exchange={undefined}` = 现状 UI，零视觉变化）。

接通只需在 `App.tsx:1637` 附近加两行 props 与一个 handler：

```tsx
customTemplateRecords={customTemplates}
onImportTemplateRecord={(record) => {
  const { next, dropped } = mergeImportedTemplate(customTemplates, record);
  setCustomTemplates(next);
  if (dropped > 0) setStatusMessage(`已达 20 个模板上限，最旧的 ${dropped} 个已移除`);
}}
```

`mergeImportedTemplate` 复刻 `App.tsx:1177` 的 `.slice(0, 20)` 语义（新的在前、超出丢最旧），已有 2 条测试。选择「丢最旧」而不是「拒绝导入」，是因为当前没有删除模板的 UI，拒绝会让用户彻底卡死。`setCustomTemplates` 之后既有持久化链路自动生效，**不需要任何新的持久化代码**。

## 6. 验收方式（AGENTS.md 交付纪律）

- 机器可查：上述 8 文件 84 条 vitest + `tsc --noEmit` + `eslint`，命令与结果见 §3④。
- 人工验收（接通 App 后）：全局设置 → 数据板块 → 「数据展示」→ 模板区底部「导出当前模板」得到 `<模板名>-YYYY-MM-DD.cengfan-template`；换一个浏览器 profile「导入模板文件」，模板出现在「我的模板」，应用到含名单工程后**名单逐条不变、嘉宾板块不被他人姓名覆盖**。
- PR 描述需附导出文件的 `head -20`（可直接肉眼确认无 `students`、无 `guests`、无任何收费字段）。

## 7. 回滚方案（新文件格式属破坏性变更）

| 级别 | 操作 | 影响 |
|------|------|------|
| L0（1 行） | `GlobalSettingsScreen.tsx` 去掉 `exchange={...}` 传参 | 入口立即不可达，库与测试保留；已导出的文件在外部照常留存 |
| L1（约 6 行） | 撤掉 `GlobalSettingsScreen` 的三个可选 props 与 `TemplateExchange` import | 同上，组件回到改动前形状 |
| L2（完全回滚） | `git revert`：删 6 个新文件、撤 `TemplatePicker` 的 `exchange` prop、撤 `template-store.ts` 的两个 `export`、撤 12 行 CSS | 野外的 `.cengfan-template` 文件成为孤儿（旧版本本就打不开），补救路径是改用 `.cengfan` 工程包传播模板 |

**数据安全性论证（为什么回滚零迁移）**：本格式是**纯附加**的第二条出口。未改 `PROJECT_PACKAGE_VERSION`（仍为 2）、未改 `.cengfan` 结构、未改 `CUSTOM_TEMPLATES_KEY` 的 localStorage schema、未改 `CustomTemplateRecord` 类型、未新增任何服务端字段。回滚后没有任何既有数据变得不可读——模板依旧在 localStorage 与工程包里。

**版本字段的前向约定**：导出恒写 `version: 1`。未来 v2 必须保持 `kind: "cengfan-template"` 不变，并让 v1 读取器落到 `UNSUPPORTED_VERSION` 的明确文案（「请升级蹭饭图后再导入」）；**禁止「尽力解析」未知版本**——这正是 `version` 字段作为回滚/演进抓手的全部意义。

## 8. 边界自检

1. `rg -i '(price|sku|listed|coupon|payment|vip|套餐|手续费|结算)' src/lib/template-package.ts` → 只命中拒收词表与错误文案，无字段定义。
2. `rg 'students' src/lib/template-package.ts` → 只命中出站正则兜底、`assertNoStudentData` 与注释。
3. `git diff --stat server/` → 空。
4. `git diff --stat src/App.tsx src/lib/project-package.ts` → 本项零改动（App.tsx 的现有改动属 R3-O2 / R3-G1）。
5. `TemplateExchange.tsx` 只导出组件一个符号（`react-refresh/only-export-components` 绿）。
6. 无障碍：导出禁用时**用文字说明原因**（「先用上方『保存当前整体模板』存一个模板，才能导出给别人。」）而不是只靠灰色；回执区 `role="status" aria-live="polite"`；导入失败统一「导入失败：<可读中文>」，不吞错、不只进 console。
