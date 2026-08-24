import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_SAFE_EXPORT_PIXELS,
  PNG_EXPORT_SCALES,
  availablePngScales,
  computeImageLoadTimeout,
  describePngScaleLimit,
  downloadBlob,
  downloadText,
  exportPixelCount,
  serializePosterSvg,
  svgToPngBlob,
} from "./export-poster";

/** 立即 onload 的图片桩。 */
class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

/** 造一个只实现导出所需接口的 canvas 桩，避免依赖 jsdom 的真实 2D 上下文。 */
function mockCanvas(options: { toBlob?: boolean } = {}) {
  const context = {
    fillStyle: "",
    font: "",
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
  };
  const canvas: Record<string, unknown> = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toDataURL: vi.fn(() => "data:image/png;base64,aGk="),
  };
  if (options.toBlob !== false) {
    canvas.toBlob = vi.fn((callback: (blob: Blob | null) => void, type?: string) => {
      callback(new Blob(["png"], { type: type ?? "image/png" }));
    });
  }
  vi.spyOn(document, "createElement").mockImplementation((tag: string) =>
    tag === "canvas"
      ? (canvas as unknown as HTMLCanvasElement)
      : (document.createElementNS("http://www.w3.org/1999/xhtml", tag) as HTMLElement),
  );
  return { canvas, context };
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

  it("omits resize handles, province hit areas and texture editors while keeping the rendered map", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const provinceFill = document.createElementNS("http://www.w3.org/2000/svg", "path");
    provinceFill.setAttribute("data-province-id", "11");
    provinceFill.setAttribute("fill", "#215d75");
    svg.appendChild(provinceFill);
    const textureImage = document.createElementNS("http://www.w3.org/2000/svg", "image");
    textureImage.setAttribute("data-province-texture", "11");
    svg.appendChild(textureImage);
    const provinceLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    provinceLabel.setAttribute("data-province-label", "11");
    provinceLabel.textContent = "北京";
    svg.appendChild(provinceLabel);

    const handles = document.createElementNS("http://www.w3.org/2000/svg", "g");
    handles.setAttribute("data-resize-handles", "");
    const handle = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    handle.setAttribute("data-resize-handle", "se");
    handles.appendChild(handle);
    svg.appendChild(handles);
    const hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
    hit.setAttribute("data-province-hit", "11");
    svg.appendChild(hit);
    // 贴图编辑器：选中态两个属性挂在同一个 <g> 上，组里只有透明命中矩形与虚线选框。
    const textureEditor = document.createElementNS("http://www.w3.org/2000/svg", "g");
    textureEditor.setAttribute("data-province-texture-editor", "11");
    textureEditor.setAttribute("data-province-texture-selection", "11");
    const textureBox = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    textureBox.setAttribute("stroke-dasharray", "6 4");
    textureEditor.appendChild(textureBox);
    svg.appendChild(textureEditor);

    const markup = serializePosterSvg(svg);

    expect(markup).not.toContain("data-resize-handles");
    // 手柄子节点必须随整组一起消失，不能只删外层属性。
    expect(markup).not.toContain("data-resize-handle=");
    expect(markup).not.toContain("data-province-hit");
    expect(markup).not.toContain("data-province-texture-editor");
    expect(markup).not.toContain("data-province-texture-selection");
    expect(markup).not.toContain("stroke-dasharray");
    // 可见地图内容在别的节点上，剔除编辑态不能把它们带走。
    expect(markup).toContain("data-province-id");
    expect(markup).toContain('data-province-texture="11"');
    expect(markup).toContain("北京");
  });

  it("omits an unselected province texture editor as well", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    // 未选中时只有 editor 属性，selection 属性不会渲染，仍然属于编辑态节点。
    const textureEditor = document.createElementNS("http://www.w3.org/2000/svg", "g");
    textureEditor.setAttribute("data-province-texture-editor", "12");
    textureEditor.setAttribute("aria-label", "调整天津市贴图位置");
    svg.appendChild(textureEditor);
    const content = document.createElementNS("http://www.w3.org/2000/svg", "text");
    content.textContent = "保留标题";
    svg.appendChild(content);

    const markup = serializePosterSvg(svg);

    expect(markup).not.toContain("data-province-texture-editor");
    expect(markup).not.toContain("调整天津市贴图位置");
    expect(markup).toContain("保留标题");
  });

  it("strips editor-only nodes nested inside layer groups", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const mapLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    mapLayer.setAttribute("data-map-layer", "true");
    const asset = document.createElementNS("http://www.w3.org/2000/svg", "image");
    asset.setAttribute("data-asset-id", "asset-badge");
    mapLayer.appendChild(asset);
    const nestedHandles = document.createElementNS("http://www.w3.org/2000/svg", "g");
    nestedHandles.setAttribute("data-resize-handles", "");
    mapLayer.appendChild(nestedHandles);
    const nestedHit = document.createElementNS("http://www.w3.org/2000/svg", "path");
    nestedHit.setAttribute("data-province-hit", "31");
    mapLayer.appendChild(nestedHit);
    svg.appendChild(mapLayer);

    const markup = serializePosterSvg(svg);

    expect(markup).toContain("data-map-layer");
    expect(markup).toContain("asset-badge");
    expect(markup).not.toContain("data-resize-handles");
    expect(markup).not.toContain("data-province-hit");
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

  it("converts svg markup into a png blob without building a base64 string", async () => {
    vi.stubGlobal("Image", MockImage);
    const { canvas, context } = mockCanvas();

    const markup =
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="#215d75"/></svg>';
    const blob = await svgToPngBlob(markup, { width: 20, height: 10 });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
    expect(canvas.toBlob).toHaveBeenCalled();
    expect(canvas.toDataURL).not.toHaveBeenCalled();
    expect(context.drawImage).toHaveBeenCalled();
  });

  it("falls back to a data url encode when the canvas has no toBlob", async () => {
    vi.stubGlobal("Image", MockImage);
    const { canvas } = mockCanvas({ toBlob: false });

    const blob = await svgToPngBlob("<svg/>", { width: 20, height: 10 });

    expect(canvas.toDataURL).toHaveBeenCalledWith("image/png");
    expect(blob.type).toBe("image/png");
    // base64 "aGk=" 解码为 2 字节的 "hi"，说明回退路径确实解码了 dataURL。
    expect(blob.size).toBe(2);
  });

  it("rejects when the canvas cannot encode a png", async () => {
    vi.stubGlobal("Image", MockImage);
    const { canvas } = mockCanvas();
    canvas.toBlob = vi.fn((callback: (blob: Blob | null) => void) => callback(null));

    await expect(svgToPngBlob("<svg/>", { width: 20, height: 10 })).rejects.toThrow("PNG 编码失败");
  });

  it("does not prefill the png canvas when transparent background is enabled", async () => {
    vi.stubGlobal("Image", MockImage);
    const { canvas, context } = mockCanvas();

    await svgToPngBlob("<svg/>", { width: 40, height: 20, transparentBackground: true });
    expect(canvas.width).toBe(40);
    expect(canvas.height).toBe(20);
    expect(context.fillRect).not.toHaveBeenCalled();
    expect(context.drawImage).toHaveBeenCalled();
  });

  it("reports image conversion failures instead of returning a placeholder poster", async () => {
    class BrokenImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onerror?.()); }
    }
    vi.stubGlobal("Image", BrokenImage);

    await expect(svgToPngBlob("<svg/>", { width: 40, height: 20 })).rejects.toThrow("SVG 转 PNG 失败");
  });

  it("keeps the 4s timeout for small posters and scales it with pixel area", () => {
    expect(computeImageLoadTimeout(20, 10)).toBe(4000);
    expect(computeImageLoadTimeout(1000, 1000)).toBe(4000);
    expect(computeImageLoadTimeout(1800, 1200)).toBe(8640);
    expect(computeImageLoadTimeout(1800 * 3, 1200 * 3)).toBe(60_000);
    expect(computeImageLoadTimeout(1800 * 3, 1200 * 3)).toBeGreaterThan(computeImageLoadTimeout(1800, 1200));
  });

  it("times out slow large exports only after the scaled budget", async () => {
    vi.useFakeTimers();
    try {
      class StalledImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) { /* 永不触发回调，模拟大图渲染卡住 */ }
      }
      vi.stubGlobal("Image", StalledImage);

      const pending = svgToPngBlob("<svg/>", { width: 1800, height: 1200 });
      const settled = vi.fn();
      void pending.catch(settled);

      await vi.advanceTimersByTimeAsync(4000);
      expect(settled).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(4640);
      await expect(pending).rejects.toThrow("SVG 转 PNG 超时");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps every scale for canvases that stay under the safe pixel budget", () => {
    // 默认画布 1500 × 1000：3× 也只有 13.5MP。
    expect(availablePngScales(1500, 1000)).toEqual([1, 2, 3]);
  });

  it("accepts a scale that lands exactly on the safe pixel budget", () => {
    // 4000 × 4000 的 2× 正好 64MP，3× 是 144MP。
    expect(exportPixelCount(4000, 4000, 2)).toBe(MAX_SAFE_EXPORT_PIXELS);
    expect(availablePngScales(4000, 4000)).toEqual([1, 2]);
  });

  it("drops a scale that exceeds the budget by a single row of pixels", () => {
    expect(exportPixelCount(4000, 4001, 2)).toBeGreaterThan(MAX_SAFE_EXPORT_PIXELS);
    expect(availablePngScales(4000, 4001)).toEqual([1]);
  });

  it("disables 2×/3× on the largest editable canvas", () => {
    expect(availablePngScales(6000, 6000)).toEqual([1]);
  });

  it("always keeps 1× available even when the canvas alone is over the budget", () => {
    expect(exportPixelCount(9000, 9000)).toBeGreaterThan(MAX_SAFE_EXPORT_PIXELS);
    expect(availablePngScales(9000, 9000)).toEqual([1]);
    expect(availablePngScales(0, 0)).toEqual([...PNG_EXPORT_SCALES]);
  });

  it("sorts and de-duplicates caller supplied scales", () => {
    expect(availablePngScales(2000, 2000, [4, 1, 2, 2, -1, Number.NaN])).toEqual([1, 2, 4]);
    // 4000 × 4000 时 4× 是 256MP，只剩 1×/2×。
    expect(availablePngScales(4000, 4000, [4, 2, 1])).toEqual([1, 2]);
  });

  it("explains the limit with the pixel budget and a scale that still works", () => {
    const message = describePngScaleLimit(6000, 6000, 3);
    expect(message).toContain("6000 × 6000");
    expect(message).toContain("3×");
    expect(message).toContain("324.0 百万像素");
    expect(message).toContain("64.0 百万像素");
    expect(message).toContain("请改用 1× 导出");
  });

  it("refuses to rasterize an over-budget bitmap instead of returning a blank png", async () => {
    const constructed = vi.fn();
    class TrackedImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() { constructed(); }
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("Image", TrackedImage);
    const { canvas } = mockCanvas();

    await expect(svgToPngBlob("<svg/>", { width: 18_000, height: 18_000 }))
      .rejects.toThrow("超过浏览器 64.0 百万像素的安全上限");

    expect(constructed).not.toHaveBeenCalled();
    expect(canvas.getContext).not.toHaveBeenCalled();
    expect(canvas.toBlob).not.toHaveBeenCalled();
    expect(canvas.toDataURL).not.toHaveBeenCalled();
  });

  it("downloads through an object url and revokes it afterwards", () => {
    vi.useFakeTimers();
    try {
      const createObjectURL = vi.fn(() => "blob:mock-url");
      const revokeObjectURL = vi.fn();
      vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
      const link = document.createElementNS("http://www.w3.org/1999/xhtml", "a") as HTMLAnchorElement;
      const click = vi.spyOn(link, "click").mockImplementation(() => {});
      vi.spyOn(document, "createElement").mockImplementation((tag: string) =>
        tag === "a" ? link : (document.createElementNS("http://www.w3.org/1999/xhtml", tag) as HTMLElement),
      );

      downloadBlob(new Blob(["png"], { type: "image/png" }), "我的毕业去向图.png");

      expect(link.getAttribute("href")).toBe("blob:mock-url");
      expect(link.download).toBe("我的毕业去向图.png");
      expect(click).toHaveBeenCalled();
      // 点击的同一个任务内不能 revoke，否则部分浏览器会取消下载。
      expect(revokeObjectURL).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    } finally {
      vi.useRealTimers();
    }
  });

  it("revokes the object url when the download click throws", () => {
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const link = document.createElementNS("http://www.w3.org/1999/xhtml", "a") as HTMLAnchorElement;
    vi.spyOn(link, "click").mockImplementation(() => {
      throw new Error("下载被拦截");
    });
    vi.spyOn(document, "createElement").mockImplementation((tag: string) =>
      tag === "a" ? link : (document.createElementNS("http://www.w3.org/1999/xhtml", tag) as HTMLElement),
    );

    expect(() => downloadBlob(new Blob(["png"]), "我的毕业去向图.png")).toThrow("下载被拦截");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("delays revoking the object url for text downloads as well", async () => {
    vi.useFakeTimers();
    try {
      const blobs: Blob[] = [];
      const createObjectURL = vi.fn((blob: Blob) => {
        blobs.push(blob);
        return "blob:mock-url";
      });
      const revokeObjectURL = vi.fn();
      vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
      const link = document.createElementNS("http://www.w3.org/1999/xhtml", "a") as HTMLAnchorElement;
      const click = vi.spyOn(link, "click").mockImplementation(() => {});
      vi.spyOn(document, "createElement").mockImplementation((tag: string) =>
        tag === "a" ? link : (document.createElementNS("http://www.w3.org/1999/xhtml", tag) as HTMLElement),
      );

      downloadText("<svg/>", "我的毕业去向图.svg", "image/svg+xml;charset=utf-8");

      expect(link.getAttribute("href")).toBe("blob:mock-url");
      expect(link.download).toBe("我的毕业去向图.svg");
      expect(click).toHaveBeenCalled();
      expect(blobs[0]?.type).toBe("image/svg+xml;charset=utf-8");
      await expect(blobs[0]?.text()).resolves.toBe("<svg/>");
      // SVG 导出同样不能在点击的当前任务内 revoke，否则尚未开始的下载会被取消。
      expect(revokeObjectURL).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    } finally {
      vi.useRealTimers();
    }
  });

  it("revokes the object url when a text download click throws", () => {
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const link = document.createElementNS("http://www.w3.org/1999/xhtml", "a") as HTMLAnchorElement;
    vi.spyOn(link, "click").mockImplementation(() => {
      throw new Error("下载被拦截");
    });
    vi.spyOn(document, "createElement").mockImplementation((tag: string) =>
      tag === "a" ? link : (document.createElementNS("http://www.w3.org/1999/xhtml", tag) as HTMLElement),
    );

    expect(() => downloadText("<svg/>", "我的毕业去向图.svg", "image/svg+xml;charset=utf-8")).toThrow("下载被拦截");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });
});
