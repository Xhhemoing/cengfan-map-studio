# R7-gpt-server

## Result

- Added `server/collaboration-file-lock.ts`: each room snapshot path uses an exclusive advisory `flock` through optional `fs-ext` when available, otherwise an atomic lock-directory fallback with bounded waiting.
- Wrapped snapshot load, save/atomic rename, and delete operations in the same per-room lock.
- Added sequential-save validation and a deterministic two-process exclusion test. The existing unset-`COLLAB_STORE_DIR` in-memory test remains green.
- Left `server/collaboration.ts` unchanged at 293 lines.

## Remaining limitation

This only coordinates cooperating processes that share one filesystem on one machine. It does not merge independently held in-memory room state, provide multi-host coordination, or turn snapshot files into a distributed database. A process killed while holding the directory fallback can also leave a `.lock.d` directory that requires operator cleanup.

## Verification

- `npx vitest run server`: 20 files passed, 222 tests passed.
- `npx tsc --noEmit -p tsconfig.node.json`: passed.
- `npx eslint server/collaboration-file-lock.ts server/collaboration-snapshot-store.ts server/collaboration-snapshot-store.test.ts`: passed.

Failure → cause → fix → recheck: targeted ESLint initially reported `preserve-caught-error` because the lock timeout replaced the caught `EEXIST`; the timeout now retains it as `Error.cause`, and the same lint command passes.

No commit was created, as requested.
