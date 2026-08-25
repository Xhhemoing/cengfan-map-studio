import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";

vi.mock("./MapLayer", () => ({ MapLayer: () => <g data-map-layer /> }));
vi.mock("./RegionalAssetLayer", () => ({ RegionalAssetLayer: () => null }));
vi.mock("./DecorationLayer", () => ({ DecorationLayer: () => null }));
vi.mock("./TextLayer", () => ({ TextLayer: () => null }));

import { chinaProvinces } from "../../data/china-locations";
import {
  createDefaultDisplayFrame,
  normalizeDisplayFrame,
} from "../../lib/display-frame";
import { cardLayoutCache } from "../../lib/card-layout-cache";
import { createProjectDocument, type ProjectDocument } from "../../lib/project-document";
import { PosterCanvas } from "./PosterCanvas";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderPoster(project: ProjectDocument) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  flushSync(() => root.render(<PosterCanvas project={project} exportMode />));
  return container;
}

afterEach(() => {
  mounted.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  cardLayoutCache.clear();
});

describe("PosterCanvas display-frame boundaries", () => {
  it("renders a surface for every destination across 24 provinces with several students each", () => {
    const provinces = chinaProvinces.slice(0, 24);
    const students = provinces.flatMap((province, provinceIndex) =>
      Array.from({ length: 3 }, (_, studentIndex) => ({
        id: `student-${provinceIndex}-${studentIndex}`,
        name: `同学${provinceIndex + 1}-${studentIndex + 1}`,
        university: `边界测试大学${studentIndex + 1}`,
        city: `测试城市${provinceIndex + 1}`,
        province: province.name,
        visibility: true,
      })),
    );
    const project = createProjectDocument({
      students,
      templateId: "original",
      dataView: "province",
    });

    const container = renderPoster(project);

    expect(container.querySelectorAll("[data-destination-card]")).toHaveLength(provinces.length);
    expect(container.querySelectorAll("[data-display-frame-surface]")).toHaveLength(provinces.length);
    expect(container.querySelector('[data-destination-card="北京市"]')?.textContent).toContain("同学1-1");
  });

  it("suppresses destination frames for empty visible fields and the pins data view without throwing", () => {
    const projects = [
      createProjectDocument({
        students: [{ id: "empty-fields", name: "林舟", university: "北京大学", city: "北京市", visibility: true }],
        templateId: "original",
        dataView: "province",
      }),
      createProjectDocument({
        students: [{ id: "pins", name: "苏禾", university: "浙江大学", city: "杭州市", visibility: true }],
        templateId: "original",
        dataView: "pins",
      }),
    ];
    projects[0]!.cards = { ...projects[0]!.cards, visibleFields: [] };

    for (const project of projects) {
      const container = renderPoster(project);
      expect(container.querySelector("[data-destination-card]")).toBeNull();
      expect(container.querySelector("[data-display-frame-surface]")).toBeNull();
    }
  });

  it("derives a display frame when the persisted frame is missing", () => {
    const project = createProjectDocument({
      students: [{ id: "derived", name: "林舟", university: "北京大学", city: "北京市", visibility: true }],
      templateId: "original",
      dataView: "province",
    });
    project.cards = {
      ...project.cards,
      displayFrame: undefined,
      fontSize: 18,
      opacity: 0.37,
    };

    const container = renderPoster(project);
    const surface = container.querySelector("[data-display-frame-surface]");

    expect(surface).not.toBeNull();
    expect(surface?.getAttribute("data-display-frame-mode")).toBe("fixed");
    expect(surface?.getAttribute("fill-opacity")).toBe("0.37");
  });

  it("keeps a borderless preset surface in the SVG while removing its border", () => {
    const project = createProjectDocument({
      students: [{ id: "borderless", name: "林舟", university: "北京大学", city: "北京市", visibility: true }],
      templateId: "original",
      dataView: "province",
    });
    project.cards = { ...project.cards, preset: "borderless" };

    const container = renderPoster(project);
    const card = container.querySelector("[data-destination-card]");
    const surface = card?.querySelector("[data-display-frame-surface]");

    expect(card?.getAttribute("data-card-preset")).toBe("borderless");
    expect(surface).not.toBeNull();
    expect(surface?.getAttribute("stroke")).toBe("none");
    expect(surface?.getAttribute("rx")).toBe("0");
  });

  it.each(["fixed", "flow"] as const)("renders a display-frame surface in %s mode", (mode) => {
    const project = createProjectDocument({
      students: [{ id: mode, name: "林舟", university: "北京大学", city: "北京市", visibility: true }],
      templateId: "original",
      dataView: "province",
    });
    const frame = createDefaultDisplayFrame();
    frame.mode = mode;
    project.cards = { ...project.cards, displayFrame: frame };

    const container = renderPoster(project);
    const surface = container.querySelector("[data-display-frame-surface]");

    expect(surface).not.toBeNull();
    expect(surface?.getAttribute("data-display-frame-mode")).toBe(mode);
  });

  it("renders normalized minimum and maximum typography with a transparent, heavily padded frame", () => {
    const project = createProjectDocument({
      students: [{ id: "extreme", name: "林舟", university: "北京大学", city: "北京市", visibility: true }],
      templateId: "original",
      dataView: "province",
    });
    const frame = createDefaultDisplayFrame();
    const normalized = normalizeDisplayFrame({
      ...frame,
      style: {
        ...frame.style,
        fontSize: -1_000,
        opacity: -1,
        padding: Number.MAX_SAFE_INTEGER,
      },
      fixed: {
        items: [
          ...frame.fixed.items,
          {
            id: "minimum-text",
            kind: "text",
            content: "最小字号",
            x: 8,
            y: 100,
            width: 100,
            height: 20,
            zIndex: 20,
            style: { fontSize: -1_000 },
          },
          {
            id: "maximum-text",
            kind: "text",
            content: "最大字号",
            x: 8,
            y: 120,
            width: 200,
            height: 240,
            zIndex: 21,
            style: { fontSize: 1_000 },
          },
        ],
      },
    });
    project.cards = { ...project.cards, displayFrame: normalized };

    const container = renderPoster(project);

    expect(normalized.style).toMatchObject({ fontSize: 8, opacity: 0, padding: 120 });
    expect(container.querySelector("[data-display-frame-surface]")?.getAttribute("fill-opacity")).toBe("0");
    expect(container.querySelector('[data-display-frame-text="minimum-text"]')?.getAttribute("font-size")).toBe("8");
    expect(container.querySelector('[data-display-frame-text="maximum-text"]')?.getAttribute("font-size")).toBe("240");
  });

  it("renders custom text plus line and rectangle decorations inside a fixed frame", () => {
    const project = createProjectDocument({
      students: [{ id: "custom", name: "苏禾", university: "浙江大学", city: "杭州市", visibility: true }],
      templateId: "original",
      dataView: "province",
    });
    const frame = createDefaultDisplayFrame();
    frame.fixed.items = [
      ...frame.fixed.items,
      {
        id: "text-boundary",
        kind: "text",
        content: "毕业快乐",
        x: 28,
        y: 96,
        width: 120,
        height: 22,
        zIndex: 20,
        style: { color: "#123456", fontSize: 14, fontWeight: "bold" },
      },
      {
        id: "line-boundary",
        kind: "decoration",
        decoration: "line",
        x: 24,
        y: 86,
        width: 120,
        height: 1,
        zIndex: 19,
        style: { color: "#123456", strokeWidth: 2 },
      },
      {
        id: "rectangle-boundary",
        kind: "decoration",
        decoration: "rectangle",
        x: 20,
        y: 90,
        width: 140,
        height: 28,
        zIndex: 18,
        style: { color: "#654321", fill: "#fff4dd", strokeWidth: 1 },
      },
    ];
    project.cards = { ...project.cards, displayFrame: frame };

    const container = renderPoster(project);
    const card = container.querySelector("[data-destination-card]")!;

    expect(card.querySelector('[data-display-frame-text="text-boundary"]')?.textContent).toBe("毕业快乐");
    expect(card.querySelector('[data-display-frame-decoration="line-boundary"]')?.tagName.toLowerCase()).toBe("line");
    expect(card.querySelector('[data-display-frame-decoration="rectangle-boundary"]')?.tagName.toLowerCase()).toBe("rect");
  });
});
