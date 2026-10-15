import { describe, expect, it } from "vitest";
import { checkLayoutHealth } from "./layout-health";

describe("layout health card contrast", () => {
  const card = {
    id: "card-a",
    kind: "card" as const,
    bounds: { x: 10, y: 10, width: 120, height: 60 },
    content: "北京",
    textColor: "#ffffff",
    backgroundColor: "#ffffff",
  };

  it("checks contrast when the card surface is opaque and known", () => {
    expect(checkLayoutHealth({ canvas: { width: 200, height: 100 }, objects: [card] }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: "card-a", kind: "unreadable-text" })]));
  });

  it("does not guess a map composite for a translucent card", () => {
    expect(checkLayoutHealth({ canvas: { width: 200, height: 100 }, objects: [{ ...card, opacity: 0.92 }] }))
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ id: "card-a", kind: "unreadable-text" })]));
  });
});
