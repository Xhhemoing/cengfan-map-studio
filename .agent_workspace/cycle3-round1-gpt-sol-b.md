MODEL: gpt-5.6-sol-xhigh-fast

# Cycle 3 Round 1 — affine-key and recolor probes

## Added tests

- `src/lib/card-layout-cache.affine.cycle3.test.ts`
  - Exercises the new `CardLayoutCacheInput.polygonOrigin` path and uses its
    documented `|` / `@` boundaries to compare only the centered-ring suffix.
  - Requires a coherent map pan to keep that geometry suffix byte-identical
    while the complete request key remains position-sensitive.
  - Retains a shape-change control so implementations cannot satisfy the probe
    by dropping polygon geometry from the key.
- `src/components/canvas/PosterCanvas.recolor.cycle3.test.tsx`
  - Proxies `d3-geo`'s callable projection, without a production hook.
  - Requires a manual province-color edit to perform no additional point
    projections.
  - Retains a visibility-change control because hiding a province really does
    change collision geometry and must still rebuild it.

No production file was edited.

## Validation

Initial combined command:

```sh
npx vitest run \
  src/lib/card-layout-cache.affine.cycle3.test.ts \
  src/components/canvas/PosterCanvas.recolor.cycle3.test.tsx \
  src/components/canvas/PosterCanvas.pan-projection.cycle2.test.tsx
```

Initial pre-implementation result: **2 failed, 1 passed** test files;
**2 failed, 2 passed** tests.

| Probe | Result | Evidence |
| --- | --- | --- |
| Affine polygon suffix | Expected pre-implementation failure | A `(73, -41)` pan remains embedded in every serialized ring and polygon-bound coordinate, so the suffix changes. |
| Province recolor | Expected pre-implementation failure | Initial render made `24,951` callable projection invocations; changing only Beijing's manual color raised the cumulative count to `49,901`. |
| Existing pan-projection suite | PASS | Both no-reprojection-on-pan and incremental-versus-fresh collision-geometry tests passed. |

The initial failure causes were localized:

- `card-layout-cache.ts` serializes absolute `occupiedPolygons` directly.
- `PosterCanvas.tsx` makes `centeredProvincePolygons` depend on the complete
  `project.map.provinceStyles` object, so an appearance-only edit rebuilds all
  rings.

Concurrent production work then added the `polygonOrigin` key input and derived
province visibility independently from appearance. The affine probe was adapted
to exercise that actual API (including origin-relative bounds invariants), and
the same combined command was rerun:

```text
Test Files  3 passed (3)
Tests       4 passed (4)
```

The recolor probe's visibility control also passed, confirming that the
optimization does not leave hidden-province collision geometry stale.

Requested standalone re-run after those changes:

```sh
npx vitest run src/components/canvas/PosterCanvas.pan-projection.cycle2.test.tsx
# Test Files  1 passed (1)
# Tests       2 passed (2)
```

Targeted ESLint for both new files passed. No Git command or commit was
created.
