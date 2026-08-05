import { describe, expect, it } from "vitest";
import { checkLayoutHealth } from "./layout-health";

describe("layout health", () => {
  it("reports visible objects that overflow the safe area or leave the canvas", () => {
    const issues = checkLayoutHealth({
      canvas: { width: 400, height: 300, safeMargin: 20 },
      objects: [
        { id: "safe-overflow", kind: "card", bounds: { x: 10, y: 40, width: 80, height: 60 } },
        { id: "outside", kind: "asset", bounds: { x: 370, y: 260, width: 60, height: 60 } },
      ],
    });

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "safe-overflow", kind: "overflow", severity: "warning" }),
      expect.objectContaining({ id: "outside", kind: "out-of-bounds", severity: "error" }),
    ]));
  });

  it("reports object occlusion, unreadable text, and connector conflicts with stable ids", () => {
    const issues = checkLayoutHealth({
      canvas: { width: 500, height: 400, safeMargin: 16 },
      objects: [
        { id: "back", kind: "asset", zIndex: 1, bounds: { x: 120, y: 120, width: 120, height: 80 } },
        { id: "front", kind: "card", zIndex: 2, bounds: { x: 150, y: 140, width: 120, height: 80 } },
        { id: "title", kind: "text", bounds: { x: 24, y: 24, width: 120, height: 28 }, content: "标题", textColor: "#777777", backgroundColor: "#808080" },
      ],
      connectors: [
        { id: "line-a", segments: [{ start: { x: 20, y: 200 }, end: { x: 300, y: 200 } }] },
        { id: "line-b", segments: [{ start: { x: 160, y: 80 }, end: { x: 160, y: 300 } }] },
      ],
    });

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "back:front", kind: "occlusion" }),
      expect.objectContaining({ id: "title", kind: "unreadable-text", severity: "warning" }),
      expect.objectContaining({ id: "line-a:line-b", kind: "connector-conflict" }),
    ]));
  });

  it("uses cards.positions as the stable manual position selector", () => {
    const issues = checkLayoutHealth({
      canvas: { width: 300, height: 240, safeMargin: 12 },
      cardsPositions: { "card-a": { x: 280, y: 180 } },
      objects: [
        { id: "card-a", kind: "card", positionKey: "card-a", bounds: { x: 0, y: 0, width: 40, height: 40 } },
      ],
    });

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "card-a", kind: "out-of-bounds" }),
    ]));
  });
});
