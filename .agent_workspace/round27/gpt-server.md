MODEL_SLUG: gpt-5.6-sol-xhigh-fast

Files changed:
- `server/client-ip.ts`: shared bracketed-address unwrapping between XFF/X-Real-IP and Forwarded normalization.
- `server/client-ip.test.ts`: added bracketed IPv6 coverage for XFF (with and without a port) and X-Real-IP; retained coverage for unbracketed IPv6, IPv4 ports, and untrusted proxies.

Tests run:
- `npx vitest run server/client-ip.test.ts` — passed (25 tests).
- `npx tsc --noEmit -p tsconfig.node.json` — passed.
- `git diff --check -- server/client-ip.ts server/client-ip.test.ts` — passed.

Evidence chain:
- Failure: bracketed IPv6 XFF/X-Real-IP hops were returned with brackets.
- Cause: `rightmostHop` stripped only IPv4 ports and returned the remaining hop directly, while bracket unwrapping existed only in Forwarded handling.
- Fix: added one small shared bracket-unwrapping helper and applied it after XFF/X-Real-IP trimming, IPv4-port stripping, and unusable-hop skipping.
- Recheck: all 25 targeted tests and the Node TypeScript check passed; no verification command failed.
