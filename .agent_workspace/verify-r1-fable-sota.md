# Round 1 — Agent B (fable SOTA) — merged-branch behavior verification

**Model:** claude-fable-5-thinking-xhigh
**HEAD:** `388eafc` (`Merge branch 'cursor/merge-all-branches-e17a'`)
**Question answered:** did each merged KEEP branch land its *user-facing behavior* in the tree (symbols exist **and** are reachable from a rendered route), not merely its commits.

**Method:** for each feature, locate the named symbols, then walk the render/import chain up to `src/App.tsx` / `src/main.tsx` / `src/components/StudioRoutes.tsx`. Confirmed import chains load by running the 9 seam test files touching all six features: **47/47 passed** (`npx vitest run` on public-base-path, workflow-stages, print-size, project-package-file-name, template-exchange-actions, DataWorkspace.live-regions, legacy-editor-panes, MapLayer.pan-memo.cycle3, App.canvas-callbacks).

## Verdict summary

| Feature | Verdict |
|---|---|
| public-static-demo | **PRESENT** |
| canvas-render-display | **PRESENT** |
| feature-expansion | **PRESENT** |
| optimize-studio-ux | **PRESENT** (one nuance, see below) |
| market-practical | **PRESENT** |
| r12-1 editor pane extract | **PRESENT** |

---

## 1. public-static-demo — PRESENT

| Surface | Evidence |
|---|---|
| `VITE_PUBLIC_DEMO` env typing | `src/vite-env.d.ts:4` (`readonly VITE_PUBLIC_DEMO?: string`) |
| `isPublicDemoBuild` | `src/lib/public-base-path.ts:36-38`; also `normalizePublicBasePath` / `stripPublicBase` / `isPrototypePath` (lines 11-34) + tests `src/lib/public-base-path.test.ts` |
| Demo banner reachable | `src/components/ProjectWorkbench.tsx:50` default prop `publicDemo = isPublicDemoBuild()`; banner + AGPL source link rendered at lines 299-305 (`.workbench-notice`, `PROJECT_SOURCE_URL`) |
| Pages workflow | `.github/workflows/pages.yml:31-33` builds with `BASE_PATH: /cengfan-map-studio/` and `VITE_PUBLIC_DEMO: "1"`, deploys via `actions/deploy-pages@v4` |
| wrangler | `wrangler.toml:6` `pages_build_output_dir = "./dist"` (Cloudflare Pages static config) |
| Base path wired to build | `vite.config.ts:24` `base: resolvePublicBasePath(process.env.BASE_PATH ?? env.BASE_PATH)`; hash-route entry uses `isPrototypePath` at `src/main.tsx:48` |
| Static-host API hint | `STATIC_HOST_API_HINT` consumed at `src/lib/ai-client.ts:39` (404/405 → hint) and `src/lib/collaboration-client.ts:264` (`API_UNAVAILABLE`) |
| Static assets / docs | `public/_headers`, `public/_redirects` exist; `docs/deployment/public-demo.md`; `.env.example:34-36` |

Not verifiable from the tree: actually enabling GitHub Pages / Cloudflare in repo settings (ops step, matches the merge-note expectation in `round-merge-all-r3-sota.md`).

## 2. canvas-render-display — PRESENT

| Surface | Evidence |
|---|---|
| `useStableCallbacks` | Defined `src/lib/stable-callbacks.ts:13` (latest-ref pattern). Consumed in `src/App.tsx:406` (`canvasActions`) and `src/App.tsx:474` (`navigationActions`); pinned by `src/App.canvas-callbacks.test.tsx` |
| PosterCanvas split | `src/components/canvas/` holds `PosterCanvas.tsx` plus split layers: `MapLayer.tsx`, `MapDataLayer.tsx`, `DestinationCardsLayer.tsx`, `GuestsLayer.tsx`, `TextLayer.tsx`, `DecorationLayer.tsx`, `RegionalAssetLayer.tsx`, `ReferenceCardVisual.tsx`, `ResizeHandles.tsx`, `CanvasDragPreview.tsx`, `useCardLayoutWorker.ts` — each with test files |
| Reachable | `src/App.tsx:864` renders `LegacyEditorStage`; `src/components/editor/LegacyEditorStage.tsx:79` renders `PosterCanvas` |
| Pan cache | `src/components/canvas/MapLayer.tsx:325-341`: `settingsEqualIgnoringOrigin` + `contentPropsEqual` memo comparator skip `x`/`y` so pans ride the wrapper `translate` (line 573) without re-rendering province nodes; per-feature path/bbox/centroid WeakMap caches at lines 87-112 and `getFeatureSplit` cache at line 128. Pinned by `MapLayer.pan-memo.cycle3.test.tsx` |
| Render bench fixtures | `src/lib/canvas-render-metrics.ts` (`buildPosterCanvasBenchFixture`, `medianDuration`, …) + `canvas-render-metrics.test.ts`; `PosterCanvas.performance.test.tsx` |

## 3. feature-expansion — PRESENT

| Surface | Evidence |
|---|---|
| Template exchange | Component `src/components/TemplateExchange.tsx:19` (+ `TemplateExchange.css`, `.test.tsx`); logic `src/lib/template-exchange-actions.ts` (`mergeImportedTemplate` re-exported via `src/lib/editor-template-actions.ts:12`), `template-package.ts`, `template-store.ts` |
| Template exchange reachable | Two routes: `src/App.tsx:697` → `GlobalSettingsShell` → `src/components/GlobalSettingsScreen.tsx:319` renders `TemplateExchange`; `src/App.tsx:730` → `StageLayoutScreen.tsx:360` → `ContentLayoutWorkspace.tsx:159` renders `TemplateExchange` (gated on `onImportTemplateRecord`, wired from `createEditorTemplateActions` at `src/App.tsx:98`) |
| Import live regions | `src/components/DataMessageRegions.tsx:14-21`: persistent dual regions — `role="status" aria-live="polite"` for success/summary, `role="alert" aria-live="assertive"` for failures (split by `isImportFailureMessage`). Rendered unconditionally at `src/components/DataWorkspace.tsx:738`; `DataWorkspace` reachable via `LegacyEditorSidebar.tsx:130` (App renders sidebar at `src/App.tsx:825`) and `GlobalSettingsShell`. Pinned by `DataWorkspace.live-regions.test.tsx` |
| Package filename | Export side: `src/lib/project-package-file-name.ts:10` `projectPackageFileName` (delegates to `buildExportFileName`), used at `src/components/ProjectWorkbench.tsx:223` and `src/components/StudioRoutes.tsx:57`. Import side (round-3 fix `b599da1`): `projectPackageDisplayName` at `src/lib/project-package.ts:379` strips the export date suffix, used at `src/components/ProjectWorkbench.tsx:254` |

## 4. optimize-studio-ux (名单→地图→版式→内容→交付) — PRESENT

| Surface | Evidence |
|---|---|
| Five-stage model | `src/lib/workflow-stages.ts:23-29` `WORKFLOW_STAGES` = 名单 / 地图 / 版式 / 内容 / 交付 (`data/map/frame/content/export`), plus legacy panel↔stage mappings (lines 31-54) and progress derivation (lines 64-101); tests `workflow-stages.test.ts` |
| Stage stepper reachable | `src/components/WorkflowStageStepper.tsx:30` maps `WORKFLOW_STAGES`; rendered from `src/App.tsx` (`workflowNavNode`, `activeId={activeStage}` at line ~681), stage state at `src/App.tsx:199` (`activeStage`) |
| Stage → workspace routing | `src/App.tsx:730` renders `StageLayoutScreen` for non-content stages; `StageLayoutScreen.tsx` routes 地图→`MapStyleWorkspace` (line 228), 交付→`DeliveryWorkspace` (line 311), 版式/内容→`ContentLayoutWorkspace` (line 360); 名单 via `DataWorkspace` |
| Legacy topbar stepper | `src/components/WorkflowStepper.tsx:6-13` (名单/地图/版式/内容/素材/交付) rendered at `LegacyEditorTopbar.tsx:77`, topbar at `src/App.tsx:792` |

Nuance (not a defect, but two coexisting steppers): the legacy `WorkflowStepper` shows six steps with 素材 as a first-class step, while `WORKFLOW_STAGES` deliberately folds 素材 into 内容 ("素材不占一级导航", `workflow-stages.ts:19-22`). Both are live UI depending on `legacyEditorEnabled`/stage. The requested 5-stage sequence is intact in both (素材 is inserted, nothing reordered).

## 5. market-practical (print size presets) — PRESENT

| Surface | Evidence |
|---|---|
| Preset data | `src/lib/print-size.ts:15-19` `NAMED_PRINT_SIZES` (A3 横版展板 / A2 横版展板 / 展板 90×60cm) with mm↔px conversion (`mmToPx`, `printSizeToPixels`) and copy helpers `describePhysicalSize` / `describeExportPrintHint` |
| Canvas size presets | `src/lib/grid.ts:15-23` `CANVAS_SIZE_PRESETS` extends the digital presets with `a3-150` / `a2-150` / `board-90x60` derived via `printSizeToPixels` |
| Preset picker UI | `src/components/inspector/CanvasInspector.tsx:39-52` — `尺寸预设` `<select id="canvas-size-preset">` applying `onPatch({width,height})`; physical-size hint at line 60 (`data-canvas-print-size`, `describePhysicalSize`) |
| Export print hint | `src/components/workspaces/DeliveryWorkspace.tsx:134` `data-export-print-size` renders `describeExportPrintHint(...)` in the 交付 workspace |
| Reachable | `CanvasInspector` rendered by `InspectorPanel.tsx:57` (→ `LegacyEditorInspector.tsx:60` → `src/App.tsx:882`) and by `GlobalSettingsScreen.tsx:262`; `DeliveryWorkspace` via `StageLayoutScreen.tsx:311` |

## 6. r12-1 editor pane extract — PRESENT

Merge `3bbfcef` ("merge(r12-1): extract legacy editor mid/right panes") added exactly the intended files, all present at HEAD:

| Surface | Evidence |
|---|---|
| Mid pane | `src/components/editor/LegacyEditorStage.tsx:43` `LegacyEditorStage` (`editor-area`/`canvas-stage` shells + zoom wrapper + PosterCanvas), rendered at `src/App.tsx:864` |
| Right pane | `src/components/editor/LegacyEditorInspector.tsx` (`#editor-inspector` shell + `InspectorPanel` at line 60 + project summary), rendered at `src/App.tsx:882` |
| Seam pins | `src/components/editor/legacy-editor-panes.test.tsx` (part of the 47 passing tests); `src/App.shell-layout.test.tsx` |
| App shrink held | `src/App.tsx` is now 923 lines (≤ the 933 allowlisted for the r12-1 shrink in `scripts/file-size-allowlist.json`) |

---

## Test evidence

```
npx vitest run src/lib/public-base-path.test.ts src/lib/workflow-stages.test.ts \
  src/lib/print-size.test.ts src/lib/project-package-file-name.test.ts \
  src/lib/template-exchange-actions.test.ts src/components/DataWorkspace.live-regions.test.tsx \
  src/components/editor/legacy-editor-panes.test.tsx \
  src/components/canvas/MapLayer.pan-memo.cycle3.test.tsx src/App.canvas-callbacks.test.tsx
→ Test Files 9 passed (9), Tests 47 passed (47)
```

No MISSING or PARTIAL findings. The only open item is operational, not code: enabling GitHub Pages / Cloudflare Pages for the public demo after merge to `main`.
