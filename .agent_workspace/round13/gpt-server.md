# R13 gpt-server

MODEL_SLUG: gpt-5.6-sol-xhigh-fast

## Result

Added HTTP-level regressions proving that a server bound to `127.0.0.1` accepts `Host` values `localhost`, `127.0.0.1`, `localhost:8787`, and `[::1]:8787`. The existing regression continues to prove that `Host: evil.example` is rejected with `421 MISDIRECTED_REQUEST` and no CORS allow-origin header.

No false denial was found. `server/host-validation.ts` already parses optional ports with `URL`, strips IPv6 brackets, and recognizes both IPv4 and IPv6 loopback addresses, so production code did not require a change. The 415 media-type checks, CORS behavior, join rate limit, and hostile-Host denial were not weakened.

## Verification

- `npx vitest run server` — 20 files, 233 tests passed.
- `npx tsc -p tsconfig.node.json` — passed.
- `wc -l server/index.ts` — 398 lines (limit 400).
- No git commit, stash, branch, or push was performed.
