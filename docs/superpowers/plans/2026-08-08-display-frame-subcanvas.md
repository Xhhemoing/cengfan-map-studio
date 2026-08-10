# Display-Frame Subcanvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the display-frame stage into a composable local canvas where operators can select, drag, resize, layer, and style frame elements, with the same frame definition rendered in exported destination cards.

**Architecture:** Extend the existing `DisplayFrameDefinition` rather than introduce a second poster format. Pure display-frame helpers own normalization, item creation, and bounds clamping; the workspace composes a layer list, a local SVG subcanvas, and a selected-item inspector. `PosterCanvas` consumes the persisted definition for background/border and custom text or decoration items, while preserving legacy field and card-row behavior.

**Tech Stack:** React 19, TypeScript, SVG, plain CSS, Vitest, Vite.

## Global Constraints

- Preserve existing `displayFrame` persistence, package import/export, migration compatibility, undo behavior, and final destination-card placement.
- Keep the existing fixed/flow variants; fixed is the only variant with a draggable local subcanvas in this implementation.
- Use semantic controls, visible keyboard focus, native buttons/inputs, status feedback, and 44px touch targets where space permits.
- Do not add a component library, canvas dependency, or runtime dependency.
- Keep model/layout logic in `src/lib`; workspace components compose and do not own poster persistence rules.
- Preserve existing unrelated worktree changes.

---

### Task 1: Build a Normalized Frame-Item API

**Files:**
- Modify: `src/lib/display-frame.ts`
- Modify: `src/lib/display-frame.test.ts`

**Interfaces:**
- Produces `createDisplayFrameTextItem`, `createDisplayFrameDecorationItem`, `updateDisplayFrameItem`, `removeDisplayFrameItem`, and `clampDisplayFrameItem`.
- Extends `DisplayFrameStyle` with `borderColor`, `borderWidth`, and `borderRadius`.
- Extends `DisplayFrameItemStyle` with `fontWeight` and `align`; decoration items carry `decoration: "line" | "rectangle"`, `strokeWidth`, and optional `fill`.
- Existing fields remain valid when the new properties are absent.

- [ ] **Step 1: Write the failing model tests**

```ts
it("creates and clamps custom text and decoration items inside a local frame", () => {
  const frame = createDefaultDisplayFrame();
  const text = createDisplayFrameTextItem(frame, "毕业快乐");
  const line = createDisplayFrameDecorationItem(frame, "line");
  const next = normalizeDisplayFrame({
    ...frame,
    fixed: { items: [
      ...frame.fixed.items,
      { ...text, x: -12, y: 7000, width: 0, height: -5 },
      { ...line, x: 7000, y: -12, width: 0, height: 0 },
    ] },
  });

  expect(next.fixed.items.at(-2)).toMatchObject({ kind: "text", content: "毕业快乐", x: 0, width: 1 });
  expect(next.fixed.items.at(-1)).toMatchObject({ kind: "decoration", decoration: "line", y: 0, width: 1, height: 1 });
});

it("preserves local frame surface styling through normalization", () => {
  const frame = normalizeDisplayFrame({
    ...createDefaultDisplayFrame(),
    style: { ...createDefaultDisplayFrame().style, borderColor: "#123456", borderWidth: 3, borderRadius: 18 },
  });

  expect(frame.style).toMatchObject({ borderColor: "#123456", borderWidth: 3, borderRadius: 18 });
});
```

- [ ] **Step 2: Run the model test to verify it fails**

Run: `npx vitest run src/lib/display-frame.test.ts`

Expected: FAIL because the item helpers and extended style properties do not exist.

- [ ] **Step 3: Implement normalized item defaults and bounded helpers**

```ts
export function clampDisplayFrameItem(item: DisplayFrameFixedItem): DisplayFrameFixedItem {
  return {
    ...item,
    x: clamp(item.x, 0, 6000, 0),
    y: clamp(item.y, 0, 6000, 0),
    width: clamp(item.width, 1, 6000, 1),
    height: clamp(item.height, 1, 6000, 1),
  };
}

export function createDisplayFrameTextItem(frame: DisplayFrameDefinition, content = "自定义文字") {
  return { id: nextDisplayFrameItemId(frame, "text"), kind: "text" as const, content, x: 18, y: 18, width: 120, height: 28, zIndex: nextZIndex(frame) };
}
```

Normalize all new persisted fields with conservative defaults: `borderColor` falls back to the existing text color, `borderWidth` to `1`, `borderRadius` to `6`, and item font/style fields remain optional.

- [ ] **Step 4: Run the model test to verify it passes**

Run: `npx vitest run src/lib/display-frame.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit model work**

```bash
git add src/lib/display-frame.ts src/lib/display-frame.test.ts
git commit -m "feat: extend display frame item model"
```

### Task 2: Add a Focused Fixed-Mode Subcanvas

**Files:**
- Create: `src/components/workspaces/DisplayFrameSubcanvas.tsx`
- Create: `src/components/workspaces/DisplayFrameSubcanvas.test.tsx`
- Modify: `src/components/workspaces/DisplayFrameWorkspace.tsx`
- Modify: `src/components/workspaces/DisplayFrameWorkspace.test.tsx`

**Interfaces:**
- `DisplayFrameSubcanvas({ frame, selectedItemId, onSelectItem, onChangeItem })` renders `role="application"` only for the direct-manipulation surface and exposes a labeled SVG preview.
- `onChangeItem(id, patch)` emits a partial `DisplayFrameFixedItem` after drag or resize.
- `DisplayFrameWorkspace` owns `selectedItemId` and transforms subcanvas changes into `onPatch({ displayFrame })` through its existing `patchFrame` transaction path.

- [ ] **Step 1: Write failing subcanvas tests**

```tsx
it("selects a local item and drags it without changing its card placement", () => {
  const onSelectItem = vi.fn();
  const onChangeItem = vi.fn();
  const { container } = renderSubcanvas({ onSelectItem, onChangeItem });

  const title = container.querySelector<SVGElement>('[data-display-frame-item="title"]')!;
  dispatchPointer(title, "pointerdown", { clientX: 30, clientY: 30, pointerId: 1 });
  dispatchPointer(title, "pointermove", { clientX: 78, clientY: 62, pointerId: 1 });
  dispatchPointer(title, "pointerup", { clientX: 78, clientY: 62, pointerId: 1 });

  expect(onSelectItem).toHaveBeenCalledWith("title");
  expect(onChangeItem).toHaveBeenCalledWith("title", expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
});

it("renders custom text and decoration layers in z-index order", () => {
  const { container } = renderSubcanvas({ frame: withCustomLayers() });
  expect(container.querySelector('[data-display-frame-item="text-1"]')).not.toBeNull();
  expect(container.querySelector('[data-display-frame-item="decoration-1"]')).not.toBeNull();
});
```

- [ ] **Step 2: Run the subcanvas test to verify it fails**

Run: `npx vitest run src/components/workspaces/DisplayFrameSubcanvas.test.tsx`

Expected: FAIL because `DisplayFrameSubcanvas` does not exist.

- [ ] **Step 3: Implement SVG local-frame selection and pointer interaction**

Render sorted fixed items in an SVG scaled from a fixed local coordinate system. Field items show representative values, text items render `content`, line decorations render a line, and rectangle decorations render a styled rectangle. Selection is visible through an outline with four resize handles.

Use pointer capture on the SVG item. Translate client movement through `getBoundingClientRect()` and the SVG viewBox; clamp only on the model side. Render a noninteractive `aria-label="展示框局部预览"` SVG with pointer interactions on item groups, and include an `aria-live="polite"` status that states the selected item label.

- [ ] **Step 4: Compose the subcanvas into fixed mode**

In `DisplayFrameWorkspace`, keep a selected item id in local state, use the selected item to render the inspector, and preserve the existing flow-mode editor. The local canvas appears before the field-property forms in fixed mode.

- [ ] **Step 5: Run subcanvas and workspace tests to verify they pass**

Run: `npx vitest run src/components/workspaces/DisplayFrameSubcanvas.test.tsx src/components/workspaces/DisplayFrameWorkspace.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the subcanvas work**

```bash
git add src/components/workspaces/DisplayFrameSubcanvas.tsx src/components/workspaces/DisplayFrameSubcanvas.test.tsx src/components/workspaces/DisplayFrameWorkspace.tsx src/components/workspaces/DisplayFrameWorkspace.test.tsx
git commit -m "feat: add display frame local canvas"
```

### Task 3: Replace Coordinate Cards with Layer and Inspector Components

**Files:**
- Create: `src/components/workspaces/DisplayFrameLayerList.tsx`
- Create: `src/components/workspaces/DisplayFrameItemInspector.tsx`
- Modify: `src/components/workspaces/FixedFrameEditor.tsx`
- Modify: `src/components/workspaces/DisplayFrameWorkspace.tsx`
- Modify: `src/components/workspaces/DisplayFrameWorkspace.test.tsx`

**Interfaces:**
- `DisplayFrameLayerList({ items, selectedItemId, onSelect, onAddText, onAddDecoration, onRemove })` owns only layer list presentation and commands.
- `DisplayFrameItemInspector({ item, onChange })` owns type-specific controls: geometry, text content, typography, colors, decoration style, and layer order.
- `FixedFrameEditor` becomes a composition shell for the subcanvas, layer list, and selected inspector rather than one form per field.

- [ ] **Step 1: Write failing workspace tests for layer commands and selection**

```tsx
it("adds a text layer, selects it, and updates its content", () => {
  const { container, onPatch } = renderWorkspace();

  flushSync(() => container.querySelector<HTMLButtonElement>('[aria-label="添加自定义文字"]')?.click());
  const layer = container.querySelector<HTMLButtonElement>('[aria-label="选择自定义文字"]')!;
  flushSync(() => layer.click());
  commitInput(container.querySelector<HTMLInputElement>('#display-frame-item-content')!, "毕业快乐");

  const item = onPatch.mock.calls.at(-1)?.[0].displayFrame.fixed.items.find((candidate: { kind: string }) => candidate.kind === "text");
  expect(item).toMatchObject({ content: "毕业快乐" });
});

it("removes a selected custom layer but keeps required field layers", () => {
  const { container } = renderWorkspace(withCustomLayers());
  flushSync(() => container.querySelector<HTMLButtonElement>('[aria-label="选择自定义文字"]')?.click());
  flushSync(() => container.querySelector<HTMLButtonElement>('[aria-label="删除当前图层"]')?.click());

  expect(container.querySelector('[aria-label="选择自定义文字"]')).toBeNull();
  expect(container.querySelector('[aria-label="选择标题"]')).not.toBeNull();
});
```

- [ ] **Step 2: Run workspace tests to verify they fail**

Run: `npx vitest run src/components/workspaces/DisplayFrameWorkspace.test.tsx`

Expected: FAIL because layer command controls and selected-item fields do not exist.

- [ ] **Step 3: Implement layered controls and selected inspector**

Keep required field layers intact; allow custom text and decoration layers to be removed. Use explicit add buttons for text, dividing line, and rectangle. Do not encode modes with boolean props. The selected item inspector uses `DeferredInput` for text and numeric fields, a native `<select>` for align/font weight, and `DeferredInput type="color"` for colors.

- [ ] **Step 4: Run workspace tests to verify they pass**

Run: `npx vitest run src/components/workspaces/DisplayFrameWorkspace.test.tsx src/components/workspaces/DisplayFrameSubcanvas.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the component composition work**

```bash
git add src/components/workspaces/DisplayFrameLayerList.tsx src/components/workspaces/DisplayFrameItemInspector.tsx src/components/workspaces/FixedFrameEditor.tsx src/components/workspaces/DisplayFrameWorkspace.tsx src/components/workspaces/DisplayFrameWorkspace.test.tsx
git commit -m "refactor: compose display frame editing controls"
```

### Task 4: Render Persisted Frame Styling in Poster Cards

**Files:**
- Modify: `src/components/canvas/PosterCanvas.tsx`
- Modify: `src/components/canvas/PosterCanvas.test.tsx`

**Interfaces:**
- `PosterCanvas` renders frame surface border color, width, and corner radius from `displayFrame.style`.
- Custom fixed text and decorations render inside every destination card in `zIndex` order and do not participate in card dragging.
- Existing title and roster line rendering keeps its existing derived behavior and honors existing field-style inheritance.

- [ ] **Step 1: Write failing canvas tests**

```tsx
it("renders display frame surface and custom local layers without moving the destination card", () => {
  const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
  project.cards = { ...project.cards, displayFrame: withStyledCustomLayers() };
  const { container } = renderPoster(project);

  const card = container.querySelector('[data-destination-card="北京市"]')!;
  expect(card.querySelector('[data-display-frame-surface]')?.getAttribute("stroke")).toBe("#123456");
  expect(card.querySelector('[data-display-frame-text="text-1"]')?.textContent).toBe("毕业快乐");
  expect(card.querySelector('[data-display-frame-decoration="decoration-1"]')).not.toBeNull();
});
```

- [ ] **Step 2: Run canvas test to verify it fails**

Run: `npx vitest run src/components/canvas/PosterCanvas.test.tsx -t "renders display frame surface and custom local layers"`

Expected: FAIL because the new data attributes and local layers are absent.

- [ ] **Step 3: Implement frame surface and local overlays**

Replace the destination-card outer rect attributes with the persisted surface style while retaining the legacy preset fallback. Render custom fixed items in a nested noninteractive SVG group after background/preset accents and before dynamic title/roster content, sorted ascending by `zIndex`. Text uses the item style with frame-style inheritance. Lines and rectangles use item color/fill/stroke settings. Do not use custom local items to calculate destination-card placement.

- [ ] **Step 4: Run canvas tests to verify they pass**

Run: `npx vitest run src/components/canvas/PosterCanvas.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit poster rendering work**

```bash
git add src/components/canvas/PosterCanvas.tsx src/components/canvas/PosterCanvas.test.tsx
git commit -m "feat: render custom display frame layers"
```

### Task 5: Style, Accessibility, and Delivery Checks

**Files:**
- Modify: `src/styles.css`
- Modify: `src/components/workspaces/DisplayFrameWorkspace.test.tsx`
- Modify: `src/App.test.tsx` only if stage integration assertions need expansion

**Interfaces:**
- Adds `display-frame-subcanvas`, layer list, item inspector, and responsive workbench styles.
- Maintains one-column, scrollable editor controls below 760px without hidden controls or horizontal page overflow.

- [ ] **Step 1: Write a failing responsive structure test**

```tsx
it("exposes the subcanvas, layer list, and selected item inspector with labelled controls", () => {
  const { container } = renderWorkspace();

  expect(container.querySelector('[aria-label="展示框局部预览"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="展示框图层"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="当前图层属性"]')).not.toBeNull();
  expect(container.querySelector('button[aria-label="添加自定义文字"]')).not.toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/workspaces/DisplayFrameWorkspace.test.tsx`

Expected: FAIL until the structured subcanvas components are present.

- [ ] **Step 3: Add responsive CSS and focus treatment**

Use a three-pane desktop editor inside the stage content: layer rail, subcanvas, inspector. At narrow widths, stack them in task order: mode/style controls, subcanvas, layers, inspector. Use stable subcanvas dimensions, no `transition: all`, explicit focus-visible outlines, and visible selected-layer state beyond color alone.

- [ ] **Step 4: Run targeted checks**

Run: `npx vitest run src/lib/display-frame.test.ts src/components/workspaces/DisplayFrameWorkspace.test.tsx src/components/workspaces/DisplayFrameSubcanvas.test.tsx src/components/canvas/PosterCanvas.test.tsx`

Expected: PASS.

- [ ] **Step 5: Run type, build, and whitespace verification**

Run:

```bash
npx tsc --noEmit
npm run build
git diff --check
node C:/Users/86080/.agents/skills/impeccable/scripts/detect.mjs --json src/components/workspaces/DisplayFrameWorkspace.tsx src/components/workspaces/DisplayFrameSubcanvas.tsx src/components/workspaces/DisplayFrameLayerList.tsx src/components/workspaces/DisplayFrameItemInspector.tsx src/components/canvas/PosterCanvas.tsx src/styles.css
```

Expected: Type check and production build succeed; no whitespace errors; detector reports no violations or all reported violations have a documented resolution.

- [ ] **Step 6: Manual browser acceptance**

At desktop and 390px wide, verify: selecting each layer updates the inspector; dragging and resizing change only local frame coordinates; custom text/decoration appears in the poster preview; switching to flow preserves fixed-mode layers; tab focus reaches every command; no horizontal page overflow.

- [ ] **Step 7: Commit final UI work**

```bash
git add src/styles.css src/components/workspaces/DisplayFrameWorkspace.test.tsx src/App.test.tsx
git commit -m "style: complete display frame subcanvas editor"
```
