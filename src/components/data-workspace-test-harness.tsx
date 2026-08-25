// 仅供 DataWorkspace 测试使用的共享装置：从 src/components/DataWorkspace.test.tsx
// 原样搬出的挂载/交互助手、工作簿 Worker 替身与导入取样数据，供按域拆分后的
// src/components/DataWorkspace.*.test.tsx 共用。
import { type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, vi } from "vitest";
import { DataWorkspace } from "./DataWorkspace";
import type { Student } from "../lib/project-data";
import {
  parseWorkbookImport,
  type WorkbookImportRequest,
  type WorkbookImportResponse,
} from "../workers/workbook-import.worker";

export const students: Student[] = [
  {
    id: "student-1",
    name: "林舟",
    university: "北京大学",
    city: "北京市",
    visibility: true,
  },
];

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

export class FakeWorkbookWorker {
  static instances: FakeWorkbookWorker[] = [];

  onmessage: ((event: MessageEvent<WorkbookImportResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  messages: WorkbookImportRequest[] = [];
  transfers: Array<Transferable[] | undefined> = [];
  terminated = false;

  constructor() {
    FakeWorkbookWorker.instances.push(this);
  }

  postMessage(message: WorkbookImportRequest, transfer?: Transferable[]): void {
    this.messages.push(message);
    this.transfers.push(transfer);
    queueMicrotask(() => {
      if (this.terminated) return;
      try {
        this.onmessage?.({
          data: {
            type: "result",
            requestId: message.requestId,
            ...parseWorkbookImport(message),
          },
        } as MessageEvent<WorkbookImportResponse>);
      } catch (error) {
        this.onmessage?.({
          data: {
            type: "error",
            requestId: message.requestId,
            message: error instanceof Error ? error.message : "工作簿后台解析失败",
          },
        } as MessageEvent<WorkbookImportResponse>);
      }
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

export class DeferredWorkbookWorker {
  static instances: DeferredWorkbookWorker[] = [];

  onmessage: ((event: MessageEvent<WorkbookImportResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  messages: WorkbookImportRequest[] = [];
  transfers: Array<Transferable[] | undefined> = [];
  terminated = false;

  constructor() {
    DeferredWorkbookWorker.instances.push(this);
  }

  postMessage(message: WorkbookImportRequest, transfer?: Transferable[]): void {
    this.messages.push(message);
    this.transfers.push(transfer);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(response: WorkbookImportResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<WorkbookImportResponse>);
  }
}

export const globalWithWorker = globalThis as unknown as { Worker?: unknown };
const originalWorker = globalWithWorker.Worker;

/**
 * Registers the two file-level hooks every DataWorkspace suite depends on:
 *
 * - the workbook worker double is installed fresh per test so instance counts
 *   start from zero;
 * - the `afterEach` drain unmounts every root the file mounted, so an assertion
 *   that throws mid-test still tears the root down (the `setupFiles` leaked-root
 *   guard reports a missing net, it does not stand in for one).
 */
export function installDataWorkspaceTestHarness(): void {
  beforeEach(() => {
    FakeWorkbookWorker.instances = [];
    DeferredWorkbookWorker.instances = [];
    globalWithWorker.Worker = FakeWorkbookWorker;
  });

  afterEach(() => {
    roots.splice(0).forEach(({ root, container }) => {
      flushSync(() => root.unmount());
      container.remove();
    });
    vi.useRealTimers();
    globalWithWorker.Worker = originalWorker;
  });
}

export function render(element: ReactElement): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(element));
  return container;
}

export function click(element: Element): void {
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

export function changeInput(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  flushSync(() => {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export function getInput(container: HTMLDivElement, label: string): HTMLInputElement {
  return container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
}

/** 校验过的 GBK 双字节：中文版 Excel/WPS 另存 CSV 就是这套编码。 */
export const GBK_BYTES: Record<string, [number, number]> = {
  姓: [0xd0, 0xd5], 名: [0xc3, 0xfb], 院: [0xd4, 0xba], 校: [0xd0, 0xa3],
  城: [0xb3, 0xc7], 市: [0xca, 0xd0], 林: [0xc1, 0xd6], 舟: [0xd6, 0xdb],
  北: [0xb1, 0xb1], 京: [0xbe, 0xa9], 大: [0xb4, 0xf3], 学: [0xd1, 0xa7],
  苏: [0xcb, 0xd5], 禾: [0xba, 0xcc], 浙: [0xd5, 0xe3], 江: [0xbd, 0xad],
  杭: [0xba, 0xbc], 州: [0xd6, 0xdd],
};

export function encodeGbk(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const character of text) {
    if (character.codePointAt(0)! < 0x80) {
      bytes.push(character.codePointAt(0)!);
      continue;
    }
    const pair = GBK_BYTES[character];
    if (!pair) throw new Error(`测试用 GBK 表缺少字符：${character}`);
    bytes.push(pair[0], pair[1]);
  }
  return new Uint8Array(bytes);
}

export function fileWithBytes(name: string, bytes: () => Promise<ArrayBufferLike>): File {
  const file = new File([], name);
  Object.defineProperty(file, "arrayBuffer", { value: bytes });
  return file;
}

export function dropFile(container: HTMLDivElement, file: File): void {
  const dropzone = container.querySelector<HTMLElement>("[data-file-dropzone]")!;
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { files: [file] } });
  flushSync(() => dropzone.dispatchEvent(event));
}

export async function settle(): Promise<void> {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  flushSync(() => {});
}

export function renderWorkspace(overrides: Partial<Parameters<typeof DataWorkspace>[0]> = {}): HTMLDivElement {
  return render(
    <DataWorkspace
      students={students}
      onAppendStudents={vi.fn()}
      onReplaceStudents={vi.fn()}
      onUpdateStudent={vi.fn()}
      onToggleVisibility={vi.fn()}
      onDeleteStudent={vi.fn()}
      onSetStudentsVisibility={vi.fn()}
      {...overrides}
    />,
  );
}

export async function workbookBytes(sheets: Array<{ name: string; rows: unknown[][] }>): Promise<ArrayBufferLike> {
  const xlsx = await import("xlsx");
  const workbook = xlsx.utils.book_new();
  for (const sheet of sheets) {
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(sheet.rows), sheet.name);
  }
  return xlsx.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBufferLike;
}
