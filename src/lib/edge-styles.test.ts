import { describe, expect, it } from "vitest";
import {
  EDGE_STYLES,
  normalizeEdgeStyle,
  resolveEdgeStyle,
} from "./edge-styles";

describe("edge styles", () => {
  it("normalizes known and unknown edge styles", () => {
    expect(normalizeEdgeStyle("wave")).toBe("wave");
    expect(normalizeEdgeStyle("nope")).toBe("solid");
    expect(EDGE_STYLES).toContain("soft-glow");
    expect(EDGE_STYLES).toContain("ornament");
  });

  it("builds multi-layer strokes for decorative borders", () => {
    const double = resolveEdgeStyle({ style: "double", color: "#215d75", width: 2 });
    expect(double.underlays.length).toBe(1);
    expect(double.strokes.length).toBe(1);
    expect(double.underlays[0]!.width).toBeGreaterThan(double.strokes[0]!.width);

    const glow = resolveEdgeStyle({ style: "soft-glow", color: "#c95c49", width: 1.5, filterPrefix: "test" });
    expect(glow.filters[0]?.id).toBe("test-soft-glow");
    expect(glow.underlays[0]?.filter).toContain("test-soft-glow");

    const stitch = resolveEdgeStyle({ style: "stitch", color: "#456", width: 1 });
    expect(stitch.strokes[0]?.dasharray).toBeTruthy();
  });

  it("returns no strokes when width is zero", () => {
    expect(resolveEdgeStyle({ style: "solid", color: "#000", width: 0 }).strokes).toEqual([]);
  });
});
