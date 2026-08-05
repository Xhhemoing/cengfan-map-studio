# Graph Report - 蹭饭图  (2026-08-04)

## Corpus Check
- 252 files · ~152,513 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2045 nodes · 4305 edges · 142 communities (128 shown, 14 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b4863fd4`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- index.ts
- editor-commands.ts
- project-migration.ts
- collaboration-client.ts
- ResizeHandles.tsx
- image-color.ts
- App.tsx
- WorkflowGuide.tsx
- solveCardLayout
- destination-layout.ts
- scene-document.ts
- project-package.ts
- project-document.ts
- search-catalog.ts
- compilerOptions
- PosterCanvas.tsx
- CardSettings
- template-document.ts
- WorkflowPrototype.tsx
- fonts.ts
- DataWorkspace.tsx
- createId
- connector-geometry.ts
- MapDataLayer.tsx
- AssetPanel.tsx
- browser-workspace-store.ts
- compilerOptions
- GlobalSettingsScreen.tsx
- Student
- devDependencies
- 项目级全局数据工作台设计规格
- name-format.ts
- map-data.ts
- assets.ts
- 蹭饭地图工作室（Cengfan Map Studio）功能与使用架构
- south-china-sea.ts
- province-texture-placement.ts
- MapLayer.tsx
- layout.ts
- DeferredInput.tsx
- InspectorPanel.tsx
- buildCandidates
- dependencies
- GlobalDataScreen.tsx
- resource-pack.ts
- StudioUi.tsx
- editor-layout.ts
- map-alignment.ts
- App.test.tsx
- 蹭饭图编辑器核心修复设计（方案 B，批注版）
- card-layout.test.ts
- edge-styles.ts
- FileDropzone.tsx
- MapInspector.tsx
- heat-scale.ts
- map-content-bounds.ts
- scripts
- background-removal.ts
- DataWorkspace.test.tsx
- card-layout.ts
- RangeNumberControl.tsx
- UserFont
- card-text-layout.ts
- CardsInspector.tsx
- Material Library and Font System Implementation Plan
- 算法：Order-Preserving Radial Layout (OPRL)
- card-expression.ts
- package.json
- 执行规则
- vite-env.d.ts
- tsconfig.json
- eslint
- @eslint/js
- eslint-plugin-react-hooks
- @types/node
- @types/react
- @types/react-dom
- vite
- run-heavy.sh script
- styles.test.ts
- 流程引导 × 全局设计 深度挂钩实施计划
- 发现
- 国际去向与画板图片实施计划
- project-data.ts
- 地图标注、名单表达与协作改进计划
- AI 蹭饭图编辑器实施计划
- 文本框自动排布算法重构：实时边界 + 简洁多模式排布
- catalog-usage.ts
- AI 蹭饭图编辑器设计
- 3.1 桌面布局
- Province Appearance Implementation Plan
- 全屏全局设置实施计划
- AssetElement
- 板块样式与无交叉智能排版实施计划
- Global Constraints
- Global Constraints
- 蹭饭地图工作室前端界面设计规划 2.0
- Global Constraints
- 前端编辑器重构设计规格
- 4.1 四层信息模型
- 自动数据框排布优化设计
- 蹭饭图核心编辑器修复 QA 验收报告
- 2.2 产品必须优先支持的四条任务路径
- 5.5 素材
- 5.6 交付
- ERRORS.md
- [ERR-20260803-LOCAL-RSYNC]
- [ERR-20260802-VERIFY-TIMEOUT]
- [ERR-20260802-VITEST-CLI]
- [ERR-20260803-EDITOR-LAYOUT-TYPE]
- [ERR-20260802-PATH]
- 左右侧栏紧凑控件改造计划
- 可调侧栏与细滚动条设计
- 12. 实施顺序
- 5.1 名单
- 5.2 地图
- 5.3 版式
- 5.4 内容
- 8. 视觉系统
- [ERR-20260803-NPM-BASH]
- [ERR-20260803-VITEST-BASELINE]
- [ERR-20260803-BROWSER-QA]
- [ERR-20260803-VITEST-FULL-TIMEOUT]
- AssetInspector.test.tsx
- 自定义覆盖地图适配实现计划
- 右侧栏紧凑布局与全局姓名表达设置
- 蹭饭图项目实施与验收要求
- 10. 易用性与无障碍要求
- 11. 必须删除或合并的重复界面
- 13. 验收标准
- 6. 导航、选择与状态同步
- 7. 组件规划
- 9. AI 助手设计
- dev.mjs
- run-heavy.mjs
- .hermes.md

## God Nodes (most connected - your core abstractions)
1. `App()` - 80 edges
2. `createProjectDocument()` - 43 edges
3. `PosterCanvas()` - 31 edges
4. `createId()` - 29 edges
5. `normalizeScene()` - 28 edges
6. `migrateProjectPayload()` - 27 edges
7. `Student` - 25 edges
8. `createAiServer()` - 22 edges
9. `solveCardLayout()` - 22 edges
10. `MapSettings` - 22 edges

## Surprising Connections (you probably didn't know these)
- `DataWorkspace()` --references--> `xlsx`  [EXTRACTED]
  src/components/DataWorkspace.tsx → package.json
- `localParseData()` --calls--> `parseStudentText()`  [EXTRACTED]
  server/ai/local-fallback.ts → src/lib/import-data.ts
- `CollaborationRoom` --references--> `CollaborationOperation`  [EXTRACTED]
  server/collaboration.ts → src/lib/collaboration-operations.ts
- `RoomTransaction` --references--> `CollaborationOperation`  [EXTRACTED]
  server/collaboration.ts → src/lib/collaboration-operations.ts
- `validateHard()` --calls--> `buildConnectorGeometry()`  [EXTRACTED]
  scripts/verify-oprl-layout.ts → src/lib/connector-geometry.ts

## Import Cycles
- None detected.

## Communities (142 total, 14 thin omitted)

### Community 0 - "index.ts"
Cohesion: 0.07
Nodes (46): commandId(), localExplain(), localParseData(), localProposeEdits(), COMMAND_TYPES, EditorCommandPayload, ParseDataRequest, parseDataRequestSchema() (+38 more)

### Community 1 - "editor-commands.ts"
Cohesion: 0.13
Nodes (27): AiAssistant(), AiProposal, requestAiParseData(), requestAiProposal(), resolveEndpoint(), applyEditorCommands(), applySingleCommand(), assertSupported() (+19 more)

### Community 2 - "project-migration.ts"
Cohesion: 0.10
Nodes (40): asRecord(), assetSlug(), asString(), BUILT_IN_TEXT_IDS, CARD_GROUPINGS, CARD_PRESETS, clamp(), DATA_VIEW_IDS (+32 more)

### Community 3 - "collaboration-client.ts"
Cohesion: 0.09
Nodes (30): CollaborationRoom, Listener, RoomStore, RoomStoreOptions, RoomTransaction, CollaborationClientError, CollaborationOperationTransaction, CollaborationRoom (+22 more)

### Community 4 - "ResizeHandles.tsx"
Cohesion: 0.15
Nodes (14): CORNER_IDS, HANDLES, ResizeHandleRect, ResizeHandles(), ResizeHandlesProps, HANDLE_ANCHORS, isCorner(), Point (+6 more)

### Community 5 - "image-color.ts"
Cohesion: 0.14
Nodes (36): backgroundCandidates(), channelHex(), clamp(), ColorCluster, colorDistance(), contrastRatio(), estimateBoundaryBackground(), extractForeground() (+28 more)

### Community 6 - "App.tsx"
Cohesion: 0.09
Nodes (37): ActivePanel, App(), createInitialProject(), dataViews, loadBrowserValue(), loadInitialProject(), provinceNames, ThemeToggle() (+29 more)

### Community 7 - "WorkflowGuide.tsx"
Cohesion: 0.11
Nodes (25): GlobalSettingsSection, badgeText(), PRESENTATION_VIEWS, stepProgress(), stepSubtitle(), click(), clickBar(), renderGuide() (+17 more)

### Community 8 - "solveCardLayout"
Cohesion: 0.27
Nodes (18): clamp(), clampCardPosition(), containFree(), hitsPlaced(), hitsProtected(), isInsideCanvas(), isotonicPack(), layoutGrid() (+10 more)

### Community 9 - "destination-layout.ts"
Cohesion: 0.13
Nodes (16): CardLayoutResult, CardLayoutStatus, CardSide, layoutCards(), layoutDestinationCards(), clampDestinationCardPosition(), DestinationCardArea, DestinationCardBounds (+8 more)

### Community 10 - "scene-document.ts"
Cohesion: 0.12
Nodes (28): CanvasTextRole, CARD_FONT_FIELDS, CardLayoutModeValue, clamp(), cloneTexts(), createDefaultGuestPanel(), createDefaultScene(), DEFAULT_PROVINCE_TEXTURE_UNIFORM_SIZE (+20 more)

### Community 11 - "project-package.ts"
Cohesion: 0.11
Nodes (29): workspace(), serializeProjectDocument(), createProjectPackage(), createProjectPackageEnvelope(), downloadProjectPackage(), hydrateMissingAssetSources(), normalizeCustomTemplates(), parseProjectPackage() (+21 more)

### Community 12 - "project-document.ts"
Cohesion: 0.11
Nodes (27): BlockStylePanel(), ControlledPanel(), renderInspector(), userFont, applyTransaction(), cloneProjectForTransaction(), cloneScene(), cloneSnapshot() (+19 more)

### Community 13 - "search-catalog.ts"
Cohesion: 0.10
Nodes (25): cityOptions(), provinceOptions(), universityOptions(), SearchCombobox(), SearchComboboxOption, cityOptions(), roots, universityOptions() (+17 more)

### Community 14 - "compilerOptions"
Cohesion: 0.08
Nodes (25): DOM, DOM.Iterable, ES2022, src, compilerOptions, allowImportingTsExtensions, allowJs, allowSyntheticDefaultImports (+17 more)

### Community 15 - "PosterCanvas.tsx"
Cohesion: 0.13
Nodes (22): connectorPathToCenter(), destinationHeight(), featureCoordinatePolygons(), features, foldedMapSplit, HEAT_COLORS, mapSource, openMapSplit (+14 more)

### Community 16 - "CardSettings"
Cohesion: 0.33
Nodes (8): CardExpressionTemplates, FontUsage, LayoutStrategy, ProjectStyleState, CardSettings, CardGrouping, CardPreset, VisibleField

### Community 17 - "template-document.ts"
Cohesion: 0.09
Nodes (30): SceneDocument, BackgroundType, ConnectorStyle, MarkerStyle, ProvinceStyle, RegionalAsset, RegionalAssetMode, TemplateBackground (+22 more)

### Community 18 - "WorkflowPrototype.tsx"
Cohesion: 0.11
Nodes (12): Admin(), Analytics, formatDate(), loadAnalytics(), Visit, AreaId, areas, mapModes (+4 more)

### Community 19 - "fonts.ts"
Cohesion: 0.12
Nodes (17): FontEditor(), cardFontTargets, TypographyPanel(), BUILT_IN_FONTS, BuiltInFont, createUserFont(), detectFontFormat(), FontFaceConstructor (+9 more)

### Community 20 - "DataWorkspace.tsx"
Cohesion: 0.14
Nodes (29): DataWorkspace(), findColumnIndexes(), HEADER_ALIASES, matrixToText(), normalizeHeader(), parseExcelArrayBuffer(), parseExcelWorkbookRows(), parseOcrLikeText() (+21 more)

### Community 21 - "createId"
Cohesion: 0.15
Nodes (19): CanvasText, CanvasTextInput, createNoteElement(), createTextElement(), moveTextElement(), createId(), createProvinceThemeTransaction(), createSceneTransaction() (+11 more)

### Community 22 - "connector-geometry.ts"
Cohesion: 0.12
Nodes (28): assert(), bounds, overlaps(), validateHard(), LayoutCandidate, buildConnectorGeometry(), connectorGeometriesIntersect(), ConnectorGeometry (+20 more)

### Community 23 - "MapDataLayer.tsx"
Cohesion: 0.24
Nodes (18): edgeFilterDefs(), hasTexture(), heatColor(), isOverflowTexture(), MapDataLayer(), normalizedHeatColor(), provinceFill(), provinceFillReference() (+10 more)

### Community 24 - "AssetPanel.tsx"
Cohesion: 0.13
Nodes (24): AssetInstanceSummary, AssetPanel(), loadImageSize(), shortProvinceName(), loadImageSize(), ProvinceInspector(), createUserAsset(), listSystemAssets() (+16 more)

### Community 25 - "browser-workspace-store.ts"
Cohesion: 0.09
Nodes (19): AsyncWorkspaceStore, BrowserWorkspaceSaveResult, BrowserWorkspaceStores, createBrowserWorkspaceStores(), createIndexedDbWorkspaceStore(), createSafeLocalStorageMirror(), loadBrowserWorkspaceMirror(), loadLatestBrowserWorkspace() (+11 more)

### Community 26 - "compilerOptions"
Cohesion: 0.10
Nodes (19): ES2023, node, server/**/*.ts, src/vite-env.d.ts, vite.config.ts, compilerOptions, allowImportingTsExtensions, lib (+11 more)

### Community 27 - "GlobalSettingsScreen.tsx"
Cohesion: 0.15
Nodes (15): PosterCanvasProps, allSections, GlobalSettingsScreen(), sectionBadge(), sectionGroups, SettingsSection, SettingsSectionGroup, workflowStepDescriptions (+7 more)

### Community 28 - "Student"
Cohesion: 0.36
Nodes (9): ConfirmImportResult, Student, buildStudentRecords(), normalizeCityName(), resolveCityLocation(), StudentBuildResult, StudentInput, StudentIssue (+1 more)

### Community 29 - "devDependencies"
Cohesion: 0.11
Nodes (19): concurrently, eslint-plugin-react-refresh, globals, jsdom, devDependencies, concurrently, eslint-plugin-react-refresh, globals (+11 more)

### Community 30 - "项目级全局数据工作台设计规格"
Cohesion: 0.05
Nodes (38): 10. 无障碍与响应式, 11. 测试与验收, 12. 实施顺序, 13. 明确不做, 1. 目标, 2.1 单一工程状态, 2.2 现有能力复用, 2.3 需要解决的问题 (+30 more)

### Community 31 - "name-format.ts"
Cohesion: 0.25
Nodes (15): CardPresentationSettings(), BUILT_IN_NAME_FORMATS, COMPOUND_SURNAMES, DEFAULT_NAME_FORMAT, formatBuiltInName(), formatStudentName(), givenInitials(), initials() (+7 more)

### Community 32 - "map-data.ts"
Cohesion: 0.10
Nodes (27): MapDataLayerProps, features, renderMap(), settings(), MapLayerProps, baseMapSettings, feature, features (+19 more)

### Community 33 - "assets.ts"
Cohesion: 0.11
Nodes (20): CanvasPosition, createAssetElement(), createDecorationElement(), createLandmarkElement(), createProvinceTextureElement(), deleteAssetElement(), duplicateAssetElement(), sortAssetElementsByLayer() (+12 more)

### Community 34 - "蹭饭地图工作室（Cengfan Map Studio）功能与使用架构"
Cohesion: 0.05
Nodes (37): 1.1 当前分类的问题, 1.2 推荐一级功能架构, 1.3 默认制作路径, 1. 重组结论, 2.1 全局骨架, 2.2 两种进入方式, 2. 推荐界面规划, 3.1 名单：先保证数据正确 (+29 more)

### Community 35 - "south-china-sea.ts"
Cohesion: 0.22
Nodes (12): asPolygons(), polygonArea(), polygonMinLat(), rebuildFeature(), ringMinLat(), SOUTH_SEA_LAT_THRESHOLD, SouthChinaSeaSplit, splitFeatureForSouthChinaSea() (+4 more)

### Community 36 - "province-texture-placement.ts"
Cohesion: 0.28
Nodes (10): candidateRects(), clampRect(), overlapArea(), ProvinceTexturePlacement, ResolvedProvinceTexturePlacement, resolveProvinceTexturePlacements(), sameRect(), TexturePlacementBounds (+2 more)

### Community 37 - "MapLayer.tsx"
Cohesion: 0.20
Nodes (10): getFeatureSplit(), MapLayer(), MapLayerThemeColors, renderMapImage(), SouthSeaInset(), splitCache, StudentPin, feature (+2 more)

### Community 38 - "layout.ts"
Cohesion: 0.21
Nodes (15): cardRowsForGroup(), studentFieldParts(), buildCitySections(), buildLayoutGroups(), buildSchoolRows(), formatSchoolRow(), groupBy(), LayoutCitySection (+7 more)

### Community 39 - "DeferredInput.tsx"
Cohesion: 0.26
Nodes (8): DeferredInput(), DeferredInputProps, DeferredTextarea(), DeferredTextareaProps, AssetInspector(), numberControl(), IconButton(), InspectorHeader()

### Community 40 - "InspectorPanel.tsx"
Cohesion: 0.20
Nodes (9): CanvasInspector(), GuestsInspector(), readAvatarFile(), DEFAULT_GUESTS, GlobalSettingsSectionId, InspectorPanel(), ImmediateFileReader, TextInspector() (+1 more)

### Community 41 - "buildCandidates"
Cohesion: 0.23
Nodes (16): addRail(), boundsTouch(), buildCandidates(), compareScores(), connectorBounds(), connectorHitsCard(), connectorIntersects(), nearestRails() (+8 more)

### Community 42 - "dependencies"
Cohesion: 0.13
Nodes (15): d3-geo, lucide-react, dependencies, d3-geo, lucide-react, pinyin-pro, react, react-dom (+7 more)

### Community 43 - "GlobalDataScreen.tsx"
Cohesion: 0.13
Nodes (19): actionableIssues, DataOverview(), roots, DataQualityPanel(), issueLabels, roots, GlobalDataScreen(), GlobalDataView (+11 more)

### Community 44 - "resource-pack.ts"
Cohesion: 0.23
Nodes (14): UserAsset, projectPackageResourcePack(), createResourcePack(), downloadResourcePack(), isRecord(), mergeResourcePack(), normalizeAsset(), normalizeFont() (+6 more)

### Community 45 - "StudioUi.tsx"
Cohesion: 0.19
Nodes (15): ActionButton(), ActionGroup(), ButtonVariant, CompactButton(), ControlCluster(), NavigationItem, PanelHeader(), PanelSection() (+7 more)

### Community 46 - "editor-layout.ts"
Cohesion: 0.12
Nodes (20): clamp(), DragState, ResizablePanelDivider(), ResizablePanelDividerProps, roots, clamp(), DEFAULT_EDITOR_PANEL_LAYOUT, EDITOR_CENTER_MIN_WIDTH (+12 more)

### Community 47 - "map-alignment.ts"
Cohesion: 0.25
Nodes (12): affineFromControlPoints(), AffineMatrix, alignmentFromAxisAlignedAffine(), autoFitAlignment(), clamp01(), ControlPointPair, FitMode, MapImageAlignment (+4 more)

### Community 48 - "App.test.tsx"
Cohesion: 0.20
Nodes (8): click(), ImmediateFileReader, openDesignTool(), openGlobalData(), openGlobalSettingsSection(), openPeopleData(), openWorkflowGuide(), roots

### Community 49 - "蹭饭图编辑器核心修复设计（方案 B，批注版）"
Cohesion: 0.09
Nodes (21): 10. 错误处理, 11. 测试策略, 12. 非目标, 1. 目标, 2.1 人员模型, 2.2 属性检查器, 2.3 文本范围, 2.4 素材范围 (+13 more)

### Community 50 - "card-layout.test.ts"
Cohesion: 0.20
Nodes (10): CardLayoutBounds, CardLayoutInput, CardLayoutMode, CardPlacement, DestinationCardBounds, DestinationCardInput, DestinationCardPlacement, assertHardConstraints() (+2 more)

### Community 51 - "edge-styles.ts"
Cohesion: 0.27
Nodes (10): clampWidth(), EDGE_STYLES, EdgeStrokeSpec, EdgeStyleOption, isEdgeStyle(), normalizeEdgeStyle(), ResolvedEdgeStyle, resolveEdgeStyle() (+2 more)

### Community 52 - "FileDropzone.tsx"
Cohesion: 0.27
Nodes (7): FileDropzone(), FileDropzoneProps, getDroppedFile(), cleanups, dataTransferWith(), fireDrag(), fileMatchesAccept()

### Community 53 - "MapInspector.tsx"
Cohesion: 0.20
Nodes (11): isImageSource(), loadImageSize(), MapInspector(), baseMap, EDGE_STYLE_OPTIONS, EdgeStyle, getProvinceNames(), CANVAS_LAYER_Z (+3 more)

### Community 54 - "heat-scale.ts"
Cohesion: 0.36
Nodes (10): asHexChannel(), clampDepth(), colorChannels(), DEFAULT_HEAT_SCALE, heatColorForCount(), heatPreviewSteps(), HeatScale, interpolateHeatColor() (+2 more)

### Community 55 - "map-content-bounds.ts"
Cohesion: 0.38
Nodes (8): computeMapContentBounds(), computeMapOccupiedAreas(), ContentBounds, ContentBoundsInput, imageContentBounds(), mapLocalBoundsToCanvas(), southSeaInsetBounds(), union()

### Community 56 - "scripts"
Cohesion: 0.20
Nodes (10): scripts, build, dev, dev:ai, dev:web, lint, preview, start (+2 more)

### Community 57 - "background-removal.ts"
Cohesion: 0.29
Nodes (7): colorDistance(), loadImage(), removeBackground(), RemoveBackgroundOptions, Rgb, sampleCorners(), MockImage

### Community 58 - "DataWorkspace.test.tsx"
Cohesion: 0.22
Nodes (3): roots, students, ParseDataResult

### Community 59 - "card-layout.ts"
Cohesion: 0.12
Nodes (30): angularOrder(), autoSplitX(), bandRatio(), CardArea, CardLayoutOptions, centerOf(), classifyQuadrant(), classifyRadial() (+22 more)

### Community 60 - "RangeNumberControl.tsx"
Cohesion: 0.08
Nodes (7): ImmediateFileReader, ImmediateImage, SizedImage, ImmediateFileReader, ImmediateImage, SizedImage, RangeNumberControl()

### Community 61 - "UserFont"
Cohesion: 0.43
Nodes (6): anchorFor(), text, TextLayer(), TextLayerProps, UserFont, CanvasText

### Community 62 - "card-text-layout.ts"
Cohesion: 0.24
Nodes (10): CardDisplayRow, PreparedCardRow, appendFragment(), CardTextFragment, CardTextLine, characterWidth(), fragmentWidth(), wrapCardText() (+2 more)

### Community 63 - "CardsInspector.tsx"
Cohesion: 0.33
Nodes (4): CardsInspector(), fields, fontFields, DEFAULT_FONT_ID

### Community 64 - "Material Library and Font System Implementation Plan"
Cohesion: 0.10
Nodes (20): Architecture Decisions, Asset Management, Client-side (simple chroma key), Dependencies, Font Management, Goal, Implementation Order, Live Preview (+12 more)

### Community 65 - "算法：Order-Preserving Radial Layout (OPRL)"
Cohesion: 0.10
Nodes (19): API（保持兼容）, Phase 0 — 输入规范化, Phase 1 — 锚点簇（同省/同城亲和）, Phase 2 — 角序环, Phase 3 — 侧轨分配（保序）, Phase 4 — 有序 1D 首选打包, Phase 5 — 径向内拉 + 留白利用, Phase 6 — 连接线几何校验与局部修复 (+11 more)

### Community 66 - "card-expression.ts"
Cohesion: 0.48
Nodes (5): CardExpressionValues, DEFAULT_CARD_EXPRESSION_TEMPLATES, formatCardExpression(), normalizeCardExpressionTemplates(), SUPPORTED_PLACEHOLDERS

### Community 67 - "package.json"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 68 - "执行规则"
Cohesion: 0.11
Nodes (18): Task 10: 重构素材库与画布素材实例, Task 11: 渲染省份纹理、地域地标和普通装饰, Task 12: 实现素材属性检查器和直接操作, Task 13: 适配 AI 命令、模板保存与导出, Task 14: 全链路浏览器验收与无障碍修整, Task 15: 两阶段代码审查与分支收尾, Task 1: 精简人员正式模型与可见性语义, Task 2: 建立城市与院校本地搜索目录 (+10 more)

### Community 82 - "流程引导 × 全局设计 深度挂钩实施计划"
Cohesion: 0.11
Nodes (18): 1. 全局设置分区分组（「其他的界面再单独分类」）, 2. 引导 ↔ 分区 双向挂钩（「尽可能挂钩」）, 3. 响应式与无障碍, 全局设置（GlobalSettingsScreen）, 切片 1：全局设置分区分组, 切片 2：引导步骤 ↔ 分区 双向联动, 切片 3：引导「全局布局」步骤分区子项联动, 切片 4：模板区块进入全局设置 (+10 more)

### Community 83 - "发现"
Cohesion: 0.11
Nodes (17): Cengfan Map Studio 全量代码审查, P1-1 开发代理端口与 API 实际监听端口不一致, P1-2 IndexedDB 持久化写入了，但应用启动从未读取它, P1-3 localStorage 访问未统一兜底，存储受限时可能直接阻止编辑器启动, P2-1 将已有学生从“海外”切回“中国”不会清除 locationScope, P2-2 合法 JSON 的 null/数组请求会返回 500，而不是 4xx 校验错误, P2-3 图片 OCR 入口仍是占位实现，上传图片不会产生 OCR 结果, P2-4 大名单布局的候选评估包含高阶计算，可能阻塞主线程 (+9 more)

### Community 84 - "国际去向与画板图片实施计划"
Cohesion: 0.11
Nodes (16): 决策, 可选的一次性抠图, 国际去向与画板图片设计, 地图与卡片分流, 已批准范围, 统一学生模型, 通用图片素材, 非目标 (+8 more)

### Community 85 - "project-data.ts"
Cohesion: 0.20
Nodes (12): students, DataPresentationPanel(), roots, CustomTemplateOption, TemplateOption, TemplatePicker(), PRESENTATION_VIEWS, DataViewId (+4 more)

### Community 86 - "地图标注、名单表达与协作改进计划"
Cohesion: 0.13
Nodes (14): 任务 1：贴图透明度与比例输入, 任务 2：删除无效内置地标和装饰, 任务 3：标签定位与数据星标, 任务 4：省份方框内按城市分节, 任务 5：通用表达模板, 任务 6：完整工程包导入导出, 任务 7：共享编辑房间, 地图标注、名单表达与协作改进计划 (+6 more)

### Community 87 - "AI 蹭饭图编辑器实施计划"
Cohesion: 0.14
Nodes (13): AI 蹭饭图编辑器实施计划, Task 10: AI 对话、逐条预览和部分应用 UI, Task 11: 撤销、重做和历史面板, Task 12: 模板保存、导出和端到端验证, Task 1: 项目文档与事务历史基础, Task 2: 白名单编辑命令与预览执行器, Task 3: 三字段数据校验与城市派生定位, Task 4: 文本、CSV 与 Excel 导入候选 (+5 more)

### Community 88 - "文本框自动排布算法重构：实时边界 + 简洁多模式排布"
Cohesion: 0.14
Nodes (13): API（兼容 + 扩展）, UI, 任务分解（TDD）, 修复, 多种排布方式（`mode` 选项）, 文本框自动排布算法重构：实时边界 + 简洁多模式排布, 新算法 `src/lib/card-layout.ts`（替换 destination-layout 排布主路径）, 测试 (+5 more)

### Community 89 - "catalog-usage.ts"
Cohesion: 0.27
Nodes (12): appearanceUsesAsset(), applyDataViewChange(), AssetUsage, findAssetUsage(), findFontUsage(), isAssetInUse(), isFontInUse(), removeUserAsset() (+4 more)

### Community 90 - "AI 蹭饭图编辑器设计"
Cohesion: 0.18
Nodes (10): AI 后端最小边界, AI 命令与预览, AI 蹭饭图编辑器设计, 已确认约束, 数据闭环, 架构, 模板与图层, 目标 (+2 more)

### Community 91 - "3.1 桌面布局"
Cohesion: 0.18
Nodes (11): 3.1 桌面布局, 3.2 响应式策略, 3. 整体界面骨架, 中央画布始终是主角, 中屏：`768–1279px`, 右侧只编辑当前对象, 大屏：`≥ 1280px`, 小屏：`< 768px` (+3 more)

### Community 92 - "Province Appearance Implementation Plan"
Cohesion: 0.20
Nodes (9): Decisions, Dependencies, Goal, Province Appearance Implementation Plan, Task 1: Model, migration, and renderer contracts, Task 2: Map rendering and canvas background integration, Task 3: Province-first materials workflow, Task 4: Default regional feature catalog coverage (+1 more)

### Community 93 - "全屏全局设置实施计划"
Cohesion: 0.20
Nodes (9): 1. 全屏模式壳层, 2. 迁移项目级控件, 3. 全屏布局与响应式, 4. 验证与审查, 全屏全局设置实施计划, 实施切片, 已批准交互, 目标 (+1 more)

### Community 94 - "AssetElement"
Cohesion: 0.29
Nodes (6): AssetPreview, byZIndex(), DecorationLayer(), DecorationLayerProps, asset, AssetElement

### Community 95 - "板块样式与无交叉智能排版实施计划"
Cohesion: 0.22
Nodes (8): 任务 1：修复板块样式状态事务, 任务 2：建立共享连接线几何, 任务 3：替换为确定性约束布局, 任务 4：画布、拖拽和样式联动, 任务 5：验证, 保证边界, 板块样式与无交叉智能排版实施计划, 目标

### Community 96 - "Global Constraints"
Cohesion: 0.22
Nodes (8): Frontend Editor Rebuild Implementation Plan, Global Constraints, Implementation Notes, Task 1: Theme Preference Contract, Task 2: Theme Hook and Single-Row Shell, Task 3: Canvas Interaction Overlay, Task 4: Workflow and Project Management Migration, Task 5: Responsive and Performance Verification

### Community 97 - "Global Constraints"
Cohesion: 0.22
Nodes (8): Global Constraints, Global Data Workbench Implementation Plan, Task 1: Add data-health selectors, Task 2: Add overview, quality, and presentation panels, Task 3: Add the full-screen global data workbench shell, Task 4: Wire the workbench into App and unify entry points, Task 5: Complete responsive styling and visual verification, Task 6: Run full verification and review the branch

### Community 98 - "蹭饭地图工作室前端界面设计规划 2.0"
Cohesion: 0.22
Nodes (8): 14. 明确不做, 15. 最终体验定义, 1.1 核心判断, 1.2 最终结构, 1.3 三维设计准则, 1. 设计结论, 5. 六个工作区的首屏规划, 蹭饭地图工作室前端界面设计规划 2.0

### Community 99 - "Global Constraints"
Cohesion: 0.25
Nodes (7): Global Constraints, Resizable Sidebar Scrollbars Implementation Plan, Task 1: Layout constraints and persistence, Task 2: Accessible resize separator, Task 3: Integrate both separators into the editor shell, Task 4: Style the layout, scrollbars, and responsive states, Task 5: Verification

### Community 100 - "前端编辑器重构设计规格"
Cohesion: 0.25
Nodes (7): 主题系统, 前端编辑器重构设计规格, 工作区迁移, 画布架构, 界面结构, 目标, 验收标准

### Community 101 - "4.1 四层信息模型"
Cohesion: 0.25
Nodes (8): 4.1 四层信息模型, 4.2 控件唯一归属, 4.3 设置生效规则, 4. 信息层级与显隐规则, L0：始终可见, L1：当前工作区直接操作, L2：选中对象属性, L3：高级/低频能力

### Community 102 - "自动数据框排布优化设计"
Cohesion: 0.29
Nodes (6): 兼容性, 目标, 算法, 约束优先级, 自动数据框排布优化设计, 验证

### Community 103 - "蹭饭图核心编辑器修复 QA 验收报告"
Cohesion: 0.29
Nodes (6): 1. 环境验证, 2. 自动化测试覆盖, 3. 浏览器验收矩阵（当前受限）, 4. 已知限制, 5. 最终门禁, 蹭饭图核心编辑器修复 QA 验收报告

### Community 104 - "2.2 产品必须优先支持的四条任务路径"
Cohesion: 0.29
Nodes (7): 2.1 主要用户, 2.2 产品必须优先支持的四条任务路径, 2. 用户与任务模型, 路径 A：第一次制作, 路径 B：快速改名单, 路径 C：美化某个省份, 路径 D：调整局部排版

### Community 105 - "5.5 素材"
Cohesion: 0.29
Nodes (7): 5.5 素材, 一级分类, 完成条件, 素材网格规则, 素材详情, 顶部上下文条, 首屏目标

### Community 106 - "5.6 交付"
Cohesion: 0.29
Nodes (7): 5.6 交付, 交付健康度, 保存和继续编辑, 协作与迁移, 导出完成状态, 首屏目标, 默认导出

### Community 107 - "ERRORS.md"
Cohesion: 0.29
Nodes (6): Context, [ERR-20260802-NPM], Error, Metadata, Suggested Fix, Summary

### Community 108 - "[ERR-20260803-LOCAL-RSYNC]"
Cohesion: 0.29
Nodes (7): Context, [ERR-20260803-LOCAL-RSYNC], Error, Metadata, Resolution, Suggested Fix, Summary

### Community 109 - "[ERR-20260802-VERIFY-TIMEOUT]"
Cohesion: 0.29
Nodes (7): Context, [ERR-20260802-VERIFY-TIMEOUT], Error, Metadata, Resolution, Suggested Fix, Summary

### Community 110 - "[ERR-20260802-VITEST-CLI]"
Cohesion: 0.29
Nodes (7): Context, [ERR-20260802-VITEST-CLI], Error, Metadata, Resolution, Suggested Fix, Summary

### Community 111 - "[ERR-20260803-EDITOR-LAYOUT-TYPE]"
Cohesion: 0.29
Nodes (7): Context, [ERR-20260803-EDITOR-LAYOUT-TYPE], Error, Metadata, Resolution, Suggested Fix, Summary

### Community 112 - "[ERR-20260802-PATH]"
Cohesion: 0.29
Nodes (7): Context, [ERR-20260802-PATH], Error, Metadata, Resolution, Suggested Fix, Summary

### Community 113 - "左右侧栏紧凑控件改造计划"
Cohesion: 0.33
Nodes (5): 实施顺序, 左右侧栏紧凑控件改造计划, 目标, 约束, 范围

### Community 114 - "可调侧栏与细滚动条设计"
Cohesion: 0.33
Nodes (5): 可调侧栏与细滚动条设计, 实现边界, 已确认方案, 目标, 验收标准

### Community 115 - "12. 实施顺序"
Cohesion: 0.33
Nodes (6): 12. 实施顺序, 阶段 1：统一壳层与导航, 阶段 2：名单、地图、交付三个关键闭环, 阶段 3：版式与上下文检查器, 阶段 4：内容和素材直达, 阶段 5：响应式、无障碍和性能

### Community 116 - "5.1 名单"
Cohesion: 0.33
Nodes (6): 5.1 名单, 全屏名单工作台, 完成条件, 已有数据状态, 空工程状态, 首屏目标

### Community 117 - "5.2 地图"
Cohesion: 0.33
Nodes (6): 5.2 地图, 完成条件, 省份上下文, 表达方式, 首屏目标, 首屏直接设置

### Community 118 - "5.3 版式"
Cohesion: 0.33
Nodes (6): 5.3 版式, 不在左栏直接展示, 完成条件, 画布直接操作, 首屏目标, 首屏结构

### Community 119 - "5.4 内容"
Cohesion: 0.33
Nodes (6): 5.4 内容, AI 的归属, 内容大纲, 内容预设, 完成条件, 首屏目标

### Community 120 - "8. 视觉系统"
Cohesion: 0.33
Nodes (6): 8.1 设计方向, 8.2 色彩角色, 8.3 排版, 8.4 尺寸与形态, 8.5 图标与文案, 8. 视觉系统

### Community 121 - "[ERR-20260803-NPM-BASH]"
Cohesion: 0.33
Nodes (6): Context, [ERR-20260803-NPM-BASH], Error, Metadata, Suggested Fix, Summary

### Community 122 - "[ERR-20260803-VITEST-BASELINE]"
Cohesion: 0.33
Nodes (6): Context, [ERR-20260803-VITEST-BASELINE], Error, Metadata, Suggested Fix, Summary

### Community 123 - "[ERR-20260803-BROWSER-QA]"
Cohesion: 0.33
Nodes (6): Context, [ERR-20260803-BROWSER-QA], Error, Metadata, Suggested Fix, Summary

### Community 124 - "[ERR-20260803-VITEST-FULL-TIMEOUT]"
Cohesion: 0.33
Nodes (6): Context, [ERR-20260803-VITEST-FULL-TIMEOUT], Error, Metadata, Suggested Fix, Summary

### Community 125 - "AssetInspector.test.tsx"
Cohesion: 0.33
Nodes (4): decoration, landmark, roots, texture

### Community 126 - "自定义覆盖地图适配实现计划"
Cohesion: 0.40
Nodes (4): 任务, 决策, 自定义覆盖地图适配实现计划, 验收

### Community 127 - "右侧栏紧凑布局与全局姓名表达设置"
Cohesion: 0.40
Nodes (4): 右侧栏紧凑布局与全局姓名表达设置, 实现边界, 目标, 验收

### Community 128 - "蹭饭图项目实施与验收要求"
Cohesion: 0.40
Nodes (4): 产品目标, 实施原则, 当前板块排版验收标准, 蹭饭图项目实施与验收要求

### Community 129 - "10. 易用性与无障碍要求"
Cohesion: 0.40
Nodes (5): 10.1 键盘, 10.2 焦点, 10.3 状态与反馈, 10.4 可读性, 10. 易用性与无障碍要求

### Community 130 - "11. 必须删除或合并的重复界面"
Cohesion: 0.40
Nodes (5): 11.1 不再保留独立“全局设置”中心, 11.2 不再保留独立 AI 页面, 11.3 不重复提供所有导出入口, 11.4 不把属性表单复制进左栏, 11. 必须删除或合并的重复界面

### Community 131 - "13. 验收标准"
Cohesion: 0.40
Nodes (5): 13.1 使用流程, 13.2 界面整洁, 13.3 简单易上手, 13.4 技术质量, 13. 验收标准

### Community 132 - "6. 导航、选择与状态同步"
Cohesion: 0.50
Nodes (4): 6.1 工作区切换, 6.2 画布选择驱动界面, 6.3 步骤状态, 6. 导航、选择与状态同步

### Community 133 - "7. 组件规划"
Cohesion: 0.50
Nodes (4): 7.1 页面组件树, 7.2 工作区组件, 7.3 复用边界, 7. 组件规划

### Community 134 - "9. AI 助手设计"
Cohesion: 0.50
Nodes (4): 9.1 定位, 9.2 入口, 9.3 交互流程, 9. AI 助手设计

## Knowledge Gaps
- **733 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+728 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DataWorkspace()` connect `DataWorkspace.tsx` to `layout.ts`, `App.tsx`, `dependencies`, `GlobalDataScreen.tsx`, `DataWorkspace.test.tsx`, `GlobalSettingsScreen.tsx`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `xlsx` connect `dependencies` to `DataWorkspace.tsx`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `package.json`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _733 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06662770309760374 - nodes in this community are weakly interconnected._
- **Should `editor-commands.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12701612903225806 - nodes in this community are weakly interconnected._
- **Should `project-migration.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10465116279069768 - nodes in this community are weakly interconnected._