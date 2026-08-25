# Round 3 Agent F — current-HEAD probes

Probe time: 2026-08-25 UTC

- Branch: `cursor/verify-merged-code-e17a`
- `HEAD`: `b5ae155bc5bbd28ff9b72af5154979fe86b7f12e`
- `origin/main`: `388eafc288e6c3449c2084e3c8034763969863e2`

## Result

PASS — all four requested probes are clean.

## 1. Conflict markers in non-Markdown source

Searched source extensions for line-start merge markers matching
`^(<<<<<<< |=======|>>>>>>> )`.

Result: no matches.

## 2. File-size allowlist versus `wc -l`

Compared every entry in `scripts/file-size-allowlist.json` with literal
`wc -l` output.

- Allowlist entries checked: 29
- Mismatches: 0
- Aggregate newline count: 27,861

| File | Allowlist | `wc -l` |
| --- | ---: | ---: |
| `scripts/sync-china-locations.mjs` | 676 | 676 |
| `scripts/sync-china-locations.test.ts` | 418 | 418 |
| `server/collaboration.ts` | 1011 | 1011 |
| `server/index.ts` | 979 | 979 |
| `src/App.collaboration-terminal.test.tsx` | 402 | 402 |
| `src/App.tsx` | 923 | 923 |
| `src/components/AgentAssistant.tsx` | 705 | 705 |
| `src/components/AppErrorBoundary.tsx` | 403 | 403 |
| `src/components/AssetPanel.tsx` | 754 | 754 |
| `src/components/DataWorkspace.tsx` | 865 | 865 |
| `src/components/canvas/MapDataLayer.tsx` | 508 | 508 |
| `src/components/canvas/MapLayer.tsx` | 606 | 606 |
| `src/components/canvas/PosterCanvas.tsx` | 948 | 948 |
| `src/components/inspector/MapInspector.tsx` | 555 | 555 |
| `src/data/china-locations.ts` | 416 | 416 |
| `src/data/china-universities.ts` | 2951 | 2951 |
| `src/data/university-emblems.ts` | 2944 | 2944 |
| `src/lib/agent-session.ts` | 799 | 799 |
| `src/lib/card-layout.ts` | 1662 | 1662 |
| `src/lib/collaboration-client.ts` | 760 | 760 |
| `src/lib/image-color.ts` | 555 | 555 |
| `src/lib/project-document.test.ts` | 403 | 403 |
| `src/lib/project-migration.ts` | 601 | 601 |
| `src/lib/project-package.test.ts` | 452 | 452 |
| `src/lib/project-store.ts` | 748 | 748 |
| `src/lib/scene-document.test.ts` | 401 | 401 |
| `src/lib/scene-document.ts` | 766 | 766 |
| `src/lib/useCollaborationRoom.ts` | 846 | 846 |
| `src/styles.css` | 3804 | 3804 |

## 3. `origin/main` ancestry

`git merge-base --is-ancestor origin/main HEAD` exited 0.

- Merge base: `388eafc288e6c3449c2084e3c8034763969863e2`
- Divergence (`origin/main...HEAD`, left/right): `0 7`

Result: `origin/main` is an ancestor of this branch; the branch is seven
commits ahead and zero commits behind.

## 4. Synthetic merge

`git merge-tree --write-tree origin/main HEAD` exited 0 and returned:

`1ea100a52ab0ee7c1a5a7f1af4c155eba7fa0b2f`

`HEAD^{tree}` is the same tree:

`1ea100a52ab0ee7c1a5a7f1af4c155eba7fa0b2f`

Result: clean fast-forward from `origin/main` to this branch; no merge
conflicts and no synthetic merge-only tree changes.
