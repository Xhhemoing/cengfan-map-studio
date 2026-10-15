import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountHook, posterExportEnv, resetPosterExportEnvironment, teardownPosterExportEnvironment } from "./poster-export-test-harness";
import { ensureUserFontsLoaded } from "./fonts";
import { fingerprintProject } from "./project-digest";
import { svgToPngBlob } from "./export-poster";
import { getSceneTextMeasurer } from "./scene-text-measurement";

vi.mock("./fonts", async (original) => ({ ...await original<typeof import("./fonts")>(), ensureUserFontsLoaded: vi.fn() }));
vi.mock("./export-poster", async (original) => ({
  ...await original<typeof import("./export-poster")>(), svgToPngBlob: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
}));

beforeEach(() => {
  resetPosterExportEnvironment();
  vi.mocked(ensureUserFontsLoaded).mockReset().mockResolvedValue(undefined);
  vi.mocked(svgToPngBlob).mockClear();
});
afterEach(teardownPosterExportEnvironment);

function managed(harness: ReturnType<typeof mountHook>) {
  harness.poster!.setAttribute("data-scene-revision", fingerprintProject(harness.project));
  harness.poster!.setAttribute("data-font-revision", String(getSceneTextMeasurer().getVersion()));
  harness.poster!.setAttribute("data-layout-pending", "false");
  harness.poster!.setAttribute("data-measurement-status", "measured");
}

describe("managed poster export scene", () => {
  it("freezes the clicked project and recompiles it after fonts, rather than serializing a pending live frame", async () => {
    let release!: () => void;
    vi.mocked(ensureUserFontsLoaded).mockReturnValue(new Promise<void>((resolve) => { release = resolve; }));
    let name = "Clicked";
    const harness = mountHook({ getProjectName: () => name });
    const clickedTitle = harness.project.textElements.find((text) => text.role === "title")!.content;
    managed(harness);
    harness.poster!.setAttribute("data-layout-pending", "true");
    harness.poster!.innerHTML = '<text>stale-layout-marker</text>';
    let pending!: Promise<void>;
    act(() => { pending = harness.result().exportPng(); });
    harness.project.textElements.find((text) => text.role === "title")!.content = "later-edit-marker";
    harness.project.canvas.width = 777;
    harness.poster!.innerHTML = '<text>live-after-marker</text>';
    name = "Later";
    act(() => { harness.result().setPngScale(3); harness.result().setTransparentExport(true); });
    await act(async () => { release(); await pending; });


    const [source, job] = vi.mocked(svgToPngBlob).mock.calls[0]!;
    expect(source).toContain(clickedTitle);
    expect(source).not.toContain("stale-layout-marker");
    expect(source).not.toContain("live-after-marker");
    expect(source).not.toContain("later-edit-marker");
    expect(source).toContain('data-layout-pending="false"');
    expect(job).toMatchObject({ width: 1500, height: 1000, transparentBackground: false });
    expect(harness.result().lastExportFileName).toBe("Clicked-1x.png");
  });

  it.each(["pending", "project", "font"])("blocks synchronous SVG while the %s scene state is stale and allows retry", (kind) => {
    const harness = mountHook();
    managed(harness);
    if (kind === "pending") harness.poster!.setAttribute("data-layout-pending", "true");
    if (kind === "project") harness.poster!.setAttribute("data-scene-revision", "previous-project");
    if (kind === "font") harness.poster!.setAttribute("data-font-revision", "-1");
    act(() => harness.result().exportSvg());
    expect(harness.result().exportState).toBe("error");
    expect(posterExportEnv.downloads).toHaveLength(0);
    expect(harness.result().exportError).toMatch(/重试|更新|计算|字体/u);
    managed(harness);
    act(() => harness.result().retryLastExport());
    expect(harness.result().exportState).toBe("success");
    expect(posterExportEnv.downloads).toHaveLength(1);
  });
});
