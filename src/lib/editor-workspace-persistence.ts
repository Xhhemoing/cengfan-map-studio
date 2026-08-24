import type { MutableRefObject } from "react";
import { DRAFT_KEY, DRAFT_SAVED_AT_KEY } from "./app-constants";
import {
  loadLatestBrowserWorkspace,
  saveBrowserWorkspaceSnapshot,
  type BrowserWorkspaceStores,
} from "./browser-workspace-store";
import {
  LocalWorkspaceOverwrite,
  type LocalOverwriteStatus,
  type LocalWorkspaceOverwriteState,
} from "./incremental-workspace-sync";
import type { MissingProjectObservation } from "./missing-project-notice";
import { serializeProjectDocument } from "./project-document";
import { restoreProjectPackage, type ProjectPackage } from "./project-package";
import type { ProjectStore, StoredProject } from "./project-store";

/** 编辑器当前挂着的项目记录身份。写回时要连同它一起落到项目库,而不是只写浏览器镜像。 */
export interface EditorProjectRecordRefs {
  idRef: MutableRefObject<string | null>;
  nameRef: MutableRefObject<string | null>;
  createdAtRef: MutableRefObject<string>;
  /** 最近一次项目记录写入失败的原因,决定强制保存后那句话怎么说。 */
  saveErrorRef: MutableRefObject<string | null>;
}

export interface WorkspaceSyncOptions {
  stores: BrowserWorkspaceStores;
  record: EditorProjectRecordRefs;
  projectStore: ProjectStore;
  onStateChange(state: LocalWorkspaceOverwriteState): void;
}

/**
 * 强制保存管线:同步草稿(localStorage)→ 完整镜像/IndexedDB 工作区 → 项目记录。
 * 三层都失败才算保存失败;项目记录单独失败要能被上层区分出来,否则用户会以为
 * 项目列表已经更新。
 */
export function createWorkspaceSync(options: WorkspaceSyncOptions): LocalWorkspaceOverwrite {
  const { stores, record, projectStore, onStateChange } = options;
  return new LocalWorkspaceOverwrite({
    saveLocal: async (pack) => {
      try {
        localStorage.setItem(DRAFT_KEY, serializeProjectDocument(pack.project));
        localStorage.setItem(DRAFT_SAVED_AT_KEY, pack.exportedAt);
      } catch {
        // The complete mirror or IndexedDB copy can still preserve the workspace.
      }
      const result = await saveBrowserWorkspaceSnapshot(pack, stores);
      if (result.durable === "failed" && result.mirror === "failed") {
        // put 分支不会执行,清空旧错误,避免强制保存后误报"本地已保存"。
        record.saveErrorRef.current = null;
        throw new Error("浏览器本地存储不可写");
      }
      if (record.idRef.current) {
        try {
          await projectStore.put({
            id: record.idRef.current,
            name: record.nameRef.current ?? "未命名项目",
            createdAt: record.createdAtRef.current,
            updatedAt: new Date().toISOString(),
            pack,
          });
          record.saveErrorRef.current = null;
        } catch (error) {
          record.saveErrorRef.current = error instanceof Error ? error.message : String(error);
          throw new Error("项目记录写入失败", { cause: error });
        }
      }
    },
    onStateChange,
  });
}

/** 强制保存之后该说的那句话:本地写成功但项目记录没写进去,是必须单独讲清楚的一种。 */
export function describeForceSaveOutcome(status: LocalOverwriteStatus, recordSaveError: string | null): string {
  if (status === "saved") return "强制保存完成：全部数据已覆盖到浏览器本地";
  if (recordSaveError) {
    return `浏览器本地已保存，但项目记录写入失败（${recordSaveError}）。请导出工程包备份，否则项目列表不会更新。`;
  }
  return "强制保存失败：浏览器本地存储不可写，请立即导出工程包";
}

export type StoredProjectOutcome =
  | { status: "loaded"; record: StoredProject; restored: ProjectPackage }
  | { status: "missing"; observation: MissingProjectObservation };

/**
 * 按 id 打开一个项目记录,并把「读不到」的成因一并带回来。
 * 降级期间 `get()` 读的是空的内存副本,所以健康度要在发起与返回两端各取一次:
 * 只有全程跑在持久库上,空结果才等于磁盘上真的没有这一行。
 */
export async function loadStoredProject(store: ProjectStore, projectId: string): Promise<StoredProjectOutcome> {
  const healthAtRequest = store.health;
  try {
    const record = await store.get(projectId);
    if (!record) {
      return { status: "missing", observation: { reason: "not-found", healthAtRequest, health: store.health } };
    }
    // 记录损坏到解不开,与读取失败是同一种处境:读不出来,不等于它已经被删除。
    return { status: "loaded", record, restored: restoreProjectPackage(record.pack) };
  } catch {
    return { status: "missing", observation: { reason: "read-failed", healthAtRequest, health: store.health } };
  }
}

/** 只有严格更新的镜像才值得盖掉首帧那份:时间戳解析不出来就当它不新。 */
export function isFresherWorkspace(currentExportedAt: string | undefined, candidateExportedAt: string): boolean {
  if (currentExportedAt === undefined) return true;
  const currentTime = Date.parse(currentExportedAt);
  const candidateTime = Date.parse(candidateExportedAt);
  if (!Number.isFinite(candidateTime)) return false;
  return candidateTime > currentTime;
}

export interface LatestWorkspaceOptions {
  stores: BrowserWorkspaceStores;
  /** 首帧同步读到的镜像,用于判断异步读回来的那份是否更新。 */
  initialExportedAt: string | undefined;
  /** 用户是否已经在本地改过东西:改过就不能再拿磁盘上的旧工作区盖回去。 */
  hasLocalEdits(): boolean;
}

/**
 * 异步读取浏览器上最完整的工作区。返回 null 表示这一次不该采纳(没有、更旧,或用户已经动过)。
 * 不管走哪条路,读取结束都要把"已尝试水合"记下来,否则之后的编辑会被当成水合前的改动。
 */
export async function loadAdoptableWorkspace(options: LatestWorkspaceOptions): Promise<ProjectPackage | null> {
  try {
    const pack = await loadLatestBrowserWorkspace(options.stores);
    if (!pack || options.hasLocalEdits()) return null;
    return isFresherWorkspace(options.initialExportedAt, pack.exportedAt) ? pack : null;
  } catch {
    return null;
  }
}

export interface PageLeaveSaveState {
  /** 编辑器当前挂着的项目 id;没有项目就没有项目记录要写。 */
  projectId: string | null;
  loading: boolean;
  missing: boolean;
  /** 返回工作台的流程自己会保存一次,重复触发只会写两遍。 */
  navigatingBack: boolean;
  syncStatus: LocalOverwriteStatus;
  hasLocalEdits: boolean;
}

/** 离开页面时是否还欠一次落盘。 */
export function shouldSaveOnPageLeave(state: PageLeaveSaveState): boolean {
  if (!state.projectId || state.loading || state.missing || state.navigatingBack) return false;
  return state.syncStatus === "pending" || state.hasLocalEdits;
}

/**
 * 切换标签或关闭页面时尽力保存一次。两个事件都要听:pagehide 在部分浏览器上不触发,
 * visibilitychange 又赶不上真正的关闭。
 */
export function subscribePageLeave(save: () => void): () => void {
  window.addEventListener("visibilitychange", save);
  window.addEventListener("pagehide", save);
  return () => {
    window.removeEventListener("visibilitychange", save);
    window.removeEventListener("pagehide", save);
  };
}
