import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { usePosterExport, type UsePosterExportResult } from "./usePosterExport";
import { createProjectPackage, serializeProjectPackage, type ProjectPackage } from "./project-package";
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
  imported: ProjectPackage[];
  render: () => void;
}

function mountHook(options: { withPoster?: boolean; getProjectName?: () => string | null } = {}): Harness {
  const statuses: string[] = [];
  const imported: ProjectPackage[] = [];
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
      applyImportedPackage: (pack) => imported.push(pack),
      reportStatus: (message) => statuses.push(message),
      getProjectName: options.getProjectName,
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
    imported,
    render: () => act(() => root.render(<HookHarness />)),
  };
}

/**
 * 卡住下一次 SVG 解码，制造一个「PNG 还在导出」的窗口，好让别的导出插进来。
 * 装置只作用于此刻发起的那一次：等它接上这次导出的 Image 之后立刻换回真实 Image。
 */
async function startGatedPngExport(
  harness: Harness,
  settleAs: "load" | "error" = "load",
): Promise<{ settled: Promise<void>; release: () => void }> {
  const originalImage = window.Image;
  let release: (() => void) | undefined;
  class GatedImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      release = () => (settleAs === "load" ? this.onload?.() : this.onerror?.());
    }
  }
  vi.stubGlobal("Image", GatedImage);
  let settled: Promise<void> | undefined;
  await act(async () => {
    settled = harness.result().exportPng();
    // 导出要先 await 字体加载才会碰 Image：装置没接上就换回真实 Image 的话，这次
    // 导出会在用例回头看它之前自己跑完，窗口是假的。
    for (let tick = 0; tick < 100 && !release; tick += 1) await Promise.resolve();
  });
  vi.stubGlobal("Image", originalImage);
  if (!settled) throw new Error("png export did not start");
  if (!release) throw new Error("png export never reached the image gate");
  return { settled, release: () => release?.() };
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
    expect(downloads[0]?.filename).toBe("我的毕业去向图-1x.png");
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
    const stale = await startGatedPngExport(harness, "error");

    await act(async () => { await harness.result().exportPng(); });
    expect(harness.result().exportState).toBe("success");

    // 先发起的那次这时才失败：它不能把后一次的成功状态改写成错误。
    // blob 通道解不出来会降级到 data URL 通道再试一次，两条都得判失败才是「这次导出失败了」。
    imageBehavior = "error";
    await act(async () => {
      stale.release();
      await stale.settled;
    });

    expect(harness.result().exportState).toBe("success");
    expect(harness.result().exportError).toBeUndefined();
    expect(harness.result().exportingPng).toBe(false);
    expect(downloads).toHaveLength(1);
  });

  it("writes only the newest png when an earlier one is still encoding", async () => {
    const harness = mountHook();
    const stale = await startGatedPngExport(harness);

    // 上一条用例里先发起的那次是解码失败，走不到落盘；这里两次都能成功编码，
    // 靠倍率区分文件名——「更晚的 PNG 让先发起的那份成为多余文件」这一条才真的被钉住。
    act(() => { harness.result().setPngScale(2); });
    await act(async () => { await harness.result().exportPng(); });
    await act(async () => { stale.release(); await stale.settled; });

    expect(downloads.map((entry) => entry.filename)).toEqual(["我的毕业去向图-2x.png"]);
    expect(harness.result().exportState).toBe("success");
    expect(harness.result().lastExportFileName).toBe("我的毕业去向图-2x.png");
  });

  it("still writes the png when another kind of export starts mid-flight", async () => {
    const harness = mountHook();
    const png = await startGatedPngExport(harness);

    // SVG 是另一份文件，不是这次 PNG 的替代品：它可以接管导出状态，但不能吃掉用户已经要过的 PNG。
    act(() => { harness.result().exportSvg(); });
    await act(async () => { png.release(); await png.settled; });

    expect(downloads.map((entry) => entry.filename)).toEqual([
      "我的毕业去向图.svg",
      "我的毕业去向图-1x.png",
    ]);
    // 代次守卫仍然生效：落地晚的 PNG 不改写 SVG 已经写下的状态与提示。
    expect(harness.result().exportState).toBe("success");
    expect(harness.result().lastExportFileName).toBe("我的毕业去向图.svg");
    expect(harness.statuses.at(-1)).toBe("SVG 已导出");
  });

  it("releases the png busy flag even when a later export supersedes it", async () => {
    const harness = mountHook();
    const png = await startGatedPngExport(harness);
    expect(harness.result().exportingPng).toBe(true);

    act(() => { harness.result().exportProjectPackage(); });
    await act(async () => { png.release(); await png.settled; });

    expect(harness.result().exportingPng).toBe(false);
  });

  it("keeps the png busy flag raised until every in-flight png settles", async () => {
    const harness = mountHook();
    const first = await startGatedPngExport(harness);
    const second = await startGatedPngExport(harness);

    // 「有没有 PNG 在途」是个计数问题：被顶掉的第一次交还占用后，第二次还在跑。
    await act(async () => { first.release(); await first.settled; });
    expect(harness.result().exportingPng).toBe(true);

    await act(async () => { second.release(); await second.settled; });
    expect(harness.result().exportingPng).toBe(false);
  });

  it("rejects an oversized package by File.size without starting a read", () => {
    const harness = mountHook();
    const readSpy = vi.spyOn(FileReader.prototype, "readAsText");
    const file = new File(["{}"], "huge.json", { type: "application/json" });
    Object.defineProperty(file, "size", { value: 256 * 1024 * 1024, configurable: true });

    act(() => { harness.result().importProjectPackage(file); });

    expect(readSpy).not.toHaveBeenCalled();
    expect(harness.imported).toHaveLength(0);
    expect(harness.statuses.at(-1)).toContain("工程包过大");
    expect(harness.statuses.at(-1)).toContain("128.0 MB");
  });

  it("imports a package whose size is within the cap", async () => {
    const harness = mountHook();
    vi.stubGlobal("confirm", vi.fn(() => true));
    const project = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
    const source = serializeProjectPackage(createProjectPackage({ project, assets: [], fonts: [] }));
    const file = new File([source], "project.json", { type: "application/json" });

    act(() => { harness.result().importProjectPackage(file); });

    await vi.waitFor(() => expect(harness.imported).toHaveLength(1));
    expect(harness.imported[0]?.project.students).toHaveLength(sampleStudents.length);
    expect(harness.statuses.at(-1)).toContain("完整工程包已导入");
  });

  it("exports the project package and reports the roster size", () => {
    const harness = mountHook();

    act(() => { harness.result().exportProjectPackage(); });

    expect(harness.result().exportState).toBe("success");
    expect(downloads).toHaveLength(1);
    expect(harness.statuses.at(-1)).toContain("完整工程包已导出");
  });

  it("names exports after the current project and publishes the file name", async () => {
    const harness = mountHook({ getProjectName: () => "高三3班" });

    await act(async () => { await harness.result().exportPng(); });

    expect(downloads[0]?.filename).toBe("高三3班-1x.png");
    expect(harness.result().lastExportFileName).toBe("高三3班-1x.png");
  });
});
