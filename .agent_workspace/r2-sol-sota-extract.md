# Round 2 Agent F — SOTA branch extraction inventory

Baseline: `HEAD=e760174ed95fb5c1d3f9a82f12c9f43f89f071a4`.

Method: the lists below are the exact path sets reported by:

```bash
git diff --name-only --diff-filter=A --no-renames HEAD <branch>
```

`--no-renames` matters here: a path is listed whenever it exists in the candidate branch and does not exist at the same path in `HEAD`, even if Git could otherwise describe it as a rename. This is an inventory, not a claim that every file is compatible with `HEAD`.

## 1. New files on `origin/cursor/sota-campaign-6231` not in HEAD

68 paths:

```text
docs/progress/2026-08-24-sota-campaign.md
server/ai/local-preroute.test.ts
server/ai/local-preroute.ts
src/components/AgentAssistant.test.tsx
src/components/AssetPanel.test.tsx
src/components/DataImportConsent.test.tsx
src/components/DataImportConsent.tsx
src/components/DataImportPanel.test.tsx
src/components/DataImportPanel.tsx
src/components/DataImportReview.tsx
src/components/ExportProjectDialog.css
src/components/ExportProjectDialog.test.tsx
src/components/ExportProjectDialog.tsx
src/components/GlobalSettingsScreen.test.tsx
src/components/ProjectWorkbench.test.tsx
src/components/SaveTemplateDialog.css
src/components/SaveTemplateDialog.test.tsx
src/components/SaveTemplateDialog.tsx
src/components/StatusBar.css
src/components/StatusBar.test.tsx
src/components/StatusBar.tsx
src/components/StudioLayoutTemplate.test.tsx
src/components/canvas/MapDataLayer.performance.test.tsx
src/components/canvas/MapLayer.test.tsx
src/components/canvas/PosterCanvas.render-facts-parity.test.tsx
src/components/canvas/PosterCanvas.test.tsx
src/components/global-data/GlobalDataNavigation.test.tsx
src/components/inspector/CanvasInspector.test.tsx
src/components/workbench/ConfirmDialog.tsx
src/components/workbench/DeleteProjectDialog.tsx
src/components/workbench/RenameProjectDialog.tsx
src/components/workbench/WorkbenchDialog.css
src/components/workbench/WorkbenchDialog.test.tsx
src/components/workbench/WorkbenchDialog.tsx
src/lib/agent-conversation-store.test.ts
src/lib/agent-session.test.ts
src/lib/ai-client.test.ts
src/lib/app-initialization.tsx
src/lib/apply-font-remap.test.ts
src/lib/apply-font-remap.ts
src/lib/binary-import.test.ts
src/lib/card-layout.test.ts
src/lib/csv-decode.test.ts
src/lib/csv-decode.ts
src/lib/export-poster.test.ts
src/lib/export-size-estimate.test.ts
src/lib/export-size-estimate.ts
src/lib/image-downscale.test.ts
src/lib/image-downscale.ts
src/lib/import-aliases.test.ts
src/lib/import-aliases.ts
src/lib/import-file-limits.test.ts
src/lib/import-file-limits.ts
src/lib/layout-health-cache.test.ts
src/lib/layout-health-cache.ts
src/lib/render-facts.test.ts
src/lib/render-facts.ts
src/lib/render-geometry.test.ts
src/lib/render-geometry.ts
src/lib/render-health.test.ts
src/lib/render-health.ts
src/lib/roster-export.test.ts
src/lib/roster-export.ts
src/lib/scene-writable-props.ts
src/lib/svg-image-inline.test.ts
src/lib/svg-image-inline.ts
src/lib/use-studio-preferences.test.tsx
src/lib/use-studio-preferences.ts
```

## 2. New files on `origin/cursor/agent-sota-polish-cbcd` not in HEAD

389 paths. Of these, 200 are `.agent_workspace` campaign/research artifacts and 189 are outside that directory.

```text
.agent_workspace/round1/BRIEF.md
.agent_workspace/round1/README.md
.agent_workspace/round1/fable-arch.md
.agent_workspace/round1/fable-sota.md
.agent_workspace/round1/gpt-perf.md
.agent_workspace/round1/gpt-server.md
.agent_workspace/round1/opus-data.md
.agent_workspace/round1/opus-layout.md
.agent_workspace/round1/perf-baseline.json
.agent_workspace/round10/BRIEF.md
.agent_workspace/round10/fable-arch.md
.agent_workspace/round10/fable-sota.md
.agent_workspace/round10/gpt-perf.md
.agent_workspace/round10/gpt-server.md
.agent_workspace/round10/opus-data.md
.agent_workspace/round10/opus-layout.md
.agent_workspace/round11/BRIEF.md
.agent_workspace/round11/fable-arch.md
.agent_workspace/round11/fable-sota.md
.agent_workspace/round11/gpt-perf.md
.agent_workspace/round11/gpt-server.md
.agent_workspace/round11/opus-data.md
.agent_workspace/round11/opus-layout.md
.agent_workspace/round12/BRIEF.md
.agent_workspace/round12/fable-arch.md
.agent_workspace/round12/fable-sota.md
.agent_workspace/round12/gpt-perf.md
.agent_workspace/round12/gpt-server.md
.agent_workspace/round12/opus-data.md
.agent_workspace/round12/opus-layout.md
.agent_workspace/round13/BRIEF.md
.agent_workspace/round13/fable-arch.md
.agent_workspace/round13/fable-sota.md
.agent_workspace/round13/gpt-perf.md
.agent_workspace/round13/gpt-server.md
.agent_workspace/round13/opus-data.md
.agent_workspace/round13/opus-layout.md
.agent_workspace/round14/BRIEF.md
.agent_workspace/round14/fable-arch.md
.agent_workspace/round14/fable-sota.md
.agent_workspace/round14/gpt-perf.md
.agent_workspace/round14/gpt-server.md
.agent_workspace/round14/opus-data.md
.agent_workspace/round14/opus-layout.md
.agent_workspace/round15/BRIEF.md
.agent_workspace/round15/fable-arch.md
.agent_workspace/round15/fable-sota.md
.agent_workspace/round15/gpt-perf.md
.agent_workspace/round15/gpt-server.md
.agent_workspace/round15/opus-data.md
.agent_workspace/round15/opus-layout.md
.agent_workspace/round16/BRIEF.md
.agent_workspace/round16/fable-arch.md
.agent_workspace/round16/fable-sota.md
.agent_workspace/round16/gpt-perf.md
.agent_workspace/round16/gpt-server.md
.agent_workspace/round16/opus-data.md
.agent_workspace/round16/opus-layout.md
.agent_workspace/round17/BRIEF.md
.agent_workspace/round17/fable-arch.md
.agent_workspace/round17/fable-sota.md
.agent_workspace/round17/gpt-perf.md
.agent_workspace/round17/gpt-server.md
.agent_workspace/round17/opus-data.md
.agent_workspace/round17/opus-layout.md
.agent_workspace/round18/BRIEF.md
.agent_workspace/round18/fable-arch.md
.agent_workspace/round18/fable-sota.md
.agent_workspace/round18/gpt-perf.md
.agent_workspace/round18/gpt-server.md
.agent_workspace/round18/opus-data.md
.agent_workspace/round18/opus-layout.md
.agent_workspace/round19/BRIEF.md
.agent_workspace/round19/fable-arch.md
.agent_workspace/round19/fable-sota.md
.agent_workspace/round19/gpt-perf.md
.agent_workspace/round19/gpt-server.md
.agent_workspace/round19/opus-data.md
.agent_workspace/round19/opus-layout.md
.agent_workspace/round2/BRIEF.md
.agent_workspace/round2/fable-arch.md
.agent_workspace/round2/fable-ux.md
.agent_workspace/round2/gpt-perf.md
.agent_workspace/round2/gpt-server.md
.agent_workspace/round2/opus-data.md
.agent_workspace/round2/opus-layout.md
.agent_workspace/round2/perf-baseline.json
.agent_workspace/round20/BRIEF.md
.agent_workspace/round20/fable-arch.md
.agent_workspace/round20/fable-sota.md
.agent_workspace/round20/gpt-perf.md
.agent_workspace/round20/gpt-server.md
.agent_workspace/round20/opus-data.md
.agent_workspace/round20/opus-layout.md
.agent_workspace/round21/BRIEF.md
.agent_workspace/round22/BRIEF.md
.agent_workspace/round23/BRIEF.md
.agent_workspace/round24/BRIEF.md
.agent_workspace/round25/BRIEF.md
.agent_workspace/round26/BRIEF.md
.agent_workspace/round26/fable-arch.md
.agent_workspace/round26/fable-sota.md
.agent_workspace/round26/gpt-perf.md
.agent_workspace/round26/gpt-server.md
.agent_workspace/round26/opus-data.md
.agent_workspace/round26/opus-layout.md
.agent_workspace/round27/BRIEF.md
.agent_workspace/round27/fable-arch.md
.agent_workspace/round27/fable-sota.md
.agent_workspace/round27/gpt-perf.md
.agent_workspace/round27/gpt-server.md
.agent_workspace/round27/opus-data.md
.agent_workspace/round27/opus-layout.md
.agent_workspace/round28/BRIEF.md
.agent_workspace/round28/fable-arch.md
.agent_workspace/round28/fable-sota.md
.agent_workspace/round28/gpt-perf.md
.agent_workspace/round28/gpt-server.md
.agent_workspace/round28/opus-data.md
.agent_workspace/round28/opus-layout.md
.agent_workspace/round29/BRIEF.md
.agent_workspace/round29/fable-arch.md
.agent_workspace/round29/fable-sota.md
.agent_workspace/round29/gpt-perf.md
.agent_workspace/round29/gpt-server.md
.agent_workspace/round29/opus-data.md
.agent_workspace/round29/opus-layout.md
.agent_workspace/round3/BRIEF.md
.agent_workspace/round3/fable-arch.md
.agent_workspace/round3/fable-sota.md
.agent_workspace/round3/gpt-perf.md
.agent_workspace/round3/gpt-server.md
.agent_workspace/round3/opus-data.md
.agent_workspace/round3/opus-layout.md
.agent_workspace/round3/perf-baseline.json
.agent_workspace/round30/BRIEF.md
.agent_workspace/round30/fable-arch.md
.agent_workspace/round30/fable-sota.md
.agent_workspace/round30/gpt-perf.md
.agent_workspace/round30/gpt-server.md
.agent_workspace/round30/opus-data.md
.agent_workspace/round30/opus-layout.md
.agent_workspace/round31/BRIEF.md
.agent_workspace/round31/fable-arch.md
.agent_workspace/round31/fable-sota.md
.agent_workspace/round31/gpt-perf.md
.agent_workspace/round31/gpt-server.md
.agent_workspace/round31/opus-data.md
.agent_workspace/round31/opus-layout.md
.agent_workspace/round32/BRIEF.md
.agent_workspace/round32/fable-arch.md
.agent_workspace/round32/fable-sota.md
.agent_workspace/round32/gpt-perf.md
.agent_workspace/round32/gpt-server.md
.agent_workspace/round32/opus-data.md
.agent_workspace/round32/opus-layout.md
.agent_workspace/round4/BRIEF.md
.agent_workspace/round4/fable-arch.md
.agent_workspace/round4/fable-sota.md
.agent_workspace/round4/golden-fingerprint.mts
.agent_workspace/round4/gpt-perf.md
.agent_workspace/round4/gpt-server.md
.agent_workspace/round4/opus-data.md
.agent_workspace/round4/opus-layout.md
.agent_workspace/round4/perf-baseline.json
.agent_workspace/round5/BRIEF.md
.agent_workspace/round5/fable-arch.md
.agent_workspace/round5/fable-sota.md
.agent_workspace/round5/gpt-perf.md
.agent_workspace/round5/gpt-server.md
.agent_workspace/round5/opus-data.md
.agent_workspace/round5/opus-layout.md
.agent_workspace/round6/BRIEF.md
.agent_workspace/round6/fable-arch.md
.agent_workspace/round6/fable-sota.md
.agent_workspace/round6/gpt-perf.md
.agent_workspace/round6/gpt-server.md
.agent_workspace/round6/opus-data.md
.agent_workspace/round6/opus-layout.md
.agent_workspace/round7/BRIEF.md
.agent_workspace/round7/fable-arch.md
.agent_workspace/round7/fable-sota.md
.agent_workspace/round7/gpt-perf.md
.agent_workspace/round7/gpt-server.md
.agent_workspace/round7/opus-data.md
.agent_workspace/round7/opus-layout.md
.agent_workspace/round8/BRIEF.md
.agent_workspace/round8/fable-arch.md
.agent_workspace/round8/fable-sota.md
.agent_workspace/round8/gpt-perf.md
.agent_workspace/round8/gpt-server.md
.agent_workspace/round8/opus-data.md
.agent_workspace/round8/opus-layout.md
.agent_workspace/round9/BRIEF.md
.agent_workspace/round9/fable-arch.md
.agent_workspace/round9/fable-sota.md
.agent_workspace/round9/gpt-perf.md
.agent_workspace/round9/gpt-server.md
.agent_workspace/round9/opus-data.md
.agent_workspace/round9/opus-layout.md
scripts/perf-layout-bench.test.ts
server/client-ip.test.ts
server/client-ip.ts
server/collaboration-error.ts
server/collaboration-file-lock.ts
server/collaboration-lifecycle.ts
server/collaboration-routes.ts
server/collaboration-snapshot-store.test.ts
server/collaboration-snapshot-store.ts
server/collaboration-types.ts
server/collaboration-utils.ts
server/host-validation.ts
server/http-utils.ts
server/ipv4-mapped.ts
server/route-methods.ts
server/security.test.ts
server/workspace-auth.ts
src/App.cards.test.tsx
src/App.collaboration.test.tsx
src/App.export.test.tsx
src/App.import.test.tsx
src/App.navigation.test.tsx
src/App.persistence.test.tsx
src/App.settings.test.tsx
src/App.shell.test.tsx
src/App.students.test.tsx
src/App.workflow.test.tsx
src/components/AgentAssistant.test.tsx
src/components/AssetLibraryPanel.test.tsx
src/components/AssetPanel.test.tsx
src/components/GlobalSettingsDrawer.test.tsx
src/components/GlobalSettingsScreen.test.tsx
src/components/HistoryControls.test.tsx
src/components/ProjectMenu.test.tsx
src/components/ProjectWorkbench.test.tsx
src/components/ThemeToggle.test.tsx
src/components/ZoomControls.test.tsx
src/components/agent-assistant-conversation-view.test.tsx
src/components/agent-assistant-conversation-view.tsx
src/components/agent-assistant-model.tsx
src/components/agent-assistant-window.tsx
src/components/asset-panel-library.test.tsx
src/components/asset-panel-library.tsx
src/components/asset-panel-province-appearance.tsx
src/components/asset-panel-upload-sections.test.tsx
src/components/asset-panel-upload-sections.tsx
src/components/asset-panel-uploads.tsx
src/components/canvas/MapLayer.test.tsx
src/components/canvas/PosterCanvas.test.tsx
src/components/canvas/map-data-fills.ts
src/components/canvas/map-data-projection.test.ts
src/components/canvas/map-data-projection.ts
src/components/canvas/map-data-province-style.ts
src/components/canvas/map-data-textures.ts
src/components/canvas/map-layer-image-handles.tsx
src/components/canvas/map-layer-image.tsx
src/components/canvas/map-layer-marks.tsx
src/components/canvas/map-layer-south-sea.tsx
src/components/canvas/map-layer-texture-editor.tsx
src/components/canvas/map-layer-texture-nodes.tsx
src/components/canvas/poster-canvas-geometry.ts
src/components/canvas/poster-canvas-pointer.ts
src/components/canvas/poster-card-placement.ts
src/components/canvas/poster-card-visuals.tsx
src/components/canvas/poster-destination-cards.tsx
src/components/canvas/poster-guest-panel.tsx
src/components/canvas/poster-svg-chrome.tsx
src/components/data-workspace-draft-form.test.tsx
src/components/data-workspace-draft-form.tsx
src/components/data-workspace-fields.tsx
src/components/data-workspace-import-panel.tsx
src/components/data-workspace-import-state.tsx
src/components/data-workspace-student-table.test.tsx
src/components/data-workspace-student-table.tsx
src/components/global-data/global-data-views.ts
src/components/inspector/CanvasInspector.test.tsx
src/components/inspector/MapAdvancedControls.tsx
src/components/inspector/MapEdgeStyleControls.tsx
src/components/studio-editor/GlobalSettingsRoute.tsx
src/components/studio-editor/LegacyEditorChrome.test.tsx
src/components/studio-editor/LegacyEditorChrome.tsx
src/components/studio-editor/LegacyProjectExportDialog.tsx
src/components/studio-editor/LegacySidebarPanels.test.tsx
src/components/studio-editor/LegacySidebarPanels.tsx
src/components/studio-editor/SkipToStageLink.tsx
src/components/studio-editor/StudioBrand.tsx
src/components/studio-editor/StudioStageScreen.tsx
src/components/studio-editor/StudioStatusScreens.test.tsx
src/components/studio-editor/StudioStatusScreens.tsx
src/components/studio-editor/StudioTopbarActions.test.tsx
src/components/studio-editor/StudioTopbarActions.tsx
src/components/studio-editor/WorkbenchBackButton.tsx
src/components/studio-editor/stage-slots.test.tsx
src/components/studio-editor/stage-slots.tsx
src/components/studio-editor/stage-target.ts
src/components/studio-editor/workspace-props.ts
src/components/studio-theme.ts
src/components/use-history-announcement.ts
src/components/workbench/ContinueEditingCard.test.tsx
src/components/workbench/ProjectCard.test.tsx
src/components/workbench/ProjectGrid.test.tsx
src/components/workbench/WorkbenchHeader.test.tsx
src/components/workbench/projects-target.ts
src/hooks/use-collaboration-sync.ts
src/hooks/use-project-actions.ts
src/hooks/use-project-commits.ts
src/hooks/use-project-health.ts
src/hooks/use-resource-library.ts
src/hooks/use-scene-actions.ts
src/hooks/use-studio-chrome.ts
src/hooks/use-studio-navigation.test.ts
src/hooks/use-studio-navigation.ts
src/hooks/use-undo-redo-shortcuts.ts
src/hooks/use-workspace-persistence.ts
src/hooks/use-workspace-session.ts
src/lib/agent-conversation-store.test.ts
src/lib/agent-session-compaction.ts
src/lib/agent-session-snapshot.ts
src/lib/agent-session-tools.test.ts
src/lib/agent-session-tools.ts
src/lib/agent-session.test.ts
src/lib/binary-import.test.ts
src/lib/card-layout-candidates.ts
src/lib/card-layout-connectors.ts
src/lib/card-layout-geometry.ts
src/lib/card-layout-index.test.ts
src/lib/card-layout-index.ts
src/lib/card-layout-manual.ts
src/lib/card-layout-modes.test.ts
src/lib/card-layout-modes.ts
src/lib/card-layout-optimizer.test.ts
src/lib/card-layout-optimizer.ts
src/lib/card-layout-pack.test.ts
src/lib/card-layout-pack.ts
src/lib/card-layout-pinned.test.ts
src/lib/card-layout-pinned.ts
src/lib/card-layout-raster.ts
src/lib/card-layout-saturation.test.ts
src/lib/card-layout-saturation.ts
src/lib/card-layout-scoring.ts
src/lib/card-layout-space.test.ts
src/lib/card-layout-space.ts
src/lib/card-layout-types.ts
src/lib/card-layout-worker-protocol.test.ts
src/lib/card-layout.test.ts
src/lib/collaboration-room-sync.ts
src/lib/content-layout-objects.test.ts
src/lib/content-layout-objects.ts
src/lib/export-poster.test.ts
src/lib/html-table-parse.test.ts
src/lib/html-table-parse.ts
src/lib/image-color-clusters.ts
src/lib/image-color-palette.ts
src/lib/image-color-space.ts
src/lib/image-color-types.ts
src/lib/import-headers.test.ts
src/lib/import-headers.ts
src/lib/layout-perf.test.ts
src/lib/layout-perf.ts
src/lib/poster-card-rows.ts
src/lib/poster-display-frame.ts
src/lib/poster-guest-layout.ts
src/lib/poster-map-geometry.ts
src/lib/print-bleed.journey.test.ts
src/lib/print-bleed.test.ts
src/lib/print-bleed.ts
src/lib/print-preflight.journey.test.ts
src/lib/print-preflight.test.ts
src/lib/print-preflight.ts
src/lib/project-migration-elements.ts
src/lib/project-migration-fields.ts
src/lib/project-migration-helpers.ts
src/lib/project-migration-map.ts
src/lib/project-migration-students.test.ts
src/lib/project-migration-students.ts
src/lib/scene-document-factories.ts
src/lib/scene-document-modules.test.ts
src/lib/scene-document-normalize.ts
src/lib/scene-document-types.ts
src/lib/scene-document-update.ts
src/lib/studio-editor-helpers-locate.test.ts
src/lib/studio-editor-helpers-templates.ts
src/lib/studio-editor-helpers-transactions.ts
src/lib/studio-editor-helpers.test.ts
src/lib/studio-editor-helpers.ts
src/lib/studio-journey.test.ts
src/lib/useCollaborationRoom.test.ts
src/test-utils/app-harness.tsx
src/workers/card-layout.worker.test.ts
```

## 3. Unique feature candidates vs campaign artifacts

### CSV decode

- Candidate branch: `origin/cursor/sota-campaign-6231`.
- New extraction: `src/lib/csv-decode.ts` and `src/lib/csv-decode.test.ts`.
- It is a real, small feature module: fatal UTF-8 decode followed by GB18030 fallback, plus CSV extension/MIME detection.
- Do **not** take it as a new feature on this HEAD without first deciding whether to refactor. HEAD already implements and tests `decodeCsvBytes`/`isCsvFile` in `src/lib/binary-import.ts` and `src/lib/binary-import.csv-decoding.test.ts`, including GB18030, BOM, literal replacement-character, empty-input, view and end-to-end cases. The branch files would currently be an unused duplicate.

### Print bleed / print preflight

- Candidate branch: `origin/cursor/agent-sota-polish-cbcd`.
- Core new files:
  - `src/lib/print-bleed.ts`
  - `src/lib/print-bleed.test.ts`
  - `src/lib/print-bleed.journey.test.ts`
  - `src/lib/print-preflight.ts`
  - `src/lib/print-preflight.test.ts`
  - `src/lib/print-preflight.journey.test.ts`
- This is the strongest unique feature family in the two inventories. `print-bleed.ts` contains reusable mm/px geometry, crop marks, SVG expansion and export-size calculations. `print-preflight.ts` adds font, raster-DPI, transparent-bleed and export-resolution checks.
- It is **not** a drop-in six-file feature. The unit/journey tests rely on companion changes to existing `export-poster.ts`, `scene-document*`, `project-migration.ts`, `resource-health.ts`, `usePosterExport.ts` and delivery UI. Copying the new files does not activate bleed, and some tests will not type-check against HEAD until those existing owners are ported.
- No `App.tsx` rewrite is intrinsically needed: the feature can be wired through scene normalization, export helpers, inspector/delivery workspaces and the existing export hook. The branch's own Round 8 commit touched `App.tsx` by only two lines, but that file should still be hand-ported or avoided rather than checked out.

### Import honesty

There are two distinct useful strands:

1. `origin/cursor/sota-campaign-6231`
   - Privacy/consent gate: `DataImportConsent.tsx` + test and `use-studio-preferences.ts` + test. This is genuinely unique: raw roster text is not sent to third-party AI until explicit consent, denial retains local results, and a remembered denial can be cleared.
   - Honest row accounting and review: `DataImportPanel.tsx`, `DataImportReview.tsx` and tests. These preserve row-level skip reasons and identify unread sheets, but they assume the campaign branch's component decomposition and changed import APIs. HEAD currently owns import orchestration inside `DataWorkspace.tsx`; port behavior there instead of checking out a replacement shell.
   - Input limits: `import-file-limits.ts` + test depends on `image-downscale.ts`. Useful, but HEAD already has a 25 MB workbook guard in `DataWorkspace.tsx`; reconcile limits rather than layering two contradictory policies.
   - Header aliases: `import-aliases.ts` + test is reusable in concept, but HEAD currently has alias logic embedded in `binary-import.ts`/`import-data.ts`. It needs a deliberate refactor to become the single source of truth.
2. `origin/cursor/agent-sota-polish-cbcd`
   - `import-headers.ts` + test is a richer shared header engine (BOM/zero-width cleanup, deterministic aliases, repeated columns, explicit missing-cell reasons).
   - `html-table-parse.ts` + test preserves browser/spreadsheet clipboard table structure, merged cells and typographic spaces.
   - These are valuable, but not drop-in: `html-table-parse.ts` imports `trimImportCell` from `import-data.ts`, which HEAD does not export, and real use requires companion edits to current `import-data.ts`, `binary-import.ts` and the data workspace. None requires taking `App.tsx`.

### Layout health

- `origin/cursor/sota-campaign-6231` has the explicit cache/truth family:
  - `layout-health-cache.ts` + test
  - `render-health.ts` + test
  - `render-facts.ts` + test
  - `render-geometry.ts` + test
  - `PosterCanvas.render-facts-parity.test.tsx`
- The intent is unique and useful: derive health checks from render geometry and cache by a stable, geometry-relevant signature. As-is, `layout-health-cache.ts` imports the branch-only `render-health.ts`; `render-health.ts` in turn requires the whole render-facts/geometry family and companion changes in existing card/render files.
- HEAD already has `src/lib/layout-health-input.ts` and calls it directly from `App.tsx`. A low-risk port should adapt the cache to HEAD's existing `buildProjectLayoutHealthInput` rather than importing the campaign branch's entire rendering stack. Activating that cache eventually needs a small call-site edit or a hook-level integration, not an `App.tsx` checkout.
- `origin/cursor/agent-sota-polish-cbcd` adds `content-layout-objects.ts` + test and `layout-perf.ts` + test, but its “honest layout health” behavior also depends on modifications to existing `layout-health.ts`, card-layout files, `DataQualityPanel` and delivery workspaces. The new files alone do not carry the complete feature.

### Campaign/research artifacts

- All 200 `.agent_workspace/round*/...` paths on the polish branch are round briefs, agent reports, progress inputs, golden-fingerprint tooling or performance baselines. They are campaign evidence, not runtime features, and should not be checked out into the product merge.
- `docs/progress/2026-08-24-sota-campaign.md` on the campaign branch is likewise campaign documentation, though it is outside `.agent_workspace`.
- Many newly named tests/components on both branches are artifacts of large file decompositions rather than self-contained features. A “new path” is not enough evidence to copy it; the source commits often modify or delete the corresponding HEAD owner.

## 4. Recommended allow-listed checkout batches

Every command below names only reviewed paths. None takes `src/App.tsx`, `src/components/AgentAssistant.tsx`, or `server/index.ts`. Do not replace these allow lists with a directory-wide checkout.

### A. Small campaign-branch sources worth staging for a deliberate port

CSV extraction, only if the team explicitly wants to move the already-present decoder out of `binary-import.ts`:

```bash
git checkout origin/cursor/sota-campaign-6231 -- \
  src/lib/csv-decode.ts \
  src/lib/csv-decode.test.ts
```

AI roster-upload consent gate and its preference storage:

```bash
git checkout origin/cursor/sota-campaign-6231 -- \
  src/components/DataImportConsent.tsx \
  src/components/DataImportConsent.test.tsx \
  src/lib/use-studio-preferences.ts \
  src/lib/use-studio-preferences.test.tsx
```

Import size policy with its direct formatter/downscale dependency:

```bash
git checkout origin/cursor/sota-campaign-6231 -- \
  src/lib/image-downscale.ts \
  src/lib/image-downscale.test.ts \
  src/lib/import-file-limits.ts \
  src/lib/import-file-limits.test.ts
```

Shared import aliases:

```bash
git checkout origin/cursor/sota-campaign-6231 -- \
  src/lib/import-aliases.ts \
  src/lib/import-aliases.test.ts
```

Layout-health/render-truth source intake, only as one review batch; expect follow-up adaptation to HEAD and do not expect this checkout alone to be green:

```bash
git checkout origin/cursor/sota-campaign-6231 -- \
  src/lib/render-geometry.ts \
  src/lib/render-geometry.test.ts \
  src/lib/render-facts.ts \
  src/lib/render-facts.test.ts \
  src/lib/render-health.ts \
  src/lib/render-health.test.ts \
  src/lib/layout-health-cache.ts \
  src/lib/layout-health-cache.test.ts \
  src/components/canvas/PosterCanvas.render-facts-parity.test.tsx
```

Do not batch-checkout `DataImportPanel.tsx`/`DataImportReview.tsx` into HEAD yet: their functionality should be ported into the existing `DataWorkspace.tsx` ownership boundary after reconciling APIs.

### B. Small polish-branch sources worth staging for a deliberate port

Print-bleed geometry first. Start with the implementation alone because the branch test also exercises scene-document integration that HEAD does not yet have:

```bash
git checkout origin/cursor/agent-sota-polish-cbcd -- \
  src/lib/print-bleed.ts
```

After hand-porting the existing scene/export owners, bring the verification files:

```bash
git checkout origin/cursor/agent-sota-polish-cbcd -- \
  src/lib/print-bleed.test.ts \
  src/lib/print-bleed.journey.test.ts
```

Print preflight after print bleed and resource-health compatibility are in place:

```bash
git checkout origin/cursor/agent-sota-polish-cbcd -- \
  src/lib/print-preflight.ts \
  src/lib/print-preflight.test.ts \
  src/lib/print-preflight.journey.test.ts
```

Import header engine as a standalone source/test pair:

```bash
git checkout origin/cursor/agent-sota-polish-cbcd -- \
  src/lib/import-headers.ts \
  src/lib/import-headers.test.ts
```

HTML clipboard parser only after exposing/adapting `trimImportCell` in the current import owner:

```bash
git checkout origin/cursor/agent-sota-polish-cbcd -- \
  src/lib/html-table-parse.ts \
  src/lib/html-table-parse.test.ts
```

Polish layout-health inputs/perf instrumentation for source review, not as a complete feature:

```bash
git checkout origin/cursor/agent-sota-polish-cbcd -- \
  src/lib/content-layout-objects.ts \
  src/lib/content-layout-objects.test.ts \
  src/lib/layout-perf.ts \
  src/lib/layout-perf.test.ts \
  scripts/perf-layout-bench.test.ts
```

### Explicit exclusions

Never use either of these broad forms:

```bash
# unsafe: would take huge branch state and protected owners
git checkout origin/cursor/sota-campaign-6231 -- src
git checkout origin/cursor/agent-sota-polish-cbcd -- src server
```

Specifically keep the current versions of:

```text
src/App.tsx
src/components/AgentAssistant.tsx
server/index.ts
```

Recommendation: list/port first, then commit each independently tested feature family. No candidate implementation files were copied during this inventory because CSV is already present in HEAD and the other feature families need compatibility work in existing owner modules.
