MODEL_SLUG: gpt-5.6-sol-xhigh-fast

Files changed:
- `src/lib/card-layout-pack.ts`
- `.agent_workspace/round26/gpt-perf.md`

Evidence:
- Hoisted the stable nearest-X and nearest-Y rail lists outside `repackAll`'s Cartesian candidate loop.
- Previously, `nearestValues(yCandidates, ...)` deduplicated, sorted, and sliced the same Y set once per X rail—up to 32 times per card. It now runs once per card, reducing Y-rail preparation from O(r × m log m) to O(m log m), where `r <= 32`; candidate order and placement logic are unchanged.
- `src/lib/card-layout-pack.ts` is 395 lines, within the 400-line limit.
- `npx vitest run src/lib/card-layout-pack.test.ts`: 1 file passed, 33 tests passed.
- The full Vitest suite was not run, as requested.
