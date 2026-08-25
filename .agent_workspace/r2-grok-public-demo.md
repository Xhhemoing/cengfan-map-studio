# Round 2 Agent A — public-static-demo-304c

**Model:** cursor-grok-4.6-high-fast  
**Target:** merge `origin/cursor/public-static-demo-304c` (`5e5405c`) into `cursor/merge-all-branches-e17a`  
**Status:** tree locked — `MERGE_HEAD` is `origin/cursor/canvas-render-display-46a1`. Did not abort, did not start a second merge, did not push.

Waited through several status checks; canvas merge still has UU: `src/App.tsx`, `PosterCanvas.reference-styles.test.tsx`, `useCardLayoutWorker.test.tsx`, `card-layout-cache.ts`, `card-layout-cache.test.ts`. Per fallback: intended resolution only.

## Policy

Keep HEAD architecture (split workbench tests, StudioRoutes, editorProjectStore, timeout/retry collaboration client, StorageNotice). Port unique user-facing static-demo behavior. Prefer ours for deleted/split `ProjectWorkbench.test.tsx`. Do not revert opt-continuous refactors.

## Intended resolution (per file)

### Conflict set from Round 1 abort

1. **`src/components/ProjectWorkbench.test.tsx` (deleted on HEAD)**  
   Keep deletion (`git rm`). Unique incoming assertion that still matters:

   ```
   it("explains the static demo limits when publicDemo is on")
   ```

   Port into `src/components/ProjectWorkbench.listing.test.tsx` (notice is workbench chrome, not storage). Extend harness `renderWorkbench` with a 4th arg `{ publicDemo?: boolean }` — do **not** change the 3rd `health` argument used by existing split tests.

2. **`src/components/ProjectWorkbench.tsx`**  
   Keep HEAD props (`health`, `recoverError`, StorageNotice). Add:
   - `import { isPublicDemoBuild, PROJECT_SOURCE_URL } from "../lib/public-base-path"`
   - `publicDemo?: boolean` on props
   - `publicDemo = isPublicDemoBuild()` default
   - After StorageNotice (both can show), the incoming `<section className="workbench-notice" role="note">` + AGPL source link

3. **`src/lib/collaboration-client.ts`**  
   Keep HEAD sendOnce / timeout / retry / persistence. Do **not** take incoming’s simplified `jsonRequest`. Port only:
   - `import { STATIC_HOST_API_HINT } from "./public-base-path"`
   - In `sendOnce`, after `fetch`, if `Content-Type` is present and not `application/json`, throw `CollaborationClientError("API_UNAVAILABLE", STATIC_HOST_API_HINT)` **before** JSON parse.
   - Keep HEAD’s parse-fail → `body = null` + preserve status (proxy/portal). Do not remap parse-fail to `API_UNAVAILABLE`.
   - `API_UNAVAILABLE` is not a transport code → no retry.

   Add unique test to HEAD `collaboration-client.test.ts` (keep `FakeEventSource`/`ok` fixtures):

   ```
   it("explains a missing JSON API on static hosts instead of throwing a parse error")
   ```

   Incoming extra tests (submitRoomSnapshot / operations / isOwnRoomAcknowledgement) already live in HEAD’s split collab tests — do not replace fixtures.

4. **`src/main.tsx`**  
   Keep StudioRoutes, `editorProjectStore`, `AppErrorBoundary projectStore={editorProjectStore}`.  
   Unique port: `import { isPrototypePath } from "./lib/public-base-path"` and replace `pathname === "/prototype"` with `isPrototypePath(window.location.pathname)` so GitHub Pages `/cengfan-map-studio/prototype` works.  
   Do **not** revert to `createIndexedDbProjectStore()` or inline `<App>` / `<ProjectWorkbench>`.

### Auto-merge / take-theirs (no architecture fight)

Take incoming new files as-is:

- `src/lib/public-base-path.ts` + `src/lib/public-base-path.test.ts`
- `docs/deployment/public-demo.md`
- `.github/workflows/pages.yml`
- `Dockerfile`, `.dockerignore`
- `public/_headers`, `public/_redirects`
- `wrangler.toml`

Surgical ports on shared files:

- **`src/lib/ai-client.ts`:** after existing code checks, `if (!data && (status === 404 || 405)) return new Error(STATIC_HOST_API_HINT)`.
- **`vite.config.ts`:** add `resolvePublicBasePath` + `base: resolvePublicBasePath(process.env.BASE_PATH ?? env.BASE_PATH)`. **Keep** HEAD `test.setupFiles` (`leaked-root-guard`). Incoming deletes it — reject that.
- **`src/vite-env.d.ts`:** add `ImportMetaEnv.VITE_PUBLIC_DEMO`; keep HEAD `*.geojson?raw`.
- **`scripts/build.mjs`:** after vite build, `copyFile("dist/index.html", "dist/404.html")` for Pages `/prototype`.
- **`src/styles.css`:** add `.workbench-notice` / `.workbench-notice a` next to `.workbench-error`. **Keep** all `.workbench-storage-notice*` (incoming deletes them because that branch had no StorageNotice).
- **`.env.example`:** comment `BASE_PATH` / `VITE_PUBLIC_DEMO=1`.
- **Docs:** README「在线试用」, USER_GUIDE demo first step, CONTRIBUTING / DEPLOY-SERVER / DEVELOPER / ai-production / 宣发 links to `public-demo.md`.

## Verification once merge can run

```
npx vitest run \
  src/lib/public-base-path.test.ts \
  src/lib/collaboration-client.test.ts \
  src/components/ProjectWorkbench.listing.test.tsx \
  src/main.test.tsx
```

Expect: listing shows「公开演示站」+ GitHub source link; createRoom on `text/html` 404 → `API_UNAVAILABLE`; prototype path works under `/cengfan-map-studio/`; workbench store still `=== editorProjectStore`.

## Rollback

Revert the merge commit. Static demo adds no data-format / API-shape change. Pages workflow is additive (`Settings → Pages` off or delete `pages.yml`).
