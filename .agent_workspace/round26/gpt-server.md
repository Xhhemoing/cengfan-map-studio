MODEL_SLUG: gpt-5.6-sol-xhigh-fast

Files changed:
- `server/client-ip.ts`: right-to-left XFF/X-Real-IP selection now skips empty, `unknown`, and obfuscated hops after IPv4 port normalization.
- `server/client-ip.test.ts`: added trailing `unknown` and `_hidden` coverage; existing IPv4-port, IPv6, and untrusted-proxy tests remain passing.

Tests run:
- `npx vitest run server/client-ip.test.ts` — passed, 22/22 tests.
- `npx tsc --noEmit -p tsconfig.node.json` — passed.

Evidence chain:
- Failure risk: `rightmostHop` previously filtered only empty values, allowing trailing `unknown` or `_hidden` to win.
- Cause: usability checks were absent from XFF/X-Real-IP selection.
- Fix: scan candidates from right to left, trim and strip only IPv4 ports, then skip unusable hops.
- Recheck: targeted Vitest and Node TypeScript checks both passed.
