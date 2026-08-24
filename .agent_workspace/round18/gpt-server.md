MODEL_SLUG: gpt-5.6-sol-xhigh-fast

# R18 gpt-server report

- Added a dedicated `Lint` step to `.github/workflows/ci.yml` after both TypeScript checks and before Vitest.
- The step runs `npx eslint .` directly; it does not invoke `scripts/run-heavy.mjs`, and GitHub Actions executes these job steps sequentially.
- Preserved Node 22, `concurrency.cancel-in-progress: true`, and `permissions.contents: read`.
- YAML structure was manually checked: the lint step has the same indentation and `name`/`run` shape as the adjacent type-check and test steps.
- Verification: `npx eslint server/index.ts` passed with exit code 0.
- No source files or ESLint configuration were changed.
