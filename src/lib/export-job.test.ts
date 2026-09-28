import { afterEach, describe, expect, it, vi } from "vitest";
import { assertRasterSize, capturePngExport, waitForExportFonts } from "./export-job";

afterEach(() => vi.useRealTimers());

describe("export job guardrails", () => {
  it.each([[0, 10], [-1, 10], [NaN, 10], [Infinity, 10], [1, 17000], [10000, 10000]])("rejects unsupported size %s x %s before rendering", (width, height) => {
    expect(() => assertRasterSize(width, height)).toThrow(expect.objectContaining({ code: "budget" }));
  });
  it("allows an A2 300 ppi size, without promising device support", () => {
    expect(() => assertRasterSize(4961, 7016)).not.toThrow();
  });
  it("removes only the captured background for a transparent job", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.innerHTML = '<rect data-canvas-background="true" /><text>name</text>';
    const job = capturePngExport({ svg, width: 100, height: 200, scale: 2, transparentBackground: true });
    expect(job.source).not.toContain("data-canvas-background");
    expect(svg.querySelector("rect")).not.toBeNull();
    expect(job.width).toBe(200);
    expect(Object.isFrozen(job)).toBe(true);
  });
  it("bounds font waits and clears its timer", async () => {
    vi.useFakeTimers();
    const result = waitForExportFonts(new Promise<void>(() => {}), 10);
    const assertion = expect(result).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("clears its timer after success and forwards failures", async () => {
    vi.useFakeTimers();
    await waitForExportFonts(Promise.resolve());
    await expect(waitForExportFonts(Promise.reject(new Error("font")))).rejects.toThrow("font");
    expect(vi.getTimerCount()).toBe(0);
  });
});
