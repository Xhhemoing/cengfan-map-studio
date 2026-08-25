MODEL: gpt-5.6-sol-xhigh-fast

# Cycle 2 Round 2 — connector/type-boundary probes

## Added tests

- `src/components/canvas/DestinationCardsLayer.connector-preview.cycle2.test.tsx`
  - Renders the real `emblem-list` SVG card.
  - Runs a throttled pointer-move preview.
  - Verifies the connector path changes while the decorative path inside
    `data-destination-card` retains its original non-connector `d`.
- `src/lib/prepared-card-content.types.cycle2.test.ts`
  - Reads `prepared-card-content.ts` as source text.
  - Rejects imports whose module path contains `components/`.

## Validation

Command:

```sh
npx vitest run \
  src/components/canvas/DestinationCardsLayer.connector-preview.cycle2.test.tsx \
  src/lib/prepared-card-content.types.cycle2.test.ts \
  src/components/canvas/PosterCanvas.pan-wrap.cycle2.test.tsx
```

Final result: **1 failed, 2 passed**.

| Probe | Result | Evidence |
| --- | --- | --- |
| `DestinationCardsLayer.connector-preview.cycle2.test.tsx` | PASS | The emblem artwork path retained its original `d`; the connector received a different preview `d`. |
| `prepared-card-content.types.cycle2.test.ts` | FAIL | `prepared-card-content.ts` still imports `CardDisplayRow` and `PreparedCardRow` from `../components/canvas/DestinationCard`. |
| `PosterCanvas.pan-wrap.cycle2.test.tsx` | PASS | The pan/zoom text-wrapping regression test passed in the same run. |

The requested standalone pan-wrap re-run also passed:

```sh
npx vitest run src/components/canvas/PosterCanvas.pan-wrap.cycle2.test.tsx
# Test Files  1 passed (1)
# Tests       1 passed (1)
```

The first validation attempt failed before its assertion because Vite supplied a
non-`file:` `import.meta.url`. The test was corrected to resolve the source from
`process.cwd()`; rerunning the same command then produced the intended architecture
failure above.

No production files were changed.
