# Round 1 quantitative baseline

Collected on branch `agent/opt-continuous` on 2026-08-24 UTC. No product source or benchmark script was changed.

## Environment

Exact command:

```bash
node -v && npm -v && uname -srvmo && getconf _NPROCESSORS_ONLN && lscpu
```

Relevant output:

| Item | Value |
|---|---|
| Node | `v22.14.0` |
| npm | `10.9.7` |
| Kernel | `Linux 6.12.94+ x86_64` |
| CPU | 4 vCPUs, `Intel(R) Xeon(R) Processor`, KVM, one thread/core |

## 1. Layout micro-benchmark

Exact command, run as five separate fresh processes:

```bash
npm run perf:layout
```

Raw internal solver times from `scripts/perf-layout-bench.ts` (milliseconds):

| Card count | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 | Min | Median | Max | Max-min / median |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 36 | 31.4 | 33.0 | 34.7 | 29.5 | 30.2 | 29.5 | 31.4 | 34.7 | 16.6% |
| 60 | 31.5 | 31.9 | 32.2 | 31.5 | 33.5 | 31.5 | 31.9 | 33.5 | 6.3% |
| 100 | 28.1 | 28.6 | 29.0 | 27.7 | 28.5 | 27.7 | 28.5 | 29.0 | 4.6% |
| 200 | 50.1 | 49.9 | 52.4 | 49.7 | 54.4 | 49.7 | 50.1 | 54.4 | 9.4% |
| 400 | 94.6 | 95.3 | 95.5 | 95.2 | 94.7 | 94.6 | 95.2 | 95.5 | 0.9% |

Raw process outputs:

```text
run 1: count=36 31.4ms; count=60 31.5ms; count=100 28.1ms; count=200 50.1ms; count=400 94.6ms
run 2: count=36 33.0ms; count=60 31.9ms; count=100 28.6ms; count=200 49.9ms; count=400 95.3ms
run 3: count=36 34.7ms; count=60 32.2ms; count=100 29.0ms; count=200 52.4ms; count=400 95.5ms
run 4: count=36 29.5ms; count=60 31.5ms; count=100 27.7ms; count=200 49.7ms; count=400 95.2ms
run 5: count=36 30.2ms; count=60 33.5ms; count=100 28.5ms; count=200 54.4ms; count=400 94.7ms
```

Noise and interpretation:

- Machine/process noise is material at 36 cards (16.6% range around the median) and 200 cards (9.4%), so a claimed 5% improvement needs more iterations or paired A/B runs. The 400-card result is stable enough to detect a 5% change.
- Every command starts a fresh Node process, but card counts run in ascending order inside that process. Thus 36 cards bears cold JIT cost while later counts are warmer; cross-count non-monotonicity, especially 60 versus 100, is not an algorithmic speedup.
- The benchmark bounds do **not** set `occupiedAreas` or `occupiedPolygons`. Therefore `solveCardLayout` skips `optimizedLayout` at `card-layout.ts:1120-1126`; these numbers do not measure connector candidate scoring or polygon geometry, which are used by `PosterCanvas`.
- The script times one solve per count with `performance.now()`, excluding `tsx` startup but including allocation and GC that occur during that solve.

## 2. Layout algorithm inspection

Notation: `n` cards, `p` occupied polygons/areas, `v` total polygon vertices, `c` shortlisted candidates/card (bounded at 48 in dense mode or 144 in sparse mode across four sides), `s` connector segments (`16` for curves), and `g` fixed-step grid positions.

| File / function | Complexity and hot work | Copies / allocations | Is a 5%+ gain plausible? |
|---|---|---|---|
| `card-layout.ts:autoSplitX` | `O(n² + n log n)`: up to about `2n+1` split candidates, each rescanning all cards (`337-358`). | `cards.map`, `Set`, sorted `xs`, two candidate spreads/maps. | Yes at high `n`: sort once and use prefix sums for `O(n log n)`, although this is not the largest saturated-layout cost. |
| `card-layout.ts:placeSide` / `resolveObstacles` | Side sorting is `O(n log n)`; obstacle resolution is up to 24 scans of prior cards per placement, `O(n²)` overall (`401-453`). | `sorted=[...cards]`, `targets`, `sizes`, `positions`, object spread per placement; `allPlaced=[...placed]` is copied for every resolved card although never mutated. | Yes: remove the redundant copies and query a spatial bucket/index instead of every prior card. |
| `card-layout.ts:containFree` | For every unplaced card, scans the whole 12px grid and checks all placed cards: `O(g(n+p+v))` per card, worst `O(g n²)` (`456-491`). It keeps scanning after finding a valid point because it seeks the nearest. | A new candidate object plus `Math.hypot` for each usable grid point. | Strongly yes for saturated canvases: nearest-first traversal plus a uniform grid/R-tree for placed cards and polygon bounds should remove most tests. |
| `card-layout.ts:repackAll` | Five orderings; for card `k`, `O(k)` x rails × `O(k)` y rails × `O(k)` placed-card check. Worst case is `O(n⁴)` (`508-575`), though early failure and canvas saturation reduce observed work. | Five index/order arrays, signatures, per-card sets, Cartesian-product area objects, placement spreads, final sort/map. | Strongly yes on fallback cases: spatial indexing and avoiding the full Cartesian product can change the practical scaling. |
| `card-layout.ts:validateHard` / `orderResult` | Pairwise overlap validation is `O(n²)` (`617-627`); output ordering is also `O(n²)` because every input does `placements.find` (`613-615`). | The output array is reallocated. | Yes at 200-400 cards: an id-to-placement map makes ordering `O(n)`; a broad-phase index can reduce validation. |
| `card-layout.ts:buildCandidates` | Per card, scans all card anchors and polygons, then combines at most 14×14 rails; approximately `O(n + p·v + c log c)` before geometry (`756-912`). | Sets, string keys with `toFixed`, maps by side, repeated score arrays in sort comparators, candidate/geometry objects. | Yes: precompute shared rails and polygon bounds, use numeric keys, and avoid temporary score arrays in comparators. |
| `card-layout.ts:optimizedLayout` | Up to 8 orderings. Each candidate scans prior placements and connector geometry, approximately `O(orders · c · n² · s²)` (`993-1099`), followed by `scoreLayout`, also pairwise (`931-990`). `n` is capped at 80. | Candidate map stores every geometry; each order allocates placement, geometry and bounds arrays plus score arrays. | Strongly yes on the production path: spatial buckets for card and connector AABBs can skip most pair tests. |
| `card-layout.ts:polygonBounds`, `rectangleIntersectsPolygon`, `connectorMapIntersections` | Without a supplied polygon bound, bounds are recomputed in `O(v)` with `rings.flat()`; exact point/edge tests rescan vertices (`165-213`, `677-702`). | Flattened point arrays, expanded rectangles, corners and edge arrays are repeatedly allocated. | Yes when province polygons are present: cache bounds/edges once and index polygons by AABB. |
| `card-layout.ts:connectorHitsCard` | Calls `connectorBounds` afresh for every card test, then scans up to `s` segments (`914-917`), even though optimized candidates already carry `geometryBounds`. | Fresh bounds and per-segment rectangle geometry. | Strongly plausible: thread existing bounds through and precompute card-expanded bounds. |
| `connector-geometry.ts:connectorGeometriesIntersect` | `O(s_left·s_right)` nested `.some`; a curve pair can perform 256 segment-distance tests, each with intersection plus up to four point-to-segment distances (`197-215`). | Closure iteration; `segmentIntersectsRect` allocates an expanded rect, four corners, and four edge objects on every segment test (`218-239`). | Strongly yes: segment AABBs/buckets, scalar rectangle tests, and allocation-free loops should exceed 5% in connector-heavy solves. |
| `connector-geometry.ts:buildConnectorGeometry` | Curve creation is fixed `O(s)` with 17 sampled points (`114-150`). | Point array, then `slice(1).map` creates another segment array; path formatting does repeated `toFixed`. | Plausible when many candidates are built. Build path text only for the selected/rendered geometry, not every scoring candidate. |
| `card-layout-cache.ts:createCardLayoutCacheKey` | `O(n+v)` traversal plus JSON serialization (`28-48`); paid on the UI thread before cache lookup. Cache `get/set` is amortized `O(1)`. | Rebuilds nested arrays for all cards, all polygon points, then one potentially large JSON string. Twelve cached results retain `O(12n)` placements. | Yes on frequent geometry renders: incremental/versioned keys or stable hashes can avoid copying all polygon coordinates. Measure before replacing JSON because cache hits already save far more solver work. |
| `card-layout.worker.ts:onmessage` | Solver is synchronous per message (`9-19`); worker messages queue FIFO and obsolete requests still run to completion. | Browser structured-clones cards/options/polygons into the worker and placements back out: `O(n+v)` inbound and `O(n)` outbound. No transferable data is used. | Strongly yes during dragging/rapid edits: latest-only coalescing or terminating/restarting stale work avoids entire obsolete solves and clone traffic. |

The hook does reject stale responses by `requestId`/key (`useCardLayoutWorker.ts:93-100`), which prevents stale rendering but does not cancel the stale work already queued. This distinction makes worker coalescing a performance fix, not a result-correctness fix.

## 3. Representative Vitest timing

The image lacks `/usr/bin/time`; the initial wrapper failed before running tests:

```text
--: line 1: /usr/bin/time: No such file or directory
```

Root cause: the GNU time executable is not installed. Fix: use Bash's built-in `time` with `TIMEFORMAT`; recheck: all three requested subsets passed.

Exact commands and results:

| Subset | Exact command | Tests | Vitest duration | Bash wall | User | Sys |
|---|---|---:|---:|---:|---:|---:|
| Layout | `TIMEFORMAT='wall_seconds=%3R user_seconds=%3U sys_seconds=%3S'; time npx vitest run src/lib/card-layout.test.ts src/lib/card-layout-cache.test.ts src/lib/destination-layout.test.ts` | 44 passed / 3 files | 1.93s | **2.445s** | 4.955s | 0.519s |
| Canvas performance | `TIMEFORMAT='wall_seconds=%3R user_seconds=%3U sys_seconds=%3S'; time npx vitest run src/components/canvas/PosterCanvas.performance.test.tsx` | 1 passed / 1 file | 1.16s | **1.563s** | 1.932s | 0.275s |
| Collaboration/API | `TIMEFORMAT='wall_seconds=%3R user_seconds=%3U sys_seconds=%3S'; time npx vitest run server/collaboration.test.ts server/index.test.ts` | 72 passed / 2 files | 531ms | **0.921s** | 1.248s | 0.190s |

The layout user time exceeds wall time because Vitest uses the four available CPUs. No full-suite or run-heavy lock was taken.

## 4. npm audit

Exact commands:

```bash
npm audit --json
npm explain nanoid
npm ls nanoid --all --omit=dev
npm update nanoid --dry-run --json
npm audit fix --package-lock-only --dry-run --json
```

Audit result:

| Severity | Package | Installed / affected | Advisory | Dependency path | Production dependency? |
|---|---|---|---|---|---|
| High (npm label; CVSS 5.9) | `nanoid` | `3.3.17`; affected `<3.3.18` | `GHSA-2v37-7h3g-55p8`: custom generators can loop indefinitely at size zero | root `@vitejs/plugin-react@6.0.4` → `vite@8.1.5` → `postcss@8.5.26` → `nanoid@3.3.17` | **Yes in npm's production graph**: `npm ls --omit=dev` retains this path and the lock entry has no `dev: true`. Operationally it is build tooling, not code normally shipped/executed in the browser. |

Raw audit totals:

```text
info=0 low=0 moderate=0 high=1 critical=0 total=1
prod=110 dev=199 optional=58 total=366
fixAvailable=true
```

Safe remediation:

1. Run `npm update nanoid --package-lock-only --ignore-scripts`. The dry run selected the semver-compatible `3.3.18` (`postcss` requests `^3.3.17`); it showed one version change, `nanoid 3.3.17 => 3.3.18`, plus optional platform lock entries.
2. Review the lock diff and explicitly assert that both root `xlsx` and `node_modules/xlsx.resolved` remain `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (`package-lock.json:21`, `5112-5115`). Do not run a command that replaces `xlsx` from the public npm registry.
3. Reinstall from lock, rerun `npm audit --json`, and run the representative tests/build. The `npm audit fix --package-lock-only --dry-run` result reported no changes despite `fixAvailable=true`, so the targeted `npm update nanoid` is the clearer path.

No remediation was applied in this baseline.

## 5. I/O and race-risk probe

### IndexedDB and project store

| Risk | Evidence | Later fix / measurable outcome |
|---|---|---|
| Cross-tab legacy migration TOCTOU can duplicate a migrated project. | `migrateLegacyWorkspace` reads all project keys in one readonly transaction, then starts a separate readwrite transaction (`project-store.ts:154-189`). Two tabs can both observe zero keys and insert different generated ids. | Use one readwrite transaction for check/put/delete, with a deterministic migration key or marker. Correctness test: two concurrent stores produce exactly one migrated project. |
| Long-lived project DB connection can block future schema upgrades. | `createIndexedDbProjectStore` caches `ready`/`IDBDatabase` forever (`201-213`) and does not install `db.onversionchange = () => db.close()`. `openAtVersion.onblocked` rejects (`131-147`) but the old tab is not asked to release. | Close on `versionchange`, retry with bounded generation logic, and integration-test two factories/tabs upgrading. Prevents an upgrade/open failure. |
| `put`/`remove` promises lack `tx.onabort`. | `project-store.ts:234-250` listens only for `oncomplete` and `onerror`; the workspace store already handles `onabort` (`browser-workspace-store.ts:111-123`). | Add abort rejection and fault-injection tests; prevents a save promise from remaining unsettled on an explicit abort. |
| Last writer wins across tabs with no revision check. | Project records are keyed only by id; `put` overwrites unconditionally (`234-241`). App autosave creates a new timestamp and writes the whole package (`App.tsx:273-285`). | Add monotonic revision/CAS and a `BroadcastChannel` conflict signal. Correctness metric: stale-tab save cannot overwrite a newer revision. |
| Listing projects reads and normalizes every complete package. | `list()` uses `getAll`, then `parseStoredProject`/`restoreProjectPackage` on each full record (`project-store.ts:215-224`, `84-99`). Base64 assets/fonts make this scale with all project bytes, not card metadata. | Split metadata from package blobs or use an index/cursor projection. Benchmark workbench load with 10/50 large projects; a >5% gain is highly likely. |
| The workspace mirror duplicates synchronous and durable writes. | `saveBrowserWorkspaceSnapshot` does `JSON.stringify(pack)` into localStorage on the main thread, then structured-clones the same pack into IndexedDB (`browser-workspace-store.ts:152-168`). App also writes a serialized draft before both (`App.tsx:261-280`). | Debounce/coalesce and keep a small metadata/checkpoint mirror; measure save latency and peak heap for image-heavy projects. |

### Project package

| Risk | Evidence | Later fix / measurable outcome |
|---|---|---|
| Import/restore has multiple whole-document copies on the main thread. | `parseProjectPackage` first `JSON.parse`s all text; `restoreProjectPackage` then `JSON.stringify`s resource and project subtrees (`project-package.ts:171-209`). `createProjectPackage` serializes/restores the project and structured-clones each resource array (`153-164`). | Validate/normalize objects directly or in a worker and avoid round-trip strings. Measure wall/heap on 10/50/100 MB packages; >5% and lower peak memory are likely. |
| Unbounded package import can freeze or crash a tab. | Workbench uses `await file.text()` before parse (`ProjectWorkbench.tsx:161-171`); no byte, resource-count, or decoded-data cap is checked. | Reject oversized files before `text()`, cap resource/data URL sizes, and parse in a worker. Correctness metric: oversized/zip-like payload fails fast without UI stall. |
| Pretty JSON expands export work and output. | `serializeProjectPackage` uses `JSON.stringify(pack, null, 2)` (`project-package.ts:167-169`). Embedded base64 dominates large packages. | Compact JSON or a streamed/container format; compare bytes, export wall, and peak heap. |
| Object URL is revoked immediately after synthetic click. | `downloadProjectPackage` calls `link.click()` then synchronous `URL.revokeObjectURL` (`219-227`). | Revoke in a later task/microtask and test browser download completion; primarily correctness/browser compatibility. |

### Binary import

| Risk | Evidence | Later fix / measurable outcome |
|---|---|---|
| XLSX decode and row materialization block the UI and duplicate data. | `DataWorkspace.handleExcelFile` does `file.arrayBuffer()`, `XLSX.read`, `sheet_to_json`, and another full string matrix map on the main thread (`DataWorkspace.tsx:273-294`). There is no file/row/cell cap. | Worker decode, limits, and chunked validation. Measure input-to-preview wall, long tasks, and peak heap for 1k/10k/100k rows; >5% responsiveness gain is likely. |
| Rapid file choices can publish an older file last. | `handleExcelFile` has no request id or abort/generation guard around dynamic import + file read (`273-298`). Two calls race to `setCandidates`. | Add a monotonically increasing import generation; test slow first file + fast second file. Correctness metric: only the latest selection updates state. |
| Exported ArrayBuffer parser silently returns an empty import. | `parseExcelArrayBuffer` ignores non-array input and returns an empty result (`binary-import.ts:151-155`) despite its name/type. | Remove the misleading overload, make it async and actually decode, or throw explicitly. Prevents silent data loss for future callers. |
| Header/sample parsing repeatedly traverses rows. | `createMetadata` slices/maps/filters the rows once per mapped field (`binary-import.ts:113-141`), then parsing slices/flatMaps again (`158-181`). | Single-pass row extraction reduces allocations; measurable mostly for very large sheets after XLSX decode is moved off-thread. |

### Collaboration SSE and server I/O

| Severity / risk | Evidence | Later fix / measurable or correctness outcome |
|---|---|---|
| **High: native EventSource reconnect cannot reuse its one-shot ticket.** | Server deletes the ticket on first `/events` connection (`server/index.ts:753-764`). Browser `EventSource` automatically retries the identical URL (`collaboration-client.ts:271-303`), but the ticket is then invalid. `onerror` only backfills; it does not close/re-ticket/re-subscribe (`useCollaborationRoom.ts:160-217`). | Own the reconnect loop: close source on error, backfill, mint a new ticket, then resubscribe with current version and bounded backoff. Disconnect/reconnect test should resume SSE rather than repeatedly receive 403. |
| **High: backfill can regress version/state if a live event wins the race.** | Backfill captures `versionRef.current`, awaits HTTP, then applies `interval` and assigns `versionRef.current = interval.version` without rechecking (`useCollaborationRoom.ts:160-180`). A live SSE update can advance the ref while that request is in flight. | Compare the returned interval against the current version or serialize all remote updates through one ordered queue. Deterministic test: delayed V+1 backfill cannot overwrite live V+2. |
| Slow SSE consumers have no backpressure handling. | Every room update/lifecycle event calls `response.write(...)` and ignores its boolean result (`server/index.ts:772-787`); heartbeats do the same (`803-806`). | Track queued bytes, wait for `drain`, or disconnect lagging clients. Load metric: bounded RSS with 50 slow subscribers and large events. |
| Heartbeats extend room lifetime and cleanup is tied only to the request close event. | Heartbeat calls `roomStore.get`, which calls `touch` (`server/index.ts:803-810`; `server/collaboration.ts:172-176`). A leaked/stuck stream keeps the room alive. Cleanup is not also attached to response `close`/`error`. | Idempotent cleanup on request/response close/error; heartbeat authorization without mutating room activity if TTL is intended to represent edits. Metric: listeners/timers return to zero after disconnect. |
| Full package work can occur synchronously around collaboration updates. | Remote packages pass through `restoreProjectPackage` before React updates (`App.tsx:538-547`); initial/full snapshots are JSON serialized by SSE (`server/index.ts:795-797`). | Worker normalization and snapshot size limits; measure reconnect-to-interactive time and server event-loop delay with resource-heavy packages. |

## Top 5 optimization hypotheses ranked by expected ≥5% or by crash/race severity

| Rank | Hypothesis | Why it ranks here | Acceptance baseline |
|---:|---|---|---|
| 1 | Replace one-shot native EventSource auto-retry with re-ticket + ordered backfill, and reject stale backfill responses. | Current disconnect behavior can permanently lose live delivery, repeatedly 403, and even regress V+2 to V+1; correctness severity exceeds a pure speed win. | Forced disconnect resumes SSE and monotonically advances versions with zero stale apply. |
| 2 | Make IndexedDB migration/autosave revision-safe across tabs and close cached DBs on `versionchange`. | Duplicate migration, blocked upgrades, or stale whole-package overwrite risk user data. | Two-tab migration creates one project; stale saves conflict instead of overwrite; upgrades do not remain blocked. |
| 3 | Add broad-phase spatial indexes to `containFree`, `repackAll`, `validateHard`, and optimized connector/card checks. | Current hot paths range from quadratic to worst-case quartic. The stable 400-card median is 95.2ms, so a ≥4.8ms reduction is detectable and likely. | Paired benchmark improves 400-card median by ≥5% while hard-constraint tests remain green. |
| 4 | Coalesce card-layout worker requests so only the latest pending request runs; reduce structured-clone/key-copy volume. | Rapid edits currently execute whole obsolete solves whose results are discarded. Avoiding one obsolete solve is already far above 5% for that interaction burst. | Burst benchmark shows latest-result latency and total worker CPU reduced ≥5%, with stale-response tests still passing. |
| 5 | Move XLSX/package parsing off-thread, impose size limits, and remove full-document stringify/clone round trips. | Large imports can block or crash the tab; package restore and XLSX parsing make multiple full-size copies. | 10k-row and 50MB-package fixtures show ≥5% lower main-thread wall/peak heap and fail-fast oversized input. |
