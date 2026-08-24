import { describe, expect, it } from "vitest";
import {
  buildContentLayoutInput,
  CONNECTOR_ANCHOR_EXEMPT_RADIUS,
  estimateDestinationCardLayouts,
  listContentLayoutIssues,
  trimSegmentsNearAnchor,
} from "./content-layout-objects";
import { listContentLayoutIssues as facadeListContentLayoutIssues } from "./studio-editor-helpers";
import { createProjectDocument, type ProjectDocument } from "./project-document";
import type { Student } from "./project-data";

let studentSequence = 0;

function student(province: string, city: string, university: string): Student {
  studentSequence += 1;
  return {
    id: `student-${studentSequence}`,
    name: `学生${studentSequence}`,
    university,
    city,
    province,
    visibility: true,
  };
}

/** 默认「original」模板：画布 1500×1000、安全边距 48、地图 (350,120,800,690)。 */
function projectWith(students: Student[]): ProjectDocument {
  return createProjectDocument({ students, templateId: "original", dataView: "province" });
}

const beijingStudent = () => student("北京市", "北京市", "北京大学");
const zhejiangStudents = (count: number) =>
  Array.from({ length: count }, (_, index) => student("浙江省", "杭州市", `大学${index}`));

/** 地图围绕自身中心缩放，中心 (350+400, 120+345) 是缩放不动点。 */
const MAP_CENTER = { x: 750, y: 465 };

describe("estimateDestinationCardLayouts", () => {
  it("measures per-card heights from real row wrapping instead of a blanket 180", () => {
    const project = projectWith([beijingStudent(), ...zhejiangStudents(6)]);
    const cards = estimateDestinationCardLayouts(project);
    const beijing = cards.find((card) => card.group.key === "北京市")!;
    const zhejiang = cards.find((card) => card.group.key === "浙江省")!;

    // 1 个城市小标题 + 1 行院校：44 + 2×20 + 12 = 96（与渲染用 destinationHeight 一致）。
    expect(beijing.height).toBe(96);
    // 1 个城市小标题 + 6 行院校：44 + 7×20 + 12 = 196。
    expect(zhejiang.height).toBe(196);
    expect(beijing.width).toBe(project.cards.maxWidth);
  });

  it("anchors every card at the scale-invariant map center without geojson", () => {
    const project = projectWith([beijingStudent()]);
    project.map = { ...project.map, scale: 2 };
    const [card] = estimateDestinationCardLayouts(project);
    expect(card!.anchorX).toBe(MAP_CENTER.x);
    expect(card!.anchorY).toBe(MAP_CENTER.y);
  });

  it("returns nothing when the canvas renders no destination cards", () => {
    const pinsProject = projectWith([beijingStudent()]);
    pinsProject.dataView = "pins";
    expect(estimateDestinationCardLayouts(pinsProject)).toEqual([]);

    const noFieldsProject = projectWith([beijingStudent()]);
    noFieldsProject.cards = { ...noFieldsProject.cards, visibleFields: [] };
    expect(estimateDestinationCardLayouts(noFieldsProject)).toEqual([]);
  });
});

describe("trimSegmentsNearAnchor", () => {
  const anchor = { x: 0, y: 0 };

  it("keeps outside segments, clips the crossing one at the circle and drops inside ones", () => {
    const trimmed = trimSegmentsNearAnchor([
      { start: { x: 100, y: 0 }, end: { x: 30, y: 0 } },
      { start: { x: 30, y: 0 }, end: { x: 10, y: 0 } },
      { start: { x: 10, y: 0 }, end: { x: 0, y: 0 } },
    ], anchor, 24);

    expect(trimmed).toHaveLength(2);
    expect(trimmed[0]).toEqual({ start: { x: 100, y: 0 }, end: { x: 30, y: 0 } });
    expect(trimmed[1]!.start).toEqual({ x: 30, y: 0 });
    expect(trimmed[1]!.end.x).toBeCloseTo(24, 6);
    expect(trimmed[1]!.end.y).toBeCloseTo(0, 6);
  });

  it("clips a segment leaving the anchor zone at its exit point", () => {
    const trimmed = trimSegmentsNearAnchor([{ start: { x: 6, y: 0 }, end: { x: 60, y: 0 } }], anchor, 24);
    expect(trimmed).toHaveLength(1);
    expect(trimmed[0]!.start.x).toBeCloseTo(24, 6);
    expect(trimmed[0]!.end).toEqual({ x: 60, y: 0 });
  });

  it("drops a connector that lives entirely inside the anchor zone", () => {
    expect(trimSegmentsNearAnchor([{ start: { x: 5, y: 5 }, end: { x: 0, y: 0 } }], anchor, 24)).toEqual([]);
  });
});

describe("buildContentLayoutInput", () => {
  it("gives placed cards their manual position, measured size and one connector each", () => {
    const project = projectWith([beijingStudent(), ...zhejiangStudents(6)]);
    project.cards = {
      ...project.cards,
      positions: { 北京市: { x: 100, y: 200 }, 浙江省: { x: 400, y: 700 }, 幽灵省: { x: 5, y: 5 } },
    };

    const { objects, connectors } = buildContentLayoutInput(project);
    const cardObjects = objects.filter((object) => object.kind === "card");
    // 「幽灵省」在画布上没有对应卡片（分组不存在），不参与体检；汇总占位块也不再出现。
    expect(cardObjects.map((object) => object.id).sort()).toEqual(["北京市", "浙江省"]);

    const beijing = cardObjects.find((object) => object.id === "北京市")!;
    expect(beijing.positionKey).toBe("北京市");
    expect(beijing.bounds).toEqual({ x: 100, y: 200, width: 220, height: 96 });
    const zhejiang = cardObjects.find((object) => object.id === "浙江省")!;
    expect(zhejiang.bounds).toEqual({ x: 400, y: 700, width: 220, height: 196 });

    expect(connectors.map((connector) => connector.id).sort()).toEqual(["connector-北京市", "connector-浙江省"]);
    // 锚点端已按共锚点豁免半径裁剪，任何端点都不落入地图锚点的豁免圈内。
    for (const connector of connectors) {
      for (const segment of connector.segments) {
        for (const point of [segment.start, segment.end]) {
          const distance = Math.hypot(point.x - MAP_CENTER.x, point.y - MAP_CENTER.y);
          expect(distance).toBeGreaterThanOrEqual(CONNECTOR_ANCHOR_EXEMPT_RADIUS - 1e-6);
        }
      }
    }
  });

  it("marks connectors invisible when the connector width is zero", () => {
    const project = projectWith([beijingStudent()]);
    project.cards = { ...project.cards, positions: { 北京市: { x: 100, y: 200 } }, connectorWidth: 0 };
    const { connectors } = buildContentLayoutInput(project);
    expect(connectors).toHaveLength(1);
    expect(connectors[0]!.visible).toBe(false);
  });

  it("keeps the legacy aggregate cards placeholder only while nothing is manually placed", () => {
    const project = projectWith([beijingStudent()]);
    const { objects, connectors } = buildContentLayoutInput(project);
    const placeholder = objects.find((object) => object.id === "cards")!;
    expect(placeholder.bounds).toEqual({ x: project.cards.x, y: project.cards.y, width: 220, height: 180 });
    expect(connectors).toEqual([]);
  });

  it("emits no card objects, placeholder or connectors in pins view", () => {
    const project = projectWith([beijingStudent()]);
    project.dataView = "pins";
    project.cards = { ...project.cards, positions: { 北京市: { x: 100, y: 200 } } };
    const { objects, connectors } = buildContentLayoutInput(project);
    expect(objects.filter((object) => object.kind === "card")).toEqual([]);
    expect(connectors).toEqual([]);
    expect(objects.some((object) => object.id === "map")).toBe(true);
  });
});

describe("listContentLayoutIssues (product path)", () => {
  it("re-exports the same product entry through the studio-editor-helpers facade", () => {
    expect(facadeListContentLayoutIssues).toBe(listContentLayoutIssues);
  });

  it("reports a connector conflict when one leader line runs over another", () => {
    const project = projectWith([beijingStudent(), student("浙江省", "杭州市", "浙江大学")]);
    // 两张卡上下叠放在地图中心正上方：两条直线连接线共线重叠（下方卡的连接线
    // 被上方卡的连接线整段覆盖），是真实的视觉冲突。
    project.cards = {
      ...project.cards,
      connectorStyle: "straight",
      positions: { 北京市: { x: 640, y: 140 }, 浙江省: { x: 640, y: 300 } },
    };

    const issues = listContentLayoutIssues(project);
    const conflicts = issues.filter((issue) => issue.kind === "connector-conflict");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.id).toBe("connector-北京市:connector-浙江省");
  });

  it("stays silent for a shared map anchor bouquet on opposite sides", () => {
    const project = projectWith([beijingStudent(), student("浙江省", "杭州市", "浙江大学")]);
    // 两张卡分列地图中心左右，卡心与锚点同高：连接线只会在锚点处会合，
    // 属于共锚点花束，不得误报冲突。
    project.cards = {
      ...project.cards,
      connectorStyle: "straight",
      positions: { 北京市: { x: 200, y: 417 }, 浙江省: { x: 1080, y: 417 } },
    };

    const issues = listContentLayoutIssues(project);
    expect(issues.some((issue) => issue.kind === "connector-conflict")).toBe(false);
  });

  it("reports two manually stacked cards as an occlusion", () => {
    const project = projectWith([beijingStudent(), student("浙江省", "杭州市", "浙江大学")]);
    project.cards = {
      ...project.cards,
      positions: { 北京市: { x: 640, y: 140 }, 浙江省: { x: 700, y: 180 } },
    };

    const issues = listContentLayoutIssues(project);
    expect(issues.some((issue) => issue.kind === "occlusion" && issue.id === "北京市:浙江省")).toBe(true);
  });

  it("no longer flags a short card as out of bounds where only the blanket 180 estimate overflowed", () => {
    const project = projectWith([beijingStudent()]);
    // 实测高 96：y=852 时底边 948，仍在安全边距内；旧的 180 估高会伪报出画布。
    project.cards = { ...project.cards, positions: { 北京市: { x: 640, y: 852 } } };

    const issues = listContentLayoutIssues(project);
    expect(issues.filter((issue) => issue.id === "北京市")).toEqual([]);
  });
});
