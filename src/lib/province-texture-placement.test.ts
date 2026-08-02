import { describe, expect, it } from "vitest";
import {
  resolveProvinceTexturePlacements,
  textureRectsOverlap,
  type ProvinceTexturePlacement,
} from "./province-texture-placement";

const placement = (
  id: string,
  x: number,
  y: number,
  width = 60,
  height = 40,
): ProvinceTexturePlacement => ({
  id,
  anchor: [x + width / 2, y + height / 2],
  rect: { x, y, width, height },
});

describe("province texture placement", () => {
  it("moves nearby texture boxes to deterministic non-overlapping positions", () => {
    const input = [
      placement("a", 20, 20),
      placement("b", 45, 30),
      placement("c", 35, 55),
    ];

    const resolved = resolveProvinceTexturePlacements(input, {
      x: 0,
      y: 0,
      width: 220,
      height: 160,
    });

    expect(resolved.find((item) => item.id === "a")?.rect).toEqual(input[0]?.rect);
    for (let index = 0; index < resolved.length; index += 1) {
      const item = resolved[index]!;
      expect(item.rect.x).toBeGreaterThanOrEqual(0);
      expect(item.rect.y).toBeGreaterThanOrEqual(0);
      expect(item.rect.x + item.rect.width).toBeLessThanOrEqual(220);
      expect(item.rect.y + item.rect.height).toBeLessThanOrEqual(160);
      for (let other = index + 1; other < resolved.length; other += 1) {
        expect(textureRectsOverlap(item.rect, resolved[other]!.rect, 4)).toBe(false);
      }
    }
    expect(resolved.some((item) => item.adjusted)).toBe(true);
  });

  it("produces the same placement for each id regardless of input order", () => {
    const input = [
      placement("c", 35, 55),
      placement("a", 20, 20),
      placement("b", 45, 30),
    ];
    const bounds = { x: 0, y: 0, width: 220, height: 160 };

    const forward = resolveProvinceTexturePlacements(input, bounds);
    const reverse = resolveProvinceTexturePlacements([...input].reverse(), bounds);
    const byId = (items: typeof forward) => Object.fromEntries(items.map((item) => [item.id, item.rect]));

    expect(byId(forward)).toEqual(byId(reverse));
  });

  it("keeps a manually positioned overflow texture fixed while automatic textures avoid it", () => {
    const manual = { ...placement("manual", 45, 30), fixed: true };
    const automatic = placement("automatic", 35, 25);

    const resolved = resolveProvinceTexturePlacements([automatic, manual], {
      x: 0,
      y: 0,
      width: 180,
      height: 120,
    });
    const resolvedManual = resolved.find((item) => item.id === "manual")!;
    const resolvedAutomatic = resolved.find((item) => item.id === "automatic")!;

    expect(resolvedManual.rect).toEqual(manual.rect);
    expect(resolvedManual.adjusted).toBe(false);
    expect(textureRectsOverlap(resolvedManual.rect, resolvedAutomatic.rect, 4)).toBe(false);
  });

  it("keeps clipped textures out of overflow avoidance", () => {
    const clipped = { ...placement("clipped", 20, 20), avoidOverlap: false };
    const overflow = placement("overflow", 30, 25);

    const resolved = resolveProvinceTexturePlacements([clipped, overflow], {
      x: 0,
      y: 0,
      width: 180,
      height: 120,
    });

    expect(resolved.find((item) => item.id === "clipped")?.rect).toEqual(clipped.rect);
    expect(resolved.find((item) => item.id === "clipped")?.adjusted).toBe(false);
    expect(resolved.find((item) => item.id === "overflow")?.rect).toEqual(overflow.rect);
    expect(resolved.find((item) => item.id === "overflow")?.adjusted).toBe(false);
  });
});
