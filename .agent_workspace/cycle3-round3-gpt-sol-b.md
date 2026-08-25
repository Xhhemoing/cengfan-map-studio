MODEL: gpt-5.6-sol-xhigh-fast

# Cycle 3 Round 3 — final-freeze acceptance audit

## Finding

One residual acceptance hole remains: map-edge filters are not instance-scoped.

- `MapDataLayer.tsx` resolves edge styles with the fixed default prefix
  `map-edge` and emits the resulting IDs unchanged. Soft-glow and ink map
  borders therefore use IDs such as `map-edge-soft-glow` and `map-edge-ink`.
- `serializePosterSvg` clones and serializes those IDs without rewriting them.
  The exported SVG is self-contained when opened alone, but its filter IDs can
  collide when more than one exported/editor SVG is embedded in one document.
- Destination connector filters do not have this hole: `DestinationCardsLayer`
  scopes them with `useId`, and the existing component/export tests cover the
  scoped reference and XML-safe serialization.

This is the already deferred “other defs cross-instance IDs” item from the
Round 2 conclusion. It was reported only; production code is frozen.

## Other requested checks

- `PosterCanvas.tsx` calls
  `destinationCardFlowContentStart(flowBlocks, project.cards.fontSize)`; the
  flow reduce is not inlined.
- `MapLayerContent` has no `settings.x` or `settings.y` read. Those fields are
  read only by the outer `MapLayer` transform.
- The existing pan-memo and flow anti-inline tests were not duplicated.
- Opus-A's optional call-site invariant was not duplicated.

## Tests

No new test was added. A passing test that expects the duplicate fixed IDs
would preserve the defect, while the correct scoping assertion would be red
until the deferred production change lands.

Targeted existing regression run:

```sh
npx vitest run src/lib/export-poster.round3.test.ts \
  src/components/canvas/MapDataLayer.test.tsx \
  src/components/canvas/MapLayer.pan-memo.cycle3.test.tsx \
  src/lib/destination-card-metrics.test.ts
```

Result: 4 files passed, 34 tests passed.

No production or test source file was changed, and no Git command was run.
