import { describe, expect, it } from "vitest";
import {
  buildContentLayoutInput,
  CONNECTOR_ANCHOR_EXEMPT_RADIUS,
  estimateDestinationCardLayouts,
  listContentLayoutIssues,
  trimSegmentsNearAnchor,
} from "./content-layout-objects";
import { fitFeatureProjection, getFeatureSplit } from "../components/canvas/map-data-projection";
import { getChinaMapFeatures } from "./map-data";
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

function overseasStudent(city: string): Student {
  studentSequence += 1;
  return {
    id: `student-${studentSequence}`,
    name: `学生${studentSequence}`,
    university: `大学${studentSequence}`,
    city,
    locationScope: "international",
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

function anchorOf(project: ProjectDocument, key: string) {
  const card = estimateDestinationCardLayouts(project).find((entry) => entry.group.key === key)!;
  return { x: card.anchorX, y: card.anchorY };
}

/** 把某张卡摆到卡心落在 (x, y) 的位置，避免在用例里手算实测宽高。 */
function centeredPosition(project: ProjectDocument, key: string, x: number, y: number) {
  const card = estimateDestinationCardLayouts(project).find((entry) => entry.group.key === key)!;
  return { x: x - card.width / 2, y: y - card.height / 2 };
}

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

  it("gives each province its own map anchor instead of the shared map center", () => {
    const project = projectWith([beijingStudent(), ...zhejiangStudents(1), student("新疆维吾尔自治区", "乌鲁木齐市", "新疆大学")]);
    const cards = estimateDestinationCardLayouts(project);
    const anchors = new Map(cards.map((card) => [card.group.key, { x: card.anchorX, y: card.anchorY }]));

    // 地图 (350,120) 800×690、scale 1：锚点 = 地图左上角 + 墨卡托适配后的省份行政中心。
    expect(anchors.get("北京市")!.x).toBeCloseTo(889.583, 2);
    expect(anchors.get("北京市")!.y).toBeCloseTo(351.563, 2);
    expect(anchors.get("浙江省")!.x).toBeCloseTo(932.800, 2);
    expect(anchors.get("浙江省")!.y).toBeCloseTo(487.409, 2);
    // 新疆在西北：明显偏左偏上，绝不是三省共用的地图中心。
    expect(anchors.get("新疆维吾尔自治区")!.x).toBeCloseTo(557.669, 2);
    expect(anchors.get("新疆维吾尔自治区")!.y).toBeCloseTo(291.356, 2);
  });

  it("keeps the scale-invariant map center for destinations that are not on the china map", () => {
    const project = projectWith([overseasStudent("东京")]);
    project.map = { ...project.map, scale: 2 };
    const [card] = estimateDestinationCardLayouts(project);
    expect(card!.anchorX).toBe(MAP_CENTER.x);
    expect(card!.anchorY).toBe(MAP_CENTER.y);
  });

  it("scales province anchors around the map center exactly like the rendered map", () => {
    const project = projectWith([beijingStudent()]);
    const base = anchorOf(project, "北京市");
    project.map = { ...project.map, scale: 2 };
    const scaled = anchorOf(project, "北京市");
    expect(scaled.x).toBeCloseTo(MAP_CENTER.x + (base.x - MAP_CENTER.x) * 2, 6);
    expect(scaled.y).toBeCloseTo(MAP_CENTER.y + (base.y - MAP_CENTER.y) * 2, 6);
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

/**
 * 体检路径不解析 geojson，锚点来自内联的省级行政中心表 + 闭式墨卡托适配。
 * 这一组用例是那张表的防漂移锁：它按渲染层的真实路径（真 geojson +
 * `getFeatureSplit` + `fitFeatureProjection`）算一遍锚点逐省比对。
 * 解析 geojson 只发生在这里，不在产品代码里。
 */
describe("province anchors match the rendered projection", () => {
  const features = getChinaMapFeatures();
  const provinceRoster = () => features.map((feature) => student(feature.name, feature.name, `${feature.name}大学`));

  it.each([
    { collapse: false, map: { x: 350, y: 120, width: 800, height: 690, scale: 1 } },
    // 折叠南海会抬高主图南边界，整幅图的适配比例随之改变；非默认地图框同时
    // 覆盖「宽高比不同 → fitExtent 居中留白方向不同」这一支。
    { collapse: true, map: { x: 300, y: 90, width: 760, height: 640, scale: 1.25 } },
  ])("reproduces fitFeatureProjection for every province (collapseSouthChinaSea=$collapse)", ({ collapse, map }) => {
    const project = projectWith(provinceRoster());
    project.map = { ...project.map, ...map, collapseSouthChinaSea: collapse };
    const { mainlandFeatures } = getFeatureSplit(features, collapse);
    const projected = fitFeatureProjection(mainlandFeatures, [[0, 0], [map.width, map.height]]);
    const cards = new Map(estimateDestinationCardLayouts(project).map((card) => [card.group.key, card]));
    expect(cards.size).toBe(features.length);

    let worst = { province: "", error: 0 };
    for (const feature of features) {
      const point = projected.project(feature.center)!;
      // 与 prepareDestinationCards 相同的地图摆放变换：围绕地图自身中心缩放。
      const expected = {
        x: map.x + map.width / 2 + (point[0] - map.width / 2) * map.scale,
        y: map.y + map.height / 2 + (point[1] - map.height / 2) * map.scale,
      };
      const card = cards.get(feature.name)!;
      const error = Math.hypot(card.anchorX - expected.x, card.anchorY - expected.y);
      if (error > worst.error) worst = { province: feature.name, error };
    }
    expect(worst.error < 0.01 ? "ok" : `${worst.province} 偏差 ${worst.error.toFixed(4)}px`).toBe("ok");
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
    // 锚点端已按共锚点豁免半径裁剪，任何端点都不落入自己那个省份锚点的豁免圈内。
    for (const connector of connectors) {
      const anchor = anchorOf(project, connector.id.replace("connector-", ""));
      for (const segment of connector.segments) {
        for (const point of [segment.start, segment.end]) {
          const distance = Math.hypot(point.x - anchor.x, point.y - anchor.y);
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

  it("reports a connector conflict when two provinces' leader lines cross", () => {
    const project = projectWith([beijingStudent(), student("新疆维吾尔自治区", "乌鲁木齐市", "新疆大学")]);
    // 北京锚点在图幅东侧、新疆在西侧，而两张卡左右对调摆放：两条引线必然交叉，
    // 这正是 Round 10「所有卡共用地图中心」时永远看不见的那类真实冲突。
    project.cards = {
      ...project.cards,
      connectorStyle: "straight",
      positions: {
        北京市: centeredPosition(project, "北京市", 310, 648),
        新疆维吾尔自治区: centeredPosition(project, "新疆维吾尔自治区", 1210, 648),
      },
    };

    const conflicts = listContentLayoutIssues(project).filter((issue) => issue.kind === "connector-conflict");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.id).toBe("connector-北京市:connector-新疆维吾尔自治区");
  });

  it("stays silent when the same two cards are on the side their anchor faces", () => {
    const project = projectWith([beijingStudent(), student("新疆维吾尔自治区", "乌鲁木齐市", "新疆大学")]);
    // 同一对卡片、同一对锚点，只是左右摆对：引线不再交叉，不得报冲突。
    project.cards = {
      ...project.cards,
      connectorStyle: "straight",
      positions: {
        北京市: centeredPosition(project, "北京市", 1210, 648),
        新疆维吾尔自治区: centeredPosition(project, "新疆维吾尔自治区", 310, 648),
      },
    };

    expect(listContentLayoutIssues(project).some((issue) => issue.kind === "connector-conflict")).toBe(false);
  });

  it("stays silent for a shared province anchor bouquet on opposite sides", () => {
    const project = projectWith([student("浙江省", "杭州市", "浙江大学"), student("浙江省", "宁波市", "宁波大学")]);
    // 按城市分组的两张卡属于同一个省份，锚点逐字相同：连接线只在锚点处会合，
    // 属于共锚点花束，不得误报冲突。
    project.cards = { ...project.cards, grouping: "city", connectorStyle: "straight" };
    const anchor = anchorOf(project, "杭州市");
    expect(anchorOf(project, "宁波市")).toEqual(anchor);
    project.cards = {
      ...project.cards,
      positions: {
        杭州市: centeredPosition(project, "杭州市", anchor.x - 450, anchor.y),
        宁波市: centeredPosition(project, "宁波市", anchor.x + 300, anchor.y),
      },
    };

    expect(listContentLayoutIssues(project).some((issue) => issue.kind === "connector-conflict")).toBe(false);
  });

  it("keeps neighbouring province anchors inside the same exemption radius", () => {
    // 香港/澳门的锚点只差 7px：引线在锚点附近会合仍属花束，24px 裁剪要兜住它。
    const project = projectWith([student("香港特别行政区", "香港", "香港大学"), student("澳门特别行政区", "澳门", "澳门大学")]);
    project.cards = { ...project.cards, connectorStyle: "straight" };
    const hongKong = anchorOf(project, "香港特别行政区");
    const macao = anchorOf(project, "澳门特别行政区");
    expect(Math.hypot(hongKong.x - macao.x, hongKong.y - macao.y)).toBeLessThan(CONNECTOR_ANCHOR_EXEMPT_RADIUS);
    project.cards = {
      ...project.cards,
      positions: {
        香港特别行政区: centeredPosition(project, "香港特别行政区", hongKong.x - 400, hongKong.y),
        澳门特别行政区: centeredPosition(project, "澳门特别行政区", macao.x + 300, macao.y),
      },
    };

    expect(listContentLayoutIssues(project).some((issue) => issue.kind === "connector-conflict")).toBe(false);
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
