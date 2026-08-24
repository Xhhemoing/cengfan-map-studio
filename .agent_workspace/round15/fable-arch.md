# R15 fable-arch report

MODEL_SLUG: claude-fable-5-thinking-xhigh

## Outcome

Closed Round 15 gap #1: `use-studio-navigation.ts`'s `locateLayoutIssue` now
passes `issue.targets` (the field name on `LayoutHealthIssue` is `targets`,
verified in `src/lib/layout-health.ts` line 71) into
`resolveLayoutIssueSelection(project, issue.id, issue.targets)`. Round 14 had
added the optional third argument to the helper but the hook still called with
`issue.id` only, so the targets-first locate path (needed when card group keys
contain `":"`) was dead code from the UI's perspective.

- The callback parameter widened from `{ id: string }` to
  `Pick<LayoutHealthIssue, "id" | "targets">` (type-only import). Both real
  callers already pass full `LayoutHealthIssue` objects:
  `handleStageOverviewAction`'s `locate-layout` action
  (`src/lib/stage-overview.ts`) and `locateDeliveryIssue`'s `layout` branch
  (`DeliveryIssue` in `DeliveryWorkspace.tsx`), so no caller changed.
- `src/lib/studio-editor-helpers.ts` was NOT touched — the Round 14 signature
  `resolveLayoutIssueSelection(project, issueId, targets?)` already accepts
  `readonly string[]`, so no signature change was needed.
- New `src/hooks/use-studio-navigation.test.ts` (first test in `src/hooks/`,
  63 lines): renders a null harness component with `createRoot` + `flushSync`
  (repo pattern, no testing-library) and asserts on the injected `setSelection`
  mock. Three cases: (1) targets order wins — issue `text-note:text-title`
  with targets `["text-title", "text-note"]` selects `text-title`, which the
  fragment parser alone would never produce (it hits `text-note` first),
  proving the wiring; (2) no targets falls back to id fragments
  (`text-note`); (3) nothing resolvable leaves the selection untouched
  (`setSelection` not called).

## Files

- `src/hooks/use-studio-navigation.ts` (168 lines; +1 import, +1 comment,
  param type and one call-site line)
- `src/hooks/use-studio-navigation.test.ts` (63 lines, new)

Both ≤400 lines. No other file modified.

## Verification

```text
npx tsc -b
passed (exit 0, 9.0s; `-b` because the root tsconfig is a project-references
shell that checks nothing under plain --noEmit, per the Round 14 note)

npx vitest run src/hooks/use-studio-navigation.test.ts \
  src/lib/studio-editor-helpers-locate.test.ts
2 files passed, 14 tests passed

npx vitest run src/lib/stage-overview.test.ts \
  src/components/workspaces/DeliveryWorkspace.test.tsx   (untouched consumers)
2 files passed, 23 tests passed

npx eslint src/hooks/use-studio-navigation.ts src/hooks/use-studio-navigation.test.ts
exit 0
```

Failure → cause → fix → recheck: no check failed at any point; all four ran
green on the first attempt after the edit.

## Acceptance and rollback

Acceptance: `npx vitest run src/hooks/use-studio-navigation.test.ts` — the
first case fails against the pre-change hook (selects `text-note` instead of
`text-title`), so it pins the wiring. Manual check: in the editor, a
connector-crosses-card issue on a card whose group key contains `":"` now
locates the crossed card from the stage-overview "定位" button.

Rollback: revert the two files. `targets` stays optional end to end; no
persisted data, export format, or API shape changed, and the old two-argument
helper call remains valid.

No commit, stash, branch, or push was created.
