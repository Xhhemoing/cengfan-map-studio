import { afterEach, describe, expect, it, vi } from "vitest";
import { posterPngExportSize, serializePosterSvg, svgToPngDataUrl } from "./export-poster";
import { resolvePrintBleedGeometry } from "./print-bleed";

describe("poster export", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

  it("expands svg dimensions and viewBox by the requested print bleed", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 50");
    svg.setAttribute("width", "100");
    svg.setAttribute("height", "50");

    const markup = serializePosterSvg(svg, { printBleedMm: 3 });
    const geometry = resolvePrintBleedGeometry(
      { x: 0, y: 0, width: 100, height: 50 },
      { printBleedMm: 3 },
    );
    const width = Number(markup.match(/\bwidth="([^"]+)"/)?.[1]);
    const height = Number(markup.match(/\bheight="([^"]+)"/)?.[1]);
    const viewBox = markup.match(/\bviewBox="([^"]+)"/)?.[1].split(" ").map(Number);

    expect(width).toBeCloseTo(geometry.media.width);
    expect(height).toBeCloseTo(geometry.media.height);
    expect(viewBox).toEqual([
      geometry.media.x,
      geometry.media.y,
      geometry.media.width,
      geometry.media.height,
    ]);
    expect(markup).toContain('data-print-crop-marks="true"');
    expect(svg.getAttribute("viewBox")).toBe("0 0 100 50");
    expect(svg.getAttribute("width")).toBe("100");
    expect(svg.getAttribute("height")).toBe("50");
  });

  it("normalizes invalid print bleed without enlarging export geometry", () => {
    const geometry = resolvePrintBleedGeometry(
      { x: 0, y: 0, width: 100, height: 50 },
      { printBleedMm: -3 },
    );
    expect(geometry.bleedMm).toBe(0);
    expect(geometry.media).toEqual(geometry.trim);
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

  it("keeps the exported markup size unchanged when print bleed is 0", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 1500 1000");
    svg.setAttribute("width", "1500");
    svg.setAttribute("height", "1000");

    const baseline = serializePosterSvg(svg);
    const withoutBleed = serializePosterSvg(svg, { printBleedMm: 0 });

    expect(withoutBleed).toBe(baseline);
    expect(withoutBleed).toContain('viewBox="0 0 1500 1000"');
    expect(withoutBleed).toContain('width="1500"');
    expect(withoutBleed).not.toContain("data-print-crop-marks");
  });

  it("expands the viewBox and draws crop marks for 3mm print bleed", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 1500 1000");
    svg.setAttribute("width", "1500");
    svg.setAttribute("height", "1000");
    const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    background.setAttribute("data-canvas-background", "true");
    background.setAttribute("width", "1500");
    background.setAttribute("height", "1000");
    svg.appendChild(background);
    const overlay = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    overlay.setAttribute("data-selection-overlay", "text");
    svg.appendChild(overlay);

    const markup = serializePosterSvg(svg, { printBleedMm: 3 });
    const viewBox = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(markup);

    expect(viewBox).not.toBeNull();
    expect(Number(viewBox![1])).toBeLessThan(0);
    expect(Number(viewBox![3])).toBeGreaterThan(1500);
    expect(Number(viewBox![4])).toBeGreaterThan(1000);
    expect(Number(/\swidth="([\d.]+)"/.exec(markup)![1])).toBeGreaterThan(1500);
    expect(markup).toContain("data-print-crop-marks");
    expect(markup).not.toContain("data-selection-overlay");
    expect(svg.getAttribute("viewBox")).toBe("0 0 1500 1000");
  });

  it("sizes the png export from the canvas, the scale and the bleed together", () => {
    const canvas = { width: 1500, height: 1000 };

    expect(posterPngExportSize(canvas)).toEqual({ width: 1500, height: 1000 });
    expect(posterPngExportSize(canvas, { scale: 2 })).toEqual({ width: 3000, height: 2000 });
    expect(posterPngExportSize(canvas, { printBleedMm: 0, scale: 2 })).toEqual({ width: 3000, height: 2000 });

    const bled = posterPngExportSize(canvas, { printBleedMm: 3, scale: 2 });
    expect(bled.width).toBeGreaterThan(3000);
    expect(bled.height).toBeGreaterThan(2000);
    expect(bled.width - 3000).toBe(bled.height - 2000);
  });

  it("converts svg markup into a png data url", async () => {
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", MockImage);

    const context = {
      fillStyle: "",
      font: "",
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      fillText: vi.fn(),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toDataURL: vi.fn(() => "data:image/png;base64,mock"),
    };
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") return canvas as unknown as HTMLCanvasElement;
      return document.createElementNS("http://www.w3.org/1999/xhtml", tag) as HTMLElement;
    });

    const markup =
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="#215d75"/></svg>';
    const dataUrl = await svgToPngDataUrl(markup, { width: 20, height: 10 });
    expect(dataUrl.startsWith("data:image/png")).toBe(true);
    expect(context.drawImage).toHaveBeenCalled();
  });

  it("does not prefill the png canvas when transparent background is enabled", async () => {
    class MockImage {
      onload: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("Image", MockImage);
    const context = { fillStyle: "", font: "", fillRect: vi.fn(), drawImage: vi.fn(), fillText: vi.fn() };
    const canvas = { width: 0, height: 0, getContext: () => context, toDataURL: () => "data:image/png;base64,mock" };
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => tag === "canvas" ? canvas as unknown as HTMLCanvasElement : document.createElementNS("http://www.w3.org/1999/xhtml", tag) as HTMLElement);

    await svgToPngDataUrl("<svg/>", { width: 40, height: 20, transparentBackground: true });
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

    await expect(svgToPngDataUrl("<svg/>", { width: 40, height: 20 })).rejects.toThrow("SVG 转 PNG 失败");
  });
});
