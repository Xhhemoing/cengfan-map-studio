
## [ERR-20260806-DEEPSEEK-UI-POLISH-DISPATCH]

**Logged**: 2026-08-06T06:41:00Z
**Priority**: medium
**Status**: resolved
**Area**: tooling

### Summary
The requested `deepseek/deepseek-v4-flash` implementation-agent dispatch failed because the subagent tool resolves a registered agent name, not a provider/model identifier.

### Context
- Task: implement the Notion-inspired Atelier polish plan and compact inspector property pairs.
- Runs `mshf4ife-f90d7a23`, `mshf4qjl-47ecc439`, `mshfc4h2-45994958`, and `mshfchlt-ab99df6b` all failed with `Unknown agent`.
- The underlying model was healthy: `pi --provider deepseek --model deepseek-v4-flash --no-tools --no-session --print "Reply with exactly READY."` returned `READY`.

### Resolution
Added `.pi/agents/deepseek-v4-flash.md`, which registers the agent name `deepseek-v4-flash`, routes it to `deepseek/deepseek-v4-flash`, and permits the standard coding tools. The end-to-end subagent probe `mshfhg5a-519bfbdb` returned `READY`.

### Metadata
- Reproducible: yes
- Related Files: `.pi/agents/deepseek-v4-flash.md`, `docs/superpowers/plans/2026-08-06-notion-inspired-editor-polish-plan.md`

---

## [ERR-20260806-PLAYWRIGHT-BROWSER-MISSING]

**Logged**: 2026-08-06T06:37:40Z
**Priority**: low
**Status**: blocked
**Area**: tooling

### Summary
The installed Playwright CLI has no downloaded Chromium headless-shell binary, so screenshot verification could not run.

### Error
`Executable doesn't exist at C:\\Users\\86080\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1234\\chrome-headless-shell-win64\\chrome-headless-shell.exe`

### Context
- Attempted `npx playwright screenshot` against the active local Vite server.
- The npx-resolved playwright 1.62.1 expects headless-shell 1234; only chromium 1228 (full Chrome) is installed.

### Resolution (2026-08-06, Notion polish verification)
- No download was performed (per repo constraint).
- Per the polish plan, a missing Playwright browser must not be worked around with an alternate browser or with extra verification tooling.
- Visual verification of the Notion-inspired polish remains blocked; manual browser verification (desktop and narrow widths per plan Step 4) is required.
- Follow-up: install the playwright 1.62-compatible headless shell (or pin playwright) before future visual regression runs.
- The CLI recommends `npx playwright install`, which would download a browser binary and was not run automatically.

### Suggested Fix
Install the approved Playwright browser in the development environment, then complete manual browser verification of the polish changes.

### Metadata
- Reproducible: yes
- Related Files: `package.json`

---

## [ERR-20260806-SINGLE-SIDEBAR-TSC]

**Logged**: 2026-08-06T06:35:30Z
**Priority**: medium
**Status**: resolved
**Area**: frontend

### Summary
The first single-right-sidebar extraction left obsolete content-layout props and removed a type context used by the shared asset panel props.

### Error
`TS6133` for unused restore-position helpers; `TS7006` for implicit callback parameters; `TS2322` for stale test props; and `TS2304` for a removed selection label helper.

### Context
- `ContentLayoutWorkspace` no longer owns outline, layout-health, or manual-position controls.
- `mapStyleAssetPanelProps` now serves only the content workspace but temporarily lost its `ContentAssetPanelProps` annotation.

### Resolution
- Remove the obsolete callbacks and test props.
- Keep `ContentAssetPanelProps` as the explicit asset-panel contract and retain the small current-selection label helper.

### Metadata
- Reproducible: yes
- Related Files: `src/App.tsx`, `src/components/workspaces/ContentLayoutWorkspace.tsx`

---

## [ERR-20260806-DEV-PORT-COLLISION]

**Logged**: 2026-08-06T06:34:45Z
**Priority**: low
**Status**: pending
**Area**: tooling

### Summary
Starting the combined development command could not start its API process because port 8787 was already occupied.

### Error
`listen EADDRINUSE: address already in use 0.0.0.0:8787`

### Context
- `npm run dev` selected Vite port 5175 after 5173 and 5174 were already occupied.
- The existing Vite server at `http://localhost:5173/` responds with HTTP 200.
- The API process attempted to bind 8787 and exited because another process already owns it.

### Suggested Fix
Reuse the existing local API server or add configurable API-port handling to `scripts/dev.mjs`.

### Metadata
- Reproducible: yes
- Related Files: `scripts/dev.mjs`

---

## [ERR-20260806-IMPECCABLE-PATH]

**Logged**: 2026-08-06T00:00:00Z
**Priority**: low
**Status**: resolved
**Area**: tooling

### Summary
The Impeccable context script is installed outside this repository and fails when invoked through a project-relative skill path.

### Error
`Cannot find module 'E:\\Project\\蹭饭图\\.agents\\skills\\impeccable\\scripts\\context.mjs'`

### Context
- The requested UI planning work uses the global skill installation.
- The correct script is `C:\\Users\\86080\\.agents\\skills\\impeccable\\scripts\\context.mjs`.

### Suggested Fix
Always resolve the supplied skill location before invoking its scripts.

### Metadata
- Reproducible: yes
- Related Files: `C:\\Users\\86080\\.agents\\skills\\impeccable\\scripts\\context.mjs`

### Resolution
- **Resolved**: 2026-08-06T00:00:00Z
- **Notes**: The global skill root was found and will be used for the next context load.

---

## [ERR-20260806-BROWSER-SCRIPT-PATH]

**Logged**: 2026-08-06T00:00:00Z
**Priority**: low
**Status**: pending
**Area**: tooling

### Summary
The browser skill documents JavaScript helpers that are absent from its installed global skill directory.

### Error
`Cannot find module 'C:\\Users\\86080\\.agents\\skills\\browser\\scripts\\start.js'`

### Context
- A visual brainstorming prototype was ready for local browser inspection.
- The skill directory exists but does not contain the documented launcher at that path.

### Suggested Fix
Inspect the installed browser skill contents and use its actual script names, or start an available Chromium browser manually with CDP.

### Metadata
- Reproducible: yes
- Related Files: `C:\\Users\\86080\\.agents\\skills\\browser\\SKILL.md`

---

## [ERR-20260806-SUBAGENT-MODEL-ROUTING]

**Logged**: 2026-08-06T00:00:00Z
**Priority**: medium
**Status**: pending
**Area**: tooling

### Summary
The requested `deepseekv4flash` and `gpt-5.6-luna` subagent review runs failed before producing a result.

### Error
Subagent runs `msgz6ci8-185c6e2f` and `msgz6ci8-2c9dac28` returned `failed` with no result payload.

### Context
- Both runs used the same review-only task and repository working directory.
- No project file was modified by either subagent.

### Suggested Fix
Expose model-routing failure details or register the requested model aliases for the subagent runner.

### Metadata
- Reproducible: unknown
- Related Files: `E:\\Project\\蹭饭图\\.superpowers\\brainstorm\\2485-1785987242\\layout-direction-b.html`

---

## [ERR-20260805-BROWSER-CDP]

**Logged**: 2026-08-05T16:16:00Z
**Priority**: low
**Status**: pending
**Area**: tooling

### Summary
The browser skill's documented launcher assumes Google Chrome and its `nav.cjs --new` helper uses an HTTP verb Edge rejects.

### Error
`spawn C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe ENOENT`

### Context
- Google Chrome is not installed at the launcher path; Microsoft Edge and Playwright Chromium are available.
- Launching Edge manually with `--remote-debugging-port=9222` works.
- Edge requires `PUT /json/new`; the helper currently sends `GET` and cannot create a tab.

### Suggested Fix
Update the browser skill launcher to discover Edge/Playwright Chromium on Windows and use `PUT` when creating a CDP target.

### Metadata
- Reproducible: yes
- Related Files: `C:\\Users\\86080\\.agents\\skills\\browser\\scripts\\start.cjs`, `C:\\Users\\86080\\.agents\\skills\\browser\\scripts\\nav.cjs`

---

## [ERR-20260803-LOCAL-RSYNC]

**Logged**: 2026-08-03T16:00:00Z
**Priority**: low
**Status**: resolved
**Area**: infra

### Summary
The local deployment environment has no `rsync` executable.

### Error
`rsync: command not found`

### Context
- Deployment to the configured Hermes server initially used an rsync transfer.
- No remote files were modified because the command failed before connecting for transfer.

### Suggested Fix
Use the available `tar | ssh` streaming transfer with explicit exclusions for runtime data and environment files.

### Metadata
- Reproducible: yes
- Related Files: `.hermes.md`

### Resolution
- **Resolved**: 2026-08-03T16:00:00Z
- **Notes**: Switched to the verified tar-over-SSH deployment path.

---

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

## [ERR-20260804-MEMORY-WRITE]

**Logged**: 2026-08-04T00:00:00+08:00
**Priority**: low
**Status**: pending
**Area**: infra

### Summary
Global memory rule write was rejected by the automatic approval service.

### Error
The memory patch was rejected because the configured automatic review model returned `404 Not Found`.

### Context
- The user explicitly requested a global rule forbidding Codex from creating branches without confirmation.
- No workaround or indirect write was attempted.

### Suggested Fix
Retry the approved memory-note write when the automatic approval service is available.

### Metadata
- Reproducible: unknown
- Related Files: `C:\Users\86080\.codex\memories\extensions\ad_hoc\notes\20260804-no-autonomous-branch-creation.md`

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

---

## [ERR-20260804-GRAPHIFY-PYTHON]

**Logged**: 2026-08-04T00:30:00+08:00
**Priority**: low
**Status**: pending
**Area**: tooling

### Summary
The existing Graphify launcher cannot query the repository graph because its Python interpreter no longer exists.

### Error
`graphify query` failed because the launcher points to a removed WindowsApps Python 3.13 executable.

### Context
- `graphify-out/graph.json` already exists, so the normal fast path is a direct query.
- The failure is limited to the local Graphify runtime; source inspection remains available.

### Suggested Fix
Reinstall Graphify against an available Python runtime or refresh its launcher and `.graphify_python` path.

### Metadata
- Reproducible: yes
- Related Files: `graphify-out/.graphify_python`, `graphify-out/graph.json`

---

## [ERR-20260804-RG-POWERSHELL-GLOB]

**Logged**: 2026-08-04T00:32:00+08:00
**Priority**: low
**Status**: resolved
**Area**: tooling

### Summary
PowerShell passed an unexpanded recursive wildcard path to ripgrep, which Windows rejected.

### Error
`rg ... src/**/*.test.ts*` and `rg ... src/components/canvas/*.tsx` returned OS error 123.

### Context
- The commands were read-only canvas performance inventory checks.
- PowerShell does not expand these path patterns the same way as Bash.

### Suggested Fix
Search the directory and use ripgrep's `-g` filters for file patterns.

### Metadata
- Reproducible: yes
- Related Files: `src/components/canvas`

### Resolution
- **Resolved**: 2026-08-04T00:32:00+08:00
- **Notes**: Subsequent searches use directory arguments with `-g '*.tsx'` and `-g '*.ts'`.

---

## [ERR-20260804-POWERSHELL-QUOTE]

**Logged**: 2026-08-04T00:45:00+08:00
**Priority**: low
**Status**: resolved
**Area**: tooling

### Summary
A nested quoted ripgrep pattern made PowerShell reject a read-only render-settings command before execution.

### Error
`The string is missing the terminator: "`.

### Context
- The command only intended to read `src/lib/render-settings.ts` and its tests.
- No process started and no project file was changed.

### Suggested Fix
Use direct `Get-Content -Raw` reads when a separate pattern search is unnecessary.

### Metadata
- Reproducible: yes
- Related Files: `src/lib/render-settings.ts`

### Resolution
- **Resolved**: 2026-08-04T00:45:00+08:00
- **Notes**: Re-ran the inspection with direct file reads.

---

## [ERR-20260804-GRAPHIFY-RUNTIME]

**Logged**: 2026-08-04T00:50:00+08:00
**Priority**: low
**Status**: unresolved
**Area**: tooling

### Summary
The repository's Graphify launcher points to a missing Python 3.13 WindowsApps runtime.

### Error
`graphify query` failed because the executable was not found at the recorded WindowsApps Python path.

### Context
- The existing `graphify-out/.graphify_python` contains the same unavailable runtime path.
- The failure occurred before any repository source was read or changed by Graphify.

### Suggested Fix
Repair or reinstall the Graphify runtime entry, then refresh `graphify-out/.graphify_python`.

---

## [ERR-20260804-START-PROCESS-PATH]

**Logged**: 2026-08-04T10:08:00+08:00
**Priority**: low
**Status**: unresolved
**Area**: tooling

### Summary
PowerShell `Start-Process` could not launch the local Vite server because its inherited environment contained a duplicate `PATH` key.

### Error
`Item has already been added. Key in dictionary: 'Path' Key being added: 'PATH'`

### Context
- The command was only intended to start Vite on port 4173 for browser validation.
- The server did not start and no application file was changed.

### Suggested Fix
Run Vite in a foreground terminal session or start it through a shell without rebuilding the environment dictionary.

## [ERR-20260805-001] subagent-run-file-write

**Logged**: 2026-08-05
**Priority**: medium

子智能体调度失败：运行记录临时文件重命名返回 EPERM，未开始实现。当前工作区保持原状。

## [ERR-20260806-001] tokenfree_luna_subagent_spawn

**Logged**: 2026-08-06T00:00:00Z
**Priority**: high
**Status**: in_progress
**Area**: infra

### Summary
Specified tokenfree Luna subagent process failed to spawn.

### Error
```
Failed to spawn subagent process
```

### Context
- Attempted `subagent_spawn` with model `tokenfree/gpt-5.6-luna`, project cwd, clean built-in tools, and direct workspace writes.
- No child run id was created.
- No credentials or prompt bodies are recorded here.

### Suggested Fix
Inspect configured Pi model aliases/provider mappings, then retry with an available exact Luna model identifier.

### Metadata
- Reproducible: unknown
- Related Files: docs/superpowers/plans/2026-08-06-ai-calling-platform-hardening.md

---

## [ERR-20260805-BROWSER-SKILL-PATH] browser skill startup

**Logged**: 2026-08-05T00:00:00Z
**Priority**: low
**Status**: pending
**Area**: infra

### Summary
Browser skill documentation referenced a script path that is absent from the installed skill directory.

### Error
```
Cannot find module 'C:\\Users\\86080\\.agents\\skills\\browser\\scripts\\start.js'
```

### Context
- Attempted to start Chrome through the browser skill while refining a local design prototype.
- No application files were changed by the failed command.

### Suggested Fix
Use the installed `.cjs` script names rather than the stale `.js` names in the skill text. The local Chrome path is also absent, so browser automation requires a configured Chrome/Edge executable; use a foreground static server for visual-companion previews when no browser is available.

### Metadata
- Reproducible: yes
- Related Files: `C:\\Users\\86080\\.agents\\skills\\browser\\SKILL.md`

---

## [ERR-20260805-005] worktree-full-test-aborted

**Logged**: 2026-08-05T22:18:11+08:00
**Priority**: medium
**Status**: resolved
**Area**: tests

### Summary
The full Vitest command in the isolated worktree was aborted before it produced a pass or failure result.

### Error
```
Command aborted
```

### Context
- `npm test`, `npm run lint`, and `npm run build` were started together despite the repository guidance to serialize heavy validation.
- Lint and build completed; the test process emitted only the Vitest header before the harness stopped it.

### Suggested Fix
Rerun `npm test` by itself from the isolated worktree, then keep full validation commands serialized.

### Metadata
- Reproducible: unknown
- Related Files: scripts/run-heavy.mjs

### Resolution
- **Resolved**: 2026-08-05T22:22:20+08:00
- **Notes**: Serialized rerun of `npm test` completed with 137 test files and 940 tests passing.

---

## [ERR-20260805-004] worktree-test-command-cwd

**Logged**: 2026-08-05T22:10:03+08:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
A focused test command ran in the primary checkout rather than the isolated worktree and therefore selected no tests.

### Error
```
Test Files 1 skipped; Tests 94 skipped
```

### Context
- The shell command did not change into `.worktrees/non-ai-optimizations`.
- The isolated worktree contains the uncommitted delivery failure test.

### Suggested Fix
Prefix worktree validation commands with `cd .worktrees/non-ai-optimizations`.

### Metadata
- Reproducible: yes
- Related Files: src/App.test.tsx

### Resolution
- **Resolved**: 2026-08-05T22:10:03+08:00
- **Notes**: Subsequent focused validation will run from the isolated worktree.

---

## [ERR-20260805-003] worktree-npm-install-network

**Logged**: 2026-08-05T22:06:28+08:00
**Priority**: medium
**Status**: pending
**Area**: infra

### Summary
Dependency installation in the isolated worktree could not reach the configured npm mirror.

### Error
```
ENOTFOUND mirrors.tencentyun.com while fetching undici-7.28.0.tgz
```

### Context
- The worktree was rebased to the current main head before installation.
- npm also reported Windows EPERM cleanup warnings before the network failure.

### Suggested Fix
Use the root workspace dependencies for immediate local verification or restore network access to the configured npm mirror before a clean worktree install.

### Metadata
- Reproducible: unknown
- Related Files: package-lock.json

---

## [ERR-20260805-002] layout-benchmark-direct-node

**Logged**: 2026-08-05T21:28:08+08:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
The documented layout benchmark command used Node directly on a TypeScript module and failed module resolution.

### Error
```
ERR_MODULE_NOT_FOUND: Cannot find module '.../src/lib/card-layout'
```

### Context
- `node scripts/perf-layout-bench.ts` cannot execute TypeScript source imports in this project.
- `npx tsx scripts/perf-layout-bench.ts` completed successfully.

### Suggested Fix
Keep the benchmark invocation on the tsx runtime; add an npm script when the benchmark becomes a routine acceptance check.

### Metadata
- Reproducible: yes
- Related Files: scripts/perf-layout-bench.ts

### Resolution
- **Resolved**: 2026-08-05T21:28:08+08:00
- **Notes**: Verified the benchmark through `npx tsx`.

---
