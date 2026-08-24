import { act, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectDocument, type ProjectDocument } from "./project-document";
import { DEFAULT_RENDER_SETTINGS } from "./render-settings";
import { usePosterExport, type UsePosterExportResult } from "./usePosterExport";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  svgToPngBlob: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
  downloadBlob: vi.fn(),
  ensureUserFontsLoaded: vi.fn(async () => {}),
}));

// 只桩掉栅格化与下载副作用，面积校验仍走真实的 availablePngScales。
vi.mock("./export-poster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./export-poster")>();
  return { ...actual, svgToPngBlob: mocks.svgToPngBlob, downloadBlob: mocks.downloadBlob };
});

vi.mock("./fonts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fonts")>();
  return { ...actual, ensureUserFontsLoaded: mocks.ensureUserFontsLoaded };
});

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];
const statusMessages: string[] = [];

function projectWithCanvas(width: number, height: number): ProjectDocument {
  const base = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  return { ...base, canvas: { ...base.canvas, width, height } };
}

function Harness({ project, onRender }: { project: ProjectDocument; onRender: (result: UsePosterExportResult) => void }) {
  const posterRef = useRef<SVGSVGElement | null>(null);
  const result = usePosterExport({
    posterRef,
    project,
    userAssets: [],
    userFonts: [],
    customTemplates: [],
    renderSettings: DEFAULT_RENDER_SETTINGS,
    applyImportedPackage: vi.fn(),
    reportStatus: (message) => statusMessages.push(message),
  });
  useEffect(() => {
    onRender(result);
  });
  return <svg ref={posterRef} />;
}

async function mountExport(project: ProjectDocument): Promise<() => UsePosterExportResult> {
  let latest: UsePosterExportResult | null = null;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  await act(async () => {
    root.render(<Harness project={project} onRender={(result) => { latest = result; }} />);
  });
  return () => latest!;
}

afterEach(() => {
  while (roots.length) {
    const entry = roots.pop()!;
    act(() => entry.root.unmount());
    entry.container.remove();
  }
  statusMessages.length = 0;
  vi.clearAllMocks();
});

describe("usePosterExport PNG 面积防护", () => {
  it("refuses an over-budget scale before starting any rasterization work", async () => {
    const result = await mountExport(projectWithCanvas(6000, 6000));

    await act(async () => { result().setPngScale(3); });
    await act(async () => { await result().exportPng(); });

    expect(result().exportState).toBe("error");
    expect(result().exportError).toContain("6000 × 6000 画布按 3× 导出");
    expect(result().exportError).toContain("超过浏览器 64.0 百万像素的安全上限");
    expect(result().exportError).toContain("请改用 1× 导出");
    expect(statusMessages.at(-1)).toBe(result().exportError);
    expect(mocks.svgToPngBlob).not.toHaveBeenCalled();
    expect(mocks.ensureUserFontsLoaded).not.toHaveBeenCalled();
    expect(mocks.downloadBlob).not.toHaveBeenCalled();
    expect(result().exportingPng).toBe(false);
  });

  it("still exports the same large canvas at the always-available 1×", async () => {
    const result = await mountExport(projectWithCanvas(6000, 6000));

    await act(async () => { await result().exportPng(); });

    expect(mocks.svgToPngBlob).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ width: 6000, height: 6000 }));
    expect(mocks.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "我的毕业去向图.png");
    expect(result().exportState).toBe("success");
    expect(statusMessages.at(-1)).toBe("PNG 已导出");
  });

  it("keeps 2× working on canvases that stay under the budget", async () => {
    const result = await mountExport(projectWithCanvas(1500, 1000));

    await act(async () => { result().setPngScale(2); });
    await act(async () => { await result().exportPng(); });

    expect(mocks.svgToPngBlob).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ width: 3000, height: 2000 }));
    expect(result().exportState).toBe("success");
  });
});
