# Round 1 Agent E — Pages probes

## Result

The Pages failure was triggered by the merge adding the workflow to `main`, but it was **not caused by merge damage or a bad output path**. GitHub Pages is not enabled for the repository (or its Source has not been set to GitHub Actions), which is an explicit prerequisite in both the workflow comment and `docs/deployment/public-demo.md`.

No workflow or Wrangler change is justified.

## 1. Conflict-marker probe

Command:

```sh
git grep -n -I -E '^(<<<<<<<( |$)|\|\|\|\|\|\|\|( |$)|=======$|>>>>>>>( |$))' -- .
```

Matches:

```text
.agent_workspace/r1-opus-r12.md:253:<<<<<<< HEAD
.agent_workspace/r1-opus-r12.md:255:=======
.agent_workspace/r1-opus-r12.md:258:>>>>>>> origin/cursor/r12-1-app-stage-187a
```

These three strings are a quoted conflict example inside a fenced Markdown block, not an unresolved repository conflict. `git ls-files -u` returned no entries. No other tracked conflict-marker lines were found, including Markdown.

## 2. Actions runs: failure → cause

Both runs were for the same push, merge commit `388eafc288e6c3449c2084e3c8034763969863e2`:

- [pages run 32807192510](https://github.com/Xhhemoing/cengfan-map-studio/actions/runs/32807192510): failed
- [CI run 32807192512](https://github.com/Xhhemoing/cengfan-map-studio/actions/runs/32807192512): succeeded

Evidence chain:

1. Pages `npm ci` succeeded.
2. Pages `npm run build` succeeded. Vite logged `dist/index.html`, hashed assets under `dist/assets/`, and `✓ built in 1.27s`.
3. `actions/upload-pages-artifact@v3` successfully archived `dist`, including `index.html`, `404.html`, assets, and public files. Artifact `9548548271` was finalized at 43,938,071 bytes.
4. Only `actions/deploy-pages@v4` failed. It found the artifact, then GitHub's Pages deployment API returned `404 Not Found`:

   ```text
   Error: Failed to create deployment (status: 404) ...
   Ensure GitHub Pages has been enabled:
   https://github.com/Xhhemoing/cengfan-map-studio/settings/pages
   ```

5. An independent read of `GET /repos/Xhhemoing/cengfan-map-studio/pages` also returned HTTP 404. The repository itself is public, and the response advertises the `pages=read` API permission, so this is consistent with there being no enabled Pages site.
6. The successful CI run independently completed typecheck, lint, and all tests (`351` files passed, `2` skipped; `2411` tests passed, `2` skipped). CI does not call the Pages deployment API, so its success is compatible with the repository-setting failure.

**Failure → cause:** deployment creation 404 → no enabled GitHub Pages site / GitHub Actions source → repository setting prerequisite was not completed.

**Merge attribution:** the merge caused the first `main` push execution because `.github/workflows/pages.yml` was newly introduced to `main`. It did not corrupt the workflow. The merged `pages.yml` and `wrangler.toml` are byte-for-byte identical to source commit `5e5405c` (matching Git blob hashes), and the build/upload stages prove their paths work.

## 3. Configuration versus actual merged paths

| Consumer | Configured path/base | Merged implementation and run evidence | Verdict |
|---|---|---|---|
| GitHub Pages artifact | `.github/workflows/pages.yml`: `path: dist` | `scripts/build.mjs` runs Vite's default `dist` build and copies `dist/index.html` to `dist/404.html`; run logs show both and a successful upload | Correct |
| GitHub project-site base | `BASE_PATH=/cengfan-map-studio/` | `vite.config.ts` maps `BASE_PATH` to Vite `base`; this matches the repository project URL | Correct |
| Cloudflare Pages | `wrangler.toml`: `pages_build_output_dir = "./dist"` | Same root-level build emits `dist` | Correct |
| Static-only scope | Workflow builds the frontend and uploads `dist` | Node API currently lives under root `server/`; it is intentionally not uploaded to either static Pages target | Correct |

The Cloudflare `wrangler.toml` does not control GitHub Pages deployment; both configurations merely agree on the same actual root-level `dist` output.

## Required external remediation

Repository owner: open **Settings → Pages**, set **Source** to **GitHub Actions**, then rerun the Pages workflow. This is the documented setup step at `docs/deployment/public-demo.md:34-38`. No repository commit can substitute for that missing repository setting under the current deployment contract.
