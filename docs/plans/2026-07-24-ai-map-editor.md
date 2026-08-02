# AI 蹭饭图编辑器实施计划

> **For implementer:** Use TDD throughout. Write failing test first. Watch it fail. Then implement.

**Goal:** 为现有蹭饭图编辑器实现可验证的三字段数据闭环、参数化模板、AI 方案预览与部分应用、统一历史和轻量 AI 后端。

**Architecture:** 前端以 `ProjectDocument` 为唯一渲染状态，纯函数命令执行器生成预览和历史事务。Node AI 服务只返回经过 Schema 验证的候选数据和白名单编辑命令；它不直接写项目状态。SVG 渲染器从项目文档读取图层、模板与数据视图。

**Tech Stack:** React、TypeScript、Vite、Vitest、d3-geo、Fastify、Zod、xlsx、Sharp/Tesseract 适配器。

---

### Task 1: 项目文档与事务历史基础

**Files:**
- Create: `src/lib/project-document.ts`
- Create: `src/lib/project-document.test.ts`
- Modify: `src/lib/project-data.ts`

**Acceptance criteria:**
- 项目文档保存学生、模板参数、元素与历史。
- 事务可原子应用、撤销与重做。
- 新操作会清除重做分支。

**Verification:** `npm test -- --run src/lib/project-document.test.ts`

### Task 2: 白名单编辑命令与预览执行器

**Files:**
- Create: `src/lib/editor-commands.ts`
- Create: `src/lib/editor-commands.test.ts`
- Modify: `src/lib/project-document.ts`

**Acceptance criteria:**
- 支持分组、卡片预设、地图、背景、标记和卡片/文本移动命令。
- 未知命令与无效参数被拒绝。
- 命令可在克隆状态中预览，不改变原项目。

**Verification:** `npm test -- --run src/lib/editor-commands.test.ts`

### Task 3: 三字段数据校验与城市派生定位

**Files:**
- Create: `src/lib/student-data.ts`
- Create: `src/lib/student-data.test.ts`
- Modify: `src/lib/project-data.ts`

**Acceptance criteria:**
- 验证学生名称、录取院校、城市。
- 根据本地城市词典生成省份候选和问题。
- 重名和无法定位城市产生提示但不静默删除。

**Verification:** `npm test -- --run src/lib/student-data.test.ts`

### Task 4: 文本、CSV 与 Excel 导入候选

**Files:**
- Create: `src/lib/import-data.ts`
- Create: `src/lib/import-data.test.ts`
- Modify: `package.json`

**Acceptance criteria:**
- 可识别制表符、逗号和普通逐行文本。
- Excel/CSV 转换为待确认三字段候选。
- 原始行信息被保留。

**Verification:** `npm test -- --run src/lib/import-data.test.ts`

### Task 5: 数据工作台 UI

**Files:**
- Create: `src/components/DataWorkspace.tsx`
- Create: `src/components/DataWorkspace.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Acceptance criteria:**
- 表格可新增、修改、删除三字段记录。
- 导入候选可逐行确认或拒绝。
- 正式数据更新地图和全部视图。

**Verification:** `npm test && npm run build`

### Task 6: 参数化模板与图层模型

**Files:**
- Create: `src/lib/template-document.ts`
- Create: `src/lib/template-document.test.ts`
- Modify: `src/App.tsx`

**Acceptance criteria:**
- 系统模板和项目覆盖参数可合并。
- 支持画布、背景、地图、卡片、标记、连线、文字参数。
- 文本和卡片位置作为项目级手调覆盖保存。

**Verification:** `npm test -- --run src/lib/template-document.test.ts && npm run build`

### Task 7: 背景与地域素材面板

**Files:**
- Create: `src/lib/assets.ts`
- Create: `src/components/AssetPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Acceptance criteria:**
- 支持系统背景、用户背景、遮罩与层级。
- 每省最多三项地域素材，支持裁切模式和透明度。
- 用户素材不自动进入模板。

**Verification:** `npm test && npm run build`

### Task 8: 完整名单主视图与自适应布局

**Files:**
- Create: `src/lib/layout.ts`
- Create: `src/lib/layout.test.ts`
- Create: `src/components/MapDataLayer.tsx`
- Modify: `src/App.tsx`

**Acceptance criteria:**
- 支持省份、城市、院校和个人紧凑主视图。
- 20–70 人时每位学生恰好展示一次。
- 人数热力和图钉只能作为辅助层。
- 布局尊重用户锁定的卡片。

**Verification:** `npm test && npm run build`

### Task 9: AI 服务契约与无模型降级

**Files:**
- Create: `server/ai/schemas.ts`
- Create: `server/ai/provider.ts`
- Create: `server/ai/local-fallback.ts`
- Create: `server/routes/ai.ts`
- Create: `server/index.ts`
- Create: `server/ai/schemas.test.ts`
- Modify: `package.json`

**Acceptance criteria:**
- 三个端点返回一致的错误格式。
- 无配置模型时使用本地规则响应。
- AI 响应必须通过白名单 Schema，不能直接产生 SVG 或文件操作。

**Verification:** `npm test && npm run server:test`

### Task 10: AI 对话、逐条预览和部分应用 UI

**Files:**
- Create: `src/components/AiAssistant.tsx`
- Create: `src/components/ProposalPanel.tsx`
- Create: `src/lib/proposals.ts`
- Create: `src/lib/proposals.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Acceptance criteria:**
- 提问式请求仅显示回答。
- 要求式请求生成可勾选命令。
- 单条和组合预览均不改动当前项目。
- 选中命令可以应用为一个历史事务。

**Verification:** `npm test && npm run build`

### Task 11: 撤销、重做和历史面板

**Files:**
- Create: `src/components/HistoryPanel.tsx`
- Create: `src/components/HistoryPanel.test.tsx`
- Modify: `src/App.tsx`

**Acceptance criteria:**
- 手动操作和 AI 应用均进入同一历史。
- 支持撤销、重做、恢复至历史节点。
- 本地保存恢复最近 50 条历史记录。

**Verification:** `npm test && npm run build`

### Task 12: 模板保存、导出和端到端验证

**Files:**
- Create: `src/lib/template-store.ts`
- Create: `src/components/TemplateSaveDialog.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Acceptance criteria:**
- 保存模板不包含学生名称、录取院校或城市。
- 支持视觉样式与布局倾向两种保存范围。
- SVG、PNG 导出使用最终项目状态。
- 完整导入、AI 预览、部分应用、撤销、保存模板和导出通过浏览器验证。

**Verification:** `npm test && npm run lint && npm run build`
