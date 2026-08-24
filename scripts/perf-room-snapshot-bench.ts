/**
 * Collaboration room-store snapshot/serialization micro-benchmark.
 *
 * Run with: npx tsx scripts/perf-room-snapshot-bench.ts
 *
 * Measures the synchronous `createRoomStore().flush()` snapshot construction
 * and the persist callback's `JSON.stringify` separately for retained 6 and
 * 8 MiB rooms, an explicitly labelled 12 MiB single-room skip path, two
 * retained 5.9 MiB rooms near the aggregate budget, and a 5 MiB room whose
 * duplicate operation history forces the history-trim path. Each result is the
 * median of five runs after one warmup.
 *
 * Limits: package inflation is synthetic, setup/allocation and persistence I/O
 * are excluded, and timings are machine/GC dependent. This measures event-loop
 * occupancy during snapshot construction and JSON serialization, not peak
 * memory or storage latency.
 *
 * Known miss: the retained 8 MiB calibration cell previously measured 56.6 ms
 * occupancy against the approximate 50 ms target; this reference run measured
 * 32.41 ms, while the worst-case aggregate-at-budget cell measured 48.34 ms /
 * 12,366,463 bytes. API-limit parity takes precedence; off-thread serialization
 * is intentionally out of scope for this fix.
 *
 * Reference run (2026-08-24):
 * | path | rooms | target record MiB/room | target MiB | snapshot median ms | stringify median ms | occupancy ms | output bytes | retained rooms | trimmed rooms | skipped rooms |
 * | :--- | ---: | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
 * | standard | 1 | 6 | 6 | 9.73 | 15.02 | 24.75 | 6288101 | 1 | 0 | 0 |
 * | standard | 1 | 8 | 8 | 12.87 | 19.54 | 32.41 | 8385253 | 1 | 0 | 0 |
 * | skip path (> 8 MiB room) | 1 | 12 | 12 | 0.06 | 0.00 | 0.06 | 73 | 0 | 0 | 1 |
 * | aggregate at budget | 2 | 5.9 | 11.8 | 18.94 | 29.40 | 48.34 | 12366463 | 2 | 0 | 0 |
 * | history trim | 1 | 5 (+ 4 MiB history) | 9 | 16.58 | 12.41 | 28.99 | 5277193 | 1 | 1 | 0 |
 */
import { performance } from "node:perf_hooks";
import {
  createRoomStore,
  MAX_PERSISTED_SNAPSHOT_BYTES,
  type RoomStoreSnapshot,
} from "../server/collaboration";

const RUNS = 5;
const BYTES_PER_MIB = 1024 * 1024;
const TRIM_HISTORY_ENTRIES = 256;
const TRIM_HISTORY_VALUE_BYTES = 16 * 1024;
// Leave space for room metadata so the target cell remains just below the cap.
const RECORD_ENVELOPE_MARGIN_BYTES = 4 * 1024;

interface BenchmarkCell {
  path: string;
  roomCount: number;
  packMiB: number;
  packLabel: string;
  targetMiBLabel: string;
  trimHistory?: boolean;
  expectedRetainedRooms: number;
  expectedTrimmedRooms: number;
  expectedSkippedRooms: number;
}

const CELLS = [
  {
    path: "standard",
    roomCount: 1,
    packMiB: 6,
    packLabel: "6",
    targetMiBLabel: "6",
    expectedRetainedRooms: 1,
    expectedTrimmedRooms: 0,
    expectedSkippedRooms: 0,
  },
  {
    path: "standard",
    roomCount: 1,
    packMiB: 8,
    packLabel: "8",
    targetMiBLabel: "8",
    expectedRetainedRooms: 1,
    expectedTrimmedRooms: 0,
    expectedSkippedRooms: 0,
  },
  {
    path: "skip path (> 8 MiB room)",
    roomCount: 1,
    packMiB: 12,
    packLabel: "12",
    targetMiBLabel: "12",
    expectedRetainedRooms: 0,
    expectedTrimmedRooms: 0,
    expectedSkippedRooms: 1,
  },
  {
    path: "aggregate at budget",
    roomCount: 2,
    packMiB: 5.9,
    packLabel: "5.9",
    targetMiBLabel: "11.8",
    expectedRetainedRooms: 2,
    expectedTrimmedRooms: 0,
    expectedSkippedRooms: 0,
  },
  {
    path: "history trim",
    roomCount: 1,
    packMiB: 5,
    packLabel: "5 (+ 4 MiB history)",
    targetMiBLabel: "9",
    trimHistory: true,
    expectedRetainedRooms: 1,
    expectedTrimmedRooms: 1,
    expectedSkippedRooms: 0,
  },
] as const satisfies readonly BenchmarkCell[];

interface Sample {
  snapshotMs: number;
  stringifyMs: number;
  outputBytes: number;
  retainedRooms: number;
  trimmedRooms: number;
  skippedRooms: number;
}

function median(values: number[]): number {
  return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)]!;
}

function makeTestPackage(packMiB: number, roomIndex: number) {
  return {
    kind: "cengfan-project-package",
    version: 2,
    exportedAt: "2026-08-24T00:00:00.000Z",
    project: {
      id: `snapshot-bench-${roomIndex}`,
      title: "snapshot benchmark",
    },
    // Test-only inflation field: production package types and schemas remain unchanged.
    benchmarkPayload: "x".repeat(packMiB * BYTES_PER_MIB - RECORD_ENVELOPE_MARGIN_BYTES),
  };
}

async function measureCell(cell: BenchmarkCell): Promise<Sample> {
  let stringifyMs = Number.NaN;
  let outputBytes = 0;
  let retainedRooms = 0;
  let trimmedRooms = 0;
  let skippedRooms = 0;
  let nextId = 1;
  const store = createRoomStore({
    maxRooms: cell.roomCount,
    generateId: () => `BENCH${nextId++}`,
    generateSecret: () => `snapshot-bench-secret-${nextId}`,
    persist: (snapshot: RoomStoreSnapshot) => {
      const startedAt = performance.now();
      const serialized = JSON.stringify(snapshot);
      stringifyMs = performance.now() - startedAt;
      outputBytes = Buffer.byteLength(serialized);
      retainedRooms = snapshot.rooms.length;
      trimmedRooms = snapshot.trimmedRoomIds?.length ?? 0;
      skippedRooms = snapshot.skippedRoomIds?.length ?? 0;
    },
  });

  for (let roomIndex = 0; roomIndex < cell.roomCount; roomIndex += 1) {
    const testPackage = makeTestPackage(cell.packMiB, roomIndex);
    const created = store.create(testPackage, {
      clientId: `owner-${roomIndex}`,
      displayName: `Owner ${roomIndex}`,
    });
    if (cell.trimHistory) {
      const historyPadding = "h".repeat(TRIM_HISTORY_VALUE_BYTES);
      for (let version = 0; version < TRIM_HISTORY_ENTRIES; version += 1) {
        store.apply(created.room.id, created.access.accessToken, {
          txId: `trim-bench-${roomIndex}-${version}`,
          clientId: `owner-${roomIndex}`,
          baseVersion: version,
          operations: [{
            type: "set",
            path: ["historyPadding"],
            value: historyPadding,
          }],
        });
      }
    }
  }

  // Warm up structured cloning, promise scheduling, and JSON serialization.
  await store.flush();

  const snapshotSamples: number[] = [];
  const stringifySamples: number[] = [];
  for (let run = 0; run < RUNS; run += 1) {
    stringifyMs = Number.NaN;
    const startedAt = performance.now();
    const pendingFlush = store.flush();
    const snapshotMs = performance.now() - startedAt;
    await pendingFlush;
    if (!Number.isFinite(stringifyMs)) {
      throw new Error("Persist callback did not record JSON.stringify timing");
    }
    snapshotSamples.push(snapshotMs);
    stringifySamples.push(stringifyMs);
  }
  if (outputBytes > MAX_PERSISTED_SNAPSHOT_BYTES) {
    throw new Error(`Persisted ${outputBytes} bytes beyond ${MAX_PERSISTED_SNAPSHOT_BYTES}-byte snapshot budget`);
  }
  if (retainedRooms !== cell.expectedRetainedRooms) {
    throw new Error(
      `${cell.path}: expected ${cell.expectedRetainedRooms} retained room(s), observed ${retainedRooms}`,
    );
  }
  if (trimmedRooms !== cell.expectedTrimmedRooms) {
    throw new Error(
      `${cell.path}: expected ${cell.expectedTrimmedRooms} trimmed room(s), observed ${trimmedRooms}`,
    );
  }
  if (skippedRooms !== cell.expectedSkippedRooms) {
    throw new Error(
      `${cell.path}: expected ${cell.expectedSkippedRooms} skipped room(s), observed ${skippedRooms}`,
    );
  }

  return {
    snapshotMs: median(snapshotSamples),
    stringifyMs: median(stringifySamples),
    outputBytes,
    retainedRooms,
    trimmedRooms,
    skippedRooms,
  };
}

console.log("| path | rooms | target record MiB/room | target MiB | snapshot median ms | stringify median ms | occupancy ms | output bytes | retained rooms | trimmed rooms | skipped rooms |");
console.log("| :--- | ---: | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
for (const cell of CELLS) {
  const result = await measureCell(cell);
  console.log(
    `| ${cell.path} | ${cell.roomCount} | ${cell.packLabel} | ${cell.targetMiBLabel} | ${result.snapshotMs.toFixed(2)} | ${result.stringifyMs.toFixed(2)} | ${(result.snapshotMs + result.stringifyMs).toFixed(2)} | ${result.outputBytes} | ${result.retainedRooms} | ${result.trimmedRooms} | ${result.skippedRooms} |`,
  );
}
