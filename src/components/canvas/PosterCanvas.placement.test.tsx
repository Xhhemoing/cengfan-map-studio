import { describe, expect, it } from "vitest";
import { flushSync } from "react-dom";
import { PosterCanvas } from "./PosterCanvas";
import { createProjectDocument } from "../../lib/project-document";
import { sampleStudents } from "../../lib/project-data";
import { cardLayoutCache } from "../../lib/card-layout-cache";
import { installPosterCanvasTestHarness, students, trackedRoot } from "./poster-canvas-test-harness";

installPosterCanvasTestHarness();

describe("PosterCanvas card placement", () => {
  it("anchors destination cards to matching provinces without card collisions", () => {
    const project = createProjectDocument({
      students: [
        { id: "sichuan", name: "程川", university: "四川大学", city: "成都市", visibility: true },
        { id: "chongqing", name: "林深", university: "重庆大学", city: "重庆市", visibility: true },
        { id: "zhejiang", name: "苏禾", university: "浙江大学", city: "杭州市", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const cards = Array.from(container.querySelectorAll<SVGGElement>("[data-destination-card]"));
    expect(cards).toHaveLength(3);
    expect(container.querySelectorAll("[data-destination-connector]")).toHaveLength(3);
    const bounds = cards.map((card) => {
      const [, x, y] = card.getAttribute("transform")!.match(/translate\(([^ ]+) ([^)]+)\)/)!;
      const rect = card.querySelector("rect")!;
      return { x: Number(x), y: Number(y), width: Number(rect.getAttribute("width")), height: Number(rect.getAttribute("height")) };
    });
    for (let index = 0; index < bounds.length; index += 1) {
      for (let other = index + 1; other < bounds.length; other += 1) {
        const left = bounds[index]!;
        const right = bounds[other]!;
        expect(left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y).toBe(false);
      }
    }
  });

  it("renders international students in a destination card without a China map anchor or connector", () => {
    const project = createProjectDocument({
      students: [{
        id: "international",
        name: "周晴",
        university: "哈佛大学",
        city: "美国·波士顿",
        locationScope: "international",
        visibility: true,
      }],
      templateId: "original",
      dataView: "province",
    });
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(container.querySelector('[data-destination-card="海外"]')).not.toBeNull();
    expect(container.textContent).toContain("周晴");
    expect(container.querySelector('[data-destination-anchor="海外"]')).toBeNull();
    expect(container.querySelector('[data-destination-connector="海外"]')).toBeNull();
    expect(container.querySelectorAll("[data-map-province-active]")).toHaveLength(0);
  });

  it("keeps automatic cards clear of visible text and the guest panel", () => {
    const project = createProjectDocument({
      students: sampleStudents,
      templateId: "original",
      dataView: "province",
    });
    project.map = {
      ...project.map,
      x: 270,
      y: 150,
      scale: 1.12,
      collapseSouthChinaSea: true,
      renderSource: {
        kind: "image",
        assetId: "map-image-test",
        src: "data:image/png;base64,test",
        fit: "contain",
        opacity: 1,
        composition: "overlay",
        alignment: {
          sourceWidth: 640,
          sourceHeight: 360,
          sourceBounds: { x: 0, y: 0, width: 1, height: 1 },
          x: 210,
          y: 160,
          width: 390,
          height: 270,
          rotation: 27,
        },
      },
    };
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const overlaps = (
      left: { x: number; y: number; width: number; height: number },
      right: { x: number; y: number; width: number; height: number },
    ) => left.x < right.x + right.width
      && left.x + left.width > right.x
      && left.y < right.y + right.height
      && left.y + left.height > right.y;
    const cards = Array.from(container.querySelectorAll<SVGGElement>("[data-destination-card]")).map((card) => {
      const [, x, y] = card.getAttribute("transform")!.match(/translate\(([^ ]+) ([^)]+)\)/)!;
      const rect = card.querySelector("rect")!;
      return {
        x: Number(x),
        y: Number(y),
        width: Number(rect.getAttribute("width")),
        height: Number(rect.getAttribute("height")),
      };
    });
    const textObstacles = project.textElements
      .filter((text) => text.visibility && text.content.trim())
      .map((text) => ({
        x: text.textAlign === "right" ? text.x - text.maxWidth : text.textAlign === "center" ? text.x - text.maxWidth / 2 : text.x,
        y: text.y - text.fontSize,
        width: text.maxWidth,
        height: text.fontSize * 1.3,
      }));
    const guestObstacle = {
      x: project.guests.x,
      y: project.guests.y,
      width: project.guests.width,
      height: project.guests.padding * 2 + 28 + Math.max(1, project.guests.people.length) * Math.max(16, project.guests.fontSize + 6),
    };

    expect(cards.some((card) => textObstacles.some((obstacle) => overlaps(card, obstacle)))).toBe(false);
    expect(cards.some((card) => overlaps(card, guestObstacle))).toBe(false);
  });

  it("uses the configured card width instead of capping it to the space left of the map", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, maxWidth: 900 };
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const card = container.querySelector('[data-destination-card="北京市"]')!;
    expect(Number(card.querySelector("rect")?.getAttribute("width"))).toBe(900);
  });

  it("reuses the layout result for cosmetic changes but invalidates geometry changes", () => {
    cardLayoutCache.clear();
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const { root } = trackedRoot();

    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));
    expect(cardLayoutCache.size).toBe(1);

    const cosmetic = {
      ...project,
      canvas: { ...project.canvas, backgroundColor: "#f7f2e8" },
      cards: { ...project.cards, connectorColor: "#123456" },
    };
    flushSync(() => root.render(<PosterCanvas project={cosmetic} exportMode />));
    expect(cardLayoutCache.size).toBe(1);

    const geometry = {
      ...cosmetic,
      cards: { ...cosmetic.cards, maxWidth: cosmetic.cards.maxWidth + 20 },
    };
    flushSync(() => root.render(<PosterCanvas project={geometry} exportMode />));
    expect(cardLayoutCache.size).toBe(2);
  });

  it("keeps an allowed manual card position inside the map", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.cards = {
      ...project.cards,
      allowMapOverlap: true,
      positions: { "北京市": { x: 600, y: 400 } },
    };
    project.textElements = [];
    project.guests = { ...project.guests, visibility: false };
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(container.querySelector('[data-destination-card="北京市"]')?.getAttribute("transform"))
      .toBe("translate(600 400)");
  });
});
