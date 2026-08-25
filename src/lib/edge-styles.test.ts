import { describe, expect, it } from "vitest";
import {
  EDGE_STYLES,
  normalizeEdgeStyle,
  resolveEdgeStyle,
  scopeEdgeStyleFilters,
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

describe("scopeEdgeStyleFilters", () => {
  const glow = () => resolveEdgeStyle({ style: "soft-glow", color: "#c95c49", width: 1.5, filterPrefix: "connector-edge" });

  it("gives each scope its own filter id and rewrites the references to it", () => {
    const first = scopeEdgeStyleFilters(glow(), "a1");
    const second = scopeEdgeStyleFilters(glow(), "b2");

    expect(first.filters[0]!.id).toBe("connector-edge-soft-glow-a1");
    expect(second.filters[0]!.id).toBe("connector-edge-soft-glow-b2");
    expect(first.underlays[0]!.filter).toBe("url(#connector-edge-soft-glow-a1)");
    expect(second.underlays[0]!.filter).toBe("url(#connector-edge-soft-glow-b2)");
    expect(first.filters[0]!.markupKey).toBe("soft-glow");
  });

  it("keeps every visual property identical to the unscoped style", () => {
    const plain = glow();
    const scoped = scopeEdgeStyleFilters(plain, "a1");

    expect(scoped.id).toBe(plain.id);
    expect({ ...scoped.underlays[0]!, filter: undefined }).toEqual({ ...plain.underlays[0]!, filter: undefined });
    expect(scoped.strokes).toEqual(plain.strokes);
  });

  it("rewrites both filters of a style that needs more than one", () => {
    const ink = scopeEdgeStyleFilters(
      resolveEdgeStyle({ style: "ink", color: "#222", width: 2, filterPrefix: "connector-edge" }),
      "c3",
    );
    expect(ink.filters.map((filter) => filter.id)).toEqual(["connector-edge-ink-c3"]);
    expect(ink.underlays[0]!.filter).toBe("url(#connector-edge-ink-c3)");
  });

  it("strips characters that would break SVG serialization or a url(#…) lookup", () => {
    // React 19's useId returns tokens like «r0», which are not valid XML names.
    const scoped = scopeEdgeStyleFilters(glow(), "«r0»");
    expect(scoped.filters[0]!.id).toBe("connector-edge-soft-glow-r0");
    expect(scoped.underlays[0]!.filter).toBe("url(#connector-edge-soft-glow-r0)");
  });

  it("returns the input untouched when there is no filter or no usable scope", () => {
    const dashed = resolveEdgeStyle({ style: "dashed", color: "#39434e", width: 2 });
    expect(scopeEdgeStyleFilters(dashed, "a1")).toBe(dashed);

    const plain = glow();
    expect(scopeEdgeStyleFilters(plain, "")).toBe(plain);
    expect(scopeEdgeStyleFilters(plain, "«»")).toBe(plain);
  });
});
