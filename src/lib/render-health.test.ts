import { describe, expect, it } from "vitest";
import { checkLayoutHealth } from "./layout-health";
import type { Student } from "./project-data";
import { createProjectDocument, type ProjectDocument } from "./project-document";
import { buildRenderFacts } from "./render-facts";
import { buildHealthInput } from "./render-health";

function student(id: string, university: string, city: string): Student {
  return { id, name: `同学${id}`, university, city, visibility: true };
}

function projectWith(students: Student[], grouping: ProjectDocument["cards"]["grouping"] = "province"): ProjectDocument {
  const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
  return { ...project, cards: { ...project.cards, grouping } };
}

function occlusionIds(project: ProjectDocument): string[] {
  return checkLayoutHealth(buildHealthInput(project))
    .filter((issue) => issue.kind === "occlusion")
    .map((issue) => issue.id);
}

describe("render health · connector conflicts", () => {
  it("keeps a freshly solved city layout free of conflicts when two cities share a province", () => {
    // 江苏两市共用省会锚点，连线在锚点处会合成花束；求解器认这是合法解，
    // check_health 也必须认，否则 auto_layout 一跑完就自报冲突。
    const project = projectWith([
      student("s1", "南京大学", "南京市"),
      student("s2", "苏州大学", "苏州市"),
      student("s3", "北京大学", "北京市"),
    ], "city");
    const facts = buildRenderFacts(project);
    const anchors = new Map(facts.cards.map((fact) => [fact.group.key, `${fact.anchorX}:${fact.anchorY}`]));

    expect(anchors.get("南京市")).toBe(anchors.get("苏州市"));
    expect(checkLayoutHealth(buildHealthInput(project, facts)).filter((issue) => issue.kind === "connector-conflict"))
      .toEqual([]);
  });

  it("still reports a real crossing after two cards are swapped onto each other's anchors", () => {
    const base = projectWith([
      student("s1", "北京大学", "北京市"),
      student("s2", "中山大学", "广州市"),
    ]);
    const project = { ...base, cards: { ...base.cards, connectorStyle: "straight" as const } };
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

    expect(checkLayoutHealth(buildHealthInput(swapped)).some((issue) => issue.kind === "connector-conflict")).toBe(true);
  });
});

describe("render health · map occlusion", () => {
  const students = [student("s1", "北京大学", "北京市"), student("s2", "中山大学", "广州市")];

  it("stops reporting cards over the map once allowMapOverlap is on", () => {
    const base = projectWith(students);
    const project = { ...base, cards: { ...base.cards, allowMapOverlap: true } };
    const input = buildHealthInput(project);
    const cardIds = new Set(input.objects.filter((object) => object.kind === "card").map((object) => object.id));
    const mapCardIssue = (id: string) => id.startsWith("map:") && cardIds.has(id.slice("map:".length));
    const withoutExemption = checkLayoutHealth({ ...input, allowMapOverlap: false })
      .filter((issue) => issue.kind === "occlusion")
      .map((issue) => issue.id);

    expect(input.allowMapOverlap).toBe(true);
    // 允许压图后求解器把卡片放到了省份轮廓上，没有豁免时就会报 map:卡片。
    expect(withoutExemption.some(mapCardIssue)).toBe(true);
    expect(occlusionIds(project).filter(mapCardIssue)).toEqual([]);
    // 非卡片对象（模板文案）仍按轮廓判定，豁免只针对卡片。
    expect(occlusionIds(project).some((id) => id.startsWith("map:"))).toBe(true);
  });

  it("does not report objects that only sit inside the empty part of the province union box", () => {
    const project = projectWith(students);
    const input = buildHealthInput(project);
    const map = input.objects.find((object) => object.id === "map")!;
    const reported = new Set(occlusionIds(project).filter((id) => id.startsWith("map:")).map((id) => id.slice(4)));
    const insideUnionBox = input.objects.filter((object) =>
      object.id !== "map"
      && object.visible !== false
      && object.bounds.x < map.bounds.x + map.bounds.width
      && object.bounds.x + object.bounds.width > map.bounds.x
      && object.bounds.y < map.bounds.y + map.bounds.height
      && object.bounds.y + object.bounds.height > map.bounds.y);

    expect(input.mapPolygons!.length).toBeGreaterThan(0);
    expect(insideUnionBox.length).toBeGreaterThan(reported.size);
  });
});
