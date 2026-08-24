// @vitest-environment node
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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

function roomState(version: number): PersistedRoomState {
  return {
    schemaVersion: 1,
    room: {
      id: "LOCKED1",
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
