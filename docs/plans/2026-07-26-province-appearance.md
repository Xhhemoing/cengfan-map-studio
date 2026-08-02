# Province Appearance Implementation Plan

## Goal

Unify province appearance into one persisted, rendered state so each province can use a default regional feature, a user-uploaded texture, heat-map coloring, or a manually selected color. Add canvas background controls that optionally show through zero-count provinces, then reorganize the materials panel around those workflows.

## Decisions

- Province base appearance is a single persisted record. A province cannot render both a base texture and a movable `province-texture` asset.
- Existing movable province-texture assets migrate into the base appearance only when their province has no configured base texture; remaining legacy instances continue to render for compatibility until explicitly removed.
- Appearance precedence is `feature/texture > manual color > heat scale > empty province rule`.
- Heat colors are normalized against the highest non-zero province count in the active project.
- Canvas background is the sole source for the optional transparent empty-province effect.

## Task 1: Model, migration, and renderer contracts

**Acceptance criteria**
- `MapSettings` represents heat/manual fill mode and whether empty provinces show the canvas background.
- Each province has at most one explicit appearance mode: default, feature, texture, or manual color.
- Legacy `fill` / `textureSrc` project values restore into the new model without losing visual output.
- Map fill resolver chooses texture, manual color, normalized heat color, or transparent/land fill in the documented order.

**Verification**
- Focused unit and component tests cover each precedence path and migration.
- `npm run test -- --run` for the touched tests passes.

## Task 2: Map rendering and canvas background integration

**Acceptance criteria**
- The main canvas supplies a heat palette and visibly uses multiple heat steps.
- Empty provinces become transparent when enabled and keep their boundaries/labels.
- Texture fit is deterministic in SVG and survives SVG serialization.
- Export receives the same SVG layers as the editing canvas.

**Verification**
- `MapDataLayer`, `MapLayer`, and `PosterCanvas` tests pass.
- Production build passes.

## Task 3: Province-first materials workflow

**Acceptance criteria**
- Materials panel has fixed province selection and mode controls with an independently scrolling content area.
- Default regional feature applies and selects its associated province in one action.
- Uploading a province texture replaces that province's base appearance.
- Users can choose a heat palette, set a manual province color, clear an override, choose a background, and toggle empty-province background visibility.
- Landmark and decoration workflows remain available and separate from province base styling.

**Verification**
- Asset panel behavior tests cover callbacks and selection behavior.
- Browser check covers desktop and narrow viewport, no console errors, and no overflow.

## Task 4: Default regional feature catalog coverage

**Acceptance criteria**
- Every valid map feature has an associated default feature entry.
- Entries use the feature's canonical province name, excluding invalid/empty GeoJSON records.
- Feature selection remains usable with grouped/searchable display.

**Verification**
- Asset catalog test checks complete canonical coverage.

## Task 5: Persistence, templates, and final regression

**Acceptance criteria**
- Save/restore, history, custom template export/import retain all new appearance and background properties.
- Existing project payloads load safely.
- Full test suite, lint, and production build pass.
- Browser screenshot inspection confirms map state reaches the canvas.

**Verification**
- `npm run test`
- `npm run lint`
- `npm run build`

## Dependencies

Task 1 precedes all tasks. Tasks 2 and 3 can proceed in parallel after Task 1. Task 4 can proceed in parallel with Tasks 2 and 3. Task 5 follows all other tasks.
