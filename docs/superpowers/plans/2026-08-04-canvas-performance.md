# Canvas Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 降低画布布局、SVG 重渲染和拖拽预览的主线程成本，使 100 张卡片的交互保持响应，并为 400 张卡片提供稳定压力路径。

**Architecture:** 保持 `ProjectDocument` 为唯一业务状态。将卡片布局请求变成可测试的纯派生输入，用有界缓存和 Web Worker 隔离 `solveCardLayout`；将拖拽预览从静态 SVG 场景中隔离，松手时才走现有事务回调。

**Tech Stack:** React 19、TypeScript、Vite module Worker、Vitest/jsdom、现有 SVG/d3-geo 渲染器。

## Global Constraints

- 不修改 `ProjectDocument` schema，不新增持久化并行模型。
- 不在 `pointermove` 中创建历史事务、持久化写入或协作操作。
- `/prototype` 路由保持独立，SVG 仍为导出源。
- 不覆盖已有工作区改动，不创建或切换 Git 分支，不提交未经授权的 commit。
- 每个生产代码改动必须先有能正确失败的测试。

---

### Task 1: Layout request key and bounded cache

**Files:**
- Create: `src/lib/card-layout-cache.ts`
- Test: `src/lib/card-layout-cache.test.ts`
- Modify: `src/lib/card-layout.ts` only if exported types need a direct import

**Interfaces:**
- Consumes: `CardLayoutInput`, `CardLayoutBounds`, `CardLayoutOptions`, `CardLayoutResult`.
- Produces: `createCardLayoutCacheKey(input)`, `CardLayoutCache.get/set/clear`, `cardLayoutCache`.

- [ ] **Step 1: Write failing tests**

  Test that equal layout inputs produce the same key, a changed anchor or obstacle changes the key, and bounded cache eviction removes the oldest entry while a `get` refreshes recency.

- [ ] **Step 2: Run the focused test and verify RED**

  Run `node_modules\\.bin\\vitest.cmd run src/lib/card-layout-cache.test.ts --no-file-parallelism`.
  Expected: module/export failures because the cache file does not exist.

- [ ] **Step 3: Implement the minimal key and LRU**

  Serialize only the documented geometry and option fields. Use a `Map<string, CardLayoutResult>` with a configurable positive capacity, delete/reinsert on `get`, and evict the first key after `set` exceeds capacity.

- [ ] **Step 4: Run the focused test and verify GREEN**

  Run the same Vitest command and require all cache tests to pass.

---

### Task 2: Worker protocol and hook

**Files:**
- Create: `src/lib/card-layout-worker-protocol.ts`
- Create: `src/workers/card-layout.worker.ts`
- Create: `src/components/canvas/useCardLayoutWorker.ts`
- Test: `src/components/canvas/useCardLayoutWorker.test.tsx`

**Interfaces:**
- Consumes: Task 1 cache and the existing `solveCardLayout` function.
- Produces: `useCardLayoutWorker(request)` returning `{ result, pending }` and a Worker message protocol with `requestId`/`key` stale-response guards.

- [ ] **Step 1: Write failing tests**

  Test that the hook sends one request for a new key, ignores a response whose request id is no longer current, stores a matching result in the cache, and uses synchronous solving when `Worker` is unavailable.

- [ ] **Step 2: Run the focused test and verify RED**

  Run `node_modules\\.bin\\vitest.cmd run src/components/canvas/useCardLayoutWorker.test.tsx --no-file-parallelism`.
  Expected: missing module/export failures.

- [ ] **Step 3: Implement protocol, Worker, and hook**

  Use Vite's `new Worker(new URL("../../workers/card-layout.worker.ts", import.meta.url), { type: "module" })`. Keep one Worker per hook instance, terminate it on unmount, increment `requestId` for every request, and accept only matching `{requestId,key}` responses. Use the bounded cache before posting work. In jsdom or export mode, call `solveCardLayout` synchronously.

- [ ] **Step 4: Run the focused test and verify GREEN**

  Require all Worker hook tests to pass without unhandled worker errors.

---

### Task 3: Narrow PosterCanvas layout dependencies

**Files:**
- Modify: `src/components/canvas/PosterCanvas.tsx`
- Modify: `src/components/canvas/PosterCanvas.test.tsx`

**Interfaces:**
- Consumes: Task 1 key/cache and Task 2 hook.
- Produces: separate memoized prepared-card derivation and asynchronous layout result consumption.

- [ ] **Step 1: Write failing regression tests**

  Add a test that changing connector color or canvas background preserves the same layout request key/result, while changing card size or map geometry requests a new result. Keep existing visual rendering assertions unchanged.

- [ ] **Step 2: Run focused tests and verify RED**

  Run `node_modules\\.bin\\vitest.cmd run src/components/canvas/PosterCanvas.test.tsx src/lib/card-layout-cache.test.ts --no-file-parallelism`.
  Expected: the new invalidation assertion fails before the narrow dependency/key integration exists.

- [ ] **Step 3: Implement the split**

  Extract the prepared card array and layout request inputs from `destinationCards`. Replace the whole-object dependency list with primitive geometry/layout dependencies. Feed the request into `useCardLayoutWorker`, combine the latest placements with prepared cards, and preserve a same-id previous placement while a new Worker result is pending.

- [ ] **Step 4: Run focused canvas tests and verify GREEN**

  Require the full existing `PosterCanvas.test.tsx` plus the new invalidation test to pass.

---

### Task 4: Isolate drag previews and stabilize layer props

**Files:**
- Create: `src/components/canvas/CanvasDragPreview.tsx`
- Create: `src/components/canvas/CanvasDragPreview.test.tsx`
- Modify: `src/components/canvas/PosterCanvas.tsx`
- Modify: `src/components/canvas/TextLayer.tsx`
- Modify: `src/components/canvas/DecorationLayer.tsx`
- Modify: `src/components/canvas/RegionalAssetLayer.tsx`
- Modify: `src/components/canvas/MapLayer.tsx`

**Interfaces:**
- Consumes: Task 3 prepared placements and existing pointer conversion/transaction callbacks.
- Produces: rAF-coalesced local transform updates, one pointer-up commit, memoized static layer boundaries.

- [ ] **Step 1: Write failing interaction tests**

  Test that repeated `pointermove` updates a preview transform without invoking a project callback, that `pointerup` invokes exactly one final callback, and that `pointercancel` clears the preview without committing.

- [ ] **Step 2: Run focused tests and verify RED**

  Run `node_modules\\.bin\\vitest.cmd run src/components/canvas/CanvasDragPreview.test.tsx --no-file-parallelism`.
  Expected: missing component/export or behavior failures.

- [ ] **Step 3: Implement the isolated preview**

  Store transient pointer and preview values in refs, schedule a single rAF, update only the preview group transform, and clear all scheduled work on end/cancel/unmount. Wrap static layer components with `memo` only after their props are made stable; keep export mode free of editor overlays.

- [ ] **Step 4: Run all canvas interaction tests and verify GREEN**

  Run `node_modules\\.bin\\vitest.cmd run src/components/canvas --no-file-parallelism` and require zero failures.

---

### Task 5: Frame-rate settings and integration verification

**Files:**
- Modify: `src/lib/render-settings.ts`
- Modify: `src/lib/render-settings.test.ts`
- Modify: `src/App.tsx` only where callback identities or preview props require it
- Modify: `scripts/perf-layout-bench.ts` only if the existing user benchmark needs a stable repeated-run mode

- [ ] **Step 1: Write failing frame-rate tests**

  Assert high mode maps to 60 FPS, normal to 30 FPS, low to 10 FPS, and fixed mode clamps to 5-60 FPS while preserving old low values safely.

- [ ] **Step 2: Run the render-settings test and verify RED**

  Run `node_modules\\.bin\\vitest.cmd run src/lib/render-settings.test.ts --no-file-parallelism`.
  Expected: current 20/30 FPS expectations fail.

- [ ] **Step 3: Implement the new frame-rate mapping**

  Update defaults, mode mapping, and fixed-rate normalization without changing local-storage keys or settings UI labels.

- [ ] **Step 4: Run focused and project gates**

  Run serially: `node_modules\\.bin\\vitest.cmd run src/components/canvas src/lib/card-layout-cache.test.ts src/lib/render-settings.test.ts --no-file-parallelism`, `node_modules\\.bin\\tsc.cmd -b`, `node_modules\\.bin\\vite.cmd build`, and `node_modules\\.bin\\tsx.cmd scripts\\perf-layout-bench.ts`.

- [ ] **Step 5: Review the diff**

  Run `git diff --check` and `git status --short`; confirm no graphify artifacts, user benchmark, or unrelated edits were removed or reset.

---

## Self-review checklist

- Layout cache key excludes cosmetic state and includes every geometry/constraint input.
- Worker responses are guarded by both request id and key.
- Synchronous fallback remains available for tests, SSR-like environments, and export mode.
- Pointer-up is the only path that invokes project movement callbacks.
- Existing export and `/prototype` paths remain untouched.
- No plan step requires a commit or branch operation without user authorization.
