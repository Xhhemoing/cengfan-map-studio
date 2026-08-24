// @vitest-environment node
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { withCollaborationFileLock } from "./collaboration-file-lock";
import {
  createFileRoomSnapshotStore,
  type PersistedRoomState,
} from "./collaboration-snapshot-store";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "cengfan-snapshot-store-"));
  temporaryDirectories.push(directory);
  return directory;
}

function roomState(version: number, id = "LOCKED1"): PersistedRoomState {
  return {
    schemaVersion: 1,
    room: {
      id,
      version,
      snapshot: { version, payload: "x".repeat(64 * 1024) },
      ready: true,
      createdBy: "owner",
      updatedBy: "owner",
      updatedAt: new Date(version * 1_000).toISOString(),
      members: [],
    },
    lastActivity: version * 1_000,
    accessRecords: [],
    revokedAccessRecords: [],
    invitations: [],
    transactions: [`transaction-${version}`],
    operationHistory: [],
    legacy: false,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("file room snapshot store", () => {
  it("skips truncated and malformed snapshots while loading valid rooms", () => {
    const directory = createTemporaryDirectory();
    const store = createFileRoomSnapshotStore(directory);
    const firstState = roomState(1, "GOOD001");
    const secondState = roomState(2, "GOOD002");
    store.save(firstState);
    store.save(secondState);
    writeFileSync(
      join(directory, "TRUNCATED.json"),
      JSON.stringify(roomState(3, "TRUNCATED")).slice(0, -1),
    );
    writeFileSync(join(directory, "MALFORMED.json"), "{not json");

    let loaded: PersistedRoomState[] | undefined;
    expect(() => {
      loaded = store.load();
    }).not.toThrow();
    expect(loaded).toHaveLength(2);
    expect(loaded).toEqual(expect.arrayContaining([firstState, secondState]));
  });

  it("serializes sequential saves of the same room as one valid latest snapshot", () => {
    const directory = createTemporaryDirectory();
    const firstStore = createFileRoomSnapshotStore(directory);
    const secondStore = createFileRoomSnapshotStore(directory);
    const firstState = roomState(1);
    const secondState = roomState(2);

    firstStore.save(firstState);
    secondStore.save(secondState);

    const serialized = readFileSync(join(directory, "LOCKED1.json"), "utf8");
    expect(JSON.parse(serialized)).toEqual(secondState);
    expect(firstStore.load()).toEqual([secondState]);
  });

  it("keeps JSON intact when two local processes overlap snapshot writes", async () => {
    const directory = createTemporaryDirectory();
    const startFile = join(directory, "start");
    const storeModuleUrl = new URL("./collaboration-snapshot-store.ts", import.meta.url).href;
    const childScript = `
      import { existsSync, readFileSync } from "node:fs";
      import { createFileRoomSnapshotStore } from ${JSON.stringify(storeModuleUrl)};
      const [directory, stateFile, startFile] = process.argv.slice(-3);
      const state = JSON.parse(readFileSync(stateFile, "utf8"));
      process.stdout.write("ready\\n");
      const sleeper = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
      while (!existsSync(startFile)) Atomics.wait(sleeper, 0, 0, 5);
      createFileRoomSnapshotStore(directory).save(state);
    `;
    const states = [roomState(1), roomState(2)];
    const writers = states.map((state, index) => {
      const stateFile = join(directory, `writer-${index}.input`);
      writeFileSync(stateFile, JSON.stringify(state));
      const child = spawn(process.execPath, [
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        childScript,
        directory,
        stateFile,
        startFile,
      ], { stdio: ["ignore", "pipe", "pipe"] });
      const ready = new Promise<void>((resolve, reject) => {
        child.stdout.setEncoding("utf8");
        child.stdout.once("data", (output: string) => {
          if (output.includes("ready")) resolve();
          else reject(new Error(`Unexpected snapshot writer output: ${output}`));
        });
        child.once("error", reject);
      });
      const exited = new Promise<void>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Snapshot writer exited with ${code}: ${child.stderr.read()}`));
        });
      });
      return { ready, exited };
    });

    await Promise.all(writers.map(({ ready }) => ready));
    writeFileSync(startFile, "go");
    await Promise.all(writers.map(({ exited }) => exited));

    const serialized = readFileSync(join(directory, "LOCKED1.json"), "utf8");
    const persisted = JSON.parse(serialized) as PersistedRoomState;
    expect(states).toContainEqual(persisted);
    expect(createFileRoomSnapshotStore(directory).load()).toEqual([persisted]);
  });

  it("excludes a second local process from the same room file", async () => {
    const directory = createTemporaryDirectory();
    const target = join(directory, "LOCKED1.json");
    const lockModuleUrl = new URL("./collaboration-file-lock.ts", import.meta.url).href;
    const childScript = `
      import { withCollaborationFileLock } from ${JSON.stringify(lockModuleUrl)};
      const target = process.argv.at(-1);
      withCollaborationFileLock(target, () => {
        process.stdout.write("locked\\n");
        const sleeper = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
        Atomics.wait(sleeper, 0, 0, 300);
      });
    `;
    const child = spawn(process.execPath, [
      "--import",
      "tsx",
      "--input-type=module",
      "--eval",
      childScript,
      target,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    const childExit = new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Lock holder exited with ${code}: ${child.stderr.read()}`));
      });
    });
    await new Promise<void>((resolve, reject) => {
      child.stdout.setEncoding("utf8");
      child.stdout.once("data", (output: string) => {
        if (output.includes("locked")) resolve();
        else reject(new Error(`Unexpected lock holder output: ${output}`));
      });
      child.once("error", reject);
    });

    const startedAt = Date.now();
    withCollaborationFileLock(target, () => undefined);

    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(100);
    await childExit;
  });
});
