import { describe, expect, it } from "vitest";
import { checkLayoutHealth, type LayoutHealthInput } from "./layout-health";

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

  it("treats connectors that only meet at a shared geographic anchor as conflict free", () => {
    const anchor = { x: 260, y: 200 };
    const bouquet = (start: { x: number; y: number }, waypoint: { x: number; y: number }) => [
      { start, end: waypoint },
      { start: waypoint, end: anchor },
    ];
    const issues = checkLayoutHealth({
      canvas: { width: 500, height: 400, safeMargin: 16 },
      objects: [],
      connectors: [
        { id: "jiangsu-nanjing", segments: bouquet({ x: 120, y: 120 }, { x: 250, y: 190 }) },
        { id: "jiangsu-suzhou", segments: bouquet({ x: 120, y: 300 }, { x: 250, y: 210 }) },
      ],
    });

    expect(issues.filter((issue) => issue.kind === "connector-conflict")).toEqual([]);
  });

  it("skips card occlusion against the map when cards may overlap it", () => {
    const input: LayoutHealthInput = {
      canvas: { width: 600, height: 400, safeMargin: 10 },
      objects: [
        { id: "map", kind: "map", zIndex: 1, bounds: { x: 100, y: 60, width: 400, height: 280 } },
        { id: "card-a", kind: "card", zIndex: 3, bounds: { x: 200, y: 120, width: 120, height: 80 } },
        { id: "note", kind: "text", zIndex: 4, bounds: { x: 220, y: 140, width: 100, height: 40 } },
      ],
    };

    expect(checkLayoutHealth(input).filter((issue) => issue.kind === "occlusion").map((issue) => issue.id))
      .toEqual(["map:card-a", "map:note", "card-a:note"]);
    expect(checkLayoutHealth({ ...input, allowMapOverlap: true })
      .filter((issue) => issue.kind === "occlusion").map((issue) => issue.id))
      .toEqual(["map:note", "card-a:note"]);
  });

  it("judges map occlusion against province outlines instead of their union box", () => {
    // 省份轮廓只占联合 AABB 的左半边，右半边是海面与留白。
    const mapPolygons = [{
      rings: [[{ x: 100, y: 60 }, { x: 260, y: 60 }, { x: 260, y: 340 }, { x: 100, y: 340 }]],
      bounds: { x: 100, y: 60, width: 160, height: 280 },
    }];
    const input: LayoutHealthInput = {
      canvas: { width: 600, height: 400, safeMargin: 10 },
      mapPolygons,
      objects: [
        { id: "map", kind: "map", zIndex: 1, bounds: { x: 100, y: 60, width: 400, height: 280 } },
        { id: "over-sea", kind: "text", zIndex: 4, bounds: { x: 300, y: 80, width: 120, height: 40 } },
        { id: "over-land", kind: "text", zIndex: 4, bounds: { x: 160, y: 80, width: 120, height: 40 } },
      ],
    };

    expect(checkLayoutHealth(input).filter((issue) => issue.kind === "occlusion").map((issue) => issue.id))
      .toEqual(["map:over-land"]);
    // 没有轮廓（图片底图）时仍退回联合 AABB，行为与旧版一致。
    expect(checkLayoutHealth({ ...input, mapPolygons: [] })
      .filter((issue) => issue.kind === "occlusion").map((issue) => issue.id))
      .toEqual(["map:over-sea", "map:over-land"]);
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
