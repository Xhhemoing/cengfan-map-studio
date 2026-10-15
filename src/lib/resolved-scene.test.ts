import { describe, expect, it } from "vitest";
import { createSampleProject } from "./project-store";
import { buildResolvedSceneInput, resolveProjectScene, resolveStoredScenePositions } from "./resolved-scene";
import { createSceneLayoutRequest } from "./scene-layout-request";
import { buildLayoutGroups } from "./layout";
import { getVisibleStudents } from "./project-data";
import { getCardScopeKey } from "./card-settings-scope";
import { checkLayoutHealth } from "./layout-health";

describe("shared resolved scene", () => {
  it.each(["province", "city", "university"] as const)("uses real %s card IDs, content sizes and geographic obstacles", (grouping) => {
    const project = createSampleProject().pack.project;
    project.cards = { ...project.cards, grouping };
    const scene = resolveProjectScene(project);
    expect(scene.cards.map((card) => card.group.key)).toEqual(buildLayoutGroups(getVisibleStudents(project.students), grouping).map((group) => group.key));
    expect(scene.input.bounds.occupiedPolygons?.length).toBeGreaterThan(0);
    expect(scene.cards.every((card) => card.placement.width === card.width && card.placement.height === card.height)).toBe(true);
    expect(scene.healthInput.objects.filter((object) => object.kind === "card").map((object) => object.bounds)).toEqual(scene.cards.map((card) => card.placement));
    expect(scene.connectors).toHaveLength(scene.cards.length);
    expect(scene.measurementStatus).toBe("estimated");
  });

  it("uses partial stored card positions as solver obstacles", () => {
    const project = createSampleProject().pack.project;
    const input = buildResolvedSceneInput(project);
    const id = input.preparedCards[0]!.group.key;
    project.cards.positions = { [id]: { x: 40, y: 50 } };
    const request = createSceneLayoutRequest(input.preparedCards, input.bounds, input.options, project.cards.positions)!;
    expect(request.cards.some((card) => card.id === id)).toBe(false);
    expect(request.bounds.occupiedAreas).toEqual(expect.arrayContaining([expect.objectContaining({ id, x: 40, y: 50, width: input.preparedCards[0]!.width })]));
  });

  it("keeps valid automatic positions and releases only invalid automatic positions", () => {
    const project = createSampleProject().pack.project;
    const scene = resolveProjectScene(project);
    const positions = Object.fromEntries(scene.cards.map((card) => [card.group.key, { x: card.placement.x, y: card.placement.y }]));
    project.cards = { ...project.cards, positions, positionSources: Object.fromEntries(scene.cards.map((card) => [getCardScopeKey(project.cards, card.group.key), "auto" as const])) };
    expect(resolveStoredScenePositions(project, scene.input.preparedCards, scene.bounds)).toEqual(positions);
    const id = scene.cards[0]!.group.key;
    project.cards.positions![id] = { x: -1000, y: -1000 };
    expect(resolveStoredScenePositions(project, scene.input.preparedCards, scene.bounds)[id]).toBeUndefined();
    project.cards.positionPolicies = { [getCardScopeKey(project.cards, id)]: "locked" };
    expect(resolveStoredScenePositions(project, scene.input.preparedCards, scene.bounds)[id]).toEqual({ x: -1000, y: -1000 });
  });

  it("reports same-layer overlap and actual stored coordinates", () => {
    const project = createSampleProject().pack.project;
    const initial = resolveProjectScene(project);
    project.cards.positions = Object.fromEntries(initial.cards.map((card) => [card.group.key, { x: 50, y: 50 }]));
    const scene = resolveProjectScene(project);
    expect(scene.diagnostics.some((issue) => issue.kind === "occlusion")).toBe(true);
    expect(scene.layoutStatus).toBe("fallback");
  });

  it("does not report two lines merely sharing a geographic endpoint as crossing", () => {
    expect(checkLayoutHealth({ canvas: { width: 500, height: 500 }, objects: [], connectors: [
      { id: "a", segments: [{ start: { x: 0, y: 0 }, end: { x: 250, y: 250 } }] },
      { id: "b", segments: [{ start: { x: 500, y: 0 }, end: { x: 250, y: 250 } }] },
    ] })).toEqual([]);
  });
});
