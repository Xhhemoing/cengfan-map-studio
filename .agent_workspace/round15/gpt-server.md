# R15-gpt-server

## Result

- Added `.github/workflows/ci.yml`.
- The workflow runs for every pull request and for pushes to `main` or
  `cursor/agent-sota-polish-cbcd`.
- It uses Node.js 22, installs with `npm ci` when `package-lock.json` exists
  (falling back to `npm install`), then runs both TypeScript checks and Vitest.
- No Playwright or server changes were added. Existing 415, CORS, Host, and
  rate-limit behavior remains untouched.

## Validation

- `npx tsc --noEmit -p tsconfig.app.json` — passed.
- `npx tsc --noEmit -p tsconfig.node.json` — passed.
- `npx vitest run` — passed: 203 test files, 1,781 tests.

## Acceptance

Open or update a pull request, or push to either configured branch, and confirm
the GitHub Actions `CI / test` job completes successfully.
