# Notion-Inspired Editor Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the default Atelier editor skin into a calmer, rounded, high-density operating workspace while keeping all ProjectDocument edits, workflow stages, inspector controls, keyboard access, and responsive paths intact.

**Architecture:** Keep the existing plain-CSS styling system and Atelier skin token boundary. Add small presentational layout wrappers only where they encode a real editing relationship: paired position fields and paired size fields. The right inspector remains the owner of object properties; this work changes grouping, spacing, radii, controls, and visual hierarchy rather than project state or transactional behavior.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Lucide, plain CSS in `src/styles.css`.

## Global Constraints

- Preserve `ProjectDocument` as canonical state; this is a presentation-only change and must not alter schema, transactions, undo/redo, import/export, or AI preview behavior.
- Preserve every existing input `id`, label association, ARIA label, and callback contract unless a test is updated to verify an equivalent accessible relationship.
- Keep the six-stage workflow at the top, the single canvas, docked assistant rail, responsive inspector access, and existing Atelier/classic skin behavior.
- Use existing CSS tokens; add no UI library or CSS framework.
- Default skin remains `atelier`; classic skin remains supported.
- Use neutral paper surfaces, restrained green only for selected/primary state, 8px panel/group radius, 6px compact controls, and no decorative gradients or new card nesting.
- Use familiar Lucide icons only where an icon button already exists; do not replace command labels with ambiguous icons.
- Treat position and size as compact grouped controls: X/Y share one `property-panel__pair` row, width/height share one row, while keeping each field individually labelled and focusable.
- At widths under 760px, retain 44px touch targets for top-level/icon controls and allow paired properties to remain readable without horizontal overflow.

---

## File Structure

- Modify: `src/components/inspector/InspectorPanel.tsx` only if a small shared inspector grouping wrapper is needed; do not change selection routing.
- Modify: `src/components/inspector/CanvasInspector.tsx` to group canvas width/height compactly.
- Modify: `src/components/inspector/MapInspector.tsx` to group map X/Y, width/height, and image-alignment X/Y and width/height controls.
- Modify: `src/components/inspector/CardsInspector.tsx` to group cards X/Y in both placement and full modes.
- Modify: `src/components/inspector/GuestsInspector.tsx` to use the shared compact pair treatment for its existing placement grid.
- Modify: `src/components/inspector/TextInspector.tsx` to group text X/Y.
- Modify: `src/components/inspector/AssetInspector.tsx` to group asset X/Y and width/height.
- Modify: `src/components/workspaces/FixedFrameEditor.tsx` to group local X/Y and width/height while retaining all IDs and fixed-frame update behavior.
- Modify: `src/styles.css` to define Atelier-scoped visual tokens/recipes, compact property pairs, refined inspector rails, component surface radii, typography, focus/press states, and responsive overrides.
- Modify: focused Vitest files listed below to make structural grouping and key behavior regression-testable.

## Task 1: Establish Compact Property Pair Semantics

**Files:**
- Modify: `src/components/inspector/CanvasInspector.tsx`
- Modify: `src/components/inspector/TextInspector.tsx`
- Modify: `src/components/inspector/AssetInspector.tsx`
- Modify: `src/components/inspector/GuestsInspector.tsx`
- Modify: `src/components/workspaces/FixedFrameEditor.tsx`
- Modify: `src/components/inspector/InspectorPanel.test.tsx`
- Modify: `src/components/workspaces/DisplayFrameWorkspace.test.tsx`

**Interfaces:**
- Consumes: existing `DeferredInput`, inspector `onPatch` callbacks, and fixed-frame `onChange` callbacks.
- Produces: semantic `.property-panel__pair` wrappers containing exactly two existing labelled number controls; all existing input IDs remain unchanged.

- [ ] **Step 1: Write focused failing assertions**

Add assertions for the semantic wrappers without weakening existing behavior assertions:

```tsx
expect(container.querySelector('.property-panel__pair[data-property-pair="canvas-size"] #canvas-width')).not.toBeNull();
expect(container.querySelector('.property-panel__pair[data-property-pair="canvas-size"] #canvas-height')).not.toBeNull();
expect(container.querySelector('.display-frame-item__pair[data-property-pair="name-position"] #display-frame-fixed-name-x')).not.toBeNull();
expect(container.querySelector('.display-frame-item__pair[data-property-pair="name-size"] #display-frame-fixed-name-width')).not.toBeNull();
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
npx vitest run src/components/inspector/InspectorPanel.test.tsx src/components/workspaces/DisplayFrameWorkspace.test.tsx
```

Expected: FAIL because the compact-pair wrappers do not yet exist.

- [ ] **Step 3: Add minimal semantic grouping markup**

Wrap only naturally paired controls. Retain the exact `DeferredInput` props and callbacks. Example:

```tsx
<div className="property-panel__pair" data-property-pair="text-position">
  {number("x", text.x, 0, 6000, "X", "text-x")}
  {number("y", text.y, 0, 6000, "Y", "text-y")}
</div>
```

For the fixed-frame editor, use `display-frame-item__pair property-panel__pair` and distinct `data-property-pair` values per item such as `${item.id}-position` and `${item.id}-size`.

- [ ] **Step 4: Run focused tests and verify pass**

Run:

```bash
npx vitest run src/components/inspector/InspectorPanel.test.tsx src/components/workspaces/DisplayFrameWorkspace.test.tsx
```

Expected: PASS; existing numeric commits still patch exactly the same properties.

- [ ] **Step 5: Inspect changed markup for accessibility**

Verify each paired field still has its existing unique `label htmlFor` and input `id`; no shared label or hidden text replaces individual field labels.

## Task 2: Apply Pair Semantics to Map and Card Placement

**Files:**
- Modify: `src/components/inspector/MapInspector.tsx`
- Modify: `src/components/inspector/CardsInspector.tsx`
- Modify: `src/components/inspector/MapInspector.test.tsx`
- Modify: `src/components/inspector/CardsInspector.test.tsx`

**Interfaces:**
- Consumes: existing `MapInspector` modes (`all`, `global`, `placement`) and `CardsInspector` modes.
- Produces: map position/size pairs, card position pair, and image-alignment position/size pairs with no changed patch payloads.

- [ ] **Step 1: Write failing structural tests**

Add assertions for all mode-relevant controls:

```tsx
expect(container.querySelector('[data-property-pair="map-position"] #map-x')).not.toBeNull();
expect(container.querySelector('[data-property-pair="map-size"] #map-width')).not.toBeNull();
expect(container.querySelector('[data-property-pair="cards-position"] #cards-x')).not.toBeNull();
```

When rendering an image-map alignment state, also assert:

```tsx
expect(container.querySelector('[data-property-pair="map-image-position"] #map-align-x')).not.toBeNull();
expect(container.querySelector('[data-property-pair="map-image-size"] #map-align-width')).not.toBeNull();
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
npx vitest run src/components/inspector/MapInspector.test.tsx src/components/inspector/CardsInspector.test.tsx
```

Expected: FAIL because the wrappers do not yet exist.

- [ ] **Step 3: Implement groups without changing control behavior**

In `MapInspector`, wrap placement X/Y and width/height separately. In the image-alignment subsection, wrap alignment X/Y and width/height separately. In `CardsInspector`, use a shared `cardPlacementControls` JSX fragment so the placement-only and full inspector do not drift.

```tsx
const cardPlacementControls = <>
  <div className="property-panel__pair" data-property-pair="cards-position">
    {number("x", cards.x, 0, 6000, "X")}
    {number("y", cards.y, 0, 6000, "Y")}
  </div>
  {number("maxWidth", cards.maxWidth, 80, 6000, "卡片宽度（画布像素）")}
</>;
```

- [ ] **Step 4: Run focused tests and verify pass**

Run:

```bash
npx vitest run src/components/inspector/MapInspector.test.tsx src/components/inspector/CardsInspector.test.tsx
```

Expected: PASS, including existing image source and patch-payload coverage.

- [ ] **Step 5: Type-check the changed inspector files**

Run:

```bash
npx tsc -p tsconfig.app.json --noEmit
```

Expected: exit code 0.

## Task 3: Implement the Notion-Inspired Atelier Density and Surface Recipe

**Files:**
- Modify: `src/styles.css`
- Test: `src/components/inspector/InspectorPanel.test.tsx`
- Test: `src/components/StudioAssistantRail.test.tsx`
- Test: `src/components/workspaces/MapStyleWorkspace.test.tsx`
- Test: `src/components/workspaces/ContentLayoutWorkspace.test.tsx`

**Interfaces:**
- Consumes: `data-editor-skin="atelier"`, established `--editor-*` tokens, `.property-panel`, `.studio-assistant-rail`, workspace classes, and compact-button components.
- Produces: CSS-only presentation refinement. No TypeScript props, persisted preferences, or project data interfaces change.

- [ ] **Step 1: Add a CSS regression test boundary where meaningful**

Do not snapshot visual CSS. Extend component tests only to confirm the new compact pair class exists from Tasks 1–2 and preserve existing semantic labels/ARIA. Avoid brittle computed-style assertions in jsdom.

- [ ] **Step 2: Add an Atelier-scoped compact editing recipe**

At the end of the Atelier rules in `src/styles.css`, add a focused override block. It must:

```css
.app-shell[data-editor-skin="atelier"] {
  --atelier-radius-panel: 10px;
  --atelier-radius-control: 7px;
  --atelier-space-1: 4px;
  --atelier-space-2: 8px;
  --atelier-space-3: 12px;
}
.app-shell[data-editor-skin="atelier"] .property-panel__pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--atelier-space-1);
}
```

Use these tokens to make the Inspector calmer and denser: 8px panel rhythm, 6–7px control corners, 10px group corners, one subtle border for structural separation, and neutral raised surfaces. Avoid a new shadow on every group; reserve low-opacity shadows for selected segmented controls and floating/popover surfaces.

- [ ] **Step 3: Refine main operating surfaces**

Apply the same system to:

- right-side inspectors and property fieldsets;
- the `AI 助手 / 高级功能` tab strip and advanced groups;
- compact buttons, segmented controls, and property inputs;
- map/content workspace inspector rails and central canvas framing;
- display-frame control pane and its fixed-frame fieldsets.

Keep the canvas itself visually primary. Do not put the canvas in a decorative card. Increase usable inspector width only when it improves two-column compact pairs; do not reduce the central canvas below its current practical minimum.

- [ ] **Step 4: Add responsive rules**

At `max-width: 760px`, retain two-column property pairs only when each field has a usable width. If the available rail becomes narrow, collapse `.property-panel__pair` and `.display-frame-item__pair` to one column. Preserve the existing 44px mobile top-level and icon controls.

- [ ] **Step 5: Run targeted visual-behavior tests**

Run:

```bash
npx vitest run src/components/inspector/InspectorPanel.test.tsx src/components/inspector/MapInspector.test.tsx src/components/inspector/CardsInspector.test.tsx src/components/StudioAssistantRail.test.tsx src/components/workspaces/MapStyleWorkspace.test.tsx src/components/workspaces/ContentLayoutWorkspace.test.tsx src/components/workspaces/DisplayFrameWorkspace.test.tsx
```

Expected: PASS.

## Task 4: Integrate, Audit, and Verify the Polished Workbench

**Files:**
- Modify: `src/App.test.tsx` only if an existing integration test needs to navigate to a relocated but behaviorally identical control.
- Modify: `.learnings/ERRORS.md` only if a command or visual-verification tool fails unexpectedly, recording cause and follow-up.

**Interfaces:**
- Consumes: Task 1–3 markup and CSS.
- Produces: verification evidence; no feature work beyond narrowly needed test adjustments.

- [ ] **Step 1: Run integration tests**

Run:

```bash
npx vitest run src/App.test.tsx src/components/AgentAssistant.test.tsx src/components/StudioAssistantRail.test.tsx src/components/inspector/InspectorPanel.test.tsx src/components/inspector/MapInspector.test.tsx src/components/inspector/CardsInspector.test.tsx src/components/workspaces/MapStyleWorkspace.test.tsx src/components/workspaces/ContentLayoutWorkspace.test.tsx src/components/workspaces/DisplayFrameWorkspace.test.tsx
```

Expected: PASS. If a test fails, document failure → root-cause hypothesis → minimal fix → rerun the same command.

- [ ] **Step 2: Run static and production checks**

Run:

```bash
npx tsc -p tsconfig.app.json --noEmit
npm run lint
npm run build
git diff --check
```

Expected: each exits successfully. Record existing non-fatal Vite chunk-size warning separately from failures.

- [ ] **Step 3: Run the Impeccable detector once after editing**

Run:

```bash
node "C:/Users/86080/.agents/skills/impeccable/scripts/detect.mjs" --json src/styles.css src/components/inspector src/components/workspaces/FixedFrameEditor.tsx src/components/StudioAssistantRail.tsx
```

Expected: `[]`, or resolve every actionable finding before completion.

- [ ] **Step 4: Perform bounded manual inspection**

Use the active Vite application at `http://localhost:5173/` if available. Inspect desktop and narrow widths for:

1. central canvas remains the primary surface;
2. one inspector field pair shows compact X/Y and width/height controls without clipped labels;
3. selected, hover, focus, disabled, and press states remain distinct;
4. Advanced > Elements still exposes outline, smart layout, manual position recovery, and issue location;
5. narrow-screen Inspector access remains discoverable.

If Playwright has no downloaded browser, do not install it automatically; record the blocked screenshot evidence in `.learnings/ERRORS.md` and report that manual browser verification remains required.

- [ ] **Step 5: Review diff scope**

Run:

```bash
git diff -- src/styles.css src/components/inspector src/components/workspaces/FixedFrameEditor.tsx src/components/workspaces/DisplayFrameWorkspace.test.tsx src/App.test.tsx
```

Confirm there are no unrelated reversions in the already-dirty worktree.

## Plan Self-Review

- Spec coverage: Task 1 and Task 2 provide the requested PS-like compact coordinate/size groups across object inspectors and fixed layout. Task 3 gives a contained rounded, Notion-like visual recipe and preserves canvas priority. Task 4 verifies visual behavior, type safety, lint, build, diff integrity, and responsive access.
- Placeholder scan: no TBD/TODO or unspecified implementation steps remain.
- Type consistency: all wrappers are class-only, preserve IDs and existing callback types, and introduce no new shared TypeScript API.
