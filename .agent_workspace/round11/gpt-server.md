MODEL_SLUG: gpt-5.6-sol-xhigh-fast

# Round 11 — server

## Bug fixed

`POST /api/rooms/:id/join` was public and had no rate limit. Repeated requests reached JSON parsing and room/invitation lookup indefinitely, unlike public room creation and AI POST routes.

The collaboration router now checks the existing bounded room limiter before parsing a join request. Join attempts use a `join:<client-ip>` key so they have a separate bucket from room creation. Exhausted requests return HTTP 429 with `ROOM_JOIN_RATE_LIMITED`.

## Regression evidence

- Before fix: `npx vitest run server/security.test.ts` failed because the second join attempt returned 404 instead of the expected 429.
- After fix: the same targeted suite passed, 28/28 tests.
- Added coverage: `server/security.test.ts` verifies repeated unauthenticated join attempts are limited.

## Verification

- `npx vitest run server` — passed, 20 files / 228 tests.
- `npx tsc --noEmit -p tsconfig.node.json` — passed.
- `wc -l server/index.ts` — `396 server/index.ts`.

No CORS or JSON media-type behavior was changed. No commit, branch, stash, or push was performed.
