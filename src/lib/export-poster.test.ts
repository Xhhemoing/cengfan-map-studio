import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeImageLoadTimeout,
  downloadBlob,
  downloadText,
  PosterExportError,
  serializePosterSvg,
  svgToPngBlob,
  type PosterExportMetrics,
} from "./export-poster";

/**
 * 伪造的 PNG 编码结果字节数（1800×1200 海报的量级），用来对比 blob 通道与
 * base64 通道的物化体积。取 3 的倍数，base64 往返后字节数才不会因补位漂移。
 */
const FAKE_PNG_BYTES = 1_999_998;

function fakePngBytes(size = FAKE_PNG_BYTES): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) bytes[index] = index % 251;
  return bytes;
}

function base64Length(byteLength: number): number {
  return Math.ceil(byteLength / 3) * 4;
}

interface CanvasMockOptions {
  /** 不提供 toBlob（模拟 jsdom / 老浏览器）。 */
  withoutToBlob?: boolean;
  /** toBlob 回 null（编码器拒绝），应降级到 toDataURL。 */
  toBlobReturnsNull?: boolean;
  toDataURL?: () => string;
}

function stubCanvas(options: CanvasMockOptions = {}) {
  const context = { fillStyle: "", font: "", fillRect: vi.fn(), drawImage: vi.fn(), fillText: vi.fn() };
  const dataUrl = `data:image/png;base64,${"A".repeat(base64Length(FAKE_PNG_BYTES))}`;
  const canvas: Record<string, unknown> = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toDataURL: vi.fn(options.toDataURL ?? (() => dataUrl)),
  };
  if (!options.withoutToBlob) {
    canvas.toBlob = vi.fn((callback: BlobCallback) => {
      callback(options.toBlobReturnsNull ? null : new Blob([fakePngBytes()], { type: "image/png" }));
    });
  }
  const original = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) =>
    tag === "canvas" ? (canvas as unknown as HTMLCanvasElement) : original(tag),
  );
  return { canvas, context, dataUrl };
}

function stubImmediateImage(): void {
  class ReadyImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal("Image", ReadyImage);
}

/** 记录 object URL 生命周期，用于「只回收一次、且在 load/error 之后」的断言。 */
function stubObjectUrls() {
  const created: Blob[] = [];
  const revoked: string[] = [];
  let counter = 0;
  const createObjectURL = vi.fn((blob: Blob) => {
    created.push(blob);
    counter += 1;
    return `blob:mock-${counter}`;
  });
  const revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  });
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  return { created, revoked, createObjectURL, revokeObjectURL };
}

/** 约 8MB 的合成海报：真实标记结构 + 中文姓名，encodeURIComponent 会显著膨胀。 */
function buildSyntheticSvg(targetChars = 8_000_000): string {
  const row = '<text x="120" y="240" fill="#215d75" font-family="Noto Sans SC" font-size="28">'
    + "李思远 · 清华大学 · 北京市</text>"
    + '<path d="M120.5 240.25 L188.75 302.5 L240 330" stroke="#215d75" stroke-width="1.5" fill="none"/>';
  const parts: string[] = ['<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1200">'];
  let length = parts[0].length;
  while (length < targetChars) {
    parts.push(row);
    length += row.length;
  }
  parts.push("</svg>");
  return parts.join("");
}

describe("poster export", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("serializes svg markup for download", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 50");
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.textContent = "毕业去向";
    svg.appendChild(text);
    const markup = serializePosterSvg(svg);
    expect(markup).toContain("<svg");
    expect(markup).toContain("毕业去向");
  });

  it("omits editor selection handles while keeping visible scene content", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 1800 1200");
    svg.setAttribute("width", "1800");
    svg.setAttribute("height", "1200");
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.textContent = "模板标题";
    svg.appendChild(text);
    const visibleAsset = document.createElementNS("http://www.w3.org/2000/svg", "image");
    visibleAsset.setAttribute("data-asset-id", "asset-visible");
    svg.appendChild(visibleAsset);
    const textSelection = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    textSelection.setAttribute("data-selection-overlay", "text");
    svg.appendChild(textSelection);
    const mapSelection = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    mapSelection.setAttribute("data-map-selection-overlay", "map");
    svg.appendChild(mapSelection);
    const assetSelection = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    assetSelection.setAttribute("data-asset-selection", "asset-visible");
    svg.appendChild(assetSelection);

    const markup = serializePosterSvg(svg);

    expect(markup).toContain("模板标题");
    expect(markup).toContain("asset-visible");
    expect(markup).toContain('width="1800"');
    expect(markup).toContain('height="1200"');
    expect(markup).not.toContain("data-selection-overlay");
    expect(markup).not.toContain("data-map-selection-overlay");
    expect(markup).not.toContain("data-asset-selection");
  });

  it("omits editor grid overlays from exported svg", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const grid = document.createElementNS("http://www.w3.org/2000/svg", "g");
    grid.setAttribute("data-editor-grid", "true");
    svg.appendChild(grid);
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.textContent = "保留内容";
    svg.appendChild(text);

    const markup = serializePosterSvg(svg);
    expect(markup).toContain("保留内容");
    expect(markup).not.toContain("data-editor-grid");
  });

  it("removes only the canvas background when transparent export is enabled", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    background.setAttribute("data-canvas-background", "true");
    svg.appendChild(background);
    const content = document.createElementNS("http://www.w3.org/2000/svg", "text");
    content.textContent = "名单内容";
    svg.appendChild(content);

    const markup = serializePosterSvg(svg, { transparentBackground: true });
    expect(markup).not.toContain("data-canvas-background");
    expect(markup).toContain("名单内容");
  });

  it("makes embedded uploaded fonts blocking for PNG export", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.setAttribute("data-font-faces", "");
    style.textContent = "@font-face{font-family:ExportHand;font-display:swap;}";
    defs.appendChild(style);
    svg.appendChild(defs);

    const markup = serializePosterSvg(svg, { blockFontDisplay: true });

    expect(markup).toContain("font-display:block");
    expect(markup).not.toContain("font-display:swap");
  });

  it("rasterizes svg markup into a png blob through the object-url path", async () => {
    const urls = stubObjectUrls();
    stubImmediateImage();
    const { context } = stubCanvas();

    const markup =
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="#215d75"/></svg>';
    let metrics: PosterExportMetrics | undefined;
    const blob = await svgToPngBlob(markup, { width: 20, height: 10, onMetrics: (value) => { metrics = value; } });

    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe(FAKE_PNG_BYTES);
    expect(context.drawImage).toHaveBeenCalled();
    expect(urls.created[0]?.type).toBe("image/svg+xml;charset=utf-8");
    expect(metrics?.sourceStrategy).toBe("blob");
    expect(metrics?.outputStrategy).toBe("blob");
  });

  it("does not prefill the png canvas when transparent background is enabled", async () => {
    stubObjectUrls();
    stubImmediateImage();
    const { canvas, context } = stubCanvas();

    await svgToPngBlob("<svg/>", { width: 40, height: 20, transparentBackground: true });

    expect(canvas.width).toBe(40);
    expect(canvas.height).toBe(20);
    expect(context.fillRect).not.toHaveBeenCalled();
    expect(context.drawImage).toHaveBeenCalled();
  });

  it("materializes far fewer bytes than the data-url pipeline for an 8MB poster", async () => {
    stubObjectUrls();
    stubImmediateImage();
    stubCanvas();

    const svg = buildSyntheticSvg();
    // 改造前的管线：encodeURIComponent 的源字符串 + toDataURL 的 base64 结果。
    const baselineBytes = encodeURIComponent(svg).length
      + "data:image/png;base64,".length + base64Length(FAKE_PNG_BYTES);

    let metrics: PosterExportMetrics | undefined;
    await svgToPngBlob(svg, { width: 1800, height: 1200, onMetrics: (value) => { metrics = value; } });

    const currentBytes = metrics?.totalBytes ?? Number.POSITIVE_INFINITY;
    const reduction = (baselineBytes - currentBytes) / baselineBytes;
    // eslint-disable-next-line no-console -- 指标要能在 CI 日志里被人读到，不然只剩一个 pass。
    console.log(`[export bytes] baseline=${baselineBytes} current=${currentBytes} reduction=${(reduction * 100).toFixed(1)}%`);
    // 门槛 5%；实测约 42%（源侧省下 encodeURIComponent 的转义膨胀，结果侧省下 base64 的 1.33×）。
    // 这里的对比对新管线是偏保守的：基线按字符数计，而 blob 按 UTF-8 字节计，中文
    // 内容在 JS 字符串里只占 2 字节/字符、在 blob 里却是 3 字节/字符。
    expect(reduction).toBeGreaterThanOrEqual(0.05);
    expect(reduction).toBeGreaterThan(0.35);
    expect(metrics?.sourceStrategy).toBe("blob");
    expect(metrics?.outputStrategy).toBe("blob");
  });

  it("falls back to toDataURL when toBlob is unavailable", async () => {
    stubObjectUrls();
    stubImmediateImage();
    const { canvas } = stubCanvas({ withoutToBlob: true });

    let metrics: PosterExportMetrics | undefined;
    const blob = await svgToPngBlob("<svg/>", { width: 20, height: 10, onMetrics: (value) => { metrics = value; } });

    expect(canvas.toDataURL).toHaveBeenCalled();
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe(FAKE_PNG_BYTES);
    expect(metrics?.outputStrategy).toBe("data-url");
  });

  it("falls back to toDataURL when toBlob hands back null", async () => {
    stubObjectUrls();
    stubImmediateImage();
    const { canvas } = stubCanvas({ toBlobReturnsNull: true });

    const blob = await svgToPngBlob("<svg/>", { width: 20, height: 10 });

    expect(canvas.toBlob).toHaveBeenCalled();
    expect(canvas.toDataURL).toHaveBeenCalled();
    expect(blob.size).toBe(FAKE_PNG_BYTES);
  });

  it("reports a tainted canvas separately from an encoding failure", async () => {
    stubObjectUrls();
    stubImmediateImage();
    const taint = new Error("Tainted canvases may not be exported.");
    taint.name = "SecurityError";
    stubCanvas({ withoutToBlob: true, toDataURL: () => { throw taint; } });

    const error = await svgToPngBlob("<svg/>", { width: 20, height: 10 }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(PosterExportError);
    expect((error as PosterExportError).code).toBe("taint");
    expect((error as Error).message).toContain("跨域素材");
  });

  it("keeps the original encoder message when png encoding fails", async () => {
    stubObjectUrls();
    stubImmediateImage();
    stubCanvas({ withoutToBlob: true, toDataURL: () => { throw new Error("PNG 下载不可用"); } });

    await expect(svgToPngBlob("<svg/>", { width: 20, height: 10 })).rejects.toThrow("PNG 下载不可用");
  });

  it("reports image decode failures distinctly from timeouts", async () => {
    stubObjectUrls();
    class BrokenImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onerror?.()); }
    }
    vi.stubGlobal("Image", BrokenImage);

    const error = await svgToPngBlob("<svg/>", { width: 40, height: 20 }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(PosterExportError);
    expect((error as PosterExportError).code).toBe("decode");
    expect((error as Error).message).toContain("SVG 转 PNG 失败");
    expect((error as Error).message).not.toContain("超时");
  });

  it("retries through the data-url source when the blob url cannot be decoded", async () => {
    const urls = stubObjectUrls();
    const attempted: string[] = [];
    class BlobHostileImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) {
        attempted.push(value.slice(0, 5));
        const failed = value.startsWith("blob:");
        queueMicrotask(() => (failed ? this.onerror?.() : this.onload?.()));
      }
    }
    vi.stubGlobal("Image", BlobHostileImage);
    stubCanvas();

    let metrics: PosterExportMetrics | undefined;
    const blob = await svgToPngBlob("<svg/>", { width: 20, height: 10, onMetrics: (value) => { metrics = value; } });

    expect(attempted).toEqual(["blob:", "data:"]);
    expect(blob.size).toBe(FAKE_PNG_BYTES);
    expect(metrics?.sourceStrategy).toBe("data-url");
    // 失败的 blob 尝试也只 revoke 一次。
    expect(urls.revoked).toEqual(["blob:mock-1"]);
  });

  it("revokes the svg object url exactly once, after the image settles", async () => {
    const urls = stubObjectUrls();
    let release: (() => void) | undefined;
    class DeferredImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        release = () => this.onload?.();
      }
    }
    vi.stubGlobal("Image", DeferredImage);
    stubCanvas();

    const pending = svgToPngBlob("<svg/>", { width: 20, height: 10 });
    await Promise.resolve();
    // 加载还没落地时提前 revoke 会让图片直接失败，这里必须一次都没调用。
    expect(urls.revoked).toEqual([]);
    release?.();
    await pending;
    expect(urls.revoked).toEqual(["blob:mock-1"]);
    expect(urls.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  describe("load deadline", () => {
    it("scales the deadline with source bytes and output pixels, and caps it", () => {
      expect(computeImageLoadTimeout({ byteLength: 0, pixels: 0 })).toBe(4000);
      expect(computeImageLoadTimeout({ byteLength: 8_000_000 })).toBe(20_000);
      expect(computeImageLoadTimeout({ byteLength: 1_000_000, pixels: 2_160_000 })).toBe(8160);
      expect(computeImageLoadTimeout({ byteLength: 500_000_000 })).toBe(60_000);
      // 非法输入不能变成 NaN 期限：setTimeout(NaN) 会立刻触发，等于零超时。
      expect(computeImageLoadTimeout({ byteLength: Number.NaN, pixels: Number.NaN })).toBe(4000);
      expect(computeImageLoadTimeout({ byteLength: -10, pixels: -10 })).toBe(4000);
      expect(computeImageLoadTimeout({ byteLength: Number.POSITIVE_INFINITY })).toBe(4000);
    });

    it("lets a large poster finish loading at 4.5s (the old fixed 4s timeout failed it)", async () => {
      vi.useFakeTimers();
      try {
        stubObjectUrls();
        class SlowImage {
          onload: (() => void) | null = null;
          onerror: (() => void) | null = null;
          set src(_value: string) {
            window.setTimeout(() => this.onload?.(), 4500);
          }
        }
        vi.stubGlobal("Image", SlowImage);
        stubCanvas();

        const svg = buildSyntheticSvg(2_000_000);
        const pending = svgToPngBlob(svg, { width: 1800, height: 1200 });
        const settled = pending.then((blob) => blob.size, (error: Error) => error.message);
        await vi.advanceTimersByTimeAsync(4600);
        await expect(settled).resolves.toBe(FAKE_PNG_BYTES);
      } finally {
        vi.useRealTimers();
      }
    });

    it("still rejects a hung load once the scaled deadline elapses", async () => {
      vi.useFakeTimers();
      try {
        const urls = stubObjectUrls();
        class HungImage {
          onload: (() => void) | null = null;
          onerror: (() => void) | null = null;
          set src(_value: string) { /* 永不落地 */ }
        }
        vi.stubGlobal("Image", HungImage);

        const svg = buildSyntheticSvg(2_000_000);
        const pending = svgToPngBlob(svg, { width: 1800, height: 1200 });
        const settled = pending.then(() => "resolved", (error: PosterExportError) => error);
        await vi.advanceTimersByTimeAsync(200_000);
        const error = await settled;
        expect(error).toBeInstanceOf(PosterExportError);
        expect((error as PosterExportError).code).toBe("timeout");
        expect((error as Error).message).toContain("SVG 转 PNG 超时");
        // 超时不再走一遍 data URL 通道，也要把 object URL 收回来。
        expect(urls.revoked).toEqual(["blob:mock-1"]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("keeps the old 4s floor for small posters", async () => {
      vi.useFakeTimers();
      try {
        stubObjectUrls();
        class SlowImage {
          onload: (() => void) | null = null;
          onerror: (() => void) | null = null;
          set src(_value: string) { window.setTimeout(() => this.onload?.(), 4500); }
        }
        vi.stubGlobal("Image", SlowImage);
        stubCanvas();

        const pending = svgToPngBlob("<svg/>", { width: 100, height: 100 });
        const settled = pending.then(() => "resolved", (error: PosterExportError) => error.code);
        await vi.advanceTimersByTimeAsync(5000);
        await expect(settled).resolves.toBe("timeout");
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("downloads", () => {
    function stubAnchor() {
      const link = document.createElementNS("http://www.w3.org/1999/xhtml", "a") as HTMLAnchorElement;
      const click = vi.spyOn(link, "click").mockImplementation(() => {});
      const original = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation((tag: string) =>
        tag === "a" ? link : original(tag),
      );
      return { link, click };
    }

    it("delays revoking the object url and leaves no anchor behind", async () => {
      vi.useFakeTimers();
      try {
        const urls = stubObjectUrls();
        const { link, click } = stubAnchor();

        downloadBlob(new Blob([fakePngBytes(16)], { type: "image/png" }), "我的毕业去向图.png");

        expect(link.getAttribute("href")).toBe("blob:mock-1");
        expect(link.download).toBe("我的毕业去向图.png");
        expect(click).toHaveBeenCalledTimes(1);
        expect(document.body.contains(link)).toBe(false);
        expect(document.querySelector("a[download]")).toBeNull();
        // 同一个任务里 revoke 会让尚未开始的下载被取消。
        expect(urls.revoked).toEqual([]);
        vi.advanceTimersByTime(1000);
        expect(urls.revoked).toEqual(["blob:mock-1"]);
        expect(urls.revokeObjectURL).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("revokes immediately when the download click is blocked", () => {
      const urls = stubObjectUrls();
      const link = document.createElementNS("http://www.w3.org/1999/xhtml", "a") as HTMLAnchorElement;
      vi.spyOn(link, "click").mockImplementation(() => { throw new Error("下载被拦截"); });
      const original = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation((tag: string) => (tag === "a" ? link : original(tag)));

      expect(() => downloadBlob(new Blob(["png"]), "我的毕业去向图.png")).toThrow("下载被拦截");
      expect(urls.revoked).toEqual(["blob:mock-1"]);
    });

    it("routes text downloads through the same blob path", async () => {
      vi.useFakeTimers();
      try {
        const urls = stubObjectUrls();
        const { link } = stubAnchor();

        downloadText("<svg/>", "我的毕业去向图.svg", "image/svg+xml;charset=utf-8");

        expect(link.download).toBe("我的毕业去向图.svg");
        expect(urls.created[0]?.type).toBe("image/svg+xml;charset=utf-8");
        expect(urls.revoked).toEqual([]);
        vi.advanceTimersByTime(1000);
        expect(urls.revoked).toEqual(["blob:mock-1"]);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
