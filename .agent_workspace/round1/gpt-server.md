MODEL_SLUG: gpt-5.6-sol-xhigh-fast

# Round 1 — embedded Node API hardening

## Routes hardened

- `PUT /api/workspace`
- `POST /api/rooms`
- `POST /api/rooms/:id/invitations`
- `POST /api/rooms/:id/join`
- `POST /api/rooms/:id/transactions`
- `POST /api/rooms/:id/members`
- `POST /api/rooms/:id/leave`
- `POST /api/rooms/:id/access`
- `POST /api/ai/agent`
- `POST /api/ai/parse-data`
- `POST /api/ai/propose-edits`
- `POST /api/ai/explain`

All JSON-reading routes now reject `null`, arrays, strings, and missing required fields with a 4xx JSON error envelope containing `error.code` and `requestId`. Oversized AI and collaboration bodies return `REQUEST_TOO_LARGE`; invalid AI message-role types return `AI_VALIDATION_ERROR`.

## Structural changes

- Extracted request IDs, JSON parsing, body limits, CORS/security headers, JSON sending, and shared error codes to `server/http-utils.ts`.
- Extracted AI, collaboration, static-file, and workspace-auth routing concerns from `server/index.ts`; it is now 400 lines and remains the application router/entry point.
- Split collaboration contracts, errors, and security/size utilities from `server/collaboration.ts`; the store is now 395 lines.
- Preserved production config/lifecycle behavior and added security headers to collaboration SSE responses.

## Collaboration edge behavior

- Invalid room tokens remain forbidden.
- A client ID cannot join the same room twice, even with a fresh invitation (`ALREADY_JOINED`, HTTP 409).
- Closed rooms reject invitations, joins, writes, heartbeats, access changes, and leave mutations.
- Room creation and transactions enforce serialized snapshot-size limits (`SNAPSHOT_TOO_LARGE`, HTTP 413).
- Viewer tokens cannot submit room changes; member heartbeat/leave and owner access mutations are bound to the client represented by the token.

## Verification

- Required Vitest suite: 4 files passed, 95 tests passed.
- `npx tsc -p tsconfig.node.json --noEmit`: passed after correcting the extracted legacy-AI runner's generic result constraint.
- `npx eslint server`: passed after removing one stale extraction import.
- Failure chain: initial tests exposed two now-invalid leave expectations and missing transaction pre-validation; fixed both and reran the identical suite successfully.

## Leftover risks

- Collaboration rooms, invitations, and access tokens remain process-memory state and are lost on restart.
- Voluntary leave removes member presence but does not revoke the room token; token revocation would be a separate compatibility-sensitive contract change.
- Snapshot byte checks serialize once before cloning/applying, so very large near-limit updates still incur bounded serialization and cloning overhead.

No payment flow, cloud identity claim, account-level identity, or fake account system was added.
