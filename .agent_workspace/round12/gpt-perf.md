MODEL_SLUG: gpt-5.6-sol-xhigh-fast

# Round 12 cache-key benchmark fixture

## Outcome

- Round 11 already added the pinned-versus-unpinned
  `createCardLayoutCacheKey` probe and made 400 cards its default fixture.
- Updated the report-shape test to exercise that actual 400-card default instead
  of substituting 40 cards.
- The test verifies both variants, including 0 unpinned coordinates and 400
  pinned coordinates. It only checks report fields and numeric value types; it
  does not enforce elapsed-time or key-size budgets.
- `DEFAULT_WORKER_CARD_THRESHOLD` remains unchanged at 24.
- No `geojson ?raw`, Playwright, or CI timing assertions were introduced.

## Verification

```text
npx vitest run scripts/perf-layout-bench.test.ts
Test Files  1 passed (1)
Tests       6 passed (6)

npx vitest run scripts/perf-layout-bench.test.ts src/lib/layout-perf.test.ts src/lib/card-layout-cache.test.ts
Test Files  3 passed (3)
Tests       14 passed (14)
```

No failures occurred, so no failure/cause/fix/recheck cycle was needed.
No git commit, stash, branch, checkout, or push operation was run.
