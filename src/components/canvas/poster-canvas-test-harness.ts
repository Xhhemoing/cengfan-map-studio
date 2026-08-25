// 仅供 PosterCanvas 测试使用的共享装置：从 src/components/canvas/PosterCanvas.test.tsx
// 原样搬出的学生样本、Worker 替身与挂载登记，供按域拆分后的
// src/components/canvas/PosterCanvas.*.test.tsx 共用。
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach } from "vitest";
import { cardLayoutCache } from "../../lib/card-layout-cache";
import type { Student } from "../../lib/project-data";

export const students: Student[] = [
  { id: "visible", name: "可见", university: "北京大学", city: "北京市", visibility: true },
  { id: "hidden", name: "隐藏", university: "清华大学", city: "北京市", visibility: false },
];

export class CanvasFakeWorker {
  static instances: CanvasFakeWorker[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;

  onerror: ((event: ErrorEvent) => void) | null = null;

  constructor() {
    CanvasFakeWorker.instances.push(this);
  }

  postMessage(): void {}

  terminate(): void {}
}

export const globalWithWorker = globalThis as unknown as { Worker?: unknown };
const originalWorker = globalWithWorker.Worker;

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

export function trackedRoot() {
  const container = document.createElement("div");
  const root = createRoot(container);
  mounted.push({ root, container });
  return { container, root };
}

/**
 * Registers the file-level teardown every PosterCanvas suite depends on.
 *
 * An assertion throwing before an inline unmount would leave the canvas mounted
 * for the rest of the run — every case in these files mounts — racing React's
 * scheduler against jsdom teardown. Cases that remount mid-test keep their inline
 * unmount; unmounting twice is a no-op. The `setupFiles` leaked-root guard reports
 * a missing net, it does not stand in for one.
 */
export function installPosterCanvasTestHarness(): void {
  afterEach(() => {
    flushSync(() => {
      for (const { root, container } of mounted.splice(0)) {
        root.unmount();
        container.remove();
      }
    });
    globalWithWorker.Worker = originalWorker;
    cardLayoutCache.clear();
  });
}
