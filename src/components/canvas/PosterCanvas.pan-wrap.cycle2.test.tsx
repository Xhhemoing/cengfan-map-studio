import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

vi.mock("./MapLayer", () => ({ MapLayer: () => <g data-map-layer /> }));
vi.mock("./RegionalAssetLayer", () => ({ RegionalAssetLayer: () => null }));
vi.mock("./DecorationLayer", () => ({ DecorationLayer: () => null }));
vi.mock("./TextLayer", () => ({ TextLayer: () => null }));

const solveCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock("../../lib/card-layout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/card-layout")>();
  return {
    ...actual,
    solveCardLayout: (...args: Parameters<typeof actual.solveCardLayout>) => {
      solveCalls.count += 1;
      return actual.solveCardLayout(...args);
    },
  };
});

import { cardLayoutCache } from "../../lib/card-layout-cache";
import { createProjectDocument } from "../../lib/project-document";
import type { ProjectDocument } from "../../lib/project-document";
import { PosterCanvas } from "./PosterCanvas";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

function cardTextLayout(container: HTMLDivElement) {
  const card = container.querySelector('[data-destination-card="北京市"]');
  expect(card).not.toBeNull();
  return {
    title: Array.from(card!.querySelectorAll("[data-card-title-line]"), (line) => line.textContent ?? ""),
    body: Array.from(card!.querySelectorAll("[data-card-row-line]"), (line) => line.textContent ?? ""),
  };
}

afterEach(() => {
  mounted.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  cardLayoutCache.clear();
  solveCalls.count = 0;
});

function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  return { container, root };
}

function cardTransforms(container: HTMLDivElement): Record<string, string> {
  return Object.fromEntries(Array.from(
    container.querySelectorAll("[data-destination-card]"),
    (card) => [card.getAttribute("data-destination-card")!, card.getAttribute("transform")!],
  ));
}

function panned(project: ProjectDocument): ProjectDocument {
  return { ...project, map: { ...project.map, x: project.map.x + 90, y: project.map.y + 40 } };
}

describe("PosterCanvas map pan and zoom text wrapping", () => {
  it("keeps destination-card title and body line text stable when only map x/y/scale change", () => {
    const project = createProjectDocument({
      students: [
        {
          id: "student-1",
          name: "林舟",
          university: "北京航空航天大学未来空天技术学院",
          city: "北京市海淀区",
          province: "北京市",
          visibility: true,
        },
        {
          id: "student-2",
          name: "沈青",
          university: "中国科学院大学人工智能学院",
          city: "北京市怀柔区",
          province: "北京市",
          visibility: true,
        },
      ],
      templateId: "original",
      dataView: "province",
    });
    project.cards = {
      ...project.cards,
      maxWidth: 210,
      expressionTemplates: {
        title: "毕业去向相聚在{group}的同学们",
        city: "{city}",
        row: "{name}前往{university}就读，地点在{city}",
      },
    };
    const pannedAndZoomed = {
      ...project,
      map: {
        ...project.map,
        x: project.map.x + 180,
        y: project.map.y + 120,
        scale: project.map.scale * 0.72,
      },
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mounted.push({ root, container });

    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));
    const before = cardTextLayout(container);
    expect(before.title.length).toBeGreaterThan(1);
    expect(before.body.length).toBeGreaterThan(project.students.length);

    flushSync(() => root.render(<PosterCanvas project={pannedAndZoomed} exportMode />));

    expect(cardTextLayout(container)).toEqual(before);
  });
});

describe("PosterCanvas frozen card positions", () => {
  const students = [
    { id: "student-1", name: "林舟", university: "北京大学", city: "北京市", province: "北京市", visibility: true },
    { id: "student-2", name: "沈青", university: "浙江大学", city: "杭州市", province: "浙江省", visibility: true },
    { id: "student-3", name: "何遥", university: "四川大学", city: "成都市", province: "四川省", visibility: true },
  ];

  /** A document whose every destination card carries the position auto-layout resolved for it,
   *  the state `freezeCardPositionsForMapChange` leaves behind before any map edit. */
  function freezeAllPositions(project: ProjectDocument): ProjectDocument {
    let resolved: Record<string, { x: number; y: number }> = {};
    const { root } = mount();
    flushSync(() => root.render(
      <PosterCanvas project={project} exportMode onCardPositionsResolved={(positions) => { resolved = positions; }} />,
    ));
    expect(Object.keys(resolved)).toHaveLength(students.length);
    expect(solveCalls.count).toBeGreaterThan(0);
    // Drop the fixture render's cached layout so a later solve can only come from a real
    // request, never from `cardLayoutCache` answering the very same key.
    cardLayoutCache.clear();
    solveCalls.count = 0;
    return { ...project, cards: { ...project.cards, positions: resolved } };
  }

  it("skips the layout solver on a map pan once every card has a stored position", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const frozen = freezeAllPositions(project);

    const { container, root } = mount();
    flushSync(() => root.render(<PosterCanvas project={frozen} exportMode />));
    const before = cardTransforms(container);
    const anchorBefore = container.querySelector("[data-destination-anchor]")!.getAttribute("cx");
    expect(Object.keys(before)).toHaveLength(students.length);

    flushSync(() => root.render(<PosterCanvas project={panned(frozen)} exportMode />));

    expect(solveCalls.count).toBe(0);
    expect(cardTransforms(container)).toEqual(before);
    expect(container.querySelector("[data-destination-anchor]")!.getAttribute("cx")).not.toBe(anchorBefore);
  });

  it("still solves when one card is left to auto-layout", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const frozen = freezeAllPositions(project);
    const { 北京市: _pinned, ...partial } = frozen.cards.positions!;
    const partiallyFrozen = { ...frozen, cards: { ...frozen.cards, positions: partial } };

    const { container, root } = mount();
    flushSync(() => root.render(<PosterCanvas project={partiallyFrozen} exportMode />));

    expect(solveCalls.count).toBeGreaterThan(0);
    expect(Object.keys(cardTransforms(container))).toHaveLength(students.length);
  });

  it("places a frozen card exactly at its stored position, map overlap included", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const frozen = freezeAllPositions(project);
    const overMap = {
      ...frozen,
      cards: {
        ...frozen.cards,
        positions: Object.fromEntries(Object.keys(frozen.cards.positions!).map((key, index) => [
          key,
          { x: project.map.x + 40, y: project.map.y + 40 + index * 30 },
        ])),
      },
    };

    const { container, root } = mount();
    flushSync(() => root.render(<PosterCanvas project={overMap} exportMode />));

    expect(solveCalls.count).toBe(0);
    expect(container.querySelector('[data-destination-card="北京市"]')!.getAttribute("transform"))
      .toBe(`translate(${project.map.x + 40} ${project.map.y + 40})`);
  });
});
