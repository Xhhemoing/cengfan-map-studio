# Regression probes — cycle 2 / round 2

## 1. Targeted Vitest regression suite

Command:

```sh
npx vitest run src/App.test.tsx src/lib/stage-overview.test.ts src/components/ProjectWorkbench.test.tsx src/components/ProjectWorkbench.reload-sample.test.tsx src/lib/template-package.test.ts src/components/HelpFeedbackMenu.test.tsx
```

Exit code: `0`

Result: 6 test files passed; 181 tests passed. Duration: 32.92s.

## 2. TypeScript application check

Command:

```sh
npx tsc --noEmit -p tsconfig.app.json
```

Exit code: `0`

Result: passed with no diagnostics.

## 3. Source regression markers

Command:

```sh
rg 'lastExportFileName|data-empty|打开项目与协作菜单|role="status"' src/
```

Exit code: `0` (matches found)

Result:

- `lastExportFileName` is wired through `src/lib/usePosterExport.ts`, `src/App.tsx`, and `src/components/workspaces/DeliveryWorkspace.tsx`, with focused coverage in `DeliveryWorkspace.test.tsx`.
- `data-empty` is produced in `src/lib/stage-overview.ts` and explicitly asserted in `src/lib/stage-overview.test.ts`.
- `打开项目与协作菜单` is the `ProjectMenu` trigger's accessible label and is asserted in `ProjectMenu.identity.test.tsx`.
- `role="status"` is present in the expected status/feedback UI and associated tests.

## Failures and cause hypotheses

No probe failed, so no failure cause hypothesis applies. No implementation change was made. The `data-empty` assertion is already present (`src/lib/stage-overview.test.ts`, line 60), so the permitted one-line assertion change was unnecessary.
