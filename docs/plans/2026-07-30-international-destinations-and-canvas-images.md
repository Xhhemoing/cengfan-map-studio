# 国际去向与画板图片实施计划

> 设计依据：[国际去向与画板图片设计](./2026-07-30-international-destinations-and-canvas-images-design.md)

## Task 1: 国际学生数据合同

**范围**：为 `Student`、输入草稿、文本/Excel 导入和项目迁移增加 `locationScope`；旧记录默认中国。

**验收**：
- [ ] 旧工程迁移后学生仍是中国去向。
- [ ] 显式海外记录保留其地点文本且不进行中国城市规范化。
- [ ] 带第四列“去向类型”的文本/Excel 导入可产生海外记录。

**验证**：`npx vitest run src/lib/student-data.test.ts src/lib/import-data.test.ts src/lib/project-migration.test.ts`

## Task 2: 无锚点国际数据方框

**范围**：中国统计、热力和图钉排除海外学生；海外学生继续进入方框布局，但无地图锚点和连接线。

**验收**：
- [ ] 海外记录可显示在卡片中。
- [ ] 海外记录不生成 `data-destination-anchor` 或 `data-destination-connector`。
- [ ] 海外记录不改变中国省份统计和图钉。

**验证**：`npx vitest run src/lib/project-data.test.ts src/components/canvas/PosterCanvas.test.tsx`

## Task 3: 数据中心去向类型交互

**范围**：新增/编辑/导入审核显示去向类型；海外输入允许自由地点文本且不提示中国城市未匹配。

**验收**：
- [ ] 新增和编辑可切换中国/海外。
- [ ] 海外记录不会计入“未匹配城市”。
- [ ] 导入审核可调整类型。

**验证**：`npx vitest run src/components/DataWorkspace.test.tsx src/App.test.tsx`

## Task 4: 任意图片作为通用画板素材

**范围**：普通图片与 SVG 都可创建 `decoration` 素材和画板实例；素材库可再次添加。

**验收**：
- [ ] PNG/JPG/WEBP/GIF/SVG 上传后均可落到画板。
- [ ] 同一素材可产生多个独立的可编辑实例。
- [ ] 工程恢复和资源包保留实例与素材。

**验证**：`npx vitest run src/lib/asset-elements.test.ts src/components/AssetPanel.test.tsx src/components/canvas/DecorationLayer.test.tsx`

## Task 5: 可选一次性自动抠图

**范围**：普通图片上传时可选抠图；素材库中未处理图片可执行一次，成功后标记不可重复处理；高级分割优先并在无模型条件下回退本地背景色算法。

**验收**：
- [ ] 上传时勾选后保存透明图片和处理状态。
- [ ] 未处理图片可以后处理，已处理图片不显示重复操作。
- [ ] 失败保留原图并提示。

**验证**：`npx vitest run src/lib/background-removal.test.ts src/lib/assets.test.ts src/components/AssetPanel.test.tsx`

## Task 6: 端到端验收

**范围**：项目保存恢复、工程包、SVG/PNG 导出及真实浏览器操作。

**验证**：
- [ ] `npm run test`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] 在 `http://localhost:5174/` 录入海外学生、上传图片并检查控制台与画板导出。
