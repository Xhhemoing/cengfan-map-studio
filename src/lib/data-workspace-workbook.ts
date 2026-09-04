/**
 * 学生数据中心导入侧的工作簿解析会话：识别代号（generation）、后台 worker 的复用、
 * 超时熔断、空闲回收与取消，全部从 src/components/DataWorkspace.tsx 原样搬出
 * （2026-08-26）。时限常量、取消语义与错误文案均未改动。
 */
import { useEffect, useRef } from "react";
import type { WorkbookImportRequest, WorkbookImportResponse } from "../workers/workbook-import.worker";

/** 提示里最多点名几张未读取的工作表，其余用「等」收尾。 */
const SKIPPED_SHEET_PREVIEW = 3;
/** 压缩工作簿解包后的体积可能远大于文件本身，先挡住异常大的输入再读取到内存。 */
export const MAX_WORKBOOK_FILE_BYTES = 25 * 1024 * 1024;
/** 病态工作簿不能无限占住导入流程；超时后销毁 worker，避免其继续消耗 CPU。 */
const WORKBOOK_PARSE_DEADLINE_MS = 30_000;
/** 连续导入复用已加载 XLSX 的 worker，空闲后再释放其模块和堆内存。 */
const WORKBOOK_WORKER_IDLE_MS = 30_000;
const WORKBOOK_IMPORT_CANCELLED = Symbol("workbook-import-cancelled");

export type WorkbookParseSuccess = Extract<WorkbookImportResponse, { type: "result" }>;

interface ActiveWorkbookImport {
  worker: Worker;
  requestId: number;
  deadlineTimer: ReturnType<typeof setTimeout>;
  reject: (reason: unknown) => void;
}

export interface WorkbookImportSession {
  /** 领一个新识别代号，同时取消在途的工作簿解析；返回值用于 {@link isCurrent} 判定。 */
  begin: () => number;
  /** 只有仍持有最新代号的那次识别才能落到候选状态上。 */
  isCurrent: (generation: number) => boolean;
  parseWorkbook: (buffer: ArrayBuffer, isCsv: boolean, requestId: number) => Promise<WorkbookParseSuccess>;
}

function createWorkbookImportWorker(): Worker {
  if (typeof Worker === "undefined") throw new Error("当前浏览器不支持后台解析 Excel / CSV");
  return new Worker(new URL("../workers/workbook-import.worker.ts", import.meta.url), { type: "module" });
}

export function describeSkippedSheets(names: readonly string[]): string {
  if (names.length === 0) return "";
  const preview = names.slice(0, SKIPPED_SHEET_PREVIEW).join("、");
  return `，另有 ${names.length} 张工作表未读取（${preview}${names.length > SKIPPED_SHEET_PREVIEW ? " 等" : ""}）`;
}

export function useWorkbookImportSession(): WorkbookImportSession {
  /**
   * 每次发起识别都领一个号，只有仍持有最新号的那次才能落到候选状态上。
   * 连点两次文件选择时，先发出的那次可能后返回，没有这道闸就会用旧文件覆盖新文件。
   */
  const importGenerationRef = useRef(0);
  const workbookWorkerRef = useRef<Worker | null>(null);
  const activeWorkbookImportRef = useRef<ActiveWorkbookImport | null>(null);
  const workbookWorkerIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearWorkbookWorkerIdleTimer = () => {
    if (workbookWorkerIdleTimerRef.current === null) return;
    clearTimeout(workbookWorkerIdleTimerRef.current);
    workbookWorkerIdleTimerRef.current = null;
  };
  const terminateWorkbookWorker = (worker: Worker | null = workbookWorkerRef.current) => {
    if (!worker) return;
    clearWorkbookWorkerIdleTimer();
    if (workbookWorkerRef.current === worker) workbookWorkerRef.current = null;
    worker.terminate();
  };
  const scheduleWorkbookWorkerIdleTeardown = (worker: Worker) => {
    clearWorkbookWorkerIdleTimer();
    if (workbookWorkerRef.current !== worker) return;
    workbookWorkerIdleTimerRef.current = setTimeout(() => {
      workbookWorkerIdleTimerRef.current = null;
      if (workbookWorkerRef.current === worker && activeWorkbookImportRef.current?.worker !== worker) {
        terminateWorkbookWorker(worker);
      }
    }, WORKBOOK_WORKER_IDLE_MS);
  };
  const acquireWorkbookWorker = (): Worker => {
    clearWorkbookWorkerIdleTimer();
    if (!workbookWorkerRef.current) workbookWorkerRef.current = createWorkbookImportWorker();
    return workbookWorkerRef.current;
  };
  const cancelWorkbookImport = () => {
    const active = activeWorkbookImportRef.current;
    if (!active) return;
    activeWorkbookImportRef.current = null;
    clearTimeout(active.deadlineTimer);
    terminateWorkbookWorker(active.worker);
    active.reject(WORKBOOK_IMPORT_CANCELLED);
  };

  const parseWorkbook = async (
    buffer: ArrayBuffer,
    isCsv: boolean,
    requestId: number,
  ): Promise<WorkbookParseSuccess> => {
    const worker = acquireWorkbookWorker();
    try {
      return await new Promise((resolve, reject) => {
        let settled = false;
        let deadlineTimer: ReturnType<typeof setTimeout>;
        const settle = () => {
          if (settled) return false;
          settled = true;
          clearTimeout(deadlineTimer);
          if (
            activeWorkbookImportRef.current?.worker === worker
            && activeWorkbookImportRef.current.requestId === requestId
          ) {
            activeWorkbookImportRef.current = null;
          }
          return true;
        };
        const rejectOnce = (reason: unknown) => {
          if (!settle()) return;
          reject(reason);
        };
        const resolveOnce = (response: WorkbookParseSuccess) => {
          if (!settle()) return;
          resolve(response);
        };
        deadlineTimer = setTimeout(() => {
          terminateWorkbookWorker(worker);
          rejectOnce(new Error("解析超时，文件可能已损坏"));
        }, WORKBOOK_PARSE_DEADLINE_MS);
        activeWorkbookImportRef.current = { worker, requestId, deadlineTimer, reject: rejectOnce };
        worker.onmessage = (event: MessageEvent<WorkbookImportResponse>) => {
          const response = event.data;
          if (response.requestId !== requestId) return;
          if (response.type === "error") {
            rejectOnce(new Error(response.message));
            return;
          }
          resolveOnce(response);
        };
        worker.onerror = (event) => {
          event.preventDefault();
          terminateWorkbookWorker(worker);
          rejectOnce(new Error(event.message || "工作簿后台解析失败"));
        };
        worker.onmessageerror = () => {
          terminateWorkbookWorker(worker);
          rejectOnce(new Error("工作簿后台解析结果无法读取"));
        };
        const request: WorkbookImportRequest = {
          type: "parse-workbook",
          requestId,
          buffer,
          isCsv,
        };
        try {
          worker.postMessage(request, [buffer]);
        } catch (error) {
          terminateWorkbookWorker(worker);
          rejectOnce(error);
        }
      });
    } finally {
      if (workbookWorkerRef.current === worker) scheduleWorkbookWorkerIdleTeardown(worker);
    }
  };

  useEffect(() => () => {
    importGenerationRef.current += 1;
    cancelWorkbookImport();
    terminateWorkbookWorker();
  }, []);

  return {
    begin: () => {
      importGenerationRef.current += 1;
      cancelWorkbookImport();
      return importGenerationRef.current;
    },
    isCurrent: (generation: number) => importGenerationRef.current === generation,
    parseWorkbook,
  };
}
