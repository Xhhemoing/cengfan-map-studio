import { describe, expect, it } from "vitest";
import {
  CARD_LAYOUT_MODES,
  createDefaultScene,
  normalizeLayoutMode,
  normalizeScene,
} from "./scene-document";

describe("card layout settings in the scene document", () => {
  it("protects the other canvas elements from cards by default, including legacy projects", () => {
    const scene = createDefaultScene("original");

    expect(scene.cards.allowElementOverlap).toBe(false);
    // A project saved before the field existed must keep avoiding those elements
    // rather than suddenly start covering them.
    const legacy = { ...scene, cards: { ...scene.cards } };
    delete legacy.cards.allowElementOverlap;
    expect(normalizeScene(legacy).cards.allowElementOverlap).toBe(false);
    expect(normalizeScene({
      ...scene,
      cards: { ...scene.cards, allowElementOverlap: "yes" as never },
    }).cards.allowElementOverlap).toBe(false);
    expect(normalizeScene({
      ...scene,
      cards: { ...scene.cards, allowElementOverlap: true },
    }).cards.allowElementOverlap).toBe(true);
  });

  it("accepts the proximity and columns layout modes while keeping the legacy fallback", () => {
    const scene = createDefaultScene("original");

    expect(CARD_LAYOUT_MODES).toEqual(["proximity", "columns", "quadrant", "radial", "right-stack", "grid"]);
    for (const mode of CARD_LAYOUT_MODES) {
      expect(normalizeScene({ ...scene, cards: { ...scene.cards, layoutMode: mode } }).cards.layoutMode).toBe(mode);
    }
    expect(normalizeLayoutMode("spiral")).toBe("quadrant");
    expect(normalizeLayoutMode(undefined)).toBe("quadrant");
    // The default must not move: an old poster reopened after this change keeps its layout.
    expect(scene.cards.layoutMode).toBe("quadrant");
  });
});
