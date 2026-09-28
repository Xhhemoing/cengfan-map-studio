import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountHook, resetPosterExportEnvironment, teardownPosterExportEnvironment } from "./poster-export-test-harness";
import { ensureUserFontsLoaded } from "./fonts";
import { svgToPngBlob } from "./export-poster";

vi.mock("./fonts", async (original) => ({
  ...await original<typeof import("./fonts")>(),
  ensureUserFontsLoaded: vi.fn(),
}));
vi.mock("./export-poster", async (original) => ({
  ...await original<typeof import("./export-poster")>(),
  svgToPngBlob: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
}));

beforeEach(() => {
  resetPosterExportEnvironment();
  vi.mocked(ensureUserFontsLoaded).mockReset().mockResolvedValue(undefined);
  vi.mocked(svgToPngBlob).mockClear();
});
afterEach(teardownPosterExportEnvironment);

describe("PNG input snapshot", () => {
  it("freezes markup, dimensions, filename and options before waiting for fonts", async () => {
    let release!: () => void;
    vi.mocked(ensureUserFontsLoaded).mockReturnValue(new Promise<void>((resolve) => { release = resolve; }));
    let name = "Before";
    const harness = mountHook({ getProjectName: () => name });
    harness.poster!.innerHTML = '<text>before</text><rect data-canvas-background="true" />';
    let pending!: Promise<void>;
    act(() => { pending = harness.result().exportPng(); });
    harness.poster!.querySelector("text")!.textContent = "after";
    harness.project.canvas.width = 777;
    name = "After";
    act(() => {
      harness.result().setPngScale(3);
      harness.result().setTransparentExport(true);
    });
    await act(async () => { release(); await pending; });
    const [source, options] = vi.mocked(svgToPngBlob).mock.calls[0]!;
    expect(source).toContain("before");
    expect(source).not.toContain("after");
    expect(source).toContain("data-canvas-background");
    expect(options).toMatchObject({ width: 1500, height: 1000, transparentBackground: false });
    expect(harness.result().lastExportFileName).toBe("Before-1x.png");
  });

  it("retries from a new snapshot rather than retaining a failed snapshot", async () => {
    const harness = mountHook({ getProjectName: () => "Retry" });
    harness.poster!.innerHTML = "<text>old</text>";
    vi.mocked(ensureUserFontsLoaded).mockRejectedValueOnce(new Error("font unavailable"));
    await act(async () => { await harness.result().exportPng(); });
    expect(harness.result().exportState).toBe("error");
    harness.poster!.innerHTML = "<text>new</text>";
    await act(async () => { harness.result().retryLastExport(); });
    expect(vi.mocked(svgToPngBlob).mock.calls[0]![0]).toContain("new");
    expect(harness.result().exportState).toBe("success");
  });
});
