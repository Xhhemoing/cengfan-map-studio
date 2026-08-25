MODEL_SLUG: gpt-5.6-sol-xhigh-fast

Files changed:
- `server/client-ip.ts`: made the leading `::ffff:` strip case-insensitive without lowercasing the address.
- `server/client-ip.test.ts`: covered mixed-case XFF/socket values, lowercase compatibility, and unchanged real IPv6.

Tests run:
- `npx vitest run server/client-ip.test.ts` — passed, 35/35 tests.
- `npx tsc --noEmit -p tsconfig.node.json` — passed.

Evidence chain:
- Failure condition: the final case-sensitive regex retained uppercase or mixed-case IPv4-mapped prefixes.
- Cause: `/^::ffff:/` matched only lowercase text.
- Fix: changed it to `/^::ffff:/i`; the start anchor prevents stripping embedded IPv6 text.
- Recheck: focused Vitest and Node TypeScript checks both passed; no verification failures occurred.
