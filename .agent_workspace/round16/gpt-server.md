MODEL_SLUG: gpt-5.6-sol-xhigh-fast

# R16-gpt-server

## Result

- Added workflow-level concurrency keyed by workflow plus pull request number or
  Git ref, with `cancel-in-progress: true`.
- Kept Node.js 22, both TypeScript checks, and the complete Vitest run unchanged.
- Fixed static gzip negotiation so `Accept-Encoding: gzip;q=0` is respected.
- Added an HTTP regression test. Existing 415, CORS, Host, and room-join limits
  were not changed. `server/index.ts` remains at 398 lines.

## Failure → cause → fix → recheck

- The new focused test initially failed because the response still contained
  `Content-Encoding: gzip`.
- `acceptsGzip` matched the `gzip` token without parsing its quality value.
- It now parses each encoding entry and accepts gzip only with a valid positive
  quality value.
- `npx vitest run server/security.test.ts` then passed: 34 tests.

## Validation

- `npx tsc --noEmit -p tsconfig.app.json` — passed.
- `npx tsc --noEmit -p tsconfig.node.json` — passed.
- `npx vitest run` — passed: 206 test files, 1,802 tests.
- `git diff --check` — passed.

## Acceptance

Open or update a pull request twice on the same PR/branch and confirm the older
`CI / test` run is cancelled. Request a compressible static file with
`Accept-Encoding: gzip;q=0` and confirm no `Content-Encoding: gzip` header is
returned.
