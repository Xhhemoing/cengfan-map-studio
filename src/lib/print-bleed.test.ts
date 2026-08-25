import { describe, expect, it } from "vitest";
import {
  CSS_PX_PER_MM,
  MAX_PRINT_BLEED_MM,
  applyPrintBleedToSvg,
  cropMarkSegments,
  mmToPx,
  normalizePrintBleedMm,
  parseTrimBox,
  pxToMm,
  resolveBleedExportSize,
  resolvePrintBleedGeometry,
} from "./print-bleed";

function createSvg(attributes: Record<string, string>): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [name, value] of Object.entries(attributes)) svg.setAttribute(name, value);
  return svg;
}

describe("print bleed units", () => {
  it("converts millimetres at 96dpi css pixels", () => {
    expect(CSS_PX_PER_MM).toBeCloseTo(3.779527, 5);
    expect(mmToPx(3)).toBeCloseTo(11.3386, 4);
    expect(mmToPx(25.4)).toBe(96);
    expect(pxToMm(96)).toBe(25.4);
    expect(pxToMm(mmToPx(5))).toBeCloseTo(5, 3);
  });

  it("normalizes bleed input to a non-negative clamped millimetre value", () => {
    expect(normalizePrintBleedMm(undefined)).toBe(0);
    expect(normalizePrintBleedMm(null)).toBe(0);
    expect(normalizePrintBleedMm("abc")).toBe(0);
    expect(normalizePrintBleedMm(Number.NaN)).toBe(0);
    expect(normalizePrintBleedMm(-4)).toBe(0);
    expect(normalizePrintBleedMm(3)).toBe(3);
    expect(normalizePrintBleedMm("3")).toBe(3);
    expect(normalizePrintBleedMm(3.14159)).toBe(3.14);
    expect(normalizePrintBleedMm(999)).toBe(MAX_PRINT_BLEED_MM);
  });
});

describe("print bleed geometry", () => {
  const trim = { x: 0, y: 0, width: 1500, height: 1000 };

  it("keeps every box equal to the trim box without bleed", () => {
    const geometry = resolvePrintBleedGeometry(trim, { printBleedMm: 0 });

    expect(geometry.bleedPx).toBe(0);
    expect(geometry.bleed).toEqual(trim);
    expect(geometry.media).toEqual(trim);
    expect(geometry.cropMarks).toBe(false);
    expect(cropMarkSegments(geometry)).toEqual([]);
  });

  it("expands bleed and media boxes symmetrically for 3mm bleed", () => {
    const geometry = resolvePrintBleedGeometry(trim, { printBleedMm: 3 });
    const bleedPx = mmToPx(3);
    const markPx = mmToPx(3);

    expect(geometry.bleed.x).toBeCloseTo(-bleedPx, 4);
    expect(geometry.bleed.width).toBeCloseTo(1500 + bleedPx * 2, 4);
    expect(geometry.media.x).toBeCloseTo(-(bleedPx + markPx), 4);
    expect(geometry.media.width).toBeCloseTo(1500 + (bleedPx + markPx) * 2, 4);
    expect(geometry.media.height).toBeCloseTo(1000 + (bleedPx + markPx) * 2, 4);
    expect(geometry.media.width).toBeGreaterThan(geometry.bleed.width);
  });

  it("draws eight crop marks outside the trim box only when bleed is positive", () => {
    expect(cropMarkSegments(resolvePrintBleedGeometry(trim, { printBleedMm: 0 }))).toHaveLength(0);

    const geometry = resolvePrintBleedGeometry(trim, { printBleedMm: 3 });
    const segments = cropMarkSegments(geometry);

    expect(segments).toHaveLength(8);
    for (const segment of segments) {
      const insideTrimX = segment.x1 > trim.x && segment.x2 < trim.x + trim.width;
      const insideTrimY = segment.y1 > trim.y && segment.y2 < trim.y + trim.height;
      expect(insideTrimX && insideTrimY).toBe(false);
      const epsilon = 1e-6;
      expect(segment.x1).toBeGreaterThanOrEqual(geometry.media.x - epsilon);
      expect(segment.y1).toBeGreaterThanOrEqual(geometry.media.y - epsilon);
      expect(segment.x2).toBeLessThanOrEqual(geometry.media.x + geometry.media.width + epsilon);
      expect(segment.y2).toBeLessThanOrEqual(geometry.media.y + geometry.media.height + epsilon);
    }
    // 横向标记贴着成品边的 y，纵向标记贴着成品边的 x。
    expect(segments.filter((segment) => segment.y1 === segment.y2)).toHaveLength(4);
    expect(segments.filter((segment) => segment.x1 === segment.x2)).toHaveLength(4);
  });

  it("suppresses crop marks when explicitly disabled but keeps the bleed box", () => {
    const geometry = resolvePrintBleedGeometry(trim, { printBleedMm: 3, cropMarks: false });

    expect(geometry.cropMarks).toBe(false);
    expect(geometry.cropMarkLengthPx).toBe(0);
    expect(geometry.media).toEqual(geometry.bleed);
    expect(geometry.media.width).toBeGreaterThan(trim.width);
  });
});

describe("trim box parsing", () => {
  it("reads the viewBox first and falls back to width/height", () => {
    expect(parseTrimBox(createSvg({ viewBox: "0 0 1500 1000", width: "1500", height: "1000" })))
      .toEqual({ x: 0, y: 0, width: 1500, height: 1000 });
    expect(parseTrimBox(createSvg({ viewBox: "10,20,30,40" }))).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    expect(parseTrimBox(createSvg({ width: "800px", height: "600px" })))
      .toEqual({ x: 0, y: 0, width: 800, height: 600 });
    expect(parseTrimBox(createSvg({}))).toBeNull();
    expect(parseTrimBox(createSvg({ viewBox: "bad" }))).toBeNull();
  });
});

describe("applyPrintBleedToSvg", () => {
  it("leaves the markup untouched without bleed", () => {
    const svg = createSvg({ viewBox: "0 0 1500 1000", width: "1500", height: "1000" });

    expect(applyPrintBleedToSvg(svg, { printBleedMm: 0 })).toBeNull();
    expect(svg.getAttribute("viewBox")).toBe("0 0 1500 1000");
    expect(svg.getAttribute("width")).toBe("1500");
    expect(svg.querySelector("[data-print-crop-marks]")).toBeNull();
  });

  it("expands viewBox, scales size attributes and appends crop marks", () => {
    const svg = createSvg({ viewBox: "0 0 1500 1000", width: "1500", height: "1000" });

    const geometry = applyPrintBleedToSvg(svg, { printBleedMm: 3 });

    expect(geometry).not.toBeNull();
    expect(svg.getAttribute("viewBox")).toBe(
      `${geometry!.media.x} ${geometry!.media.y} ${geometry!.media.width} ${geometry!.media.height}`,
    );
    expect(Number(svg.getAttribute("width"))).toBeCloseTo(geometry!.media.width, 3);
    expect(Number(svg.getAttribute("height"))).toBeCloseTo(geometry!.media.height, 3);
    const marks = svg.querySelector("[data-print-crop-marks]");
    expect(marks).not.toBeNull();
    expect(marks?.querySelector("path")?.getAttribute("d")?.match(/M /g)).toHaveLength(8);
  });

  it("keeps the unit suffix when scaling width/height", () => {
    const svg = createSvg({ viewBox: "0 0 1000 1000", width: "1000px", height: "1000px" });

    applyPrintBleedToSvg(svg, { printBleedMm: 3 });

    expect(svg.getAttribute("width")?.endsWith("px")).toBe(true);
    expect(Number.parseFloat(svg.getAttribute("width")!)).toBeGreaterThan(1000);
  });

  it("stretches the canvas background across the bleed box so trimming never shows paper", () => {
    const svg = createSvg({ viewBox: "0 0 1500 1000", width: "1500", height: "1000" });
    const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    background.setAttribute("data-canvas-background", "true");
    background.setAttribute("x", "0");
    background.setAttribute("y", "0");
    background.setAttribute("width", "1500");
    background.setAttribute("height", "1000");
    svg.appendChild(background);

    const geometry = applyPrintBleedToSvg(svg, { printBleedMm: 3 })!;

    expect(Number(background.getAttribute("x"))).toBeCloseTo(geometry.bleed.x, 4);
    expect(Number(background.getAttribute("width"))).toBeCloseTo(geometry.bleed.width, 4);
    expect(Number(background.getAttribute("height"))).toBeCloseTo(geometry.bleed.height, 4);
  });

  it("does nothing when the source svg has no measurable trim box", () => {
    const svg = createSvg({});
    expect(applyPrintBleedToSvg(svg, { printBleedMm: 3 })).toBeNull();
    expect(svg.getAttribute("viewBox")).toBeNull();
  });
});

describe("resolveBleedExportSize", () => {
  it("returns the scaled canvas size without bleed", () => {
    expect(resolveBleedExportSize({ width: 1500, height: 1000 })).toEqual({ width: 1500, height: 1000 });
    expect(resolveBleedExportSize({ width: 1500, height: 1000 }, { scale: 2 })).toEqual({ width: 3000, height: 2000 });
    expect(resolveBleedExportSize({ width: 1500, height: 1000 }, { scale: 0, printBleedMm: 0 }))
      .toEqual({ width: 1500, height: 1000 });
  });

  it("grows with bleed and stays consistent with the media box", () => {
    const geometry = resolvePrintBleedGeometry({ x: 0, y: 0, width: 1500, height: 1000 }, { printBleedMm: 3 });
    const size = resolveBleedExportSize({ width: 1500, height: 1000 }, { printBleedMm: 3, scale: 2 });

    expect(size.width).toBe(Math.round(geometry.media.width * 2));
    expect(size.height).toBe(Math.round(geometry.media.height * 2));
    expect(size.width).toBeGreaterThan(3000);
  });
});
