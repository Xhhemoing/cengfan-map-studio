# R14 fable-arch report

MODEL_SLUG: claude-fable-5-thinking-xhigh

## Outcome

- `LayoutHealthIssue` gained an optional `targets?: string[]`: the raw ids of
  the involved canvas objects in locate-preference order. `issue.id` remains
  the composite `":"`-joined string, but card group keys can themselves contain
  `":"`, so `targets` carries the unjoined originals. Connectors are not canvas
  objects, so they are represented by their departure card (`cardId`), falling
  back to the connector's own id when `cardId` is absent.
- `checkLayoutHealth` now populates `targets` on every issue kind:
  - single-object issues (`overflow`, `out-of-bounds`, `object-in-bleed`,
    `unreadable-text`): `[object.id]`;
  - `occlusion`: `[back.id, front.id]` (same preference the id-fragment parser
    had: leading object first);
  - `connector-conflict`: `[left.cardId ?? left.id, right.cardId ?? right.id]`;
  - `connector-crosses-card`: `[crossedCard.id, connector.cardId ?? connector.id]`
    — the crossed card first (the thing the user needs to move), departure card
    second as the fallback when the crossed card is no longer placed.
- `resolveLayoutIssueSelection(project, issueId, targets?)` prefers `targets`
  when present and non-empty; the existing id-fragment enumeration stays as the
  fallback both for callers that pass no targets (the current
  `use-studio-navigation` hook) and for stale targets that resolve to nothing.
  The `connector-` prefix-strip second pass now applies uniformly to both
  candidate sources via the extracted `findSelectableTarget` helper. All
  previous behavior (fragment ordering, colon-key handling, verbatim-id
  precedence, null result) is unchanged.
- The solver (`card-layout*`) and `content-layout-objects` were not touched;
  `targets` survives the agent tool `check_health` JSON round-trip unchanged.

## Files

- `src/lib/layout-health.ts` (357 lines)
- `src/lib/layout-health.test.ts` (304 lines)
- `src/lib/studio-editor-helpers.ts` (232 lines)
- `src/lib/studio-editor-helpers-locate.test.ts` (128 lines)

`src/lib/studio-editor-helpers.test.ts` needed no change (it covers other
helpers); all files remain ≤400 lines.

## Verification

```text
npx tsc -b
passed (exit 0, 9.1s)

npx vitest run src/lib/layout-health.test.ts \
  src/lib/studio-editor-helpers-locate.test.ts src/lib/studio-editor-helpers.test.ts
3 files passed, 50 tests passed

npx vitest run src/lib/agent-session-tools.test.ts src/lib/content-layout-objects.test.ts \
  src/lib/studio-journey.test.ts src/lib/stage-overview.test.ts \
  src/components/workspaces/DeliveryWorkspace.test.tsx   (untouched consumers)
5 files passed, 52 tests passed

npx eslint <the five scoped files>
exit 0
```

Failure → cause → fix → recheck: no scoped check failed. One verification
false-start: plain `npx tsc --noEmit` returned green in 0.26s because the root
`tsconfig.json` is a project-references shell with `files: []` and checks
nothing; reran as `npx tsc -b`, which performs the real 9s compile and passed.

## Acceptance and rollback

Acceptance: run the two targeted Vitest files above. New coverage includes:
targets emitted by the real `listContentLayoutIssues` crossing scenario
(`["浙江省", "北京市"]`), targets preferred over fragment parsing
(`text-note:text-title` with reversed targets selects `text-title`),
colon-bearing key matched verbatim, `connector-` strip inside targets,
stale/empty targets falling back to fragments, and the cardless-connector
fallback to its own id.

Rollback: revert the two lib files and their tests; `targets` is optional, no
persisted data, export format, or API shape depends on it, and the two-argument
`resolveLayoutIssueSelection` call keeps working throughout.

Follow-up (outside this round's allowed paths): `use-studio-navigation.ts`'s
`locateLayoutIssue` still calls with `issue.id` only; passing `issue.targets`
through is a one-line change once that file is in scope.

No commit, stash, branch, or push was created.
