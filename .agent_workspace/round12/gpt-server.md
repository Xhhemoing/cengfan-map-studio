# R12 gpt-server

MODEL_SLUG: gpt-5.6-sol-xhigh-fast

## Hole fixed

A server explicitly bound to a loopback address accepted arbitrary `Host` headers. A hostile site whose DNS answer changes to `127.0.0.1` could therefore address the local API as `evil.example`.

`server/host-validation.ts` now permits only loopback IP literals, `localhost`, and `*.localhost` when the listening socket itself is loopback-bound. Non-loopback listeners retain virtual-host and reverse-proxy behavior. Rejected requests return JSON `421 MISDIRECTED_REQUEST` before routing, and the existing CORS allowlist remains unchanged.

## Regression evidence

1. Failure: the new focused test received `200` for `Host: evil.example`.
2. Cause: `requireHostHeader` checked only that `Host` existed; no host value validation existed.
3. Fix: validate the request host against the loopback-only allowlist before any route handler.
4. Recheck: focused regression passed; the security suite initially found an older absolute-form fixture using placeholder `Host: studio.example`, which was corrected to `localhost`; the same security suite then passed all 29 tests.

## Verification

- `npx vitest run server` — 20 files, 229 tests passed.
- `npx tsc -p tsconfig.node.json` — passed.
- `wc -l server/index.ts` — 398 lines (limit 400).
- No git commit, stash, branch, or push was performed.
