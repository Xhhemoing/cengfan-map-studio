MODEL_SLUG: gpt-5.6-sol-xhigh-fast

# Round 10 server report

- Added `X-Request-Id` to the explicit CORS request-header allowlist in `server/http-utils.ts`.
- Added an OPTIONS regression in `server/security.test.ts` covering an allowed origin with `x-request-id,content-type` and a disallowed origin with no CORS response headers.
- Confirmed the server implements GET, PUT, and POST API methods only; PATCH and DELETE remain absent from `Access-Control-Allow-Methods`.
- Left JSON media-type enforcement unchanged (`application/json` and `application/*+json` only).
- Audited request headers used by `server/**`; no additional same-class browser CORS omission was found.

Verification evidence:

1. Failure: the new targeted preflight test failed because `x-request-id` was absent from `Access-Control-Allow-Headers`.
2. Cause: `requestIdFor` consumes `x-request-id`, while `corsHeaders` did not allow it.
3. Fix: added only `X-Request-Id` to the existing tight allowlist.
4. Recheck:
   - Targeted regression: 1 passed.
   - `npx vitest run server`: 20 files and 227 tests passed.
   - `npx tsc --noEmit -p tsconfig.node.json`: passed.
   - `wc -l server/index.ts`: 396 lines (limit 400).
