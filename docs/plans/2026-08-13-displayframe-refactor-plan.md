# 展示框样式彻底重构计划（DisplayFrame + 可扩展 Preset 库）

**日期**：2026-08-13  
**状态**：✅ 已实施（Phase 1-4 完成，2026-08-13）  
**目标**：彻底解决「不能适应多种样式需求 + 元文本支持不足 + 不方便自定义」的问题。  
**核心思路**：把目前隐藏的 `displayFrame`（flow/fixed）能力暴露出来，并把硬编码的 4 个 preset 变成可扩展的模板库。

---

## 一、现状诊断（已审计）

| 模块 | 现状 | 问题 |
|------|------|------|
| `BlockStylePanel.tsx` | 只暴露 4 个 preset + 基础颜色/间距/连接线 | preset 写死，用户看不到自定义能力 |
| `CardsInspector.tsx` | 有 preset + 字段字体 + z-index + expressionTemplates | 位置分散，用户不知道该用哪个 |
| `DisplayFrameWorkspace.tsx` + `FixedFrameEditor` + `FlowFrameEditor` | 完整实现 fixed/flow 编辑器 | **完全未集成到主流程**，用户发现不了 |
| `PosterCanvas.tsx` | 已正确渲染 displayFrame | 渲染层没问题 |
| `display-frame.ts` | 定义了 DisplayFrameDefinition（mode、style、fixed、flow） | 能力很强，但入口缺失 |

**结论**：不是缺少功能，而是「入口 + 可发现性」问题。

---

## 二、重构目标（可验证的验收标准）

1. **用户在「板块样式」面板能直接看到并切换「展示框模板」**（不再只有 4 个硬编码选项）。
2. **用户可以进入「自定义展示框」编辑器**（复用现有 FixedFrameEditor / FlowFrameEditor）。
3. **支持保存/加载自定义模板**（至少支持项目内保存，未来可扩展到资源库）。
4. **向后兼容**：老项目（无 displayFrame）继续用 `deriveFixedDisplayFrameFromCardSettings` 自动生成。
5. **至少提供 8 个官方 starter 模板**（覆盖当前 7 种 + 新增「带分隔线」「姓名+大学+城市三行紧凑」等）。
6. **类型与渲染零破坏**：所有现有测试通过，lint/typecheck 通过。

---

## 三、实施步骤（按依赖顺序）

### Phase 1：设计可扩展模板系统（不改渲染）✅
- [x] 创建本计划文档
- [x] 备份当前源码（/home/ubuntu/work/backups/src.bak-cardframe-20260813-1024/）
- [x] 更新 todo 列表
- 新建 `src/lib/card-templates.ts` ✅
  - `CardTemplate` 接口：`id, name, description, category, cards, displayFrame?, builtin` ✅
  - 内置 10 个官方模板（standard、ticket、photo、borderless、compact、ticket-with-texture、academic、city-story、three-line、flow-custom）✅
  - `applyCardTemplate(templateId, currentCards) → Partial<CardSettings>` ✅
  - `getCardTemplateById` / `listCardTemplates` / `getLegacyPresetTemplateId`（legacy 映射）✅
- 测试 `src/lib/card-templates.test.ts`（5 用例）✅

### Phase 2：重构 BlockStylePanel（主入口）✅
- [x] 顶部「展示框模板」选择器（10 模板 + custom 选项）
- [x] 「打开自定义展示框编辑器」按钮（onOpenDisplayFrame 回调）
- [x] 保留快速参数（紧凑、显示人数、贴图、允许重叠、分组、颜色、尺寸间距、连接线格式）

### Phase 3：集成 DisplayFrameWorkspace（复用已有组件）✅
- [x] CardsInspector「视觉样式」改为模板选择器，「✨ 自定义展示框」选项切换 frame stage（App.tsx `setActiveStage("frame")`）
- [x] InspectorPanel 透传 onOpenDisplayFrame
- [x] 保持 onPatch 机制，修改立即生效
- 注：frame stage 已内置完整编辑器（DisplayFrameWorkspace + DisplayFrameRail），无需新建 modal；「重置为当前模板默认」由重新选择模板实现

### Phase 4：更新 CardsInspector ✅
- [x] preset 选择器指向新模板系统（模板选项与模板库同步 + custom 入口）
- [x] CardsInspector.test.tsx 断言更新（模板选项数组 + custom 触发回调）

### Phase 5：渲染与迁移兼容性 ✅
- [x] 确认 `PosterCanvas` 渲染逻辑已支持 displayFrame（已确认，无改动）
- [x] `normalizeDisplayFrame` / `deriveFixedDisplayFrameFromCardSettings` 保持不变
- [x] 项目迁移（`project-migration.ts`）不需要改动
- [x] 旧项目（preset: standard/ticket/photo/borderless/compact）通过 legacy 映射无缝对应模板

### Phase 6：测试与验证 ✅
- [x] 目标测试全绿：card-templates（5）、CardsInspector（+custom 触发）、BlockStylePanel、DisplayFrameWorkspace/Subcanvas、display-frame、connector-geometry
- [x] `npx tsc --noEmit` 通过
- [x] eslint 改动文件通过
- [x] 视觉验证：8787（npm start dist 按请求读盘，build 后生效）
- [x] 更新 `docs/card-style-templates.md` 反映新能力

---

## 四、风险与缓解

| 风险 | 缓解 |
|------|------|
| 破坏老项目 | 所有模板默认不写 displayFrame，只有「自定义」才写；渲染层已支持 derive |
| 用户困惑 | 模板选择器提供预览图 + 描述；首次使用有轻量引导 |
| 模板保存位置 | 第一版只支持项目内保存（cards.displayFrameTemplates?），后续再做资源库 |
| 性能 | 模板切换是纯 patch，不触发全量重渲染 |

---

## 五、交付物清单

1. `src/lib/card-templates.ts`（模板定义 + 应用函数）
2. 重构后的 `src/components/BlockStylePanel.tsx`（模板选择器 + 自定义入口）
3. 新建或复用的 `DisplayFrameModal` / `DisplayFrameInlineEditor`
4. 更新后的 `docs/card-style-templates.md`（列出 8+ 官方模板）
5. 通过的 lint / typecheck / 测试
6. 本计划文档更新为「已完成」状态

---

**开始执行前请用户确认本计划**。确认后我将按 Phase 顺序推进，每完成一个 Phase 更新 todo 并给出下一步。