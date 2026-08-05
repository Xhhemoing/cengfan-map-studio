import { describe, expect, it, vi } from "vitest";
import { clearCanvasPreview, createCanvasPreviewScheduler, scheduleCanvasPreview } from "./CanvasDragPreview";

describe("canvas drag preview scheduler", () => {
  it("coalesces timer-rate previews and applies only the latest value", () => {
    vi.useFakeTimers();
    const scheduler = createCanvasPreviewScheduler<number>();
    const apply = vi.fn();

    scheduleCanvasPreview(scheduler, 1, 50, apply);
    scheduleCanvasPreview(scheduler, 2, 50, apply);
    expect(apply).not.toHaveBeenCalled();

    vi.advanceTimersByTime(49);
    expect(apply).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenLastCalledWith(2);

    clearCanvasPreview(scheduler);
    vi.useRealTimers();
  });

  it("cancels pending work without invoking the apply callback", () => {
    vi.useFakeTimers();
    const scheduler = createCanvasPreviewScheduler<number>();
    const apply = vi.fn();

    scheduleCanvasPreview(scheduler, 1, 50, apply);
    clearCanvasPreview(scheduler);
    vi.advanceTimersByTime(100);

    expect(apply).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
