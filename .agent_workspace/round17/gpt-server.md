MODEL_SLUG: gpt-5.6-sol-xhigh-fast

# Round 17 server report

Picked hole B.

- Changed `server/static-files.ts` so `Accept-Encoding: *` accepts gzip only when gzip is not explicitly rejected, while `identity` alone remains uncompressed.
- Added HTTP coverage in `server/security.test.ts` for `*`, weighted wildcard, `identity`, and `gzip;q=0, *`.
- Left `server/index.ts` unchanged at 398 lines.

Verification evidence:

1. Failure: `npx vitest run server/security.test.ts` failed 2 wildcard cases; 36 tests passed.
2. Cause: `acceptsGzip` recognized only an explicit `gzip` token and ignored RFC 9110 wildcard preferences.
3. Fix: parse both explicit gzip and wildcard preferences, with an explicit non-acceptable gzip preference taking precedence.
4. Recheck:
   - `npx vitest run server/security.test.ts` — 38/38 passed.
   - `npx tsc --noEmit -p tsconfig.node.json` — passed.
   - `git diff --check` — passed.

No commit, branch, stash, or push operation was performed.
