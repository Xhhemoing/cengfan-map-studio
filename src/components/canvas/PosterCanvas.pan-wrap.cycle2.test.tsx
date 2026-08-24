import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

vi.mock("./MapLayer", () => ({ MapLayer: () => <g data-map-layer /> }));
vi.mock("./RegionalAssetLayer", () => ({ RegionalAssetLayer: () => null }));
vi.mock("./DecorationLayer", () => ({ DecorationLayer: () => null }));
vi.mock("./TextLayer", () => ({ TextLayer: () => null }));

import { cardLayoutCache } from "../../lib/card-layout-cache";
import { createProjectDocument } from "../../lib/project-document";
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
});

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
