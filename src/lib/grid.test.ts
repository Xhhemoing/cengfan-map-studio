import { describe, expect, it } from "vitest";
import {
  CANVAS_SIZE_PRESETS,
  clampGridSize,
  fitZoomPercent,
  snapPoint,
  snapToGrid,
} from "./grid";

describe("grid helpers", () => {
  it("snaps coordinates to the nearest grid intersection", () => {
    expect(snapToGrid(27, 20)).toBe(20);
    expect(snapToGrid(31, 20)).toBe(40);
    expect(snapPoint({ x: 14, y: 46 }, 20)).toEqual({ x: 20, y: 40 });
  });

  it("clamps grid size into a usable editor range", () => {
    expect(clampGridSize(2)).toBe(4);
    expect(clampGridSize(999)).toBe(200);
    expect(clampGridSize("abc")).toBe(20);
  });

  it("provides stable canvas size presets", () => {
    expect(CANVAS_SIZE_PRESETS.some((item) => item.width === 1500 && item.height === 1000)).toBe(true);
    expect(CANVAS_SIZE_PRESETS.some((item) => item.id === "a3-150" && item.label.includes("A3"))).toBe(true);
    expect(CANVAS_SIZE_PRESETS.some((item) => item.id === "board-90x60")).toBe(true);
    expect(CANVAS_SIZE_PRESETS.every((item) => item.width >= 320 && item.height >= 320 && item.width <= 6000)).toBe(true);
  });

  it("computes a fit zoom that keeps the canvas inside the stage", () => {
    expect(fitZoomPercent({
      stageWidth: 800,
      stageHeight: 600,
      canvasWidth: 1500,
      canvasHeight: 1000,
      padding: 40,
    })).toBe(50);
  });
});
