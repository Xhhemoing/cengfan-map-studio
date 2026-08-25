import { describe, expect, it } from "vitest";
import { CARD_LAYOUT_MODES } from "./scene-document";
import { CARD_LAYOUT_MODE_OPTIONS, cardLayoutModeLabel } from "./card-layout-modes";

describe("card layout mode catalog", () => {
  it("covers every stored layout mode exactly once", () => {
    expect(CARD_LAYOUT_MODE_OPTIONS.map((option) => option.id)).toEqual([...CARD_LAYOUT_MODES]);
  });

  it("returns the inspector-facing label for a stored mode", () => {
    expect(cardLayoutModeLabel("quadrant")).toBe("四象限");
    expect(cardLayoutModeLabel("radial")).toBe("极角环绕");
  });
});
