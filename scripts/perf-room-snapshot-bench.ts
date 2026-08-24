/**
 * Collaboration room-store snapshot/serialization micro-benchmark.
 *
 * Run with: npx tsx scripts/perf-room-snapshot-bench.ts
 *
 * Measures the synchronous `createRoomStore().flush()` snapshot construction
 * and the persist callback's `JSON.stringify` separately for one room whose
 * persisted record targets 6, 8, or 12 MiB, plus a 5 MiB room whose duplicate
 * operation history forces the history-trim path. Each result is the median of
 * five runs after one warmup.
 *
 * Limits: package inflation is synthetic, setup/allocation and persistence I/O
 * are excluded, and timings are machine/GC dependent. This measures event-loop
 * occupancy during snapshot construction and JSON serialization, not peak
 * memory or storage latency.
 *
 * Known miss: the retained 8 MiB calibration cell measured 56.6 ms occupancy
 * against the approximate 50 ms target. API-limit parity takes precedence;
 * off-thread serialization is intentionally out of scope for this fix.
 */
import { performance } from "node:perf_hooks";
import {
  createRoomStore,
  MAX_PERSISTED_SNAPSHOT_BYTES,
  type RoomStoreSnapshot,
} from "../server/collaboration";

const RUNS = 5;
const ROOM_COUNTS = [1] as const;
const PACK_MIB = [6, 8, 12] as const;
const BYTES_PER_MIB = 1024 * 1024;
const TRIM_HISTORY_ENTRIES = 256;
const TRIM_HISTORY_VALUE_BYTES = 16 * 1024;
// Leave space for room metadata so the target cell remains just below the cap.
const RECORD_ENVELOPE_MARGIN_BYTES = 4 * 1024;

interface Sample {
  snapshotMs: number;
  stringifyMs: number;
  outputBytes: number;
  trimmedRooms: number;
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

async function measureCell(roomCount: number, packMiB: number, trimHistory = false): Promise<Sample> {
  let stringifyMs = Number.NaN;
  let outputBytes = 0;
  let trimmedRooms = 0;
  let nextId = 1;
  const store = createRoomStore({
    maxRooms: ROOM_COUNTS.at(-1),
    generateId: () => `BENCH${nextId++}`,
    generateSecret: () => `snapshot-bench-secret-${nextId}`,
    persist: (snapshot: RoomStoreSnapshot) => {
      const startedAt = performance.now();
      const serialized = JSON.stringify(snapshot);
      stringifyMs = performance.now() - startedAt;
      outputBytes = Buffer.byteLength(serialized);
      trimmedRooms = snapshot.trimmedRoomIds?.length ?? 0;
    },
  });

  for (let roomIndex = 0; roomIndex < roomCount; roomIndex += 1) {
    const testPackage = makeTestPackage(packMiB, roomIndex);
    const created = store.create(testPackage, {
      clientId: `owner-${roomIndex}`,
      displayName: `Owner ${roomIndex}`,
    });
    if (trimHistory) {
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
  if (trimHistory && trimmedRooms !== roomCount) {
    throw new Error(`Expected ${roomCount} trimmed room(s), observed ${trimmedRooms}`);
  }

  return {
    snapshotMs: median(snapshotSamples),
    stringifyMs: median(stringifySamples),
    outputBytes,
    trimmedRooms,
  };
}

console.log("| path | rooms | target record MiB/room | target MiB | snapshot median ms | stringify median ms | occupancy ms | output bytes | trimmed rooms |");
console.log("| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
for (const roomCount of ROOM_COUNTS) {
  for (const packMiB of PACK_MIB) {
    const result = await measureCell(roomCount, packMiB);
    console.log(
      `| standard | ${roomCount} | ${packMiB} | ${roomCount * packMiB} | ${result.snapshotMs.toFixed(2)} | ${result.stringifyMs.toFixed(2)} | ${(result.snapshotMs + result.stringifyMs).toFixed(2)} | ${result.outputBytes} | ${result.trimmedRooms} |`,
    );
  }
}
const trimResult = await measureCell(1, 5, true);
console.log(
  `| history trim | 1 | 5 (+ 4 MiB history) | 9 | ${trimResult.snapshotMs.toFixed(2)} | ${trimResult.stringifyMs.toFixed(2)} | ${(trimResult.snapshotMs + trimResult.stringifyMs).toFixed(2)} | ${trimResult.outputBytes} | ${trimResult.trimmedRooms} |`,
);
