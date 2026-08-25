# Cycle 3 Round 3 · 浏览器验收清单（C3R3-F2）

MODEL: claude-fable-5-thinking-xhigh

本清单只描述「怎么点、看什么」，不改产品代码。每一步给出控件文案 / aria-label / DOM 选择器与期望结果，父代理逐项打勾。

## 0. 前置准备

- [ ] 环境：`npm run dev`（Vite 5173 + API 8787），浏览器打开 `http://localhost:5173/`。
- [ ] 用全新浏览器 profile 或先清空该站点的 IndexedDB/localStorage——「载入示例项目」按钮只在工作台**没有任何项目**时出现（`ProjectGrid.tsx` 空状态）。
- [ ] 注意：当前工作区有**未提交**的 `src/components/DataWorkspace.tsx` / `DataWorkspace.test.tsx` 改动（Round 3「Empty」项，把 live region 子节点收成无空白单行）。验收针对工作树现状，不是最近一次 commit。

## A. 帮助菜单 · 更新日志链接与版本号

工作台（首页 `/`，未进项目）：

- [ ] A1 顶部右侧点按钮「帮助」（`<summary>`，aria-label「帮助与反馈」）。弹出层出现两组链接。
- [ ] A2 在「先自己看看」组找到链接「更新日志」。检查其 `href` **精确等于** `https://github.com/Xhhemoing/cengfan-map-studio/blob/main/CHANGELOG.md`：
  - 含 `CHANGELOG.md`；
  - **不含 `?`（无任何 query 参数）**——工程数据不进 URL；
  - `target="_blank"`、`rel="noopener noreferrer"`，aria-label 为「更新日志（GitHub，新窗口打开）」。
- [ ] A3 同一弹出层底部可见文字「版本 v0.1.0」（`<small>版本 v{APP_VERSION}</small>`，`APP_VERSION = "0.1.0"`，`feedback-links.ts`）。

编辑器（进入任一项目后，如 B1 打开的示例项目）：

- [ ] A4 顶栏「帮助」按钮同样存在（`App.tsx` 的 `ToolbarGroup label="帮助与反馈"`），重复 A2、A3，期望完全一致。两处渲染的是同一个 `HelpFeedbackMenu` 组件，只差 `variant`。

## B. 示例项目 · 工程包导出文件名

### 期望文件名计算（以 `src/lib/export-filename.ts` 为准）

示例项目名是 `示例：2026届毕业去向`（`project-store.ts` 的 `SAMPLE_PROJECT_NAME`），其中冒号是**全角** `：`（U+FF1A）。`sanitizeExportBaseName` 只删除 ASCII 半角字符 `\ / : * ? " < > |`，全角冒号**不会被删**；名字 12 个字符 ≤ 40 上限，无空白、无首尾 `.`/`-`，因此 base 原样保留。`buildExportFileName({ kind: "project" })` 拼成 `${base}-工程包-${date}.json`，`date` 取 `pack.exportedAt.slice(0, 10)`，即导出瞬间的 **UTC** 日期。

**期望字符串（今天 UTC 2026-08-24 导出时）：**

```
示例：2026届毕业去向-工程包-2026-08-24.json
```

与单测 `export-filename.test.ts` 第 22–23 行断言一致。若验收在 UTC 次日执行，日期段相应顺延；UTC 与本地时区跨天时以 UTC 为准。若操作系统下载层再改名（极少数环境会替换全角字符），以应用内成功条文案为准——成功条显示的是应用生成的文件名。

### 点击步骤

- [ ] B1 工作台空状态点「载入示例项目」→ 项目卡片「示例：2026届毕业去向」出现 → 点卡片打开进入编辑器（URL 变为 `#/project/<id>`）。
- [ ] B2 路径一（最终导出阶段）：顶部工作流步骤条点「最终导出」→ 右栏「导出操作」组（aria-label「导出操作」）点按钮「工程包」（aria-label「导出工程包」）。该路径**直接导出，无确认弹窗**。
- [ ] B3 路径二（项目菜单）：顶栏点「项目」（aria-label「打开项目与协作菜单」）→「工程文件」组点「导出工程」→ 弹出对话框「确认导出工程」（aria-label「导出工程确认」）→ 点「确认导出」。
- [ ] B4 验收其一即可，二者走同一 `buildExportFileName`：
  - 浏览器下载文件名 = 上面的期望字符串（含全角冒号、`.json` 后缀）；**或**
  - 在「最终导出」阶段右栏出现成功条（`role="status"`，class `delivery-workspace__result`），文案为「已导出 示例：2026届毕业去向-工程包-2026-08-24.json」，旁有「再次导出」按钮。
- [ ] B5（补充口径）工作台项目卡「···」菜单里的「导出」走 `ProjectWorkbench.exportProject`，同样调用 `buildExportFileName({ projectName, kind: "project", date })`，期望文件名相同（日期取该项目包的 `exportedAt`，即上次保存时间的 UTC 日期，可能早于今天）。

## C. 数据阶段 · 空名单导入失败必须是 role=alert

- [ ] C1 在示例项目内，顶部工作流步骤条点「数据与素材」进入数据阶段（默认布局下 `DataUploadWorkspace` 内嵌 `DataWorkspace`）。
- [ ] C2 数据面板里点「展开导入 / OCR / Excel」（aria-label「展开导入名单」；紧凑模式下导入区默认收起）。
- [ ] C3 **不在文本框输入任何内容**，直接点按钮「一键识别并导入」。
- [ ] C4 期望失败文案 **精确为「请先粘贴名单」**（`DataWorkspace.tsx` `importDirectly` 的空文本分支；含关键词「请先」，`isImportFailureMessage` 判定为失败）。
- [ ] C5 DOM 断言（关键——失败不许落在成功区）：
  - 文案出现在 `div[role="alert"].data-message--alert`（`aria-live="assertive"`，红框样式）里，`textContent === "请先粘贴名单"`；
  - 相邻的 `div[role="status"].data-message:not(.data-message--alert)`（绿框）此刻**不包含**该文案，且匹配 CSS `:empty`（可在控制台跑 `document.querySelector('.data-message:not(.data-message--alert)').matches(':empty')` 期望 `true`）——空白文本节点都不允许，否则空绿框会露出来（Round 3「Empty」项）。
  - 两个 live region **常驻 DOM**（消息为空时也不卸载），空时被 `.data-message:empty` 收成 1px 不可见。
- [ ] C6（顺手回归）随后做一次成功操作（如在文本框粘贴 `林舟 北京大学 北京` 再点「一键识别并导入」并确认）：成功文案应落回 `role="status"` 绿框，且 alert 红框恢复 `:empty`。

## D. 顶栏「导出 PNG」禁用条件（源码守卫 + 可见行为）

- [ ] D1 源码检查（必做）：`rg 'disabled=\{posterExport\.exportState === "exporting"\}' src/App.tsx` 应命中**两处**「导出 PNG」按钮——顶栏导出组（约 2021 行）与旧版交付面板「交付操作」组（约 2286 行）。两处按钮文案在导出中显示「导出中...」，空闲显示「导出 PNG」。条件必须是 `exportState === "exporting"`（任意 PNG/SVG/工程包导出进行中都禁用），**不是**只看 `exportingPng`。
- [ ] D2 源码检查：最终导出阶段右栏三个按钮（PNG / SVG / 工程包，`DeliveryWorkspace.tsx` 122–124 行）也都是 `disabled={exportState === "exporting"}`，外层 `role="group"` 带 `aria-busy`。
- [ ] D3 浏览器可见性说明：带「导出 PNG」文案的顶栏按钮只在**旧版编辑器外壳**渲染（需 `localStorage.setItem("cengfan-legacy-editor", "1")` 后刷新并处于「内容与排版」阶段）。默认新布局下等价验收点是最终导出阶段右栏「PNG」按钮。二选一即可：
  - 默认布局：在「最终导出」点「PNG」，导出瞬间三个导出按钮同时置灰（PNG 导出很快，可用 DevTools 把 CPU 节流放大窗口，或点「工程包」后立即观察 PNG 按钮）；
  - 旧版外壳：设置上述 localStorage 后刷新，顶栏按钮点击后文案变「导出中...」且 `disabled`。
  D1 的源码断言是本项的硬性验收，浏览器观察为佐证。

## 回滚一览

全部为前端行为改动，无数据格式/存储迁移；工程包仍是 `.json`、解析不依赖文件名，旧导出文件不受影响。

| 验收项 | 改动所在 | 回滚方式 |
|---|---|---|
| A 帮助菜单 CHANGELOG 链接 + 版本号 | commit `4aa8f89`（`feedback-links.ts`、`HelpFeedbackMenu.tsx`） | `git revert 4aa8f89`（会连带 F3/D3/CSS，按文件挑拣可 `git checkout 4aa8f89^ -- <file>`） |
| B 工程包文件名走 `buildExportFileName` | commit `4aa8f89` + `18a45f9`（`usePosterExport.ts`、`ProjectWorkbench.tsx`、`export-filename.ts`） | `git revert 18a45f9 4aa8f89`；回滚后文件名退回旧默认，不影响导入 |
| C 失败消息进 `role="alert"` | commit `4aa8f89`/`18a45f9`（`import-message.ts`、`DataWorkspace.tsx`）+ **未提交**的 Round 3 Empty 改动 | 未提交部分：`git restore src/components/DataWorkspace.tsx src/components/DataWorkspace.test.tsx`；已提交部分同上 revert |
| D PNG 按钮禁用条件 | commit `4abc3b2`（首版）+ `18a45f9`（对齐守卫） | `git revert 18a45f9 4abc3b2` |

回滚验证：revert 后跑 `npx vitest run src/lib/export-filename.test.ts src/components/DataWorkspace.test.tsx src/components/HelpFeedbackMenu.test.tsx`，失败项即为已回滚行为，属预期。
