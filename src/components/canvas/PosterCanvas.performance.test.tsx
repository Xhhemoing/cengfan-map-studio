import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

const renderCounts = vi.hoisted(() => ({ map: 0 }));

vi.mock("./MapLayer", () => ({
  MapLayer: () => {
    renderCounts.map += 1;
    return <g data-map-layer />;
  },
}));
vi.mock("./RegionalAssetLayer", () => ({ RegionalAssetLayer: () => null }));
vi.mock("./DecorationLayer", () => ({ DecorationLayer: () => null }));
vi.mock("./TextLayer", () => ({ TextLayer: () => null }));

import { PosterCanvas } from "./PosterCanvas";
import { createProjectDocument } from "../../lib/project-document";
import { cardLayoutCache } from "../../lib/card-layout-cache";

beforeEach(() => cardLayoutCache.clear());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cardLayoutCache.clear();
  renderCounts.map = 0;
});

describe("PosterCanvas interaction rendering", () => {
  it("coalesces a pointer-move burst without re-rendering or re-laying out static content", () => {
    vi.useFakeTimers();
    const project = createProjectDocument({
      students: [{ id: "student-1", name: "林舟", university: "北京大学", city: "北京市", visibility: true }],
      templateId: "original",
      dataView: "province",
    });
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} renderIntervalMs={100} onMoveCard={vi.fn()} />));

    expect(renderCounts.map).toBe(1);
    const card = container.querySelector<SVGGElement>("[data-destination-card]")!;
    Object.assign(card, { setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() });
    const setAttributeSpy = vi.spyOn(card, "setAttribute");
    const cacheGetSpy = vi.spyOn(cardLayoutCache, "get");

    flushSync(() => card.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      pointerId: 1,
      clientX: 120,
      clientY: 120,
    })));
    flushSync(() => {
      for (let index = 0; index < 250; index += 1) {
        card.dispatchEvent(new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 1,
          clientX: 121 + index,
          clientY: 121 + index / 2,
        }));
      }
    });
    flushSync(() => vi.advanceTimersByTime(100));

    expect(renderCounts.map).toBe(1);
    expect(cacheGetSpy).not.toHaveBeenCalled();
    expect(setAttributeSpy.mock.calls.filter(([name]) => name === "transform")).toHaveLength(1);

    flushSync(() => root.unmount());
    container.remove();
  });

  it("hits the layout cache when referentially new inputs have identical geometry", () => {
    const project = createProjectDocument({
      students: [{ id: "student-1", name: "林舟", university: "北京大学", city: "北京市", visibility: true }],
      templateId: "original",
      dataView: "province",
    });
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(cardLayoutCache.size).toBe(1);
    const originalTransform = container.querySelector("[data-destination-card]")?.getAttribute("transform");
    const cacheGetSpy = vi.spyOn(cardLayoutCache, "get");
    const identicalProject = {
      ...project,
      students: project.students.map((student) => ({ ...student })),
    };

    flushSync(() => root.render(<PosterCanvas project={identicalProject} exportMode />));

    expect(cacheGetSpy.mock.results.some(
      ({ type, value }) => type === "return" && value !== undefined,
    )).toBe(true);
    expect(cardLayoutCache.size).toBe(1);
    expect(container.querySelector("[data-destination-card]")?.getAttribute("transform"))
      .toBe(originalTransform);

    flushSync(() => root.unmount());
    container.remove();
  });
});
