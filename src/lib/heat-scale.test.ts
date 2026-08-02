import { describe, expect, it } from "vitest";
import {
  DEFAULT_HEAT_SCALE,
  heatColorForCount,
  heatPreviewSteps,
  normalizeHeatScale,
} from "./heat-scale";

describe("heat scale", () => {
  it("normalizes a reversed depth range while retaining selected colors", () => {
    expect(normalizeHeatScale({
      minDepth: 12,
      maxDepth: 3,
      lowColor: "#dfeeff",
      highColor: "#174a7c",
    })).toEqual({
      minDepth: 3,
      maxDepth: 12,
      lowColor: "#dfeeff",
      highColor: "#174a7c",
    });
  });

  it("clamps heat colors at configured endpoints and interpolates within them", () => {
    const scale = { minDepth: 2, maxDepth: 10, lowColor: "#dceeff", highColor: "#174a7c" };

    expect(heatColorForCount(1, scale)).toBe("#dceeff");
    expect(heatColorForCount(6, scale)).toBe("#7a9cbe");
    expect(heatColorForCount(12, scale)).toBe("#174a7c");
  });

  it("provides a five-step preview spanning the active depth range", () => {
    const steps = heatPreviewSteps({ minDepth: 2, maxDepth: 10, lowColor: "#dceeff", highColor: "#174a7c" });

    expect(steps).toHaveLength(5);
    expect(steps[0]).toEqual({ depth: 2, color: "#dceeff" });
    expect(steps[4]).toEqual({ depth: 10, color: "#174a7c" });
  });

  it("uses the stable default scale for incomplete input", () => {
    expect(normalizeHeatScale(undefined)).toEqual(DEFAULT_HEAT_SCALE);
  });
});
