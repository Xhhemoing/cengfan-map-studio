import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { usePosterExport, type UsePosterExportResult } from "./usePosterExport";
import { createProjectDocument } from "./project-document";
import { sampleStudents } from "./project-data";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

/** 图片加载行为：测试之间可以改写，用来模拟解码失败、慢加载。 */
let imageBehavior: "load" | "error" | "hang" = "load";
/** 画布编码行为。 */
let canvasBehavior: "ok" | "throw" = "ok";
let canvasSizes: Array<{ width: number; height: number }> = [];
let fillRectCalls = 0;
let downloads: Array<{ filename: string; blob: Blob }> = [];

function installEnvironment(): void {
  class ScriptedImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      const behavior = imageBehavior;
      if (behavior === "hang") return;
      queueMicrotask(() => (behavior === "load" ? this.onload?.() : this.onerror?.()));
    }
  }
  vi.stubGlobal("Image", ScriptedImage);

  const blobsByUrl = new Map<string, Blob>();
  let counter = 0;
  vi.stubGlobal("URL", {
    createObjectURL: (blob: Blob) => {
      counter += 1;
      const url = `blob:mock-${counter}`;
      blobsByUrl.set(url, blob);
      return url;
    },
    revokeObjectURL: () => {},
  });

  const original = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "canvas") {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          fillStyle: "",
          fillRect: () => { fillRectCalls += 1; },
          drawImage: () => {},
        }),
        toBlob: (callback: BlobCallback) => {
          if (canvasBehavior === "throw") throw new Error("PNG 下载不可用");
          canvasSizes.push({ width: canvas.width, height: canvas.height });
          callback(new Blob([new Uint8Array(64)], { type: "image/png" }));
        },
      };
      return canvas as unknown as HTMLCanvasElement;
    }
    if (tag === "a") {
      const link = document.createElementNS("http://www.w3.org/1999/xhtml", "a") as HTMLAnchorElement;
      link.click = () => {
        const blob = blobsByUrl.get(link.getAttribute("href") ?? "");
        if (blob) downloads.push({ filename: link.download, blob });
      };
      return link;
    }
    return original(tag);
  });
}

interface Harness {
  result: () => UsePosterExportResult;
  statuses: string[];
  render: () => void;
}

function mountHook(options: { withPoster?: boolean } = {}): Harness {
  const statuses: string[] = [];
  let latest: UsePosterExportResult | null = null;
  const project = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
  const poster = options.withPoster === false
    ? null
    : (document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement);

  function HookHarness(): null {
    const posterRef = useRef<SVGSVGElement | null>(poster);
    latest = usePosterExport({
      posterRef,
      project,
      userAssets: [],
      userFonts: [],
      customTemplates: [],
      renderSettings: { mode: "normal", fixedFps: 20 },
      applyImportedPackage: () => {},
      reportStatus: (message) => statuses.push(message),
    });
    return null;
  }

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  act(() => root.render(<HookHarness />));

  return {
    result: () => {
      if (!latest) throw new Error("hook not mounted");
      return latest;
    },
    statuses,
    render: () => act(() => root.render(<HookHarness />)),
  };
}

beforeEach(() => {
  imageBehavior = "load";
  canvasBehavior = "ok";
  canvasSizes = [];
  fillRectCalls = 0;
  downloads = [];
  installEnvironment();
});

afterEach(() => {
  act(() => {
    for (const { root, container } of roots.splice(0)) {
      root.unmount();
      container.remove();
    }
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("usePosterExport", () => {
  it("exports a png blob and reports success", async () => {
    const harness = mountHook();

    await act(async () => { await harness.result().exportPng(); });

    expect(downloads).toHaveLength(1);
    expect(downloads[0]?.filename).toBe("我的毕业去向图.png");
    expect(downloads[0]?.blob.type).toBe("image/png");
    expect(harness.result().exportState).toBe("success");
    expect(harness.result().exportError).toBeUndefined();
    expect(harness.result().exportingPng).toBe(false);
    expect(harness.statuses).toContain("PNG 已导出");
  });

  it("surfaces a decode failure distinctly and keeps the export panel usable", async () => {
    imageBehavior = "error";
    const harness = mountHook();

    await act(async () => { await harness.result().exportPng(); });

    expect(downloads).toHaveLength(0);
    expect(harness.result().exportState).toBe("error");
    expect(harness.result().exportError).toContain("SVG 转 PNG 失败");
    expect(harness.result().exportError).not.toContain("超时");
    expect(harness.result().exportingPng).toBe(false);
  });

  it("reports a png encoder failure with the underlying message", async () => {
    canvasBehavior = "throw";
    const harness = mountHook();

    await act(async () => { await harness.result().exportPng(); });

    expect(harness.result().exportState).toBe("error");
    expect(harness.result().exportError).toContain("PNG 下载不可用");
  });

  it("retries with fresh state after a failure", async () => {
    imageBehavior = "error";
    const harness = mountHook();

    await act(async () => { await harness.result().exportPng(); });
    expect(harness.result().exportState).toBe("error");

    // 重试前用户改了倍率与透明底：重试必须用新状态，而不是失败那次的快照。
    act(() => { harness.result().setPngScale(2); });
    act(() => { harness.result().setTransparentExport(true); });
    imageBehavior = "load";
    await act(async () => { harness.result().retryLastExport(); });

    expect(harness.result().exportState).toBe("success");
    expect(harness.result().exportError).toBeUndefined();
    expect(downloads).toHaveLength(1);
    expect(canvasSizes).toEqual([{ width: 1500 * 2, height: 1000 * 2 }]);
    expect(fillRectCalls).toBe(0);
  });

  it("routes retry back to the last export kind", async () => {
    const harness = mountHook();

    act(() => { harness.result().exportSvg(); });
    expect(harness.result().exportState).toBe("success");
    expect(downloads.map((entry) => entry.filename)).toEqual(["我的毕业去向图.svg"]);

    await act(async () => { harness.result().retryLastExport(); });

    expect(downloads.map((entry) => entry.filename)).toEqual(["我的毕业去向图.svg", "我的毕业去向图.svg"]);
    expect(harness.statuses.filter((message) => message === "SVG 已导出")).toHaveLength(2);
  });

  it("keeps the failure visible when the poster is not mounted yet", async () => {
    const harness = mountHook({ withPoster: false });

    await act(async () => { await harness.result().exportPng(); });

    expect(harness.result().exportState).toBe("error");
    expect(harness.result().exportError).toBe("海报预览尚未准备好");
  });

  it("ignores a stale png export that settles after a newer one", async () => {
    const harness = mountHook();
    let releaseFirst: (() => void) | undefined;
    const originalImage = window.Image;
    class GatedImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        releaseFirst = () => this.onerror?.();
      }
    }
    vi.stubGlobal("Image", GatedImage);

    let stale: Promise<void> | undefined;
    act(() => { stale = harness.result().exportPng(); });
    vi.stubGlobal("Image", originalImage);

    await act(async () => { await harness.result().exportPng(); });
    expect(harness.result().exportState).toBe("success");

    // 先发起的那次这时才失败：它不能把后一次的成功状态改写成错误。
    await act(async () => {
      releaseFirst?.();
      await stale;
    });

    expect(harness.result().exportState).toBe("success");
    expect(harness.result().exportError).toBeUndefined();
    expect(harness.result().exportingPng).toBe(false);
    expect(downloads).toHaveLength(1);
  });

  it("exports the project package and reports the roster size", () => {
    const harness = mountHook();

    act(() => { harness.result().exportProjectPackage(); });

    expect(harness.result().exportState).toBe("success");
    expect(downloads).toHaveLength(1);
    expect(harness.statuses.at(-1)).toContain("完整工程包已导出");
  });
});
