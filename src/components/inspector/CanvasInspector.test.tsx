import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { createProjectDocument } from "../../lib/project-document";
import { CanvasInspector } from "./CanvasInspector";

/** Mimics a browser image decoder so the real downscale pipeline can run under jsdom. */
function stubDownscalePipeline({ width, height, encoded }: { width: number; height: number; encoded: string }) {
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width, height, close: vi.fn() })));
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray([12, 34, 56, 255]) }),
    }),
    toDataURL: (mime: string) => {
      if (mime !== "image/jpeg") throw new Error("unsupported type");
      return encoded;
    },
  };
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tagName: string) => (
    tagName === "canvas" ? canvas as unknown as HTMLCanvasElement : createElement(tagName)
  ));
  return canvas;
}

function stubFileReader(result: string, { sync = false } = {}) {
  class ImmediateFileReader {
    result = result;
    onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
    onerror: (() => void) | null = null;
    readAsDataURL() {
      const load = () => this.onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>);
      if (sync) load();
      else queueMicrotask(load);
    }
  }
  vi.stubGlobal("FileReader", ImmediateFileReader);
}

function renderInspector(onPatch = vi.fn()) {
  const { canvas } = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  const container = document.createElement("div");
  const root = createRoot(container);
  flushSync(() => root.render(<CanvasInspector canvas={canvas} onPatch={onPatch} onReset={vi.fn()} />));
  return { container, root, onPatch };
}

function uploadBackground(container: HTMLElement, file: File) {
  const input = container.querySelector("#canvas-background-image") as HTMLInputElement;
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  flushSync(() => input.dispatchEvent(new Event("change", { bubbles: true })));
}

describe("CanvasInspector", () => {
  it("keeps a small background image untouched and patches it in the same frame", () => {
    stubFileReader("data:image/png;base64,small", { sync: true });
    const { container, root, onPatch } = renderInspector();

    uploadBackground(container, new File(["x"], "背景.png", { type: "image/png" }));

    expect(onPatch).toHaveBeenCalledWith({ backgroundImageSrc: "data:image/png;base64,small" });

    root.unmount();
    vi.unstubAllGlobals();
  });

  it("downscales an oversized background before it enters the document", async () => {
    stubFileReader(`data:image/jpeg;base64,${"A".repeat(1_600_000)}`);
    const canvas = stubDownscalePipeline({ width: 5120, height: 2560, encoded: "data:image/jpeg;base64,background-small" });
    const { container, root, onPatch } = renderInspector();

    uploadBackground(container, new File(["x"], "校园.jpg", { type: "image/jpeg" }));

    await vi.waitFor(() => {
      expect(onPatch).toHaveBeenCalledWith({ backgroundImageSrc: "data:image/jpeg;base64,background-small" });
    });
    expect(canvas).toMatchObject({ width: 2560, height: 1280 });

    root.unmount();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("refuses an oversized SVG background and explains why", () => {
    stubFileReader(`data:image/svg+xml;base64,${"A".repeat(3_000_000)}`, { sync: true });
    const { container, root, onPatch } = renderInspector();

    uploadBackground(container, new File(["<svg />"], "巨幅.svg", { type: "image/svg+xml" }));

    expect(onPatch).not.toHaveBeenCalled();
    expect(container.querySelector("[data-canvas-background-notice]")?.textContent).toContain("SVG 体积过大");

    root.unmount();
    vi.unstubAllGlobals();
  });
});
