# Round 1 Agent F — post-merge verification probe

Date: 2026-08-25 UTC

## Observed baseline

- Current branch: `cursor/merge-all-branches-e17a`
- Current commit: `897a2a61d6fd5460ec27f4738aef929aea44616a`
- Merge source inspected without checking it out: `origin/agent/opt-continuous` at `d04f398d679ed943c6c5927870f7a2da80690052`
- The merge source is 405 commits ahead and changes 290 files (`40,269` insertions, `9,652` deletions).
- `node_modules/` is **missing**. No install was run: installing the pre-merge lockfile would be stale immediately, so run `npm ci` after the merge instead.
- No full test suite was run.

## Package scripts and cheapest smoke commands

The current `package.json` defines:

- `npm test` → `node scripts/run-heavy.mjs vitest run`
- `npm run lint` → `node scripts/run-heavy.mjs eslint .`

The merge source keeps both scripts and adds:

- `npm run typecheck` → `tsc -b --noEmit`

`test` and `lint` are deliberately serialized through `scripts/run-heavy.mjs`; do not run heavy checks in parallel. For a cheap local signal after `npm ci`, use direct targeted commands:

```bash
npx eslint src/lib/ids.ts src/lib/ids.test.ts
npx vitest run src/lib/ids.test.ts
```

For a merge-focused but still bounded smoke:

```bash
npx eslint src/App.tsx server/index.ts server/collaboration.ts src/lib/project-store.ts src/lib/useCollaborationRoom.ts src/components/DataWorkspace.tsx
npx vitest run scripts/file-size-ratchet.test.ts src/lib/student-transactions.test.ts src/lib/project-document.test.ts src/lib/collaboration-operations.test.ts server/boot-tmp-sweep.test.ts
```

Vitest uses `jsdom`, includes `src`, `server`, and `scripts` `*.test.ts(x)` files, and has a 20-second per-test timeout.

## CI workflow

The current pre-merge tree has no files under `.github/workflows/`. The merge source adds only `.github/workflows/ci.yml`.

It requires:

- GitHub `pull_request` events and pushes to `main` or `agent/opt-continuous`
- `ubuntu-latest`, Node 22, npm cache, and read-only repository contents permission
- `npm ci`
- Serial `npm run typecheck`, `npm run lint`, then `npm test`
- A 30-minute job timeout
- Concurrency cancellation for superseded runs on the same workflow/ref

It does not run the production build or security audit.

## Post-merge smoke checklist

Run from `/workspace` after the parent completes the merge:

1. Confirm the expected merge and install exactly the merged lockfile.

   ```bash
   git status --short
   git rev-list --count 897a2a61d6fd5460ec27f4738aef929aea44616a..HEAD
   npm ci
   ```

2. Typecheck the two referenced TypeScript projects.

   ```bash
   npm run typecheck
   ```

3. Target ESLint at the highest-churn entry points and stateful seams.

   ```bash
   npx eslint src/App.tsx server/index.ts server/collaboration.ts src/lib/project-store.ts src/lib/useCollaborationRoom.ts src/components/DataWorkspace.tsx
   ```

4. Run a bounded Vitest cross-section: size ratchet, student transaction purity, document mutation, collaboration operations, and temporary-file cleanup.

   ```bash
   npx vitest run scripts/file-size-ratchet.test.ts src/lib/student-transactions.test.ts src/lib/project-document.test.ts src/lib/collaboration-operations.test.ts server/boot-tmp-sweep.test.ts
   ```

5. Check for leaked student-data artifacts. Both commands should print nothing; inspect every match rather than deleting it blindly.

   ```bash
   git ls-files | rg -i '\.(csv|tsv|xlsx?|ods|sqlite3?|db|sql|jsonl|parquet)$|(^|/)(students?|rosters?|class[-_]?list|名单|学生数据)\.(json|ya?ml|txt)$'
   git diff --unified=0 897a2a61d6fd5460ec27f4738aef929aea44616a..HEAD -- . ':!docs/**' ':!.agent_workspace/**' | rg -i '^\+[^+].*(身份证|身份证号|手机号|手机号码|学号|家庭住址|真实姓名)'
   ```

6. Check the AGPL repository boundary for billing/payment implementation. Both commands should print nothing.

   ```bash
   git ls-files | rg -i '(^|/)(billing|payments?|stripe|invoices?|checkout|pricing)([-_./]|$)'
   git diff --unified=0 897a2a61d6fd5460ec27f4738aef929aea44616a..HEAD -- . ':!package-lock.json' ':!docs/**' ':!.agent_workspace/**' ':!.github/**' | rg -i '^\+[^+].*(stripe|billing|payment|invoice|checkout|price[_-]?id|card[_ -]?number)'
   ```

7. If the bounded checks pass, leave the full serial CI workflow to run `typecheck`, repository-wide lint, and the full Vitest suite.

## Pre-merge leak probe result

Against `origin/agent/opt-continuous`, the tracked-filename scan found no spreadsheet/database/data-dump extensions and no newly added sensitive artifact paths. The added-line student-identifier scan was empty. The billing-term scan found only the expected GitHub Action reference `actions/checkout@v4`; no billing implementation was found.
