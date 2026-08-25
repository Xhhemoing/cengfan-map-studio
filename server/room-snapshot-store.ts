import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { isRecord } from "./ai/agent-types";

/** 隔离出来的坏快照最多留几份。 */
const MAX_ROOM_SNAPSHOT_SIDECARS = 5;

/** 信封能不能用：version 或 rooms 形状不对时房间存储会整份丢弃，等同于没有快照。 */
export function isRestorableRoomSnapshot(snapshot: unknown): snapshot is Record<string, unknown> & { rooms: unknown[] } {
  return isRecord(snapshot) && snapshot.version === 1 && Array.isArray(snapshot.rooms);
}

/**
 * 原子落盘：先写 `<file>.<pid>.tmp` 再改名，避免写到一半被打断时留下半截文件。
 * 改名失败时临时文件仍躺在数据目录里，而落盘故障（目标被目录占住、磁盘满）会反复发生，
 * 不收掉就是每个进程堆一份孤儿；清理只是尽力而为，失败也绝不能顶替真正的 rename 错误。
 */
export async function writeFileAtomically(file: string, contents: string, mode?: number): Promise<void> {
  const temporaryFile = `${file}.${process.pid}.tmp`;
  await writeFile(temporaryFile, contents, mode === undefined ? "utf8" : { encoding: "utf8", mode });
  try {
    await rename(temporaryFile, file);
  } catch (error) {
    await rm(temporaryFile, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** `writeFileAtomically` 造出来的临时名：`<任意文件名>.<纯数字 pid>.tmp`，别的 .tmp 一概不认。 */
const ATOMIC_TEMPORARY_FILE = /^.+\.\d+\.tmp$/;

/**
 * 启动时收掉上一次进程崩在 write 与 rename 之间留下的 `<file>.<pid>.tmp`。
 * R9-1 的清理只跑在本进程 rename 失败的 catch 里，被 SIGKILL 打断的那份没人认领，
 * 会一直堆在数据目录里。必须在任何写者上膛之前跑：那一刻连与本进程同号的 pid 名
 * 也只可能来自上一次启动。清理纯属尽力而为，扫不动也绝不能挡住启动。
 */
export async function sweepStaleTemporaryFiles(dataDir: string): Promise<void> {
  let names: string[];
  try {
    names = await readdir(dataDir);
  } catch {
    // 首次启动时数据目录还不存在，没有孤儿可扫。
    return;
  }
  for (const name of names) {
    // 只认原子写的名字形状：.bad / .corrupt-* 是事故现场，正常数据文件更不能碰。
    if (!ATOMIC_TEMPORARY_FILE.test(name)) continue;
    const path = join(dataDir, name);
    try {
      await rm(path, { force: true });
    } catch (error) {
      console.warn(`清理残留临时文件失败，跳过: ${path}`, error instanceof Error ? error.message : error);
    }
  }
}

/** 坏快照的隔离路径：已有 .bad 时带上时间戳，绝不覆盖上一次的事故现场。 */
function roomSnapshotQuarantinePath(file: string): string {
  if (!existsSync(`${file}.bad`)) return `${file}.bad`;
  let candidate = `${file}.${Date.now()}.bad`;
  // 同一毫秒内连续两次坏启动会撞名，再补一个序号即可保证唯一。
  for (let attempt = 1; existsSync(candidate); attempt += 1) {
    candidate = `${file}.${Date.now()}.${attempt}.bad`;
  }
  return candidate;
}

/** 隔离文件名里的时间戳序：没有时间戳的 `.bad` 是第一份被隔离的，因此排最旧。 */
function roomSnapshotSidecarSequence(name: string, prefix: string): number {
  const middle = name.slice(prefix.length, -".bad".length);
  return middle ? Number(middle.split(".")[0]) || 0 : 0;
}

/** 坏启动会反复发生，`.bad` 不设上限就会一直堆在数据目录里，只留最近的几份现场。 */
async function pruneRoomSnapshotSidecars(file: string, keep = MAX_ROOM_SNAPSHOT_SIDECARS): Promise<void> {
  const directory = dirname(file);
  const prefix = `${basename(file)}.`;
  try {
    const names = (await readdir(directory)).filter((name) => name.startsWith(prefix) && name.endsWith(".bad"));
    if (names.length <= keep) return;
    const sidecars = await Promise.all(names.map(async (name) => {
      const path = join(directory, name);
      return {
        path,
        modifiedAt: await stat(path).then((info) => info.mtimeMs, () => 0),
        sequence: roomSnapshotSidecarSequence(name, prefix),
      };
    }));
    sidecars.sort((a, b) => b.modifiedAt - a.modifiedAt || b.sequence - a.sequence);
    for (const stale of sidecars.slice(keep)) {
      await rm(stale.path, { force: true });
    }
  } catch {
    // 清理不成功只是多留几份证据，不能反过来挡住启动。
  }
}

/**
 * 坏文件留在正常路径上会被下一次成功落盘直接覆盖，事故现场就此消失，
 * 所以先把它挪到 .bad 旁路；挪不动也只是少一份证据，启动照常继续。
 */
async function quarantineRoomSnapshot(file: string, reason: string): Promise<void> {
  const quarantine = roomSnapshotQuarantinePath(file);
  try {
    await rename(file, quarantine);
  } catch (error) {
    console.warn(
      `房间快照${reason}且隔离失败（目标 ${quarantine}），本次启动不恢复房间: ${file}`,
      error instanceof Error ? error.message : error,
    );
    return;
  }
  console.warn(`房间快照${reason}，已隔离到 ${quarantine}，本次启动不恢复房间: ${file}`);
  await pruneRoomSnapshotSidecars(file);
}

/** 缺失或损坏的房间快照一律当作「没有房间」：启动不能被一份坏文件挡住。 */
export async function loadRoomSnapshot(file: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    // 首次启动、或上一次进程还没落过盘，都没有快照文件。
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    await quarantineRoomSnapshot(file, "无法解析");
    return undefined;
  }
  // 能解析不等于能用：信封不对时房间存储会整份丢弃，文件却仍躺在正常路径上等着被覆盖。
  if (!isRestorableRoomSnapshot(parsed)) {
    await quarantineRoomSnapshot(file, "信封无法使用");
    return undefined;
  }
  return parsed;
}

export function createRoomSnapshotWriter(dataDir: string, file: string) {
  return async (snapshot: unknown): Promise<void> => {
    await mkdir(dataDir, { recursive: true });
    // 快照里带着房间凭证（R3-4 保证是哈希后的）：仍然按私有文件写。
    await writeFileAtomically(file, `${JSON.stringify(snapshot)}\n`, 0o600);
  };
}
