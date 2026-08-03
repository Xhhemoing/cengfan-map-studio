
## [ERR-20260802-NPM]

**Logged**: 2026-08-02T18:40:00+08:00
**Priority**: medium
**Status**: pending
**Area**: infra

### Summary
Dependency installation cannot complete on the Windows workspace because the configured npm mirror cannot resolve.

### Error
`npm install --ignore-scripts --cache C:\\tmp\\cengfan-map-npm-cache` failed with `ENOTFOUND` while downloading `zod-validation-error` from `mirrors.tencentyun.com`; the repository's `bash` wrapper also cannot run on Windows.

### Context
- Needed to run Vitest and build verification after adding the theme contract.
- Install left a partially populated `node_modules` directory; no destructive cleanup was attempted.

### Suggested Fix
Use the workspace's available package mirror or a complete dependency cache, then run `npx vitest`, `tsc -b`, and `vite build` directly on Windows.

### Metadata
- Reproducible: yes
- Related Files: `package.json`, `package-lock.json`

---

## [ERR-20260802-PATH]

**Logged**: 2026-08-02T18:50:00+08:00
**Priority**: low
**Status**: resolved
**Area**: tooling

### Summary
The Impeccable context script was first invoked with a project-relative path that does not exist in this workspace.

### Error
`Cannot find module 'E:\\Project\\蹭饭图\\.agents\\skills\\impeccable\\scripts\\context.mjs'`

### Context
- The skill is installed outside the repository at `C:\\Users\\86080\\.agents\\skills\\impeccable`.
- The command was retried with the resolved absolute skill path.

### Suggested Fix
Use the resolved skill-root path when invoking skill scripts from this workspace.

### Metadata
- Reproducible: yes
- Related Files: `src/components/GlobalDataScreen.tsx`

### Resolution
- **Resolved**: 2026-08-02T18:50:00+08:00
- **Notes**: Retried with the absolute skill path.

---

## [ERR-20260802-VERIFY-TIMEOUT]

**Logged**: 2026-08-02T19:30:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: tests

### Summary
The parallel final verification command timed out before returning independent results.

### Error
`vitest run`, `tsc -b`, `vite build`, and `eslint .` were launched together; the combined shell call exceeded its timeout and left the repository Vitest worker running.

### Context
- The test worker command was verified by PID and terminated after the tool timeout.
- Earlier isolated typecheck, build, lint, detector, and focused test commands had already returned results.

### Suggested Fix
Run the expensive repository checks serially on this Windows workspace and use the direct installed binaries.

### Metadata
- Reproducible: unknown
- Related Files: `server/styles.test.ts`, `src/styles.css`

### Resolution
- **Resolved**: 2026-08-02T19:31:00+08:00
- **Notes**: The residual Vitest process was terminated after command-line verification; serial verification is being rerun.

---

## [ERR-20260802-VITEST-CLI]

**Logged**: 2026-08-02T19:32:00+08:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
The installed Vitest CLI does not recognize the `--minWorkers` option.

### Error
`CACError: Unknown option --minWorkers`

### Context
- The attempted command was `node_modules/.bin/vitest run --maxWorkers=1 --minWorkers=1`.
- No tests were executed by that command.

### Suggested Fix
Use only options exposed by the installed Vitest version, such as `--maxWorkers=1`.

### Metadata
- Reproducible: yes
- Related Files: `package.json`

### Resolution
- **Resolved**: 2026-08-02T19:32:00+08:00
- **Notes**: Vitest CLI reference was checked; the retry omits `--minWorkers`.

---

## [ERR-20260803-NPM-BASH]

**Logged**: 2026-08-03T10:35:00+08:00
**Priority**: low
**Status**: pending
**Area**: infra

### Summary
The repository's default npm test script cannot start on this Windows workspace because it invokes Bash.

### Error
`npm test -- --run` failed with `'bash' is not recognized as an internal or external command`.

### Context
- The command was run before implementing the resizable sidebar and scrollbar refinement.
- The failure occurred in the package script wrapper before Vitest executed.

### Suggested Fix
Run the installed Vitest binary directly on Windows, then run TypeScript and Vite checks using their direct Node entry points as needed.

### Metadata
- Reproducible: yes
- Related Files: `package.json`, `scripts/run-heavy.sh`

---

## [ERR-20260803-VITEST-BASELINE]

**Logged**: 2026-08-03T10:38:00+08:00
**Priority**: medium
**Status**: pending
**Area**: tests

### Summary
The full direct Vitest baseline did not complete in the Windows workspace.

### Error
`node_modules\\.bin\\vitest.cmd run --maxWorkers=1` emitted only `RUN v4.1.10 E:/Project/蹭饭图` and exited with code 1 without test results.

### Context
- The repository was already dirty before this task.
- The npm wrapper fails earlier because Bash is unavailable.

### Suggested Fix
Use focused Vitest files for this change and run TypeScript/Vite verification independently; investigate the full runner separately if it remains unstable.

### Metadata
- Reproducible: unknown
- Related Files: `package.json`, `src/App.test.tsx`

---

## [ERR-20260803-EDITOR-LAYOUT-TYPE]

**Logged**: 2026-08-03T11:20:00+08:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
TypeScript rejected the layout test's minimal storage stub when it was cast directly to the browser `Storage` interface.

### Error
`TS2352: Conversion of type ... to type Storage may be a mistake` because the test stub intentionally implemented only `getItem` and `setItem`.

### Context
- The production persistence helper only needs those two methods.
- The test stub exposed the narrower contract correctly, but the helper signature was too specific.

### Suggested Fix
Use a `StorageLike` type containing `getItem` and `setItem` for the helper boundary and cast the test stub to that contract.

### Metadata
- Reproducible: yes
- Related Files: `src/lib/editor-layout.ts`, `src/lib/editor-layout.test.ts`

### Resolution
- **Resolved**: 2026-08-03T11:21:00+08:00
- **Notes**: Added the narrower `StorageLike` interface and updated the tests.

---

## [ERR-20260803-BROWSER-QA]

**Logged**: 2026-08-03T12:02:00+08:00
**Priority**: low
**Status**: pending
**Area**: tooling

### Summary
The browser screenshot pass could not start because the configured Chrome binary is absent and the existing Edge process did not expose a CDP port.

### Error
- Browser skill launcher: `spawn C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe ENOENT`.
- Edge fallback on port 9222: no CDP endpoint became available.

### Context
- Vite is available at `http://127.0.0.1:5173/`.
- Static detector, focused tests, TypeScript, lint, and production build completed independently.
- No browser installation or existing process was modified.

### Suggested Fix
Open the local URL in a browser with remote debugging enabled to complete visual screenshot QA.

### Metadata
- Reproducible: yes
- Related Files: `src/styles.css`, `src/components/ResizablePanelDivider.tsx`

---

## [ERR-20260803-VITEST-FULL-TIMEOUT]

**Logged**: 2026-08-03T12:07:00+08:00
**Priority**: medium
**Status**: pending
**Area**: tests

### Summary
The full direct Vitest suite did not emit individual test results within four minutes.

### Error
`node_modules\\.bin\\vitest.cmd run --maxWorkers=1` timed out after 240 seconds with only `RUN v4.1.10 E:/Project/蹭饭图` in its output.

### Context
- The targeted suite covering this change completed with 70 passed tests.
- The npm wrapper remains unusable because it invokes Bash on Windows.
- No source process was intentionally left running by the command.

### Suggested Fix
Investigate the repository's full-suite worker hang independently; use focused Vitest commands on Windows until the runner issue is resolved.

### Metadata
- Reproducible: yes
- Related Files: `package.json`, `scripts/run-heavy.sh`
