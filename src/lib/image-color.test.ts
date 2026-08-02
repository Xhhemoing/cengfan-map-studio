import { describe, expect, it } from "vitest";
import {
  inferImageTheme,
  optimizeNeighborThemeColors,
  representativeImageColor,
} from "./image-color";

function solidImage(
  width: number,
  height: number,
  color: [number, number, number, number],
): Uint8ClampedArray {
  return new Uint8ClampedArray(Array.from({ length: width * height }, () => color).flat());
}

function setPixel(
  pixels: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  color: [number, number, number, number],
) {
  pixels.set(color, (y * width + x) * 4);
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)) as [number, number, number];
}

describe("representativeImageColor", () => {
  it("averages visible image pixels while ignoring transparent background", () => {
    const pixels = new Uint8ClampedArray([
      240, 40, 20, 255,
      220, 60, 40, 255,
      255, 255, 255, 0,
      0, 0, 0, 0,
    ]);

    expect(representativeImageColor(pixels)).toBe("#e6321e");
  });
});

describe("inferImageTheme", () => {
  it("derives a subtle province background from a saturated transparent sticker", () => {
    const pixels = solidImage(10, 10, [0, 0, 0, 0]);
    for (let y = 2; y < 8; y += 1) {
      for (let x = 2; x < 8; x += 1) setPixel(pixels, 10, x, y, [224, 48, 36, 255]);
    }
    for (let x = 2; x < 8; x += 1) {
      setPixel(pixels, 10, x, 2, [32, 28, 26, 255]);
      setPixel(pixels, 10, x, 7, [32, 28, 26, 255]);
    }

    const theme = inferImageTheme(pixels, 10, 10);
    const background = rgb(theme.backgroundColor);

    expect(theme.identityColor).not.toBeNull();
    expect(theme.backgroundColor).not.toBe(theme.identityColor);
    expect(background.every((channel) => channel >= 180)).toBe(true);
    expect(theme.confidence).toBeGreaterThan(0.3);
    expect(theme.diagnostics.fallbackUsed).not.toBe(true);
  });

  it("ignores boundary-connected white backgrounds when choosing the identity color", () => {
    const pixels = solidImage(12, 12, [255, 255, 255, 255]);
    for (let y = 3; y < 9; y += 1) {
      for (let x = 3; x < 9; x += 1) setPixel(pixels, 12, x, y, [34, 104, 210, 255]);
    }

    const theme = inferImageTheme(pixels, 12, 12);
    const identity = rgb(theme.identityColor!);

    expect(identity[2]).toBeGreaterThan(identity[0] + 60);
    expect(theme.backgroundColor).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("ignores a low-chroma colored JPG-style border background", () => {
    const pixels = solidImage(12, 12, [232, 222, 202, 255]);
    for (let y = 3; y < 9; y += 1) {
      for (let x = 3; x < 9; x += 1) setPixel(pixels, 12, x, y, [76, 166, 82, 255]);
    }

    const theme = inferImageTheme(pixels, 12, 12);
    const identity = rgb(theme.identityColor!);

    expect(identity[1]).toBeGreaterThan(identity[0] + 50);
    expect(theme.diagnostics.fallbackUsed).not.toBe(true);
  });

  it("uses a conservative fallback when foreground pixels are insufficient", () => {
    const pixels = solidImage(8, 8, [0, 0, 0, 0]);
    setPixel(pixels, 8, 4, 4, [220, 40, 30, 255]);

    const theme = inferImageTheme(pixels, 8, 8, {
      mapBaseColor: "#d6d3c2",
      posterBackground: "#fff9ed",
    });

    expect(theme.confidence).toBe(0);
    expect(theme.diagnostics.fallbackUsed).toBe(true);
    expect(theme.backgroundColor).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("optimizeNeighborThemeColors", () => {
  it("moves only the lower-confidence province away from a colliding neighbor", () => {
    const base = {
      primaryColor: "#cc3344",
      identityColor: "#cc3344",
      supportingColor: "#336699",
      backgroundColor: "#f4dfe1",
      outlineColor: "#8c7376",
      haloColor: "#fff9ed",
      diagnostics: {},
    };
    const optimized = optimizeNeighborThemeColors({
      北京市: { ...base, confidence: 0.9 },
      河北省: { ...base, confidence: 0.45 },
    }, { 北京市: ["河北省"], 河北省: ["北京市"] });

    expect(optimized.北京市.backgroundColor).toBe("#f4dfe1");
    expect(optimized.河北省.backgroundColor).not.toBe("#f4dfe1");
    expect(optimized.河北省.diagnostics.neighborAdjusted).toBe(true);
  });
});