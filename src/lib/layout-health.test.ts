import { describe, expect, it } from "vitest";
import { checkLayoutHealth } from "./layout-health";
import { mmToPx } from "./print-bleed";

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
      expect.objectContaining({ id: "safe-overflow", kind: "overflow", severity: "warning", targets: ["safe-overflow"] }),
      expect.objectContaining({ id: "outside", kind: "out-of-bounds", severity: "error", targets: ["outside"] }),
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
      expect.objectContaining({ id: "back:front", kind: "occlusion", targets: ["back", "front"] }),
      expect.objectContaining({ id: "title", kind: "unreadable-text", severity: "warning", targets: ["title"] }),
      // 这两条连接线没有 cardId，targets 退回连接线自身 id。
      expect.objectContaining({ id: "line-a:line-b", kind: "connector-conflict", targets: ["line-a", "line-b"] }),
    ]));
  });

  it("targets a connector conflict with the departure cards when the lines carry cardIds", () => {
    const issues = checkLayoutHealth({
      canvas: { width: 500, height: 400, safeMargin: 16 },
      objects: [],
      connectors: [
        { id: "connector-北京市", cardId: "北京市", segments: [{ start: { x: 20, y: 200 }, end: { x: 300, y: 200 } }] },
        { id: "connector-浙江省", cardId: "浙江省", segments: [{ start: { x: 160, y: 80 }, end: { x: 160, y: 300 } }] },
      ],
    });

    expect(issues.filter((issue) => issue.kind === "connector-conflict")).toEqual([
      expect.objectContaining({ id: "connector-北京市:connector-浙江省", targets: ["北京市", "浙江省"] }),
    ]);
  });

  it("reports two overlapping cards on the shared card layer, using paint order for front/back", () => {
    const issues = checkLayoutHealth({
      canvas: { width: 600, height: 480, safeMargin: 8 },
      objects: [
        { id: "card-a", kind: "card", zIndex: 30, bounds: { x: 100, y: 100, width: 200, height: 180 } },
        { id: "card-b", kind: "card", zIndex: 30, bounds: { x: 220, y: 200, width: 200, height: 180 } },
      ],
    });

    expect(issues.filter((issue) => issue.kind === "occlusion")).toEqual([
      expect.objectContaining({ id: "card-a:card-b", detail: "card-b 遮挡了 card-a" }),
    ]);
  });

  it("stays quiet about same-layer text and asset overlap, whose heights are only estimates", () => {
    const issues = checkLayoutHealth({
      canvas: { width: 600, height: 480, safeMargin: 8 },
      objects: [
        { id: "text-a", kind: "text", zIndex: 40, bounds: { x: 100, y: 100, width: 200, height: 40 } },
        { id: "text-b", kind: "text", zIndex: 40, bounds: { x: 120, y: 110, width: 200, height: 40 } },
        { id: "asset-a", kind: "asset", zIndex: 10, bounds: { x: 300, y: 300, width: 120, height: 120 } },
        { id: "asset-b", kind: "asset", zIndex: 10, bounds: { x: 340, y: 340, width: 120, height: 120 } },
        // Same layer as the texts, so the card/text pairs stay exempt too.
        { id: "card-over-text", kind: "card", zIndex: 40, bounds: { x: 110, y: 105, width: 120, height: 60 } },
        // A layer above, where the overlap is unambiguous and still reported.
        { id: "badge", kind: "asset", zIndex: 90, bounds: { x: 350, y: 350, width: 60, height: 60 } },
      ],
    });

    expect(issues.filter((issue) => issue.kind === "occlusion").map((issue) => issue.id))
      .toEqual(["asset-a:badge", "asset-b:badge"]);
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

  describe("connector crossing a card", () => {
    const canvas = { width: 900, height: 600, safeMargin: 8 };
    const card = (id: string, x: number, y: number) => ({
      id,
      kind: "card" as const,
      zIndex: 30,
      bounds: { x, y, width: 160, height: 80 },
    });

    it("reports a leader line that runs through a different card's body", () => {
      const issues = checkLayoutHealth({
        canvas,
        objects: [card("card-a", 60, 260), card("card-b", 360, 260)],
        connectors: [{
          id: "connector-card-a",
          cardId: "card-a",
          anchor: { x: 800, y: 300 },
          segments: [{ start: { x: 220, y: 300 }, end: { x: 800, y: 300 } }],
        }],
      });

      expect(issues.filter((issue) => issue.kind === "connector-crosses-card")).toEqual([
        expect.objectContaining({
          id: "connector-card-a:card-b",
          severity: "warning",
          detail: "card-a 的连接线从 card-b 上穿过",
          // 被穿的卡在前（要挪的对象），出发卡殿后兜底。
          targets: ["card-b", "card-a"],
        }),
      ]);
    });

    it("targets a cardless line by its own id after the crossed card", () => {
      const issues = checkLayoutHealth({
        canvas,
        objects: [card("card-b", 360, 260)],
        connectors: [{
          id: "free-line",
          segments: [{ start: { x: 220, y: 300 }, end: { x: 800, y: 300 } }],
        }],
      });

      expect(issues.filter((issue) => issue.kind === "connector-crosses-card")).toEqual([
        expect.objectContaining({ id: "free-line:card-b", targets: ["card-b", "free-line"] }),
      ]);
    });

    it("stays quiet when the line only grazes a corner of the other card", () => {
      // 45° 斜线从 (220,300) 升向 (500,20)，恰好削掉 card-b 左上角 2×2 的一块，
      // 卡内弦长不到 3px：画面上看不出线压在卡上，报出来只是噪声。
      const issues = checkLayoutHealth({
        canvas,
        objects: [card("card-a", 60, 260), card("card-b", 320, 198)],
        connectors: [{
          id: "connector-card-a",
          cardId: "card-a",
          anchor: { x: 500, y: 20 },
          segments: [{ start: { x: 220, y: 300 }, end: { x: 500, y: 20 } }],
        }],
      });

      expect(issues.filter((issue) => issue.kind === "connector-crosses-card")).toEqual([]);
    });

    it("stays quiet about the card the line starts from, even when it hugs that card's frame", () => {
      const issues = checkLayoutHealth({
        canvas,
        objects: [card("card-a", 60, 260)],
        connectors: [{
          id: "connector-card-a",
          cardId: "card-a",
          anchor: { x: 220, y: 100 },
          // 起点落在自己的右边框上，先贴着边框上行 60px 再离开。
          segments: [
            { start: { x: 220, y: 300 }, end: { x: 220, y: 240 } },
            { start: { x: 220, y: 240 }, end: { x: 220, y: 100 } },
          ],
        }],
      });

      expect(issues.filter((issue) => issue.kind === "connector-crosses-card")).toEqual([]);
    });

    it("exempts the bouquet zone where shared-anchor lines meet on top of a card", () => {
      const anchor = { x: 400, y: 300 };
      const bouquet = (anchorCardX: number) => checkLayoutHealth({
        canvas,
        // anchor-card 正压在共用锚点上，锚点落在它左边框内侧。
        objects: [card("far-card", 60, 260), card("anchor-card", anchorCardX, 260)],
        connectors: [
          { id: "connector-far-card", cardId: "far-card", anchor, segments: [{ start: { x: 220, y: 300 }, end: anchor }] },
          { id: "connector-anchor-card", cardId: "anchor-card", anchor, segments: [{ start: { x: anchorCardX, y: 300 }, end: anchor }] },
        ],
      }).filter((issue) => issue.kind === "connector-crosses-card");

      // 锚点在 anchor-card 内 10px：far-card 的引线只在豁免圈里蹭到它。
      expect(bouquet(390)).toEqual([]);
      // 同一束、同一个锚点，但 anchor-card 向左挪到锚点内 80px：豁免圈之外还有
      // 56px 实打实压在卡身上，仍要报。豁免的是半径，不是「共锚点」这个身份。
      expect(bouquet(320)).toEqual([
        expect.objectContaining({ id: "connector-far-card:anchor-card" }),
      ]);
    });

    it("reports a line that runs along another card's frame, whose bounding box is flat", () => {
      // 引线贴着 card-b 左边框竖直走 60px：包围盒零宽，粗筛不能把它当成够不着。
      const issues = checkLayoutHealth({
        canvas,
        objects: [card("card-a", 60, 60), card("card-b", 360, 260)],
        connectors: [{
          id: "connector-card-a",
          cardId: "card-a",
          anchor: { x: 360, y: 420 },
          segments: [{ start: { x: 360, y: 140 }, end: { x: 360, y: 420 } }],
        }],
      });

      expect(issues.filter((issue) => issue.kind === "connector-crosses-card").map((issue) => issue.id))
        .toEqual(["connector-card-a:card-b"]);
    });

    it("skips hidden cards and hidden connectors", () => {
      const crossing = {
        id: "connector-card-a",
        cardId: "card-a",
        anchor: { x: 800, y: 300 },
        segments: [{ start: { x: 220, y: 300 }, end: { x: 800, y: 300 } }],
      };

      expect(checkLayoutHealth({
        canvas,
        objects: [card("card-a", 60, 260), { ...card("card-b", 360, 260), visible: false }],
        connectors: [crossing],
      }).filter((issue) => issue.kind === "connector-crosses-card")).toEqual([]);

      expect(checkLayoutHealth({
        canvas,
        objects: [card("card-a", 60, 260), card("card-b", 360, 260)],
        connectors: [{ ...crossing, visible: false }],
      }).filter((issue) => issue.kind === "connector-crosses-card")).toEqual([]);
    });

    it("measures the card against its manual position, like every other check", () => {
      const issues = checkLayoutHealth({
        canvas,
        cardsPositions: { "card-b": { x: 360, y: 260 } },
        objects: [
          card("card-a", 60, 260),
          { ...card("card-b", 0, 0), positionKey: "card-b" },
        ],
        connectors: [{
          id: "connector-card-a",
          cardId: "card-a",
          anchor: { x: 800, y: 300 },
          segments: [{ start: { x: 220, y: 300 }, end: { x: 800, y: 300 } }],
        }],
      });

      expect(issues.filter((issue) => issue.kind === "connector-crosses-card").map((issue) => issue.id))
        .toEqual(["connector-card-a:card-b"]);
    });
  });

  describe("print bleed", () => {
    it("warns about cards and text that sit in the bleed or crowd the trim box", () => {
      expect(mmToPx(3)).toBeCloseTo(11.339, 3);

      const issues = checkLayoutHealth({
        canvas: { width: 400, height: 300, safeMargin: 0, printBleedMm: 3 },
        objects: [
          { id: "bleeding-card", kind: "card", bounds: { x: -6, y: 40, width: 120, height: 80 } },
          { id: "edge-title", kind: "text", bounds: { x: 0, y: 200, width: 80, height: 24 } },
          { id: "inside-card", kind: "card", bounds: { x: 150, y: 120, width: 100, height: 60 } },
          { id: "full-bleed-map", kind: "map", bounds: { x: 0, y: 0, width: 400, height: 300 } },
        ],
      });

      const bleedIssues = issues.filter((issue) => issue.kind === "object-in-bleed");
      expect(bleedIssues.map((issue) => issue.id)).toEqual(["bleeding-card", "edge-title"]);
      expect(bleedIssues.every((issue) => issue.severity === "warning")).toBe(true);
      expect(bleedIssues[0]?.detail).toContain("出血区");
      expect(bleedIssues[1]?.detail).toContain("距裁切线不足 3mm");
    });

    it("keeps quiet when no bleed is configured or the object clears the trim box", () => {
      const objects = [
        { id: "edge-card", kind: "card" as const, bounds: { x: 0, y: 0, width: 120, height: 80 } },
      ];

      expect(checkLayoutHealth({ canvas: { width: 400, height: 300 }, objects })
        .some((issue) => issue.kind === "object-in-bleed")).toBe(false);
      expect(checkLayoutHealth({ canvas: { width: 400, height: 300, printBleedMm: 0 }, objects })
        .some((issue) => issue.kind === "object-in-bleed")).toBe(false);
      expect(checkLayoutHealth({
        canvas: { width: 400, height: 300, printBleedMm: 3 },
        objects: [{ id: "inside-card", kind: "card", bounds: { x: 60, y: 60, width: 120, height: 80 } }],
      })).toEqual([]);
    });
  });
});
