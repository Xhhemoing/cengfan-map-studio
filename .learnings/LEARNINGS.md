
## [LRN-20260805-001] correction

**Logged**: 2026-08-05
**Priority**: medium

用户多次要求继续写入，已确认此前只写入设计/计划文档，没有实际实现代码；后续应直接执行计划并明确报告真实写入状态。

---

## [LRN-20260806-002] correction

**Logged**: 2026-08-06T10:20:27+08:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
把用户所说的“前端预览”错误地理解为现有 `/prototype` 的旧原型，而不是新建一张独立的方案样式图。

### Details
用户先要求针对现有新版界面提出改进方案，后明确要求“做出简单的样式图，展示每个板块的布局”。我沿用了仓库中已存在、视觉语言陈旧的 `WorkflowPrototype`，并直接修改它来附加版块图谱。该路径既没有满足“新建”的要求，也让用户看到旧原型被局部加料，偏离了交付目标。

### Correct Rule
涉及“预览”“样式图”“方案图”等界面概念验证时，必须先确认目标路由和产物边界。用户未指定复用现有原型时，应新建独立、可访问的方案页面/组件，不修改旧原型。交付前必须检查页面入口以及视觉产物本身，而不能只以组件测试和类型检查代替。

### Suggested Action
1. 删除本轮对旧 `WorkflowPrototype` 的未提交改动。
2. 新建独立方案页面，例如 `/layout-preview`，在单页内展示六个工作区的布局样式图。
3. 首次提交视觉产物前，在浏览器中打开新路由并确认其不是既有 `/prototype` 的旧界面。

### Metadata
- Source: user_feedback
- Related Files: src/main.tsx, src/components/WorkflowPrototype.tsx, src/components/workflow-prototype.css
- Tags: preview, prototype, route-boundary, user-correction
- Pattern-Key: frontend.preview-must-be-new-surface
- Recurrence-Count: 1
- First-Seen: 2026-08-06
- Last-Seen: 2026-08-06

### Resolution
- **Resolved**: 2026-08-06T10:20:27+08:00
- **Notes**: Documented before reverting the mistaken prototype changes; any subsequent visual work must use a new independent preview route.
