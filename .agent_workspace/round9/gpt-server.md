# Round 9 — GPT server

## Hole addressed

JSON endpoints accepted bodies with any media type, including `text/plain`. In a browser, `text/plain` is a CORS-safelisted request type, so a cross-origin page could send a simple POST to public room or AI endpoints without first passing a CORS preflight.

## Change

- `readJson` now requires `application/json` or an `application/*+json` structured media type and returns `415 UNSUPPORTED_MEDIA_TYPE` otherwise.
- Request-body parse errors share a typed base error so `index.ts` can map 400, 413, and 415 responses consistently without growing beyond its line limit.
- Regression coverage verifies room and AI routes reject `text/plain`, preserve the request ID in the error envelope, and accept vendor JSON media types with parameters.

## Verification

- `npx vitest run server/security.test.ts` — 26 passed.
- `npx vitest run server` — 20 files, 226 tests passed.
- `npx tsc --noEmit -p tsconfig.node.json` — passed.
- Line limits: `server/index.ts` 396; `server/collaboration.ts` 293.
