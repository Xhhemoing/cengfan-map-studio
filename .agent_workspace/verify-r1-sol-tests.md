# Round 1 Agent F verification

- Verified HEAD: `388eafc288e6c3449c2084e3c8034763969863e2`
- HEAD matches local `main` and `origin/main`.
- `node_modules` was present, so `npm ci` was not run.
- Commands were run sequentially in CI order.

| Command | Exit code | Fail count | Result |
| --- | ---: | ---: | --- |
| `npm run typecheck` | 0 | 0 | Passed |
| `npm run lint` | 0 | 0 errors | Passed with 5 warnings |
| `npm test` | 0 | 0 failing tests | 351 files passed, 2 skipped; 2411 tests passed, 2 skipped |

The full-test command is the command used by `.github/workflows/ci.yml`.
