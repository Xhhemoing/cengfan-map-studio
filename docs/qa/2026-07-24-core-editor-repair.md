# 蹭饭图核心编辑器修复 QA 验收报告

**日期：** 2026-07-25
**基线提交：** 3aa8e8c
**计划文档：** `docs/plans/2026-07-24-core-editor-repair.md`
**设计文档：** `docs/plans/2026-07-24-core-editor-repair-design.md`

---

## 1. 环境验证

| 检查项 | 命令/端点 | 结果 |
|---|---|---|
| Vite 开发服务 | `http://localhost:5173/` | 返回 HTML 200，脚本加载正常 |
| API 健康检查 | `http://localhost:8787/api/health` | `{"ok":true,"provider":"local-fallback"}` |
| 生产构建 | `npm run build` | 通过 |
| 静态资源服务 | `dist/` 目录已生成 | 通过 |

---

## 2. 自动化测试覆盖

本次会话确认以下任务测试全部通过：

| 任务 | 目标测试文件 | 结果 |
|---|---|---|
| Task 1 | `src/lib/project-persistence.test.ts` | 通过 |
| Task 2 | `src/lib/search-catalog.test.ts` | 通过（8 tests） |
| Task 3 | `src/components/DataWorkspace.test.tsx` `src/components/SearchCombobox.test.tsx` `src/lib/data-workspace.test.ts` | 通过 |
| Task 4 | `src/lib/scene-document.test.ts` `src/lib/canvas-data.test.ts` `src/lib/project-document.test.ts` | 通过 |
| Task 5 | `src/lib/project-migration.test.ts` `src/lib/project-persistence.test.ts` `src/lib/template-store.test.ts` | 通过 |
| Task 6 | `src/components/canvas/PosterCanvas.test.tsx` `src/lib/layout.test.ts` | 通过 |
| Task 7 | `src/lib/inspector-operations.test.ts` | 通过 |
| Task 8 | `src/components/inspector/InspectorPanel.test.tsx` | 通过 |
| Task 9 | `src/components/inspector/TextInspector.test.tsx` `src/components/canvas/TextLayer.test.tsx` | 通过 |
| Task 10 | `src/lib/assets.test.ts` `src/lib/asset-elements.test.ts` `src/components/AssetPanel.test.tsx` | 通过 |
| Task 11 | `src/components/canvas/RegionalAssetLayer.test.tsx` `src/components/canvas/DecorationLayer.test.tsx` `src/lib/map-data.test.ts` | 通过 |
| Task 12 | `src/components/inspector/AssetInspector.test.tsx` `src/components/canvas/RegionalAssetLayer.test.tsx` | 通过 |
| Task 13 | `src/lib/editor-commands.test.ts` `src/lib/style-commands.test.ts` `src/lib/template-store.test.ts` `src/lib/export-poster.test.ts` | 通过 |

**全量测试：** `npm test` → 36 个文件，140 个测试全部通过。

**类型/构建：** `npm run build` 通过；`npm run lint` 通过。

---

## 3. 浏览器验收矩阵（当前受限）

以下交互验收项因当前环境缺少 Camofox 浏览器工具而无法在终端自动执行，需要在带 GUI 浏览器的环境中完成：

1. 使用 `北大` 和 `杭州` 建议添加学生。
2. 编辑记录、切换可见性、删除、撤销/重做。
3. 修改画布尺寸，验证 SVG `viewBox` 和 PNG 尺寸。
4. 选择地图，修改位置、尺寸、缩放、标签和颜色。
5. 选择卡片，修改预设、间距、分组和可见字段。
6. 选择每个内置文本角色，编辑内容、大小、颜色、字重、对齐、宽度和可见性。
7. 添加/编辑/删除特殊备注。
8. 将图片应用为浙江省纹理。
9. 为同一省份添加两个地标，移动、缩放、旋转、重排序、隐藏一个。
10. 添加装饰并移动/缩放/删除。
11. 保存/重载，验证场景和人员持久化。
12. 保存/应用自定义模板，验证人员不被覆盖。
13. 导出 SVG 和 PNG，验证输出无选择手柄。
14. 键盘操作所有组合框、开关、标签页和检查器控件。
15. 检查浏览器控制台错误/警告。

---

## 4. 已知限制

- 浏览器级验收（点击、拖拽、键盘导航、截图对比）受限于当前无头环境，未在本报告中执行。
- 任何在浏览器验收中发现的缺陷，都需要先编写失败的回归测试，再修复（按执行规则）。

---

## 5. 最终门禁

- `npm test`：通过
- `npm run build`：通过
- `git diff --check`：无空白错误
- `git status --short`：新增 QA 文档
