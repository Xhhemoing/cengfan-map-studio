# Graph Report - .  (2026-08-02)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1399 nodes · 3521 edges · 82 communities (71 shown, 11 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a89931aa`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79

## God Nodes (most connected - your core abstractions)
1. `App()` - 71 edges
2. `createProjectDocument()` - 40 edges
3. `PosterCanvas()` - 31 edges
4. `createId()` - 29 edges
5. `normalizeScene()` - 28 edges
6. `migrateProjectPayload()` - 27 edges
7. `Student` - 23 edges
8. `solveCardLayout()` - 22 edges
9. `MapSettings` - 22 edges
10. `createAiServer()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `DataWorkspace()` --references--> `xlsx`  [EXTRACTED]
  src/components/DataWorkspace.tsx → package.json
- `validateHard()` --calls--> `buildConnectorGeometry()`  [EXTRACTED]
  scripts/verify-oprl-layout.ts → src/lib/connector-geometry.ts
- `validateHard()` --calls--> `connectorGeometriesIntersect()`  [EXTRACTED]
  scripts/verify-oprl-layout.ts → src/lib/connector-geometry.ts
- `localParseData()` --calls--> `parseStudentText()`  [EXTRACTED]
  server/ai/local-fallback.ts → src/lib/import-data.ts
- `CollaborationRoom` --references--> `CollaborationOperation`  [EXTRACTED]
  server/collaboration.ts → src/lib/collaboration-operations.ts

## Import Cycles
- None detected.

## Communities (82 total, 11 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (41): commandId(), localExplain(), localParseData(), localProposeEdits(), COMMAND_TYPES, EditorCommandPayload, ParseDataRequest, parseDataRequestSchema() (+33 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (40): AiAssistant(), AiProposal, requestAiParseData(), requestAiProposal(), resolveEndpoint(), appearanceUsesAsset(), applyDataViewChange(), AssetUsage (+32 more)

### Community 2 - "Community 2"
Cohesion: 0.10
Nodes (43): restoreSnapshot(), asRecord(), assetSlug(), asString(), BUILT_IN_TEXT_IDS, CARD_GROUPINGS, CARD_PRESETS, clamp() (+35 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (32): CollaborationError, CollaborationRoom, createRoomStore(), Listener, RoomStore, RoomStoreOptions, RoomTransaction, CollaborationClientError (+24 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (30): AssetPreview, byZIndex(), DecorationLayer(), DecorationLayerProps, asset, CORNER_IDS, HANDLES, ResizeHandleRect (+22 more)

### Community 5 - "Community 5"
Cohesion: 0.14
Nodes (37): backgroundCandidates(), channelHex(), clamp(), ColorCluster, colorDistance(), contrastRatio(), estimateBoundaryBackground(), extractForeground() (+29 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (28): ActivePanel, App(), dataViews, provinceNames, ThemeToggle(), loadUserAssets(), subscribeRoom(), canvasToPngDataUrl() (+20 more)

### Community 7 - "Community 7"
Cohesion: 0.09
Nodes (28): GlobalSettingsSection, CustomTemplateOption, TemplateOption, TemplatePicker(), badgeText(), PRESENTATION_VIEWS, stepProgress(), stepSubtitle() (+20 more)

### Community 8 - "Community 8"
Cohesion: 0.15
Nodes (34): angularOrder(), autoSplitX(), bandRatio(), centerOf(), clamp(), clampCardPosition(), classifyQuadrant(), classifyRadial() (+26 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (28): assert(), bounds, overlaps(), validateHard(), CardArea, CardLayoutOptions, CardLayoutResult, CardLayoutStatus (+20 more)

### Community 10 - "Community 10"
Cohesion: 0.14
Nodes (28): normalizeCardExpressionTemplates(), CARD_FONT_FIELDS, CardLayoutModeValue, clamp(), cloneTexts(), createDefaultGuestPanel(), createDefaultScene(), DEFAULT_PROVINCE_TEXTURE_UNIFORM_SIZE (+20 more)

### Community 11 - "Community 11"
Cohesion: 0.13
Nodes (24): createProjectPackageEnvelope(), downloadProjectPackage(), hydrateMissingAssetSources(), normalizeCustomTemplates(), parseProjectPackage(), PROJECT_PACKAGE_VERSION, ProjectPackageInput, projectWithoutHistory() (+16 more)

### Community 12 - "Community 12"
Cohesion: 0.15
Nodes (24): loadInitialProject(), packageAt(), workspace(), applyTransaction(), cloneProjectForTransaction(), cloneScene(), cloneSnapshot(), cloneStyle() (+16 more)

### Community 13 - "Community 13"
Cohesion: 0.13
Nodes (22): provinceOptions(), chinaCities, CityCatalogEntry, cityRows, chinaUniversities, UniversityCatalogEntry, CHINA_PROVINCE_ADJACENCY, getProvinceNames() (+14 more)

### Community 14 - "Community 14"
Cohesion: 0.08
Nodes (25): DOM, DOM.Iterable, ES2022, src, compilerOptions, allowImportingTsExtensions, allowJs, allowSyntheticDefaultImports (+17 more)

### Community 15 - "Community 15"
Cohesion: 0.12
Nodes (23): CardDisplayRow, connectorPathToCenter(), destinationHeight(), featureCoordinatePolygons(), features, foldedMapSplit, HEAT_COLORS, mapSource (+15 more)

### Community 16 - "Community 16"
Cohesion: 0.11
Nodes (23): CardExpressionTemplates, FontUsage, EdgeStyle, LayoutStrategy, ProjectStyleState, CardSettings, BackgroundType, CardGrouping (+15 more)

### Community 17 - "Community 17"
Cohesion: 0.18
Nodes (19): createSystemTemplate(), mergeTemplateDocuments(), TemplateDocument, applyCustomTemplateToProject(), createCustomTemplateFromProject(), CustomTemplateRecord, isFiniteNumber(), isMapTemplateId() (+11 more)

### Community 18 - "Community 18"
Cohesion: 0.11
Nodes (12): Admin(), Analytics, formatDate(), loadAnalytics(), Visit, AreaId, areas, mapModes (+4 more)

### Community 19 - "Community 19"
Cohesion: 0.13
Nodes (13): FontEditor(), BUILT_IN_FONTS, BuiltInFont, FontFaceConstructor, FontFormat, FontSet, FORMAT_BY_EXTENSION, listFonts() (+5 more)

### Community 20 - "Community 20"
Cohesion: 0.19
Nodes (19): findColumnIndexes(), HEADER_ALIASES, matrixToText(), normalizeHeader(), parseExcelArrayBuffer(), parseExcelWorkbookRows(), parseOcrLikeText(), StudentColumn (+11 more)

### Community 21 - "Community 21"
Cohesion: 0.17
Nodes (17): CanvasText, CanvasTextInput, createNoteElement(), createTextElement(), moveTextElement(), createId(), createProvinceThemeTransaction(), createSceneTransaction() (+9 more)

### Community 22 - "Community 22"
Cohesion: 0.16
Nodes (21): LayoutCandidate, buildConnectorGeometry(), connectorGeometriesIntersect(), ConnectorGeometry, ConnectorPort, ConnectorSegment, ConnectorSide, cubicPoint() (+13 more)

### Community 23 - "Community 23"
Cohesion: 0.21
Nodes (19): edgeFilterDefs(), hasTexture(), heatColor(), isOverflowTexture(), MapDataLayer(), normalizedHeatColor(), provinceFill(), provinceFillReference() (+11 more)

### Community 24 - "Community 24"
Cohesion: 0.21
Nodes (15): loadImageSize(), ProvinceInspector(), clampTextureOpacity(), clampTextureScale(), createTextureAppearance(), DEFAULT_TEXTURE_SCALE, MAX_TEXTURE_SCALE, MIN_TEXTURE_SCALE (+7 more)

### Community 25 - "Community 25"
Cohesion: 0.15
Nodes (12): AsyncWorkspaceStore, BrowserWorkspaceSaveResult, BrowserWorkspaceStores, createBrowserWorkspaceStores(), createIndexedDbWorkspaceStore(), createLocalStorageMirror(), loadBrowserWorkspaceMirror(), loadLatestBrowserWorkspace() (+4 more)

### Community 26 - "Community 26"
Cohesion: 0.10
Nodes (19): ES2023, node, server/**/*.ts, src/vite-env.d.ts, vite.config.ts, compilerOptions, allowImportingTsExtensions, lib (+11 more)

### Community 27 - "Community 27"
Cohesion: 0.14
Nodes (18): MapLayerProps, PosterCanvasProps, allSections, GlobalSettingsScreen(), sectionBadge(), sectionGroups, SettingsSection, SettingsSectionGroup (+10 more)

### Community 28 - "Community 28"
Cohesion: 0.22
Nodes (15): students, buildProvinceSummary(), getVisibleStudents(), ProvinceSummary, sampleStudents, Student, students, resolveCity() (+7 more)

### Community 29 - "Community 29"
Cohesion: 0.11
Nodes (19): concurrently, eslint-plugin-react-refresh, globals, jsdom, devDependencies, concurrently, eslint-plugin-react-refresh, globals (+11 more)

### Community 30 - "Community 30"
Cohesion: 0.17
Nodes (10): cityOptions(), universityOptions(), SearchCombobox(), SearchComboboxOption, cityOptions(), roots, universityOptions(), ImportReviewRow (+2 more)

### Community 31 - "Community 31"
Cohesion: 0.25
Nodes (15): CardPresentationSettings(), BUILT_IN_NAME_FORMATS, COMPOUND_SURNAMES, DEFAULT_NAME_FORMAT, formatBuiltInName(), formatStudentName(), givenInitials(), initials() (+7 more)

### Community 32 - "Community 32"
Cohesion: 0.16
Nodes (13): AssetPreview, byZIndex(), RegionalAssetLayer(), RegionalAssetLayerProps, svgId(), features, landmark, settings (+5 more)

### Community 33 - "Community 33"
Cohesion: 0.15
Nodes (12): ADDITIONAL_PROVINCE_FEATURES, AssetKind, CACHED_SYSTEM_ASSETS, createUserAsset(), listSystemAssets(), saveUserAssets(), StorageAdapter, StoredAssetKind (+4 more)

### Community 34 - "Community 34"
Cohesion: 0.18
Nodes (8): INITIAL_STATE, LocalOverwriteStatus, LocalWorkspaceOverwrite, LocalWorkspaceOverwriteOptions, LocalWorkspaceOverwriteState, ProjectPackage, RenderSettings, WorkspaceSnapshot

### Community 35 - "Community 35"
Cohesion: 0.20
Nodes (14): MapFeature, Position, asPolygons(), polygonArea(), polygonMinLat(), rebuildFeature(), ringMinLat(), SOUTH_SEA_LAT_THRESHOLD (+6 more)

### Community 36 - "Community 36"
Cohesion: 0.23
Nodes (11): MapDataLayerProps, candidateRects(), clampRect(), overlapArea(), ProvinceTexturePlacement, ResolvedProvinceTexturePlacement, resolveProvinceTexturePlacements(), sameRect() (+3 more)

### Community 37 - "Community 37"
Cohesion: 0.17
Nodes (11): getFeatureSplit(), MapLayer(), MapLayerThemeColors, renderMapImage(), SouthSeaInset(), splitCache, StudentPin, baseMapSettings (+3 more)

### Community 38 - "Community 38"
Cohesion: 0.22
Nodes (14): cardRowsForGroup(), studentFieldParts(), buildCitySections(), buildLayoutGroups(), buildSchoolRows(), formatSchoolRow(), groupBy(), LayoutCitySection (+6 more)

### Community 39 - "Community 39"
Cohesion: 0.20
Nodes (9): DeferredInput(), DeferredInputProps, DeferredTextarea(), DeferredTextareaProps, GuestsInspector(), readAvatarFile(), renderInspector(), TextInspector() (+1 more)

### Community 40 - "Community 40"
Cohesion: 0.16
Nodes (10): AssetInspector(), numberControl(), decoration, landmark, roots, texture, DEFAULT_GUESTS, GlobalSettingsSectionId (+2 more)

### Community 41 - "Community 41"
Cohesion: 0.23
Nodes (16): addRail(), boundsTouch(), buildCandidates(), compareScores(), connectorBounds(), connectorHitsCard(), connectorIntersects(), nearestRails() (+8 more)

### Community 42 - "Community 42"
Cohesion: 0.13
Nodes (15): d3-geo, lucide-react, dependencies, d3-geo, lucide-react, pinyin-pro, react, react-dom (+7 more)

### Community 43 - "Community 43"
Cohesion: 0.21
Nodes (7): AssetInstanceSummary, AssetPanel(), loadImageSize(), shortProvinceName(), RangeNumberControl(), extractImageColor(), ProvinceTextureUniformSize

### Community 44 - "Community 44"
Cohesion: 0.25
Nodes (13): projectPackageResourcePack(), createResourcePack(), downloadResourcePack(), isRecord(), mergeResourcePack(), normalizeAsset(), normalizeFont(), ParsedResourcePack (+5 more)

### Community 45 - "Community 45"
Cohesion: 0.25
Nodes (10): BlockStylePanel(), ControlledPanel(), ActionButton(), ControlCluster(), NavigationItem, PanelHeader(), PanelSection(), SegmentedNav() (+2 more)

### Community 46 - "Community 46"
Cohesion: 0.22
Nodes (9): cardFontTargets, userFont, TypographyPanel(), createUserFont(), detectFontFormat(), CardFontField, applyTypographyFont(), optionalFontId() (+1 more)

### Community 47 - "Community 47"
Cohesion: 0.25
Nodes (12): affineFromControlPoints(), AffineMatrix, alignmentFromAxisAlignedAffine(), autoFitAlignment(), clamp01(), ControlPointPair, FitMode, MapImageAlignment (+4 more)

### Community 48 - "Community 48"
Cohesion: 0.21
Nodes (7): click(), ImmediateFileReader, openDesignTool(), openGlobalSettingsSection(), openPeopleData(), openWorkflowGuide(), roots

### Community 49 - "Community 49"
Cohesion: 0.28
Nodes (11): DataWorkspace(), confirmImportCandidates(), ConfirmImportResult, createEmptyStudentDraft(), removeStudent(), StudentDraft, students, toggleStudentVisibility() (+3 more)

### Community 50 - "Community 50"
Cohesion: 0.20
Nodes (10): CardLayoutBounds, CardLayoutInput, CardLayoutMode, CardPlacement, DestinationCardBounds, DestinationCardInput, DestinationCardPlacement, assertHardConstraints() (+2 more)

### Community 51 - "Community 51"
Cohesion: 0.27
Nodes (10): clampWidth(), EDGE_STYLES, EdgeStrokeSpec, EdgeStyleOption, isEdgeStyle(), normalizeEdgeStyle(), ResolvedEdgeStyle, resolveEdgeStyle() (+2 more)

### Community 52 - "Community 52"
Cohesion: 0.27
Nodes (7): FileDropzone(), FileDropzoneProps, getDroppedFile(), cleanups, dataTransferWith(), fireDrag(), fileMatchesAccept()

### Community 53 - "Community 53"
Cohesion: 0.25
Nodes (8): isImageSource(), loadImageSize(), MapInspector(), baseMap, EDGE_STYLE_OPTIONS, CANVAS_LAYER_Z, CANVAS_LAYER_Z_RANGE, MapImageAlignment

### Community 54 - "Community 54"
Cohesion: 0.42
Nodes (9): asHexChannel(), clampDepth(), colorChannels(), DEFAULT_HEAT_SCALE, heatColorForCount(), heatPreviewSteps(), interpolateHeatColor(), normalizeColor() (+1 more)

### Community 55 - "Community 55"
Cohesion: 0.40
Nodes (8): computeMapContentBounds(), computeMapOccupiedAreas(), ContentBounds, imageContentBounds(), mapLocalBoundsToCanvas(), southSeaInsetBounds(), union(), defaultSouthSeaInsetFrame()

### Community 56 - "Community 56"
Cohesion: 0.20
Nodes (10): scripts, build, dev, dev:ai, dev:web, lint, preview, start (+2 more)

### Community 57 - "Community 57"
Cohesion: 0.29
Nodes (7): colorDistance(), loadImage(), removeBackground(), RemoveBackgroundOptions, Rgb, sampleCorners(), MockImage

### Community 58 - "Community 58"
Cohesion: 0.22
Nodes (3): roots, students, ParseDataResult

### Community 59 - "Community 59"
Cohesion: 0.36
Nodes (9): connectorMapIntersections(), orientation(), pointInPolygon(), pointInRing(), pointOnSegment(), polygonBounds(), rectangleIntersectsPolygon(), segmentIntersectsPolygon() (+1 more)

### Community 60 - "Community 60"
Cohesion: 0.25
Nodes (3): ImmediateFileReader, ImmediateImage, SizedImage

### Community 61 - "Community 61"
Cohesion: 0.43
Nodes (6): anchorFor(), text, TextLayer(), TextLayerProps, UserFont, CanvasText

### Community 62 - "Community 62"
Cohesion: 0.43
Nodes (6): appendFragment(), CardTextFragment, characterWidth(), fragmentWidth(), wrapCardText(), WrapCardTextOptions

### Community 63 - "Community 63"
Cohesion: 0.33
Nodes (4): CardsInspector(), fields, fontFields, DEFAULT_FONT_ID

### Community 64 - "Community 64"
Cohesion: 0.29
Nodes (3): ImmediateFileReader, ImmediateImage, SizedImage

### Community 65 - "Community 65"
Cohesion: 0.57
Nodes (5): clampGridSize(), DEFAULT_GRID_SIZE, fitZoomPercent(), snapPoint(), snapToGrid()

### Community 66 - "Community 66"
Cohesion: 0.53
Nodes (4): CardExpressionValues, DEFAULT_CARD_EXPRESSION_TEMPLATES, formatCardExpression(), SUPPORTED_PLACEHOLDERS

### Community 67 - "Community 67"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 68 - "Community 68"
Cohesion: 0.67
Nodes (3): features, renderMap(), settings()

## Knowledge Gaps
- **291 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+286 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DataWorkspace()` connect `Community 49` to `Community 6`, `Community 42`, `Community 20`, `Community 58`, `Community 27`, `Community 28`, `Community 30`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Why does `xlsx` connect `Community 42` to `Community 49`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Community 42` to `Community 67`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _291 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08603145235892692 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.0966183574879227 - nodes in this community are weakly interconnected._