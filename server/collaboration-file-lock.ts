import {
  closeSync,
  constants,
  mkdirSync,
  openSync,
  rmdirSync,
} from "node:fs";
import * as nodeFs from "node:fs";
import { createRequire } from "node:module";

type FlockSync = (fileDescriptor: number, operation: "ex" | "un") => void;

const LOCK_RETRY_MS = 10;
const LOCK_TIMEOUT_MS = 10_000;
const sleepBuffer = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
const require = createRequire(import.meta.url);

function loadFlockSync(): FlockSync | undefined {
  const nativeFlockSync = (nodeFs as unknown as { flockSync?: FlockSync }).flockSync;
  if (nativeFlockSync) return nativeFlockSync;
  try {
    const optionalFsExt = require("fs-ext") as { flockSync?: FlockSync };
    return optionalFsExt.flockSync;
  } catch {
    return undefined;
  }
}

const flockSync = loadFlockSync();

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : undefined;
}

function isUnsupportedFlock(error: unknown): boolean {
  return ["ENOSYS", "ENOTSUP", "EOPNOTSUPP"].includes(errorCode(error) ?? "");
}

function withDirectoryLock<T>(filePath: string, action: () => T): T {
  const lockDirectory = `${filePath}.lock.d`;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  while (true) {
    try {
      mkdirSync(lockDirectory, { mode: 0o700 });
      break;
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      if (Date.now() >= deadline) {
        throw new Error(
          `Timed out waiting for collaboration snapshot lock: ${filePath}`,
          { cause: error },
        );
      }
      Atomics.wait(sleepBuffer, 0, 0, LOCK_RETRY_MS);
    }
  }

  try {
    return action();
  } finally {
    rmdirSync(lockDirectory);
  }
}

/**
 * Serializes access to one snapshot path between cooperating local processes.
 * This is intentionally a same-machine advisory lock, not distributed storage.
 */
export function withCollaborationFileLock<T>(filePath: string, action: () => T): T {
  if (!flockSync) return withDirectoryLock(filePath, action);

  const lockFile = `${filePath}.lock`;
  const fileDescriptor = openSync(
    lockFile,
    constants.O_CREAT | constants.O_RDWR,
    0o600,
  );
  let locked = false;
  let flockUnsupported = false;

  try {
    try {
      flockSync(fileDescriptor, "ex");
      locked = true;
    } catch (error) {
      if (!isUnsupportedFlock(error)) throw error;
      flockUnsupported = true;
    }
    if (locked) return action();
  } finally {
    if (locked) flockSync(fileDescriptor, "un");
    closeSync(fileDescriptor);
  }

  if (flockUnsupported) return withDirectoryLock(filePath, action);
  throw new Error(`Could not acquire collaboration snapshot lock: ${filePath}`);
}
