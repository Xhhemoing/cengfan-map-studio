import { describe, expect, it } from "vitest";
import { checkLayoutHealth } from "./layout-health";
import { buildProjectLayoutHealthInput } from "./layout-health-input";
import { createProjectDocument } from "./project-document";
import { createSampleProject } from "./project-store";

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

  it("treats the map as a backdrop instead of an occluded object", () => {
    const issues = checkLayoutHealth({
      canvas: { width: 500, height: 400, safeMargin: 8 },
      objects: [
        { id: "map", kind: "map", zIndex: 1, bounds: { x: 40, y: 40, width: 400, height: 300 } },
        { id: "title", kind: "text", zIndex: 40, bounds: { x: 60, y: 60, width: 160, height: 32 }, content: "标题" },
        { id: "card-a", kind: "card", zIndex: 10, bounds: { x: 100, y: 120, width: 120, height: 80 } },
        { id: "card-b", kind: "card", zIndex: 11, bounds: { x: 140, y: 150, width: 120, height: 80 } },
      ],
    });

    const occlusions = issues.filter((issue) => issue.kind === "occlusion");
    // 标题压在地图上是常态版式，两张卡片互相压才是要修的问题。
    expect(occlusions.map((issue) => issue.id)).toEqual(["card-a:card-b"]);
  });

  it("still reports the map when it is stacked in front of a card", () => {
    const issues = checkLayoutHealth({
      canvas: { width: 500, height: 400, safeMargin: 8 },
      objects: [
        { id: "card-a", kind: "card", zIndex: 10, bounds: { x: 100, y: 120, width: 120, height: 80 } },
        { id: "map", kind: "map", zIndex: 60, bounds: { x: 40, y: 40, width: 400, height: 300 } },
      ],
    });

    // 底图的豁免只对「地图在后面」成立：地图被抬到卡片前面就是真把卡片盖住了，得报。
    expect(issues.filter((issue) => issue.kind === "occlusion")).toEqual([
      expect.objectContaining({ id: "card-a:map", severity: "warning", detail: "map 遮挡了 card-a" }),
    ]);
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

describe("layout health of the documents we ship", () => {
  const documents = {
    示例工程: () => createSampleProject().pack.project,
    空白工程: () => createProjectDocument({ students: [], templateId: "original", dataView: "province" }),
  };

  for (const [label, build] of Object.entries(documents)) {
    // 默认版式把标题与卡片摆在地图上，卡片右缘也压着地图右缘。少了底图豁免，
    // 用户一打开就会看到一串永远不该修的遮挡告警，体检面板从此没人再信。
    it(`${label} 打开时没有一条牵扯到地图的遮挡告警`, () => {
      const occlusions = checkLayoutHealth(buildProjectLayoutHealthInput(build()))
        .filter((issue) => issue.kind === "occlusion");

      expect(occlusions.filter((issue) => issue.id.split(":").includes("map"))).toEqual([]);
      // 这两份文档现在整体也是干净的：真冒出卡片互压这类告警，这里会把它点名报出来。
      expect(occlusions).toEqual([]);
    });
  }
});
