import { describe, expect, it } from "vitest";
import { checkLayoutHealth } from "./layout-health";
import { buildLayoutGroups } from "./layout";
import { findProvinceFeature, getChinaMapFeatures } from "./map-data";
import { createProjectDocument, type ProjectDocument } from "./project-document";
import type { Student } from "./project-data";
import { buildCardFacts, buildLayoutRequest, buildRenderFacts } from "./render-facts";
import { buildRenderGeometry, mapPointToCanvas } from "./render-geometry";
import { buildHealthInput } from "./render-health";

function student(id: string, university: string, city: string): Student {
  return { id, name: `同学${id}`, university, city, visibility: true };
}

function projectWith(students: Student[], grouping: ProjectDocument["cards"]["grouping"] = "province"): ProjectDocument {
  const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
  return { ...project, cards: { ...project.cards, grouping } };
}

describe("render geometry", () => {
  it("puts a province card anchor inside that province's projected bounding box", () => {
    const project = projectWith([student("s1", "北京大学", "北京市")]);
    const geometry = buildRenderGeometry(project);
    const fact = buildCardFacts(project, geometry).find((card) => card.group.key === "北京市");
    const feature = findProvinceFeature(getChinaMapFeatures(), "北京市")!;
    const [[left, top], [right, bottom]] = geometry.path.bounds(feature as never);
    const topLeft = mapPointToCanvas(project.map, [left, top]);
    const bottomRight = mapPointToCanvas(project.map, [right, bottom]);

    expect(fact).toBeDefined();
    expect(fact!.anchorX).toBeGreaterThanOrEqual(topLeft.x);
    expect(fact!.anchorX).toBeLessThanOrEqual(bottomRight.x);
    expect(fact!.anchorY).toBeGreaterThanOrEqual(topLeft.y);
    expect(fact!.anchorY).toBeLessThanOrEqual(bottomRight.y);
  });

  it("scales the map around its center instead of anchoring the top-left corner", () => {
    const project = projectWith([student("s1", "北京大学", "北京市")]);
    const scaled = { ...project, map: { ...project.map, scale: 1.5 } };
    const base = buildRenderGeometry(project).mapContentBounds;
    const enlarged = buildRenderGeometry(scaled).mapContentBounds;

    expect(enlarged.x).toBeLessThan(scaled.map.x);
    expect(enlarged.x).toBeLessThan(base.x);
    expect(enlarged.width).toBeGreaterThan(base.width);
    // 左上角锚定会让内容框停在 map.x 右侧，居中缩放则同时向两侧扩张。
    expect(enlarged.x + enlarged.width).toBeGreaterThan(base.x + base.width);
  });

  it("moves the card anchor with the map when it pans", () => {
    const project = projectWith([student("s1", "北京大学", "北京市")]);
    const moved = { ...project, map: { ...project.map, x: project.map.x + 60 } };

    expect(buildCardFacts(moved)[0]!.anchorX - buildCardFacts(project)[0]!.anchorX).toBeCloseTo(60, 6);
  });
});

describe("card facts", () => {
  it("grows the card height as a group gains people", () => {
    const universities = ["北京大学", "清华大学", "北京师范大学", "中国人民大学", "北京航空航天大学"];
    const heights = [1, 3, 5].map((count) => {
      const students = universities.slice(0, count).map((university, index) => student(`s${index}`, university, "北京市"));
      const fact = buildCardFacts(projectWith(students)).find((card) => card.group.key === "北京市")!;
      return fact.height;
    });

    expect(heights[1]).toBeGreaterThan(heights[0]!);
    expect(heights[2]).toBeGreaterThan(heights[1]!);
  });

  it.each(["province", "city", "university"] as const)("keeps %s card ids aligned with the render layout groups", (grouping) => {
    const project = projectWith([
      student("s1", "北京大学", "北京市"),
      student("s2", "复旦大学", "上海市"),
      student("s3", "中山大学", "广州市"),
    ], grouping);
    const expected = buildLayoutGroups(project.students, grouping).map((group) => group.key);
    const facts = buildRenderFacts(project);

    expect(facts.cards.map((card) => card.group.key)).toEqual(expected);
    expect(facts.layoutRequest?.cards.map((card) => card.id)).toEqual(expected);
    expect(facts.placements.map((placement) => placement.id).sort()).toEqual([...expected].sort());
    expect(buildHealthInput(project, facts).objects.filter((object) => object.kind === "card").map((object) => object.id))
      .toEqual(expected);
  });

  it("carries the measured card height into the layout request", () => {
    const project = projectWith([
      student("s1", "北京大学", "北京市"),
      student("s2", "清华大学", "北京市"),
      student("s3", "复旦大学", "上海市"),
    ]);
    const facts = buildRenderFacts(project);
    const request = facts.layoutRequest!;

    for (const card of facts.cards) {
      expect(request.cards.find((entry) => entry.id === card.group.key)?.height).toBe(card.height);
    }
    expect(new Set(request.cards.map((card) => card.height)).size).toBeGreaterThan(1);
  });

  it("produces no layout request for the pins data view", () => {
    const project = { ...projectWith([student("s1", "北京大学", "北京市")]), dataView: "pins" as const };

    expect(buildCardFacts(project)).toEqual([]);
    expect(buildLayoutRequest(project)).toBeNull();
  });
});

describe("health input", () => {
  it("reports crossing connectors when two cards are swapped onto each other's anchors", () => {
    const base = projectWith([
      student("s1", "北京大学", "北京市"),
      student("s2", "中山大学", "广州市"),
    ]);
    const project = { ...base, cards: { ...base.cards, connectorStyle: "straight" as const } };
    const facts = buildRenderFacts(project);
    const [first, second] = facts.cards;
    const centered = (fact: typeof first, target: typeof second) => ({
      x: target!.anchorX - fact!.width / 2,
      y: target!.anchorY - fact!.height / 2,
    });
    const swapped = {
      ...project,
      cards: {
        ...project.cards,
        positions: {
          [first!.group.key]: centered(first, second),
          [second!.group.key]: centered(second, first),
        },
      },
    };
    const issues = checkLayoutHealth(buildHealthInput(swapped));

    expect(issues.some((issue) => issue.kind === "connector-conflict")).toBe(true);
  });

  it("keeps a healthy auto layout free of connector conflicts", () => {
    const project = projectWith([
      student("s1", "北京大学", "北京市"),
      student("s2", "中山大学", "广州市"),
    ]);

    expect(checkLayoutHealth(buildHealthInput(project)).some((issue) => issue.kind === "connector-conflict")).toBe(false);
  });

  it("drops the connectors that borderless low-opacity cards never draw", () => {
    const base = projectWith([
      student("s1", "北京大学", "北京市"),
      student("s2", "中山大学", "广州市"),
    ]);
    const borderless = { ...base, cards: { ...base.cards, preset: "borderless" as const, opacity: 0 } };
    const opaque = { ...borderless, cards: { ...borderless.cards, opacity: 1 } };
    const framed = { ...base, cards: { ...base.cards, preset: "standard" as const, opacity: 0 } };

    expect(buildHealthInput(borderless).connectors).toEqual([]);
    expect(buildHealthInput(opaque).connectors!.length).toBeGreaterThan(0);
    expect(buildHealthInput(framed).connectors!.length).toBeGreaterThan(0);
  });

  it("reports no connector conflict when the hidden borderless connectors would cross", () => {
    const base = projectWith([
      student("s1", "北京大学", "北京市"),
      student("s2", "中山大学", "广州市"),
    ]);
    const project = {
      ...base,
      cards: { ...base.cards, connectorStyle: "straight" as const, preset: "borderless" as const, opacity: 0 },
    };
    const facts = buildRenderFacts(project);
    const [first, second] = facts.cards;
    const swapped = {
      ...project,
      cards: {
        ...project.cards,
        positions: {
          [first!.group.key]: { x: second!.anchorX - first!.width / 2, y: second!.anchorY - first!.height / 2 },
          [second!.group.key]: { x: first!.anchorX - second!.width / 2, y: first!.anchorY - second!.height / 2 },
        },
      },
    };

    const drawn = { ...swapped, cards: { ...swapped.cards, opacity: 1 } };

    expect(checkLayoutHealth(buildHealthInput(drawn)).some((issue) => issue.kind === "connector-conflict")).toBe(true);
    expect(checkLayoutHealth(buildHealthInput(swapped)).some((issue) => issue.kind === "connector-conflict")).toBe(false);
  });

  it("lets a manual position override the solved card bounds through positionKey", () => {
    const base = projectWith([student("s1", "北京大学", "北京市")]);
    const key = buildCardFacts(base)[0]!.group.key;
    const project = { ...base, cards: { ...base.cards, positions: { [key]: { x: base.canvas.width + 400, y: 40 } } } };
    const input = buildHealthInput(project);
    const card = input.objects.find((object) => object.kind === "card")!;

    expect(card.positionKey).toBe(key);
    expect(input.cardsPositions?.[key]).toEqual({ x: base.canvas.width + 400, y: 40 });
    expect(card.bounds.x).toBeLessThan(base.canvas.width);
    expect(checkLayoutHealth(input).some((issue) => issue.id === key && issue.kind === "out-of-bounds")).toBe(true);
  });

  it("measures the map, guests and text obstacles from the render truth", () => {
    const base = projectWith([student("s1", "北京大学", "北京市")]);
    const project: ProjectDocument = {
      ...base,
      guests: { ...base.guests, visibility: true, people: [
        { id: "g1", name: "张老师", title: "班主任", visibility: true },
        { id: "g2", name: "李老师", visibility: true },
      ] },
      textElements: [{
        id: "title", role: "custom", content: "毕业去向", x: 600, y: 90, fontSize: 40,
        color: "#1c3154", fontWeight: 700, textAlign: "center", maxWidth: 400, visibility: true,
      }],
    };
    const input = buildHealthInput(project);
    const geometry = buildRenderGeometry(project);
    const text = input.objects.find((object) => object.id === "title")!;
    const guests = input.objects.find((object) => object.id === "guests")!;

    expect(input.objects.find((object) => object.id === "map")?.bounds).toEqual(geometry.mapContentBounds);
    // textAlign=center 的文本以 x 为中线，占位必须左移半个 maxWidth。
    expect(text.bounds.x).toBe(400);
    expect(guests.bounds.height).toBeGreaterThan(project.guests.padding * 2 + 28);
  });
});
