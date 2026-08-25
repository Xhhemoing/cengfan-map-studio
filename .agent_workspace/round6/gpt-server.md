# R6-gpt-server

## Result

- Extracted room creation, invitation, authorization, membership, access, and lifecycle subscription behavior into `server/collaboration-lifecycle.ts`.
- Reduced `server/collaboration.ts` from 493 to 293 lines.
- Kept snapshot persistence and the optional `COLLAB_STORE_DIR` selection in `server/collaboration.ts`; an unset or blank value still uses only the in-memory maps.
- Added no account or payment behavior and made no multi-instance-safety claim.

## Verification

- `npx vitest run server`: 19 files passed, 220 tests passed.
- `npx tsc --noEmit -p tsconfig.node.json`: passed.
- `git diff --check -- server/collaboration.ts server/collaboration-lifecycle.ts`: passed.
- Required checks had no failure, so no failure/cause/fix/recheck cycle was needed.

No commit was created, as requested.
