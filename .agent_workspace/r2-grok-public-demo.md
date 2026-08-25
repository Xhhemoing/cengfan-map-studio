# Round 2 Agent A — public-static-demo-304c

**Model:** cursor-grok-4.6-high-fast  
**Result:** merged `origin/cursor/public-static-demo-304c` (`5e5405c`) into `cursor/merge-all-branches-e17a`. Did not abort. Did not push.

Waited out an in-progress canvas merge on this worktree (other worktrees stayed dirty). Merge completed on `/workspace` after HEAD reached `76cc652`.

## Conflicts

| File | Resolution |
| --- | --- |
| `src/components/ProjectWorkbench.test.tsx` | Kept HEAD deletion. Ported unique `publicDemo` assertion into `ProjectWorkbench.listing.test.tsx`. Harness gained a 4th `{ publicDemo }` arg; 3rd `health` arg unchanged. |
| `src/components/ProjectWorkbench.tsx` | Kept StorageNotice / `health` / `recoverError`. Added `publicDemo = isPublicDemoBuild()` and the workbench notice + AGPL source link. |
| `src/lib/collaboration-client.ts` | Kept timeout/retry/persistence. Rejected incoming simplified `jsonRequest`. In `sendOnce`, non-JSON `Content-Type` → `API_UNAVAILABLE` + `STATIC_HOST_API_HINT`. Parse-fail still preserves status. |
| `src/main.tsx` | Kept StudioRoutes + `editorProjectStore`. Prototype check is now `isPrototypePath(pathname)` so GitHub Pages `/cengfan-map-studio/prototype` works. |

## Also taken (no architecture fight)

`public-base-path.ts` + test, Pages workflow, Dockerfile, `wrangler.toml`, `public/_headers`/`_redirects`, `docs/deployment/public-demo.md`, README/USER_GUIDE demo copy, `VITE_PUBLIC_DEMO` / `BASE_PATH`, `404.html` copy, AI 404/405 hint, `.workbench-notice` CSS. Kept HEAD `vite` `setupFiles` and all `.workbench-storage-notice*` rules.

## Verify

```
npx vitest run src/lib/public-base-path.test.ts src/lib/collaboration-client.test.ts src/components/ProjectWorkbench.listing.test.tsx src/main.test.tsx
```

## Rollback

Revert this merge commit. No data-format / API-shape change. Pages is additive.
