import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/** 隔离出来的坏状态文件最多留几份，与房间快照的 MAX_ROOM_SNAPSHOT_SIDECARS 对齐。 */
const MAX_AI_STATE_SIDECARS = 5;

export const AI_RUNTIME_STATE_VERSION = 1 as const;
export const AI_RUNTIME_STATE_MAX_BYTES = 1024 * 1024;
export const AI_RUNTIME_STATE_MAX_LEDGER_ENTRIES = 10_000;
export const AI_RUNTIME_STATE_MAX_RATE_LIMIT_NAMES = 16;
export const AI_RUNTIME_STATE_MAX_RATE_LIMIT_ENTRIES = 10_000;

export interface PersistedBudgetLedgerEntry { taskId: string; sequence: number; receiptDigest: string; usedTokens: number; rounds: number; updatedAt: number; consumed: boolean; }
export interface PersistedRateLimitEntry { key: string; startedAt: number; count: number; }
export interface AiRuntimeState { version: typeof AI_RUNTIME_STATE_VERSION; budgetLedger: PersistedBudgetLedgerEntry[]; rateLimits: Record<string, PersistedRateLimitEntry[]>; }
export interface AiStateStoreErrorInfo { readonly code: string; readonly message: string; }
export interface AiStateStore {
  readonly mode: "memory" | "file";
  readonly ready: boolean;
  readonly recovered: boolean;
  readonly failure: boolean;
  readonly error?: AiStateStoreErrorInfo;
  load(): Promise<AiRuntimeState>;
  update(mutator: (state: AiRuntimeState) => void | AiRuntimeState): Promise<void>;
  flush(): Promise<void>;
}

export function emptyAiRuntimeState(): AiRuntimeState { return { version: 1, budgetLedger: [], rateLimits: {} }; }
function cloneState(state: AiRuntimeState): AiRuntimeState { return { version: 1, budgetLedger: state.budgetLedger.map((entry) => ({ ...entry })), rateLimits: Object.fromEntries(Object.entries(state.rateLimits).map(([name, entries]) => [name, entries.map((entry) => ({ ...entry }))])) }; }
class StateStoreFailure extends Error { constructor(readonly code: string, message: string, options?: { cause?: unknown }) { super(message, options); this.name = "StateStoreFailure"; } }
function safeInt(value: unknown, min = 0): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= min; }
function bounded(value: unknown, pattern: RegExp, max: number, empty = false): value is string { return typeof value === "string" && (empty || value.length > 0) && value.length <= max && pattern.test(value); }
function validLedger(value: unknown): value is PersistedBudgetLedgerEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return (Object.keys(entry).sort().join(",") === "consumed,receiptDigest,rounds,sequence,taskId,updatedAt,usedTokens" || Object.keys(entry).sort().join(",") === "claimId,consumed,receiptDigest,rounds,sequence,taskId,updatedAt,usedTokens")
    && bounded(entry.taskId, /^[A-Za-z0-9._:-]+$/, 128) && safeInt(entry.sequence) && bounded(entry.receiptDigest, /^[a-f0-9]{0,64}$/, 64, true) && safeInt(entry.usedTokens) && safeInt(entry.rounds) && safeInt(entry.updatedAt) && typeof entry.consumed === "boolean";
}
function validRate(value: unknown): value is PersistedRateLimitEntry { if (!value || typeof value !== "object" || Array.isArray(value)) return false; const entry = value as Record<string, unknown>; return Object.keys(entry).sort().join(",") === "count,key,startedAt" && typeof entry.key === "string" && entry.key.length > 0 && entry.key.length <= 256 && !entry.key.includes("\u0000") && safeInt(entry.startedAt) && safeInt(entry.count, 1); }
function parseState(value: unknown): AiRuntimeState {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new StateStoreFailure("AI_STATE_CORRUPT", "AI 状态文件格式无效");
  const record = value as Record<string, unknown>;
  if (record.version !== 1) throw new StateStoreFailure("AI_STATE_UNSUPPORTED_VERSION", "AI 状态文件版本不受支持");
  if (Object.keys(record).sort().join(",") !== "budgetLedger,rateLimits,version" || !Array.isArray(record.budgetLedger) || record.budgetLedger.length > AI_RUNTIME_STATE_MAX_LEDGER_ENTRIES || !record.budgetLedger.every(validLedger) || !record.rateLimits || typeof record.rateLimits !== "object" || Array.isArray(record.rateLimits)) throw new StateStoreFailure("AI_STATE_CORRUPT", "AI 状态文件格式无效");
  const limits = record.rateLimits as Record<string, unknown>;
  const names = Object.keys(limits);
  if (names.length > AI_RUNTIME_STATE_MAX_RATE_LIMIT_NAMES || names.some((name) => !/^[A-Za-z0-9._:-]{1,64}$/.test(name)) || Object.values(limits).some((entries) => !Array.isArray(entries) || entries.length > AI_RUNTIME_STATE_MAX_RATE_LIMIT_ENTRIES || !entries.every(validRate))) throw new StateStoreFailure("AI_STATE_CORRUPT", "AI 状态文件格式无效");
  return cloneState({ version: 1, budgetLedger: record.budgetLedger as PersistedBudgetLedgerEntry[], rateLimits: limits as Record<string, PersistedRateLimitEntry[]> });
}
/** 对外只暴露稳定的 code/message，原始 errno 挂在 cause 上，排障时才知道是磁盘满还是路径被占。 */
function safeError(error: unknown, fallback: string): StateStoreFailure { return error instanceof StateStoreFailure ? error : new StateStoreFailure(fallback, "AI 状态持久化失败", { cause: error }); }

/**
 * 原子落盘：先写 `<file>.<pid>.tmp` 再改名。改名失败时临时文件仍躺在数据目录里，
 * 而落盘故障（目标被目录占住、磁盘满）会反复发生，不收掉就是每个进程堆一份孤儿；
 * 清理只是尽力而为，失败也绝不能顶替真正的 rename 错误。
 */
async function writeAiStateAtomically(filePath: string, contents: string): Promise<void> {
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, contents, "utf8");
  try {
    await rename(temporary, filePath);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** 坏状态会反复出现，`.corrupt-*` 不设上限就会一直堆在数据目录里，只留最近的几份现场。 */
async function pruneAiStateSidecars(filePath: string, keep = MAX_AI_STATE_SIDECARS): Promise<void> {
  const directory = dirname(filePath);
  const prefix = `${basename(filePath)}.corrupt-`;
  try {
    const names = (await readdir(directory)).filter((name) => name.startsWith(prefix));
    if (names.length <= keep) return;
    const sidecars = await Promise.all(names.map(async (name) => {
      const path = join(directory, name);
      return {
        path,
        modifiedAt: await stat(path).then((info) => info.mtimeMs, () => 0),
        // 文件名里的隔离时间戳：mtime 撞在同一毫秒时用它兜底定序。
        sequence: Number(name.slice(prefix.length)) || 0,
      };
    }));
    sidecars.sort((a, b) => b.modifiedAt - a.modifiedAt || b.sequence - a.sequence);
    for (const stale of sidecars.slice(keep)) await rm(stale.path, { force: true });
  } catch {
    // 清理不成功只是多留几份证据，不能反过来挡住加载。
  }
}

function createStore(mode: "memory" | "file", initial: AiRuntimeState, persist: (state: AiRuntimeState) => Promise<void>, diskLoad?: () => Promise<AiRuntimeState>): AiStateStore {
  let state = cloneState(initial); let loaded = false; let recovered = false; let failure = false; let error: AiStateStoreErrorInfo | undefined; let queue = Promise.resolve();
  const store: AiStateStore = {
    mode,
    get ready() { return loaded && !failure; },
    get recovered() { return recovered; },
    get failure() { return failure; },
    get error() { return error; },
    async load() { if (loaded) return cloneState(state); try { state = diskLoad ? await diskLoad() : cloneState(initial); loaded = true; return cloneState(state); } catch (cause) { const safe = safeError(cause, "AI_STATE_LOAD_FAILED"); failure = true; error = { code: safe.code, message: safe.message }; throw safe; } },
    update(mutator) { const operation = queue.catch(() => undefined).then(async () => { if (!loaded || failure) throw new StateStoreFailure("AI_STATE_UNAVAILABLE", "AI 状态不可用"); const next = cloneState(state); const result = mutator(next); state = cloneState(result ?? next); parseState(state); await persist(state); }); queue = operation.catch((cause) => { const safe = safeError(cause, "AI_STATE_PERSIST_FAILED"); failure = true; error = { code: safe.code, message: safe.message }; throw safe; }); return queue; },
    async flush() { try { await queue; } catch (cause) { const safe = safeError(cause, "AI_STATE_PERSIST_FAILED"); failure = true; error = { code: safe.code, message: safe.message }; throw safe; } if (failure) throw new StateStoreFailure(error?.code ?? "AI_STATE_UNAVAILABLE", error?.message ?? "AI 状态不可用"); },
  };
  return store;
}

export function createMemoryAiStateStore(initial?: AiRuntimeState, options: { ready?: boolean } = {}): AiStateStore { const store = createStore("memory", initial ? parseState(initial) : emptyAiRuntimeState(), async () => undefined); if (options.ready) void store.load(); return store; }
export function createFileAiStateStore(filePath: string): AiStateStore {
  let recovered = false;
  const diskLoad = async (): Promise<AiRuntimeState> => {
    let raw: string;
    try { raw = await readFile(filePath, "utf8"); } catch (cause) { if (cause && typeof cause === "object" && "code" in cause && cause.code === "ENOENT") return emptyAiRuntimeState(); throw new StateStoreFailure("AI_STATE_LOAD_FAILED", "AI 状态文件读取失败", { cause }); }
    if (Buffer.byteLength(raw, "utf8") > AI_RUNTIME_STATE_MAX_BYTES) throw new StateStoreFailure("AI_STATE_CORRUPT", "AI 状态文件格式无效");
    try { return parseState(JSON.parse(raw) as unknown); } catch (cause) { const safe = safeError(cause, "AI_STATE_CORRUPT"); if (safe.code === "AI_STATE_UNSUPPORTED_VERSION") throw safe; try { await rename(filePath, `${filePath}.corrupt-${Date.now()}`); } catch (renameCause) { throw new StateStoreFailure("AI_STATE_LOAD_FAILED", "AI 状态文件隔离失败", { cause: renameCause }); } await pruneAiStateSidecars(filePath); recovered = true; return emptyAiRuntimeState(); }
  };
  const store = createStore("file", emptyAiRuntimeState(), async (state) => { await mkdir(dirname(filePath), { recursive: true }); const serialized = `${JSON.stringify(state)}\n`; if (Buffer.byteLength(serialized, "utf8") > AI_RUNTIME_STATE_MAX_BYTES) throw new StateStoreFailure("AI_STATE_TOO_LARGE", "AI 状态超出大小限制"); await writeAiStateAtomically(filePath, serialized); }, diskLoad);
  Object.defineProperty(store, "recovered", { get: () => recovered });
  return store;
}
