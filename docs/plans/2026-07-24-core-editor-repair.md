# 蹭饭图编辑器核心修复实施计划

> **For implementer:** Use TDD throughout. Write failing test first. Watch it fail. Then implement. Do not implement later tasks early.

**Goal:** 将人员数据收敛为 `id/name/university/city/visibility`，提供院校和城市自动匹配，并把画布、地图、卡片、全部文本和地域素材接入可选择、可撤销、可持久化、可导出的专业属性编辑闭环。

**Architecture:** 采用已批准的方案 B，在现有 React + SVG 技术栈上把 `ProjectDocument` 升级为场景文档 v2。人员省份由城市目录派生，所有渲染只使用可见人员；画布元素与素材实例由项目文档驱动，右侧检查器通过统一事务修改文档，页面预览与 SVG/PNG 导出共享同一渲染树。

**Tech Stack:** React、TypeScript、Vite、Vitest、jsdom、d3-geo、lucide-react、xlsx；不新增画布框架。

**Design:** `docs/plans/2026-07-24-core-editor-repair-design.md`

**Baseline:** commit `8355ac5`; `npm test` = 18 files / 47 tests passing.

---

## 执行规则

1. 每个任务严格执行 RED -> 验证失败 -> GREEN -> 目标测试 -> 全量测试 -> commit。
2. 不把多个任务合并成一个大提交；每个任务完成后单独提交。
3. 若现有测试因正式模型变化而需要更新，只修改与该任务直接相关的 fixture 和断言。
4. 不删除旧草稿兼容逻辑，直到 v1 -> v2 迁移测试已经 GREEN。
5. 组件测试若需要 DOM 交互，优先使用 `react-dom/client` + `react-dom/test-utils`/原生事件；只有确有必要时才引入 Testing Library，并在同一任务记录依赖原因。
6. 每完成一个任务运行：目标测试、`npm test`。涉及 UI/类型时再运行 `npm run lint && npm run build`。
7. 新对话从 Task 1 开始，不重新设计，不改动已批准范围。

---

### Task 1: 精简人员正式模型与可见性语义

**Files:**
- Modify: `src/lib/project-data.ts`
- Modify: `src/lib/student-data.ts`
- Modify: `src/lib/data-workspace.ts`
- Modify: `src/lib/layout.ts`
- Modify: `src/lib/project-data.test.ts`
- Modify: `src/lib/student-data.test.ts`
- Modify: `src/lib/data-workspace.test.ts`
- Modify: `src/lib/layout.test.ts`
- Modify: all directly affected student fixtures in `src/**/*.test.ts`

**Step 1: Write failing tests**

Add tests proving:

```ts
const student: Student = {
  id: "student-1",
  name: "林舟",
  university: "北京大学",
  city: "北京市",
  visibility: false,
};

expect(getVisibleStudents([student])).toEqual([]);
expect(resolveStudentLocation(student)).toMatchObject({
  city: "北京市",
  province: "北京市",
  status: "resolved",
});
```

Also assert that `buildStudentRecords()` returns only the approved formal fields plus any result-level issues; it must not emit `province`, `major`, `locationStatus`, or `raw` inside the saved `Student`.

**Step 2: Run tests and confirm RED**

```bash
npm test -- --run src/lib/project-data.test.ts src/lib/student-data.test.ts src/lib/data-workspace.test.ts src/lib/layout.test.ts
```

Expected: FAIL because `visibility`, `getVisibleStudents`, and derived-location APIs are missing and old records contain obsolete fields.

**Step 3: Implement minimal model**

- Change `Student` to exactly `id/name/university/city/visibility`.
- Add `getVisibleStudents(students)`.
- Keep city normalization/province lookup as derived helpers.
- Make newly confirmed/imported students default to `visibility: true`.
- Change summaries and layout entry points to exclude hidden people.
- Remove direct reads of `student.province` and replace with derived location at boundaries.

**Step 4: Run target and full tests**

```bash
npm test -- --run src/lib/project-data.test.ts src/lib/student-data.test.ts src/lib/data-workspace.test.ts src/lib/layout.test.ts
npm test
```

Expected: all PASS.

**Step 5: Commit**

```bash
git add src/lib src/**/*.test.ts
git commit -m "refactor: simplify student model and visibility"
```

---

### Task 2: 建立城市与院校本地搜索目录

**Files:**
- Create: `src/data/china-cities.ts`
- Create: `src/data/china-universities.ts`
- Create: `src/lib/search-catalog.ts`
- Create: `src/lib/search-catalog.test.ts`
- Modify: `src/lib/student-data.ts`

**Step 1: Write failing tests**

Cover one behavior per test:

```ts
expect(searchCities("杭州", 5)[0]).toMatchObject({
  name: "杭州市",
  province: "浙江省",
});
expect(searchCities("北京", 5)[0]?.name).toBe("北京市");
expect(searchUniversities("北大", 5)[0]?.name).toBe("北京大学");
expect(searchUniversities("浙江大", 5)[0]).toMatchObject({
  name: "浙江大学",
  city: "杭州市",
});
expect(resolveCity("自定义火星城")).toMatchObject({ status: "unresolved" });
```

Add ranking assertions: exact alias > prefix > substring; duplicate aliases return one canonical result; result count respects the limit.

**Step 2: Confirm RED**

```bash
npm test -- --run src/lib/search-catalog.test.ts
```

Expected: FAIL because catalog files and search APIs do not exist.

**Step 3: Implement minimal catalog/search**

- Define `CityCatalogEntry` and `UniversityCatalogEntry`.
- Move current city aliases and province mapping into `china-cities.ts`.
- Add a curated, deterministic mainland university catalog sufficient for common destinations; include aliases such as 北大、清华、浙大、复旦、上交、南大、武大、中大、川大、西交、哈工大、厦大、湖大.
- Normalize whitespace, punctuation, case and common suffix variants.
- Implement ranked local search with no network dependency.
- Re-export city resolution helpers used by student data.

**Step 4: Verify**

```bash
npm test -- --run src/lib/search-catalog.test.ts src/lib/student-data.test.ts
npm test
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/data src/lib/search-catalog* src/lib/student-data.ts
git commit -m "feat: add local city and university matching"
```

---

### Task 3: 完成人员增删改、显隐与自动匹配 UI

**Files:**
- Create: `src/components/SearchCombobox.tsx`
- Create: `src/components/SearchCombobox.test.tsx`
- Modify: `src/components/DataWorkspace.tsx`
- Create or Modify: `src/components/DataWorkspace.test.tsx`
- Modify: `src/lib/data-workspace.ts`
- Modify: `src/lib/data-workspace.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Step 1: Write failing helper tests**

Add pure operations:

```ts
expect(updateStudent(students, "student-1", { city: "杭州市" })[0]?.city)
  .toBe("杭州市");
expect(toggleStudentVisibility(students, "student-1")[0]?.visibility)
  .toBe(false);
expect(removeStudent(students, "student-1")).toEqual([]);
```

**Step 2: Confirm helper RED, implement, verify GREEN**

```bash
npm test -- --run src/lib/data-workspace.test.ts
```

Implement immutable helpers only, then rerun until PASS.

**Step 3: Write failing component tests**

Test these scenarios:

1. Typing `北大` opens suggestions; selecting it writes `北京大学`.
2. Typing `杭州` opens `杭州市 · 浙江省`; selecting writes canonical city.
3. Custom unmatched values remain saveable.
4. Editing an existing row calls `onUpdateStudent` with stable ID.
5. Visibility switch calls `onToggleVisibility` and changes accessible label.
6. Delete requires confirmation callback and calls `onDeleteStudent` only after confirmation.
7. “全部显示/全部隐藏” invokes one batch callback, not N independent transactions.
8. Keyboard ArrowDown/Enter/Escape works in the combobox.

**Step 4: Confirm component RED**

```bash
npm test -- --run src/components/SearchCombobox.test.tsx src/components/DataWorkspace.test.tsx
```

Expected: FAIL because components/props do not exist.

**Step 5: Implement UI and project transactions**

- Replace plain city/university inputs with `SearchCombobox`.
- Add row edit/save/cancel/delete/visibility controls.
- Add search/filter and batch visibility controls.
- Route add/update/delete/visibility through `applyTransaction` in `App.tsx`.
- Preserve import behavior; imported rows start visible.
- Ensure hidden rows remain editable in the workspace.

**Step 6: Verify**

```bash
npm test -- --run src/components/SearchCombobox.test.tsx src/components/DataWorkspace.test.tsx
npm test
npm run lint
npm run build
```

Expected: all PASS; no accessibility label failures.

**Step 7: Commit**

```bash
git add src/components src/lib/data-workspace* src/App.tsx src/styles.css
git commit -m "feat: add editable searchable student records"
```

---

### Task 4: 定义场景文档 v2 与安全默认值

**Files:**
- Create: `src/lib/scene-document.ts`
- Create: `src/lib/scene-document.test.ts`
- Modify: `src/lib/canvas-data.ts`
- Modify: `src/lib/canvas-data.test.ts`
- Modify: `src/lib/project-document.ts`
- Modify: `src/lib/project-document.test.ts`
- Modify: `src/lib/template-document.ts`
- Modify: `src/lib/template-document.test.ts`

**Step 1: Write failing scene tests**

Assert defaults and clamps:

```ts
const scene = createDefaultScene("original");
expect(scene.canvas).toMatchObject({ width: 1500, height: 1000 });
expect(scene.map).toMatchObject({ x: 350, y: 120, width: 800, height: 690, scale: 1 });
expect(scene.textElements.map((item) => item.role)).toEqual(
  expect.arrayContaining(["eyebrow", "title", "subtitle", "stats", "watermark", "note"]),
);
expect(updateSceneTarget(scene, { type: "text", id: "text-title" }, { fontSize: 400 })
  .textElements.find((item) => item.id === "text-title")?.fontSize).toBe(240);
```

Also test invalid negative canvas sizes and map dimensions are clamped/rejected.

**Step 2: Confirm RED**

```bash
npm test -- --run src/lib/scene-document.test.ts src/lib/canvas-data.test.ts src/lib/project-document.test.ts
```

**Step 3: Implement scene types and defaults**

- Add `CanvasSettings`, `MapSettings`, `CardSettings`, expanded `CanvasText`, `AssetElement`.
- Add stable built-in text IDs/roles.
- Add pure target-update and normalization helpers.
- Add `schemaVersion: 2` and scene fields to `ProjectDocument` while retaining temporary v1 restoration compatibility.
- Make `createProjectDocument` initialize v2 scene.

**Step 4: Verify**

```bash
npm test -- --run src/lib/scene-document.test.ts src/lib/canvas-data.test.ts src/lib/project-document.test.ts src/lib/template-document.test.ts
npm test
```

**Step 5: Commit**

```bash
git add src/lib/scene-document* src/lib/canvas-data* src/lib/project-document* src/lib/template-document*
git commit -m "feat: add versioned scene document"
```

---

### Task 5: 实现 v1 草稿和模板迁移

**Files:**
- Create: `src/lib/project-migration.ts`
- Create: `src/lib/project-migration.test.ts`
- Modify: `src/lib/project-document.ts`
- Modify: `src/lib/project-persistence.test.ts`
- Modify: `src/lib/template-store.ts`
- Modify: `src/lib/template-store.test.ts`

**Step 1: Write failing migration tests**

Use explicit v1 JSON fixtures asserting:

- Obsolete student fields are removed and `visibility=true` is added.
- `style.mapScale` maps to `map.scale`.
- `backgroundColor/backgroundImageSrc` map to `canvas`.
- Fixed v1 canvas/map frame become v2 defaults.
- Old note text is preserved; missing built-in texts are generated exactly once.
- Every old regional asset becomes an asset instance with province binding.
- v2 serialize -> restore is lossless for scene fields and history.
- custom template round-trip contains no `students`.

**Step 2: Confirm RED**

```bash
npm test -- --run src/lib/project-migration.test.ts src/lib/project-persistence.test.ts src/lib/template-store.test.ts
```

**Step 3: Implement migration**

- Detect absent/old `schemaVersion`.
- Parse defensively; preserve all valid people.
- Use city-derived province centroid for old regional asset placement.
- Keep `restoreProjectDocument` as the single entry point.
- Migrate template records without injecting people.

**Step 4: Verify**

```bash
npm test -- --run src/lib/project-migration.test.ts src/lib/project-persistence.test.ts src/lib/template-store.test.ts
npm test
```

**Step 5: Commit**

```bash
git add src/lib/project-migration* src/lib/project-document.ts src/lib/project-persistence.test.ts src/lib/template-store*
git commit -m "feat: migrate projects to scene document v2"
```

---

### Task 6: 拆分动态 SVG 场景渲染器

**Files:**
- Create: `src/components/canvas/PosterCanvas.tsx`
- Create: `src/components/canvas/MapLayer.tsx`
- Create: `src/components/canvas/MapDataLayer.tsx`
- Create: `src/components/canvas/TextLayer.tsx`
- Create: `src/components/canvas/DecorationLayer.tsx`
- Create: `src/components/canvas/PosterCanvas.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/lib/layout.ts`
- Modify: `src/styles.css`

**Step 1: Write failing renderer tests**

Render SVG and assert:

1. `viewBox` follows project canvas width/height.
2. Map layer transform/frame follows `x/y/width/height/scale`.
3. Hidden students do not appear in cards or statistics.
4. Text content, size, weight, alignment, width and visibility come from text elements.
5. Selection click callbacks identify canvas/map/cards/text.
6. Editing overlays are omitted when `exportMode=true`.

**Step 2: Confirm RED**

```bash
npm test -- --run src/components/canvas/PosterCanvas.test.tsx
```

**Step 3: Implement minimal renderer split**

- Move existing rendering without visual redesign.
- Replace global `canvas` and `mapFrame` constants with scene fields.
- Derive province at the layout boundary.
- Render built-in text from `textElements`; delete hard-coded title/subtitle/stats/watermark SVG nodes.
- Ensure visible students are the only data input to map and cards.

**Step 4: Verify**

```bash
npm test -- --run src/components/canvas/PosterCanvas.test.tsx src/lib/layout.test.ts
npm test
npm run lint
npm run build
```

**Step 5: Commit**

```bash
git add src/components/canvas src/App.tsx src/lib/layout.ts src/styles.css
git commit -m "refactor: render poster from scene document"
```

---

### Task 7: 建立统一选择与属性事务 API

**Files:**
- Create: `src/lib/inspector-operations.ts`
- Create: `src/lib/inspector-operations.test.ts`
- Modify: `src/lib/project-document.ts`
- Modify: `src/App.tsx`

**Step 1: Write failing operation tests**

Cover:

```ts
expect(updateCanvas(project, { width: 1800 }).canvas.width).toBe(1800);
expect(updateMap(project, { x: 420, scale: 1.2 }).map).toMatchObject({ x: 420, scale: 1.2 });
expect(updateCards(project, { gap: 20 }).cards.gap).toBe(20);
expect(updateText(project, "text-note", { fontSize: 36 }).textElements[...].fontSize).toBe(36);
```

Also assert missing IDs are no-op or return a typed error, invalid numeric values cannot enter the document, and deleting selected text/asset produces a valid project.

**Step 2: Confirm RED**

```bash
npm test -- --run src/lib/inspector-operations.test.ts
```

**Step 3: Implement pure operations**

- Add target-specific immutable operations.
- Add one transaction factory that labels changes by target.
- Keep `SceneSelection` in `App` state only.
- Add coalescing contract for range controls: input preview may be local; commit one transaction on pointer/key completion.

**Step 4: Verify**

```bash
npm test -- --run src/lib/inspector-operations.test.ts src/lib/project-document.test.ts
npm test
```

**Step 5: Commit**

```bash
git add src/lib/inspector-operations* src/lib/project-document.ts src/App.tsx
git commit -m "feat: add scene inspector operations"
```

---

### Task 8: 实现画布、地图和卡片专业检查器

**Files:**
- Create: `src/components/inspector/InspectorPanel.tsx`
- Create: `src/components/inspector/CanvasInspector.tsx`
- Create: `src/components/inspector/MapInspector.tsx`
- Create: `src/components/inspector/CardsInspector.tsx`
- Create: `src/components/inspector/InspectorPanel.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Step 1: Write failing component tests**

Assert:

- Canvas selection shows width/height/safe margin/background controls.
- Map selection shows x/y/width/height/scale/colors/labels/reset.
- Cards selection shows preset/grouping/x/y/max width/padding/gap/columns/colors/visible fields.
- Changing a number emits normalized patch for the selected target.
- Reset asks for one reset transaction.
- Controls have labels and keyboard access.

**Step 2: Confirm RED**

```bash
npm test -- --run src/components/inspector/InspectorPanel.test.tsx
```

**Step 3: Implement inspectors**

- Replace right-side summary with context inspector.
- Retain project summary/history as a collapsible secondary section below properties.
- Wire canvas/map/cards clicks from `PosterCanvas` to selection.
- Add visible selection outline without affecting export.

**Step 4: Verify**

```bash
npm test -- --run src/components/inspector/InspectorPanel.test.tsx src/components/canvas/PosterCanvas.test.tsx
npm test
npm run lint
npm run build
```

**Step 5: Commit**

```bash
git add src/components/inspector src/components/canvas src/App.tsx src/styles.css
git commit -m "feat: add canvas map and card inspectors"
```

---

### Task 9: 实现全部文本与特殊备注编辑

**Files:**
- Create: `src/components/inspector/TextInspector.tsx`
- Create: `src/components/inspector/TextInspector.test.tsx`
- Modify: `src/components/inspector/InspectorPanel.tsx`
- Modify: `src/components/canvas/TextLayer.tsx`
- Modify: `src/lib/canvas-data.ts`
- Modify: `src/lib/canvas-data.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Step 1: Write failing tests**

Test every required property:

- content
- x/y
- font size
- color
- weight
- alignment
- max width
- visibility

Also test:

- Add special note creates `role="note"`.
- Built-in and custom text can be hidden.
- User custom/note text can be deleted.
- Built-in text delete action is replaced with “restore default” or visibility toggle, preventing loss of stable roles.
- Drag movement and inspector edits both use the same text element source.

**Step 2: Confirm RED**

```bash
npm test -- --run src/components/inspector/TextInspector.test.tsx src/lib/canvas-data.test.ts
```

**Step 3: Implement text inspector and render behavior**

- Remove `window.prompt` text creation; use explicit panel form/action.
- Implement SVG alignment (`textAnchor`) and wrapping policy using `maxWidth`.
- Make title/subtitle/eyebrow/stats/watermark/note selectable.
- Keep drag behavior; commit a single movement transaction per drag end.

**Step 4: Verify**

```bash
npm test -- --run src/components/inspector/TextInspector.test.tsx src/components/canvas/PosterCanvas.test.tsx src/lib/canvas-data.test.ts
npm test
npm run lint
npm run build
```

**Step 5: Commit**

```bash
git add src/components/inspector src/components/canvas/TextLayer.tsx src/lib/canvas-data* src/App.tsx src/styles.css
git commit -m "feat: make all poster text editable"
```

---

### Task 10: 重构素材库与画布素材实例

**Files:**
- Modify: `src/lib/assets.ts`
- Modify: `src/lib/assets.test.ts`
- Create: `src/lib/asset-elements.ts`
- Create: `src/lib/asset-elements.test.ts`
- Modify: `src/components/AssetPanel.tsx`
- Create or Modify: `src/components/AssetPanel.test.tsx`
- Modify: `src/App.tsx`

**Step 1: Write failing domain tests**

Assert:

```ts
const landmark = createLandmarkElement(asset, "浙江省", centroid);
expect(landmark).toMatchObject({ kind: "landmark", province: "浙江省" });

const texture = createProvinceTextureElement(asset, "浙江省");
expect(texture).toMatchObject({ kind: "province-texture", province: "浙江省" });

expect(sortAssetElementsByLayer(elements).map((item) => item.id)).toEqual([...]);
```

Also test duplicate application creates distinct instance IDs, source deletion does not silently corrupt existing instances, and instance deletion preserves the source asset.

**Step 2: Confirm RED**

```bash
npm test -- --run src/lib/assets.test.ts src/lib/asset-elements.test.ts
```

**Step 3: Implement source/instance separation**

- Extend asset kind choices to background/regional/decoration at upload time.
- Add factories for province texture, landmark and decoration instances.
- Add immutable update/delete/duplicate/layer helpers.
- Remove “max three, render only last” behavior from main state.

**Step 4: Write failing AssetPanel tests**

Test:

- Explicit province selector is required for regional apply.
- Buttons are “省份纹理” and “地域地标”, not ambiguous “绑省份”.
- Background applies through background callback.
- Decoration creates an instance.
- Upload allows choosing kind and handles storage quota error.
- Applied state/feedback identifies exact province and mode.

**Step 5: Implement AssetPanel**

- Add province selector based on map feature names.
- Add source tabs/filters and upload kind.
- Emit typed application intents rather than directly constructing partial assets.
- Show instances using the selected source and allow selecting an existing instance.

**Step 6: Verify**

```bash
npm test -- --run src/lib/assets.test.ts src/lib/asset-elements.test.ts src/components/AssetPanel.test.tsx
npm test
npm run lint
npm run build
```

**Step 7: Commit**

```bash
git add src/lib/assets* src/lib/asset-elements* src/components/AssetPanel* src/App.tsx
git commit -m "feat: create applicable regional asset instances"
```

---

### Task 11: 渲染省份纹理、地域地标和普通装饰

**Files:**
- Create: `src/components/canvas/RegionalAssetLayer.tsx`
- Create: `src/components/canvas/RegionalAssetLayer.test.tsx`
- Modify: `src/components/canvas/DecorationLayer.tsx`
- Modify: `src/components/canvas/PosterCanvas.tsx`
- Modify: `src/lib/map-data.ts`
- Modify: `src/lib/map-data.test.ts`
- Modify: `src/styles.css`

**Step 1: Write failing tests**

Assert:

1. Province texture creates a unique `clipPath` tied to the province path and renders its image clipped.
2. Multiple textures/landmarks for one province all render.
3. Landmark x/y/width/height/rotation/opacity/zIndex affect SVG attributes/order.
4. Decoration renders and can be selected/moved/resized.
5. Hidden asset instances do not render.
6. Broken image instances produce an editor warning hook but do not crash SVG serialization.
7. Export mode omits handles/selection overlays but includes assets.

**Step 2: Confirm RED**

```bash
npm test -- --run src/components/canvas/RegionalAssetLayer.test.tsx src/lib/map-data.test.ts
```

**Step 3: Implement rendering**

- Add province feature lookup and centroid helpers.
- Use stable sanitized IDs for SVG defs.
- Render textures inside map before borders.
- Render landmarks at instance coordinates after map data.
- Render decorations in their designated layer.
- Ensure data URLs survive `serializePosterSvg` and PNG conversion.

**Step 4: Verify**

```bash
npm test -- --run src/components/canvas/RegionalAssetLayer.test.tsx src/components/canvas/PosterCanvas.test.tsx src/lib/map-data.test.ts src/lib/export-poster.test.ts
npm test
npm run lint
npm run build
```

**Step 5: Commit**

```bash
git add src/components/canvas src/lib/map-data* src/styles.css
git commit -m "feat: render regional textures and landmarks"
```

---

### Task 12: 实现素材属性检查器和直接操作

**Files:**
- Create: `src/components/inspector/AssetInspector.tsx`
- Create: `src/components/inspector/AssetInspector.test.tsx`
- Modify: `src/components/inspector/InspectorPanel.tsx`
- Modify: `src/components/canvas/RegionalAssetLayer.tsx`
- Modify: `src/components/canvas/DecorationLayer.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Step 1: Write failing tests**

Test:

- Inspector shows instance label/type/province.
- Landmark supports x/y/width/height/rotation/opacity/visibility and layer up/down.
- Province texture supports province/opacity/visibility/layer; no meaningless free-position controls.
- Decoration supports x/y/width/height/visibility/delete; rotation may be omitted per approved scope.
- Duplicate and delete callbacks use instance ID.
- Canvas pointer movement updates landmark/decoration; final pointer-up creates one history entry.

**Step 2: Confirm RED**

```bash
npm test -- --run src/components/inspector/AssetInspector.test.tsx
```

**Step 3: Implement inspector and direct manipulation**

- Add target-aware controls.
- Add visible selection box and basic resize handles for landmark/decoration.
- Clamp object bounds sensibly but allow partial bleed outside the safe area.
- After deletion, select canvas.

**Step 4: Verify**

```bash
npm test -- --run src/components/inspector/AssetInspector.test.tsx src/components/canvas/RegionalAssetLayer.test.tsx
npm test
npm run lint
npm run build
```

**Step 5: Commit**

```bash
git add src/components/inspector src/components/canvas src/App.tsx src/styles.css
git commit -m "feat: add asset inspector and transforms"
```

---

### Task 13: 适配 AI 命令、模板保存与导出

**Files:**
- Modify: `src/lib/editor-commands.ts`
- Modify: `src/lib/editor-commands.test.ts`
- Modify: `src/lib/style-commands.test.ts`
- Modify: `src/lib/template-store.ts`
- Modify: `src/lib/template-store.test.ts`
- Modify: `src/lib/export-poster.ts`
- Modify: `src/lib/export-poster.test.ts`
- Modify: `src/App.tsx`

**Step 1: Write failing integration tests**

Assert:

- `setMapScale` updates `project.map.scale`.
- `setCardPreset` and `setVisibleFields` update `project.cards`.
- `setBackgroundColor` updates `project.canvas.backgroundColor`.
- Template save captures scene layout/text/assets but no students.
- Applying saved template restores visual scene without replacing current people.
- SVG/PNG dimensions use current canvas size.
- Final SVG includes visible text and asset instances, excludes hidden people and editor handles.

**Step 2: Confirm RED**

```bash
npm test -- --run src/lib/editor-commands.test.ts src/lib/style-commands.test.ts src/lib/template-store.test.ts src/lib/export-poster.test.ts
```

**Step 3: Implement adapters**

- Point current whitelist commands to v2 scene targets.
- Update preview cloning for new nested state and assets.
- Update template create/apply around scene state.
- Export from `PosterCanvas` in export mode using dynamic dimensions.
- Preserve AI fallback and API schema compatibility unless a test proves a contract update is required.

**Step 4: Verify**

```bash
npm test -- --run src/lib/editor-commands.test.ts src/lib/style-commands.test.ts src/lib/template-store.test.ts src/lib/export-poster.test.ts
npm test
npm run lint
npm run build
```

**Step 5: Commit**

```bash
git add src/lib/editor-commands* src/lib/style-commands.test.ts src/lib/template-store* src/lib/export-poster* src/App.tsx
git commit -m "feat: connect scene state to ai templates and export"
```

---

### Task 14: 全链路浏览器验收与无障碍修整

**Files:**
- Modify as failures require: `src/components/**`
- Modify as failures require: `src/styles.css`
- Create: `docs/qa/2026-07-24-core-editor-repair.md`

**Step 1: Build and start integrated production service**

```bash
npm test
npm run lint
npm run build
APP_PORT=8787 npm run start
```

Expected: all commands PASS; `GET /` and `GET /api/health` return 200.

**Step 2: Browser acceptance matrix**

Test at desktop 1440px and narrow 768px:

1. Add a student using `北大` and `杭州` suggestions.
2. Edit the record, toggle visibility off/on, delete another record, undo and redo.
3. Change canvas size; verify SVG viewBox and PNG dimensions.
4. Select map; change position, frame size, scale, labels and colors.
5. Select cards; change preset, spacing, grouping and visible fields.
6. Select each built-in text role; edit content, size, color, weight, alignment, width and visibility.
7. Add/edit/delete a special note.
8. Apply an image as Zhejiang province texture.
9. Apply two landmarks to the same province; move, resize, rotate, reorder and hide one.
10. Add a decoration and move/resize/delete it.
11. Save/reload; verify scene and people persist.
12. Save/apply custom template; verify people are not overwritten.
13. Export SVG and PNG; verify output matches editor and contains no selection handles.
14. Keyboard test all comboboxes, toggles, tabs and inspector controls.
15. Check browser console for errors/warnings.

**Step 3: Record evidence and fix only observed defects**

Write results, screenshots/paths if available, and exact commands to `docs/qa/2026-07-24-core-editor-repair.md`. Any bug fix requires a failing regression test first.

**Step 4: Final verification**

```bash
npm test
npm run lint
npm run build
git status --short
```

Expected: tests/lint/build PASS; only intended QA doc/code changes remain.

**Step 5: Commit**

```bash
git add src docs/qa/2026-07-24-core-editor-repair.md
git commit -m "test: verify core editor repair workflow"
```

---

### Task 15: 两阶段代码审查与分支收尾

**Files:**
- Review all files changed since the plan commit.

**Step 1: Spec review**

Review against `docs/plans/2026-07-24-core-editor-repair-design.md` and this plan. Confirm every acceptance scenario is implemented and no arbitrary-field system or unrelated feature was added.

**Step 2: Code-quality review**

Inspect for:

- oversized components and duplicated transaction code
- stale v1 reads after migration
- mutation of project/history arrays
- unsafe SVG IDs or image handling
- accessibility gaps
- hidden students leaking into summary/export
- template records leaking people
- range controls flooding history

Fix each confirmed issue using RED/GREEN regression tests.

**Step 3: Final gate**

```bash
npm test
npm run lint
npm run build
git diff --check
git status --short --branch
```

Expected: all PASS and clean working tree after final commit.

**Step 4: Finish branch**

Present exactly four choices: merge locally, push and open PR, keep branch, or discard. Do not push or merge without user selection.

---

## 新对话启动提示

在新对话中可直接说：

> 按 `docs/plans/2026-07-24-core-editor-repair.md` 执行，从 Task 1 开始。严格 TDD，每个任务完成后运行目标测试和全量测试，并提交一次；先只执行 Task 1。

执行者还应先阅读：

- `docs/plans/2026-07-24-core-editor-repair-design.md`
- `docs/plans/2026-07-24-core-editor-repair.md`
- 当前 `git status --short --branch`
