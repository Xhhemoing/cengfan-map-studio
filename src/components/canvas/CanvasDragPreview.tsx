export interface CanvasPreviewScheduler<T> {
  frame: number | null;
  timer: number | null;
  pending: T | null;
}

export function createCanvasPreviewScheduler<T>(): CanvasPreviewScheduler<T> {
  return { frame: null, timer: null, pending: null };
}

function requestPreviewFrame(callback: FrameRequestCallback): number {
  if (typeof window !== "undefined" && window.requestAnimationFrame) return window.requestAnimationFrame(callback);
  return window.setTimeout(() => callback(performance.now()), 16);
}

function cancelPreviewFrame(frame: number): void {
  if (typeof window !== "undefined" && window.cancelAnimationFrame) {
    window.cancelAnimationFrame(frame);
    return;
  }
  window.clearTimeout(frame);
}

export function scheduleCanvasPreview<T>(
  scheduler: CanvasPreviewScheduler<T>,
  next: T,
  intervalMs: number,
  apply: (value: T) => void,
): void {
  scheduler.pending = next;
  if (intervalMs <= 0) {
    if (scheduler.frame !== null) return;
    scheduler.frame = requestPreviewFrame(() => {
      scheduler.frame = null;
      const pending = scheduler.pending;
      scheduler.pending = null;
      if (pending !== null) apply(pending);
    });
    return;
  }
  if (scheduler.timer !== null) return;
  scheduler.timer = window.setTimeout(() => {
    scheduler.timer = null;
    const pending = scheduler.pending;
    scheduler.pending = null;
    if (pending !== null) apply(pending);
  }, intervalMs);
}

export function clearCanvasPreview<T>(scheduler: CanvasPreviewScheduler<T>): void {
  if (scheduler.frame !== null) cancelPreviewFrame(scheduler.frame);
  if (scheduler.timer !== null) window.clearTimeout(scheduler.timer);
  scheduler.frame = null;
  scheduler.timer = null;
  scheduler.pending = null;
}
