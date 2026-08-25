MODEL_SLUG: claude-opus-5-thinking-high-fast

# Round 27 — `﹔` (U+FE54) small-form semicolon as a cell delimiter

## What changed

A roster pasted at CJK width ships `﹔` (small form of `；`) instead of the fullwidth semicolon.
`CELL_DELIMITERS` knew `；` but not `﹔`, so every row of such a paste stayed one field and the
whole import failed silently — the same class of bug Round 25 fixed for `﹑` vs `、`.

`﹔` is now a delimiter, on the ordinary two-cell threshold. It is a semicolon, not an enumeration
mark, so it does **not** join `、`/`﹑` on the three-cell rule, and `LIST_MARKER` is untouched
(a semicolon never numbers a list).

## Files changed

- `src/lib/import-data.ts` — added `"﹔"` to `CELL_DELIMITERS` right after `"；"`; extended the
  `CELL_DELIMITERS` doc line and the `detectDelimiter` doc block to state that `﹔` stands for `；`
  and keeps the two-cell rule; reflowed the second paragraph of the `usableColumnsByDelimiter` doc
  from 5 lines to 4 to pay for the added comment line (wording preserved, only rewrapped).
- `src/lib/import-data.test.ts` — three tests added to `describe("、 | ； separated pastes")`.

No behavior was deleted. `FREEFORM_SEPARATOR` was **not** touched: the unlabeled `﹔` case is
already covered by `CELL_DELIMITERS` (proved by the headerless test below, which passes with the
`CELL_DELIMITERS` entry alone and fails without it).

## Line count

`wc -l src/lib/import-data.ts` → **400** (was 400; the ≤400 budget holds).

## Tests added

1. `reads a roster headed by the small semicolon a CJK-width paste ships` — headered
   `姓名﹔院校﹔城市﹔去向类型` with 苏禾 / 周晴(海外) / `林舟﹔﹔北京市﹔`; expects the two
   candidates, `locationScope` unset on 苏禾, and `缺少院校` on line 4. Mirrors the `﹑` suite.
2. `reads a ﹔-separated roster without a header and reports its gap` —
   `苏禾﹔浙江大学﹔杭州市` / `林舟﹔﹔北京市`; expects 苏禾 plus
   `无法识别学生名称、录取院校和城市`. Mirrors the `；` test at line 765 exactly.
3. `keeps a ﹔ inside one cell from splitting a row another delimiter already divides` —
   comma-headered roster whose 城市 is `波士顿﹔剑桥`; the cell stays whole.

### Contract check against `；` (not invented, measured)

Two throwaway probe tests were run against the existing `；` behavior and then removed:

- headered `姓名；院校；城市` + `林舟；；北京市` → `缺少院校` (so the headered `﹔` test asserting
  `缺少院校` matches `；`, and the `无法识别` wording in the existing line-765 test comes from that
  paste having no header, not from `；` being weaker).
- comma-headered row with `波士顿；剑桥` → city kept whole, nothing unparsed.

The `﹔` tests assert exactly these two contracts. Nothing stricter was added.

## Evidence chain (failure → cause → fix → recheck)

1. **failure** — `npx vitest run src/lib/import-data.test.ts` with the new tests but `CELL_DELIMITERS`
   reverted to its old value: 2 failed / 78 passed. `reads a roster headed by the small semicolon…`
   and `reads a ﹔-separated roster without a header…` both fail; the third (guard) test passes,
   as it must, since it asserts a non-split.
2. **cause** — `detectDelimiter` walks `CELL_DELIMITERS`, which held `；` (U+FF1B) but not the small
   form `﹔` (U+FE54); with no delimiter matched the row fell to `FREEFORM_SEPARATOR`, which splits
   on whitespace only, so `林舟﹔北京大学﹔北京市` stayed a single part and produced no candidate.
3. **fix** — inserted `"﹔"` into `CELL_DELIMITERS` after `"；"`. It sits behind `\t , ，  ; ；`, so it
   preempts nothing, and it is excluded from the `/^[、﹑]$/` three-cell branch, so it keeps the
   two-cell threshold `；` uses.
4. **recheck** — same command, `npx vitest run src/lib/import-data.test.ts`: **80 passed (80)**
   (77 pre-existing + 3 new; the 77 were green before the change too, so no regression).
   `wc -l src/lib/import-data.ts` → 400.
   `npx eslint src/lib/import-data.ts src/lib/import-data.test.ts` → clean.
   `npx tsc -p tsconfig.app.json --noEmit` → clean.
   `npm test` (full suite) → **221 files / 1966 tests passed**.

## Acceptance & rollback

- **Acceptance:** CI runs `npm test`; the three new cases in `describe("、 | ； separated pastes")`
  are the acceptance criteria. Manual check: paste `姓名﹔院校﹔城市` plus rows into the import box
  and confirm rows import and a blank 院校 reports `缺少院校`.
- **Rollback:** delete `"﹔"` from `CELL_DELIMITERS` and the three tests. No data format, export
  shape, or API shape changed — this only widens which pasted text parses, so a revert cannot
  invalidate anything already imported.

## Constraints honored

- No git commit / stash / checkout / push / branch.
- Only `src/lib/import-data.ts` and `src/lib/import-data.test.ts` touched (other entries in
  `git diff --stat` are pre-existing work from earlier rounds on this branch).
- No ASCII `;` added (already present), no `·` added, `LIST_MARKER` unchanged, no Playwright,
  tests use 林舟 / 苏禾 / 周晴.
