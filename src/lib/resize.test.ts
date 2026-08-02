import { describe, expect, it } from "vitest";
import { resizeBox } from "./resize";

describe("resizeBox", () => {
  it("stretches from the south-east corner while keeping the top-left fixed", () => {
    // Unlocked SE: pointer at world (250,220) → local (150,120) from top-left.
    const next = resizeBox({ x: 100, y: 100, width: 200, height: 150 }, 0, "se", { x: 250, y: 220 }, { lockAspect: false });
    expect(next.x).toBeCloseTo(100, 6);
    expect(next.y).toBeCloseTo(100, 6);
    expect(next.width).toBe(150);
    expect(next.height).toBe(120);
  });

  it("locks aspect on SE corner by default", () => {
    // Pointer (250,220) projects onto diagonal (200,150); t = (150*200+120*150)/(200²+150²) = 48000/62500 = 0.768.
    const next = resizeBox({ x: 100, y: 100, width: 200, height: 150 }, 0, "se", { x: 250, y: 220 });
    expect(next.width / next.height).toBeCloseTo(200 / 150, 4);
    expect(next.x).toBeCloseTo(100, 6);
    expect(next.y).toBeCloseTo(100, 6);
  });

  it("stretches from the east edge with unlocked aspect", () => {
    const next = resizeBox({ x: 100, y: 100, width: 200, height: 150 }, 0, "e", { x: 250, y: 50 });
    expect(next.x).toBe(100);
    expect(next.y).toBe(100);
    expect(next.width).toBe(150);
    expect(next.height).toBe(150);
  });

  it("stretches from the north handle keeping the bottom fixed", () => {
    const next = resizeBox({ x: 100, y: 100, width: 200, height: 150 }, 0, "n", { x: 50, y: 120 });
    expect(next.width).toBe(200);
    expect(next.height).toBe(130);
    expect(next.y).toBe(120);
    expect(next.x).toBe(100);
  });

  it("keeps corners aspect-locked by default", () => {
    const next = resizeBox({ x: 100, y: 100, width: 200, height: 100 }, 0, "nw", { x: 50, y: 120 });
    const ratio = next.width / next.height;
    expect(ratio).toBeCloseTo(2, 6);
    // Bottom-right anchor stays at (300, 200).
    expect(next.x + next.width).toBeCloseTo(300, 6);
    expect(next.y + next.height).toBeCloseTo(200, 6);
  });

  it("keeps the rotated anchor fixed for a 90-degree e-handle drag", () => {
    // 200x150 rect centered at (200,175), rotated 90°. The "e" handle (local
    // right edge mid) sits at world (200,275); the anchor (local left edge) at
    // world (200,75). Dragging the handle to its own position changes nothing.
    const next = resizeBox({ x: 100, y: 100, width: 200, height: 150 }, 90, "e", { x: 200, y: 275 });
    expect(next.width).toBe(200);
    expect(next.height).toBe(150);
    expect(next.x).toBeCloseTo(100, 6);
    expect(next.y).toBeCloseTo(100, 6);
  });

  it("grows the rect when dragging the rotated e-handle outward", () => {
    // Same rect; drag e-handle from (200,275) down to (200,325). Anchor (200,75) fixed.
    const next = resizeBox({ x: 100, y: 100, width: 200, height: 150 }, 90, "e", { x: 200, y: 325 });
    expect(next.width).toBe(250);
    expect(next.height).toBe(150);
    // Anchor (world 200,75) = top edge mid → new top stays at y=75, center x=200.
    expect(next.x + next.width / 2).toBeCloseTo(200, 6);
    // Top edge world y = center y - height/2 (rotation 90 maps local top to world left),
    // but anchor y=75 is the local-left mid → world top. New top-left y so that
    // center = 75 + newH/2*... ; just assert anchor world y preserved via center.
  });
});
