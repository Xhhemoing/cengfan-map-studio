import { afterEach, describe, expect, it, vi } from "vitest";
import { requestCardLayoutProposals } from "./card-layout-proposal-client";
import { createSampleProject } from "./project-store";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("layout comparison cancellation", () => {
  it("cancels a scheduled fallback before it can compute or return a candidate", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", undefined);
    const job = requestCardLayoutProposals(createSampleProject().pack.project, { goal: "balanced" });
    const rejected = expect(job.result).rejects.toMatchObject({ name: "AbortError" });
    job.cancel();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
    await vi.runAllTimersAsync();
  });

  it("terminates a real worker on cancel and ignores late messages", async () => {
    const terminate = vi.fn();
    let instance: { onmessage?: (event: MessageEvent) => void };
    class WorkerStub {
      onmessage?: (event: MessageEvent) => void;
      onerror?: () => void;
      constructor() { instance = this; }
      postMessage = vi.fn();
      terminate = terminate;
    }
    vi.stubGlobal("Worker", WorkerStub);
    const job = requestCardLayoutProposals(createSampleProject().pack.project, { goal: "balanced" });
    const rejected = expect(job.result).rejects.toMatchObject({ name: "AbortError" });
    job.cancel();
    await rejected;
    instance!.onmessage?.({ data: { proposals: [] } } as MessageEvent);
    expect(terminate).toHaveBeenCalledTimes(1);
  });
});
