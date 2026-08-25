MODEL_SLUG: gpt-5.6-sol-xhigh-fast

Files changed:
- `server/client-ip.ts`
- `server/client-ip.test.ts`

Tests run:
- `npx vitest run server/client-ip.test.ts` — passed (31 tests)
- `npx tsc --noEmit -p tsconfig.node.json` — passed

Evidence chain:
- Failure: X-Forwarded-For and X-Real-IP hops bypassed the quoted-address normalization used by Forwarded, so quoted addresses retained their quotes.
- Cause: `rightmostHop` only trimmed hops, stripped IPv4 ports, filtered unusable values, and unwrapped brackets.
- Fix: routed each candidate through the existing Forwarded address normalizer, preserving quote validation/unescaping, unknown and obfuscated-hop filtering, IPv4 port stripping, bracketed IPv6 unwrapping, and final `::ffff:` stripping. Added all requested regression cases.
- Recheck: the focused Vitest suite and Node TypeScript type-check both completed successfully on the first run.
