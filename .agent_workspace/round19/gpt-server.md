MODEL_SLUG: gpt-5.6-sol-xhigh-fast

# Round 19 server report

- `npx eslint .` still exits 0 with the five out-of-lane `react-refresh/only-export-components` warnings, so `.github/workflows/ci.yml` remains unchanged and does not add `--max-warnings 0`.
- Fixed a static-response cache negotiation hole: gzip-eligible identity responses now send `Vary: Accept-Encoding`, preventing a shared cache from reusing an identity representation for requests whose accepted encodings differ.
- Extended the existing `Accept-Encoding` matrix to require `Vary` on both gzip and identity responses.
- `server/index.ts` remains unchanged at 399 lines.

Verification evidence:

1. Failure: `npx vitest run server/security.test.ts` failed the `identity` and `gzip;q=0, *` cases because their identity responses omitted `Vary`.
2. Cause: `server/static-files.ts` emitted `Vary: Accept-Encoding` only when gzip was selected, although representation selection also depends on that header when identity is selected.
3. Fix: compute gzip eligibility independently, emit `Vary` for every eligible response, and emit `Content-Encoding: gzip` only when gzip is selected.
4. Recheck:
   - `npx vitest run server/security.test.ts` — 38/38 passed.
   - `npx tsc --noEmit -p tsconfig.node.json` — passed.
   - `git diff --check -- server/static-files.ts server/security.test.ts` — passed.

No commit, branch, stash, or push operation was performed.
