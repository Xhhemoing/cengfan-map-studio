# Round 2 Agent B — `optimize-studio-ux-7077` per-file resolution plan

**Status:** DID NOT MERGE. Tree is busy with another merge.

- Current branch: `cursor/merge-all-branches-e17a` @ `e760174`
- In-progress merge: `origin/cursor/canvas-render-display-46a1` (`MERGE_HEAD` present)
- Unmerged paths owned by that merge: `src/App.tsx`, `src/components/canvas/PosterCanvas.reference-styles.test.tsx`, `src/components/canvas/useCardLayoutWorker.test.tsx`, `src/lib/card-layout-cache.ts`, `src/lib/card-layout-cache.test.ts`
- This file is the fallback required by the task. Do not `git add` / commit it into the canvas merge.

**Incoming tip:** `origin/cursor/optimize-studio-ux-7077` @ `373d91b` (11 unique commits; **covers** `reorder-function-entries-7077` @ `fd443e0`, skip that branch).

**Policy (do not relax):**

1. Finish the canvas merge first. Then: `git merge origin/cursor/optimize-studio-ux-7077`.
2. Keep HEAD `App.tsx` decomposition (`src/components/editor/*`, `src/lib/editor-navigation-actions.ts`). **Do not take their 2498-line `App.tsx` rewrite.**
3. Port UX copy/flow only: **名单 → 地图 → 版式 → 内容 → 交付**, ProjectMenu **导出 PNG**, stage-overview **下一步** cards, frame live canvas + style rail, data-stage asset-library removal, public-path settings jump to stages.

---

## Why Round 1 conflict list is incomplete

Round 1 `merge-tree` vs opt-continuous predicted 4 files / 11 hunks:

| File | R1 hunks |
| --- | ---: |
| `src/App.tsx` | 5 |
| `src/App.test.tsx` | 2 |
| `src/components/ProjectMenu.tsx` | 1 |
| `src/components/workspaces/ReferenceCardStyleWorkspace.test.tsx` | 3 |

User also listed `src/components/workspaces/DeliveryWorkspace.tsx`. HEAD has since split App tests and extracted `StageLayoutScreen`. After the canvas merge, **re-run** `git merge-tree --write-tree --name-only HEAD origin/cursor/optimize-studio-ux-7077` — expect extra conflicts in `ReferenceCardStyleWorkspace.tsx` (canvas already rewrote it) and possibly `DeliveryWorkspace.tsx` / `App.test.tsx` (HEAD split).

---

## Execution after canvas merge is committed

```bash
# 1. Confirm idle tree
test ! -f .git/MERGE_HEAD && git status --porcelain

# 2. Preview
git merge-tree --write-tree --name-only HEAD origin/cursor/optimize-studio-ux-7077

# 3. Merge, then resolve using the tables below
git merge --no-ff origin/cursor/optimize-studio-ux-7077 \
  -m "merge(r2-b): optimize-studio-ux-7077 into decomposed editor (名单→交付)"
```

If `git merge` reports `App.tsx` conflict: **checkout ours immediately**, then port the small wiring listed in §App / §StageLayoutScreen / §editor-navigation. Never `git checkout --theirs -- src/App.tsx`.

```bash
git checkout --ours -- src/App.tsx
```

---

## A. Auto-take theirs (no App rewrite; expect clean or trivial)

Take incoming content as-is (or `--theirs` if a docs/copy hunk collides). These files do not rewrite the editor shell.

| File | Port |
| --- | --- |
| `src/lib/workflow-stages.ts` | `WORKFLOW_STAGES` labels/descriptions → 名单/地图/版式/内容/交付. Keep HEAD mapping tables (`LEGACY_*`). |
| `src/lib/workflow-stages.test.ts` | Expected labels → 名单/地图/版式/内容/交付. |
| `src/lib/stage-metadata.ts` | `data.rightRailLabel` → `"数据质量"`; `frame.rightRailLabel` → `"版式与展示框样式"`. |
| `src/lib/stage-overview.ts` | Healthy-stage next-step cards (see §Overview). |
| `src/lib/stage-overview.test.ts` | `data-clean` points to map; new `map-next` / `frame-next` / `content-next` cases. |
| `src/components/DataWorkspace.tsx` | Incoming (hide duplicate title / template download restore). |
| `src/components/workspaces/DataUploadWorkspace.tsx` + `.test.tsx` | Drop `assetPanelProps` / `onCreateDecoration`; aria-label **名单工作台**; restore template download via `hideWorkbenchHeader` (not `hideTemplateDownload`). |
| `src/components/workspaces/MapStyleWorkspace.tsx` + `.test.tsx` | aria-label **地图** / **地图预览**. |
| `src/components/workspaces/ContentLayoutWorkspace.tsx` + `.test.tsx` | aria-label **内容**; 返回地图; asset `<details>` open only when `selection.type === "canvas"`; aria-label **素材库**. |
| `src/components/workspaces/DeliveryWorkspace.tsx` + `.test.tsx` | See §Delivery. |
| `src/components/StudioAssistantRail.tsx` + `.test.tsx` | See §Rail. |
| `src/components/StudioEditorShell.test.tsx` | Guide aria-label copy. |
| `src/components/StudioLayoutTemplate.tsx` | Comment copy only. |
| `src/components/WorkflowStageStepper.test.tsx` | Step labels. |
| `src/components/workflow-workspaces.css` | Incoming +1. |
| `src/styles.css` | Incoming UX rules (keep any canvas-merge CSS). |
| `README.md` / `USER_GUIDE.md` | Step names 名单→交付. |
| `src/components/ProjectMenu.test.tsx` | **New file** — take theirs; add optional collab props if types require (`roomExpired?` etc. already optional on HEAD). |

---

## B. Round 1 conflict files — exact resolution

### 1. `src/App.tsx` — KEEP OURS, port 6 small wirings

Their file is still a 2498-line monolith (`buildStageSlots` inline). HEAD is ~1994 and delegates stages to `StageLayoutScreen`. **Discard every incoming hunk that reintroduces `buildStageSlots` / `openStudioSettings` / `mapStyleAssetPanelProps` into App.**

After `--ours`, edit HEAD `App.tsx` only:

| # | Port | Where on HEAD |
| --- | --- | --- |
| 1 | ProjectMenu PNG shortcut | `projectExportActions` `<ProjectMenu>`: add `onExportPng={() => void posterExport.exportPng()}`. (Delivery/StageLayout already have this.) |
| 2 | Rename asset-panel owner | `mapStyleAssetPanelProps` → `contentAssetPanelProps`; add `onCreateDecoration: handleCreateDecoration` (or the extracted library action). Pass the same object into `StageLayoutScreen` as `assetPanelProps`. |
| 3 | Do **not** re-open GlobalSettings on public path | Do not add their `openStudioSettings` / `openDataDiagnostics` / `openRenderSettings` into App. Port into `src/lib/editor-navigation-actions.ts` (below). App already destructures those from `createEditorNavigationActions`. |
| 4 | `advancedMode` | `<StudioAssistantRail advancedMode={legacyEditorEnabled ? "legacy-settings" : "stage-nav"} />`. |
| 5 | History toolbar label | `historyActionsNode`: `label="历史与缩放"` → `label="历史"` (matches their App.test). |
| 6 | Do **not** paste `moveCardTo` / `moveGuestsTo` into App if `StageLayoutScreen` already receives `onMoveCard` / `onMoveGuests` from existing canvas actions. Reuse those props; only extract helpers if a new frame-stage call site needs them in App. |

**Do not take:** CardsInspector import removal in App (already gone), their inline frame-stage `ReferenceCardStyleRail` JSX, their data-stage asset-panel deletions inside App (those belong in `StageLayoutScreen`).

### 2. `src/App.test.tsx` — KEEP HEAD split, update copy + add UX pins

HEAD already split the R1-conflicting cases into:

- `src/app-test-harness.tsx` — `openGlobalData` / `leaveFocusedWorkspace` still use **数据与素材** / **内容与排版**
- `src/App.test.tsx` — 最终导出 / 数据与素材工作台
- `src/App.stage-workbenches.test.tsx` — frame/data/map workbench pins
- `src/App.workflow-guidance.test.tsx` — stepper labels
- `src/App.shell-layout.test.tsx` — `[stageLabel, rightRailLabel]` pairs
- `src/App.data-and-canvas.test.tsx` — 展示框样式 / 内容与排版

**Resolution:** do not accept their monolithic `App.test.tsx`. Mechanically replace labels across the split files:

| Old (HEAD) | New (UX) |
| --- | --- |
| `数据与素材` | `名单` |
| `数据与素材工作台` | `名单工作台` |
| `地图样式` | `地图` |
| `展示框样式` | `版式` |
| `展示框公共样式` | `版式与展示框样式` |
| `内容与排版` | `内容` |
| `最终导出` | `交付` |
| `历史与缩放` | `历史` |
| `数据质量与素材` | `数据质量` |

Then port **behavior** pins from their `App.test.tsx` (not just strings):

- Frame workbench: `main[aria-label="版式"] svg.poster` exists; style options **not** inside main; 4 `.reference-card-style-option` in `aside[aria-label="版式与展示框样式"]`; `.template-picker` in that aside.
- Public advanced: no `打开全局设置`; click `前往版式` → land on 版式, `全局设置` screen stays null. Legacy flag still opens GlobalSettings.
- Empty roster: assistant default tab is **本阶段** (their P2).
- PNG from ProjectMenu: `button[aria-label="导出 PNG"]` (covered by new `ProjectMenu.test.tsx`; optional App pin).

Their `openGlobalData` helper change is `workflowStage(..., "名单")` — apply in `src/app-test-harness.tsx`.

### 3. `src/components/ProjectMenu.tsx` — take PNG hunk, keep HEAD collab copy

Incoming vs merge-base is a 5-line add (`ImageDown`, `onExportPng` prop + button before 导出 SVG).

HEAD added persistence/offline/expired notes and extra optional props. **Keep all HEAD collaboration UI.**

Resolution:

```ts
// props
onExportPng: () => void;
// import
import { ..., ImageDown, ... } from "lucide-react";
// in 导出海报 section, before 导出 SVG:
<button type="button" aria-label="导出 PNG" onClick={onExportPng}>
  <ImageDown size={16} /> 导出 PNG
</button>
```

Wire callers: App `projectExportActions` (above) and any other `<ProjectMenu>` (grep). Tests that construct `ProjectMenuProps` must pass `onExportPng`.

### 4. `src/components/workspaces/DeliveryWorkspace.tsx` — take copy + all-clear, keep HEAD rail API

Incoming:

- `<main aria-label="交付">` (was 最终导出)
- When `dataIssues/layoutIssues/resourceIssues/fontIssues` all empty, render:

```tsx
<p className="delivery-workspace__all-clear" role="status">
  检查全部通过：{visibleStudents.length} 人 · 覆盖 {provinceCount} 个省市，可直接导出。
</p>
```

`provinceCount` = unique `student.province?.trim() || resolveStudentLocation(student).province` among visible students.

HEAD already has `onExportPng` on `DeliveryRail`. Keep HEAD export-button wiring. If canvas/market merge added print-size lines, keep those and add the all-clear block above `CheckSection`s.

Tests (`DeliveryWorkspace.test.tsx`):

- `main[aria-label="交付"]`
- Existing issue case: `.delivery-workspace__all-clear` is null
- New case: empty issues + `sampleStudents` → status contains `检查全部通过`, `/\d+ 人/`, `/\d+ 个省市/`

### 5. `src/components/workspaces/ReferenceCardStyleWorkspace.test.tsx` — rewrite to new API

Incoming +118/−~20: workspace is now a live `PosterCanvas`; style grid + `CardsInspector` + `TemplatePicker` live in `ReferenceCardStyleRail`.

Canvas-merge may have already edited this test (file is staged in the in-progress merge). After canvas lands:

1. Take incoming test **structure** (rail vs workspace split, live canvas assertions).
2. Re-apply any canvas-specific pins the canvas merge added (destination-card / presentation attributes). Do not drop those.
3. Update `aria-label` from 展示框样式 → **版式** (workspace) / **版式与展示框样式** (rail).

---

## C. HEAD-only files that must receive the UX (or the merge is incomplete)

Their App hunks that used to live in `buildStageSlots` now belong here.

### `src/components/editor/StageLayoutScreen.tsx`

This is the real substitute for their App.tsx stage JSX.

**data stage**

- Drop `assetPanelProps` / `onCreateDecoration` from `DataUploadRail` and `DataUploadWorkspace`.
- Workspace props: pass `dataWorkspaceProps` as-is (their path restores template download). Do **not** keep HEAD’s `hideTemplateDownload: true`. If DataWorkspace still needs a hidden duplicate header, use incoming `hideWorkbenchHeader`.
- `StageLayoutScreenProps.onCreateDecoration` can stay for map/content if still used; it must not be passed into data rail/workspace.

**frame stage**

Replace `CardsInspector` + style-grid workspace with:

```tsx
rightRail: (
  <ReferenceCardStyleRail
    cards={project.cards}
    userFonts={userFonts}
    templates={/* 5 system templates: original/cartoon/grain/q/scenery */}
    currentTemplateId={template}
    customTemplates={customTemplates.map(({ id, name, scope }) => ({ id, name, scope }))}
    onApplyTemplate={applySystemTemplate}
    onApplyCustomTemplate={...}
    onSaveTemplate={saveCurrentTemplate}
    onPatch={patchCards}
    onResetCards={resetCards}
  />
),
workspace: (
  <ReferenceCardStyleWorkspace
    project={renderProject}
    selection={selection}
    userFonts={userFonts}
    onSelect={onSelect}
    onMoveCard={onMoveCard}
    onMoveGuests={onMoveGuests}
    onCardPositionsResolved={onCardPositionsResolved}
  />
),
```

Add props to `StageLayoutScreenProps` for template apply/save if they are not already there (`template`, `customTemplates`, `onApplyTemplate`, …). **Do not push this JSX back into App.tsx.**

**content stage**

- Toolbar: `返回地图样式` → `返回地图`.
- `assetPanelProps` already received from App; after App rename it is the content-owned panel (includes `onCreateDecoration`).

### `src/components/workspaces/ReferenceCardStyleWorkspace.tsx`

Take incoming split:

- `ReferenceCardStyleOptions` — 4 presentation tiles (keep canvas-merge presentation ids if they differ; union, don’t regress).
- `ReferenceCardStyleRail` — TemplatePicker + options + CardsInspector; `aria-label="版式与展示框样式"`.
- `ReferenceCardStyleWorkspace` — live `PosterCanvas`; `aria-label="版式"`.

If canvas merge changed `PosterCanvas` props (pan/origin/metrics), **adapt incoming workspace to HEAD/canvas canvas API**. Do not revert canvas `PosterCanvas` to the UX-branch snapshot.

### `src/lib/editor-navigation-actions.ts` (+ `.test.ts`)

Public (non-legacy) settings must jump to stages, not GlobalSettings. Need a `legacyEditorEnabled` (or `settingsMode`) dep:

```ts
openStudioSettings: () => {
  if (deps.legacyEditorEnabled) {
    setActiveWorkflowStep("layout");
    setSettingsSection("canvas");
    return;
  }
  // same as changeWorkflowStage("frame")
  deps.change-or-inline: setSettingsSection(null); setActiveStage("frame"); ...
},
openDataDiagnostics: () => {
  if (deps.legacyEditorEnabled) { setSettingsSection("cards"); return; }
  // jump to data (openGlobalData)
},
openRenderSettings: () => {
  if (deps.legacyEditorEnabled) { setSettingsSection("advanced"); return; }
  // jump to content
},
```

`runStageOverviewAction({ kind: "data-diagnostics" })` on the public path should land on **名单**, not open GlobalSettings cards.

Update `editor-navigation-actions.test.ts`:

- Default harness (public): `openStudioSettings` → stage `frame`, **no** settings section; `openDataDiagnostics` → data/roster; `openRenderSettings` → content.
- Harness with `legacyEditorEnabled: true`: keep today’s assertions (`layout`+`canvas`, `cards`, `advanced`).

Pass `legacyEditorEnabled` from App into `createEditorNavigationActions`.

### `src/components/StudioAssistantRail.tsx`

Port incoming `advancedMode?: "stage-nav" | "legacy-settings"` (default `"stage-nav"`):

- Empty roster: initial tab `"stage"` else `"ai"`.
- Data diagnostics subtitle appends ` · 前往名单阶段处理` unless legacy-settings.
- Render interval: read-only meta line on stage-nav; button only on legacy-settings.
- Developer: `前往版式` (`aria-label="前往版式"`) on stage-nav; `打开全局设置` on legacy-settings.

Wire from App as in §App row 4.

### `src/lib/stage-overview.ts` (next-step cards)

| Stage | When | Card |
| --- | --- | --- |
| data | no warning cards | `data-clean` question `名单数据健康 · 下一步：地图`, `action: { kind: "stage", stage: "map" }` |
| map | `unresolved === 0` | `map-next` 「下一步：版式」 → `frame` |
| frame | `!hasOverflow` | `frame-next` 「下一步：内容」 → `content` |
| content | no layout issues | `content-next` 「下一步：交付」 → `export` |

`action.kind === "stage"` already works in `runStageOverviewAction`. Keep `MAX_OVERVIEW_CARDS` cap (`slice`).

---

## D. Label sweep (HEAD split tests / comments)

Grep and update after merge (do not leave mixed old/new labels):

```
数据与素材|地图样式|展示框样式|内容与排版|最终导出|历史与缩放|数据质量与素材|返回地图样式
```

Known extra files beyond incoming diff:

- `src/app-test-harness.tsx`
- `src/App.shell-layout.test.tsx`
- `src/App.stage-workbenches.test.tsx`
- `src/App.workflow-guidance.test.tsx`
- `src/App.data-and-canvas.test.tsx`
- `src/App.lifecycle-seams.test.tsx`
- `src/components/editor/legacy-editor-panes.test.tsx` / `editor-shells.test.tsx` only if they assert public stepper labels (legacy editor may keep old GlobalSettings copy).

Do **not** rename card-template names (校徽开放名单 etc.) or guest-panel titles.

---

## E. Commit / do not push

```
merge(r2-b): optimize-studio-ux-7077 into decomposed editor (名单→交付)
```

Body should say: kept `src/components/editor/*`; ported step copy, PNG shortcut, next-step cards, frame live canvas, data-stage asset-library removal; skipped `reorder-function-entries-7077` (ancestor). **Do not push** (task rule).

---

## F. Verification (after resolve, before considering done)

Do not run the full suite in parallel with other heavy jobs.

```bash
npx vitest run \
  src/lib/workflow-stages.test.ts \
  src/lib/stage-overview.test.ts \
  src/lib/editor-navigation-actions.test.ts \
  src/components/ProjectMenu.test.tsx \
  src/components/WorkflowStageStepper.test.tsx \
  src/components/StudioAssistantRail.test.tsx \
  src/components/workspaces/DataUploadWorkspace.test.tsx \
  src/components/workspaces/MapStyleWorkspace.test.tsx \
  src/components/workspaces/ContentLayoutWorkspace.test.tsx \
  src/components/workspaces/DeliveryWorkspace.test.tsx \
  src/components/workspaces/ReferenceCardStyleWorkspace.test.tsx \
  src/App.stage-workbenches.test.tsx \
  src/App.workflow-guidance.test.tsx \
  src/App.shell-layout.test.tsx \
  src/App.test.tsx
```

Acceptance pins:

- Stepper: 名单 → 地图 → 版式 → 内容 → 交付
- Default public app: `main[aria-label="名单工作台"]`; no 素材库 tab on data rail; template download visible
- 版式: live `svg.poster` in main; 4 style options + template picker in right rail
- Project menu: `导出 PNG` calls `exportPng`
- Healthy overview: next-step cards fire `action.kind === "stage"`
- Public advanced: `前往版式` does not open GlobalSettings; empty roster opens 本阶段 tab
- `src/App.tsx` stays decomposed (no 2400+ line rollback); `src/components/editor/StageLayoutScreen.tsx` still owns slots

---

## G. Rollback

`git revert` the merge commit. No data/API/export-format change. Card-template / canvas render behavior must remain the canvas-merge versions if that merge already landed.

---

## Incoming commit map (for cherry-pick fallback)

If `git merge` is too dirty after canvas, cherry-pick in order and skip App.tsx hunks each time:

1. `ac78291` workflow labels  
2. `f98573c` data-stage drop asset library  
3. `fd443e0` settings → stage (port to `editor-navigation-actions`, not App)  
4. `8f0a9cc` short workspace titles  
5. `06f4b26` rail advancedMode  
6. `27f3e02` docs  
7. `5c8c4cd` template download restore  
8. `2113c2e` frame live canvas + rail (port to `StageLayoutScreen` + ReferenceCard*)  
9. `2348ea5` next-step cards  
10. `dcb92c9` ProjectMenu PNG  
11. `373d91b` P2: empty-roster 本阶段, delivery all-clear, asset library collapse  

Never cherry-pick into a tree that still has `MERGE_HEAD`.
