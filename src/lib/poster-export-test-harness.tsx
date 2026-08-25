/**
 * `usePosterExport` 的浏览器装置：脚本化的 `Image` / `canvas` / 下载锚点，加上挂载 hook
 * 与「卡住一次在途 PNG」的窗口助手。
 *
 * 基础导出用例与代次守卫矩阵分在两个文件里（`usePosterExport.test.tsx` 与
 * `usePosterExport.generation.test.tsx`），装置只此一份，两边共用。
 */
import { vi } from "vitest";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { usePosterExport, type UsePosterExportResult } from "./usePosterExport";
import { createProjectDocument } from "./project-document";
import { sampleStudents } from "./project-data";
import type { ProjectPackage } from "./project-package";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface PosterExportEnvironment {
  /** 图片加载行为：用来模拟解码失败、慢加载。 */
  imageBehavior: "load" | "error" | "hang";
  /** 画布编码行为。 */
  canvasBehavior: "ok" | "throw";
  /** 写盘行为：`throw` 模拟浏览器/扩展拦下程序化下载，字节已经编好但文件没落地。 */
  downloadBehavior: "ok" | "throw";
  canvasSizes: Array<{ width: number; height: number }>;
  fillRectCalls: number;
  downloads: Array<{ filename: string; blob: Blob }>;
}

export const posterExportEnv: PosterExportEnvironment = {
  imageBehavior: "load",
  canvasBehavior: "ok",
  downloadBehavior: "ok",
  canvasSizes: [],
  fillRectCalls: 0,
  downloads: [],
};

/** 已落盘文件名，按落盘顺序。 */
export function downloadedFileNames(): string[] {
  return posterExportEnv.downloads.map((entry) => entry.filename);
}

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function installEnvironment(): void {
  class ScriptedImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      const behavior = posterExportEnv.imageBehavior;
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
          fillRect: () => { posterExportEnv.fillRectCalls += 1; },
          drawImage: () => {},
        }),
        toBlob: (callback: BlobCallback) => {
          if (posterExportEnv.canvasBehavior === "throw") throw new Error("PNG 下载不可用");
          posterExportEnv.canvasSizes.push({ width: canvas.width, height: canvas.height });
          callback(new Blob([new Uint8Array(64)], { type: "image/png" }));
        },
      };
      return canvas as unknown as HTMLCanvasElement;
    }
    if (tag === "a") {
      const link = document.createElementNS("http://www.w3.org/1999/xhtml", "a") as HTMLAnchorElement;
      link.click = () => {
        if (posterExportEnv.downloadBehavior === "throw") throw new Error("下载被拦截");
        const blob = blobsByUrl.get(link.getAttribute("href") ?? "");
        if (blob) posterExportEnv.downloads.push({ filename: link.download, blob });
      };
      return link;
    }
    return original(tag);
  });
}

/** `beforeEach`：回到默认行为并装上装置。 */
export function resetPosterExportEnvironment(): void {
  posterExportEnv.imageBehavior = "load";
  posterExportEnv.canvasBehavior = "ok";
  posterExportEnv.downloadBehavior = "ok";
  posterExportEnv.canvasSizes = [];
  posterExportEnv.fillRectCalls = 0;
  posterExportEnv.downloads = [];
  installEnvironment();
}

/** `afterEach`：卸载本用例挂起的所有 hook 宿主并还原全局。 */
export function teardownPosterExportEnvironment(): void {
  act(() => {
    for (const { root, container } of roots.splice(0)) {
      root.unmount();
      container.remove();
    }
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
}

export interface Harness {
  result: () => UsePosterExportResult;
  statuses: string[];
  imported: ProjectPackage[];
  render: () => void;
}

export function mountHook(options: { withPoster?: boolean; getProjectName?: () => string | null } = {}): Harness {
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
export async function startGatedPngExport(
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
