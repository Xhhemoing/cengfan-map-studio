import { describe, expect, it } from "vitest";
import { flushSync } from "react-dom";
import { PosterCanvas } from "./PosterCanvas";
import { createProjectDocument } from "../../lib/project-document";
import {
  CanvasFakeWorker,
  globalWithWorker,
  installPosterCanvasTestHarness,
  students,
  trackedRoot,
} from "./poster-canvas-test-harness";

installPosterCanvasTestHarness();

describe("PosterCanvas scene", () => {
  it("keeps cards present in the initial browser-worker export state", () => {
    globalWithWorker.Worker = CanvasFakeWorker;
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const { container, root } = trackedRoot();

    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(container.querySelectorAll("[data-destination-card]")).toHaveLength(1);
    expect(container.textContent).toContain("可见");
  });

  it("renders the project canvas dimensions and visible student data", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 1500 1000");
    expect(container.textContent).toContain("可见");
    expect(container.textContent).not.toContain("隐藏");
  });

  it("orders the map and cards layers by zIndex (default: map below cards)", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const order = () => Array.from(
      container.querySelectorAll("svg > [data-map-layer], svg > [data-cards-layer]"),
    ).map((node) => (node.hasAttribute("data-map-layer") ? "map" : "cards"));

    // 默认层级：地图 0 < 数据框 10，先画地图。
    expect(order()).toEqual(["map", "cards"]);

    // 地图置顶（超过文本锚点 40）：地图后画，覆盖数据框。
    project.map = { ...project.map, zIndex: 50 };
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));
    expect(order()).toEqual(["cards", "map"]);

    // 数据框置底（低于地图锚点 0）：数据框先画。
    project.map = { ...project.map, zIndex: 10 };
    project.cards = { ...project.cards, zIndex: -50 };
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));
    expect(order()).toEqual(["cards", "map"]);
  });

  it("updates destination cards when the edited project records change", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const updated = {
      ...project,
      students: [{ id: "edited", name: "苏禾", university: "浙江大学", city: "杭州市", visibility: true }],
    };
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));
    expect(container.textContent).toContain("可见");

    flushSync(() => root.render(<PosterCanvas project={updated} exportMode />));
    expect(container.textContent).toContain("苏禾");
    expect(container.textContent).not.toContain("可见");
  });

  it("folds the south china sea inset when enabled", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.map = { ...project.map, collapseSouthChinaSea: true };
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(container.querySelector("[data-map-layer]")?.getAttribute("data-collapse-south-sea")).toBe("true");
    expect(container.querySelector("[data-south-sea-inset]")).not.toBeNull();
    expect(container.querySelector("[data-south-sea-label]")?.textContent).toContain("南海诸岛");
    expect(container.querySelector('[data-province-label="460000"]')?.textContent).toContain("海南");
  });

  it("renders an editor-only grid overlay that is omitted in export mode", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} showGrid gridSize={25} />));

    const grid = container.querySelector("[data-editor-grid]");
    expect(grid).not.toBeNull();
    expect(grid?.getAttribute("data-grid-size")).toBe("25");

    flushSync(() => root.render(<PosterCanvas project={project} showGrid gridSize={25} exportMode />));
    expect(container.querySelector("[data-editor-grid]")).toBeNull();
  });
});
