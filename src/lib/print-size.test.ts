import { describe, expect, it } from "vitest";
import {
  NAMED_PRINT_SIZES,
  describeExportPrintHint,
  describePhysicalSize,
  formatCentimeters,
  matchNamedPrintSize,
  mmToPx,
  printSizeToPixels,
  pxToMm,
} from "./print-size";

describe("print-size helpers", () => {
  it("converts millimetres and pixels at a given DPI", () => {
    expect(mmToPx(25.4, 150)).toBe(150);
    expect(pxToMm(150, 150)).toBeCloseTo(25.4);
    expect(mmToPx(Number.NaN, 150)).toBe(0);
    expect(pxToMm(100, 0)).toBe(0);
  });

  it("formats centimetres without trailing noise", () => {
    expect(formatCentimeters(420)).toBe("42");
    expect(formatCentimeters(297)).toBe("29.7");
    expect(formatCentimeters(Number.NaN)).toBe("0");
  });

  it("keeps named print sizes inside the editor canvas limit", () => {
    for (const size of NAMED_PRINT_SIZES) {
      const pixels = printSizeToPixels(size);
      expect(pixels.width).toBeGreaterThanOrEqual(320);
      expect(pixels.height).toBeGreaterThanOrEqual(320);
      expect(pixels.width).toBeLessThanOrEqual(6000);
      expect(pixels.height).toBeLessThanOrEqual(6000);
      expect(matchNamedPrintSize(pixels.width, pixels.height)?.id).toBe(size.id);
    }
  });

  it("describes A3 in print-shop language", () => {
    const a3 = printSizeToPixels(NAMED_PRINT_SIZES[0]!);
    expect(describePhysicalSize(a3.width, a3.height)).toBe("A3 横版展板 · 42 × 29.7 cm @ 150dpi");
  });

  it("describes scaled export pixels when the canvas is not a named print size", () => {
    expect(describeExportPrintHint(1500, 1000, 2)).toBe("约合印刷：50.8 × 33.9 cm @ 150dpi");
    expect(describeExportPrintHint(1500, 1000, Number.NaN)).toBe("约合印刷：25.4 × 16.9 cm @ 150dpi");
  });
});
