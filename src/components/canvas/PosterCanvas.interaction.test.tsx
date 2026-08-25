import { describe, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { PosterCanvas } from "./PosterCanvas";
import { createProjectDocument } from "../../lib/project-document";
import { installPosterCanvasTestHarness, students, trackedRoot } from "./poster-canvas-test-harness";

installPosterCanvasTestHarness();

describe("PosterCanvas interaction", () => {
  it("uses scene text properties and reports selection targets", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const onSelect = vi.fn();
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} onSelect={onSelect} />));

    const title = container.querySelector('[data-text-id="text-title"]') as SVGGElement;
    expect(title.querySelector("text")?.getAttribute("font-size")).toBe("42");
    expect(title.querySelector("text")?.getAttribute("font-weight")).toBe("700");
    Object.assign(title, {
      setPointerCapture: vi.fn(),
    });
    const svg = container.querySelector("svg") as SVGSVGElement;
    Object.assign(svg, {
      createSVGPoint: vi.fn(() => ({
        x: 0,
        y: 0,
        matrixTransform: vi.fn(() => ({ x: 72, y: 126 })),
      })),
      getScreenCTM: vi.fn(() => ({ inverse: vi.fn(() => ({}) ) })),
    });
    flushSync(() => title.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: 72, clientY: 126 })));
    expect(onSelect).toHaveBeenCalledWith({ type: "text", id: "text-title" });
  });

  it("reports a dragged destination card position", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const onMoveCard = vi.fn();
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} onMoveCard={onMoveCard} />));

    const card = container.querySelector<SVGGElement>("[data-destination-card]")!;
    Object.assign(card, { setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() });
    flushSync(() => card.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 120, clientY: 120, pointerId: 1 })));
    flushSync(() => card.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 160, clientY: 150, pointerId: 1 })));

    expect(onMoveCard).not.toHaveBeenCalled();
    flushSync(() => card.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 160, clientY: 150, pointerId: 1 })));
    expect(onMoveCard).toHaveBeenCalledTimes(1);
  });

  it("limits destination-card drag previews to the configured render interval", () => {
    vi.useFakeTimers();
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} renderIntervalMs={100} onMoveCard={vi.fn()} />));
    const card = container.querySelector<SVGGElement>("[data-destination-card]")!;
    Object.assign(card, { setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() });
    const initial = card.getAttribute("transform");

    flushSync(() => card.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 120, clientY: 120, pointerId: 1 })));
    flushSync(() => card.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 200, clientY: 180, pointerId: 1 })));
    expect(card.getAttribute("transform")).toBe(initial);
    flushSync(() => vi.advanceTimersByTime(100));
    expect(card.getAttribute("transform")).not.toBe(initial);

    vi.useRealTimers();
  });

  it("reports canvas, map, and card selections without rendering editor overlays for export", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const onSelect = vi.fn();
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} onSelect={onSelect} />));

    const svg = container.querySelector("svg")!;
    const map = container.querySelector("[data-map-frame]")!;
    const cards = container.querySelector("[data-cards-layer]")!;
    flushSync(() => svg.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    flushSync(() => map.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    flushSync(() => cards.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSelect).toHaveBeenCalledWith({ type: "canvas" });
    expect(onSelect).toHaveBeenCalledWith({ type: "map" });
    expect(onSelect).toHaveBeenCalledWith({ type: "cards" });

    flushSync(() => root.render(<PosterCanvas project={project} exportMode onSelect={onSelect} />));
    expect(container.querySelector("[data-map-selection-overlay]")).toBeNull();
    expect(container.querySelector("[data-selection-overlay]")).toBeNull();
  });
});
