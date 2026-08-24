import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

const renderCounts = vi.hoisted(() => ({ map: 0, card: 0 }));

vi.mock("./MapLayer", () => ({
  MapLayer: () => {
    renderCounts.map += 1;
    return <g data-map-layer />;
  },
}));
vi.mock("./RegionalAssetLayer", () => ({ RegionalAssetLayer: () => null }));
vi.mock("./DecorationLayer", () => ({ DecorationLayer: () => null }));
vi.mock("./TextLayer", () => ({ TextLayer: () => null }));
// A memo stub stands in for the real card so the assertions read "PosterCanvas handed the
// card the same props again", independent of the card's own render cost.
vi.mock("./DestinationCard", async () => {
  const { memo } = await import("react");
  return {
    DestinationCard: memo(function CountingDestinationCard() {
      renderCounts.card += 1;
      return <g data-card-body />;
    }),
  };
});

import { PosterCanvas } from "./PosterCanvas";
import { createProjectDocument } from "../../lib/project-document";

afterEach(() => {
  vi.useRealTimers();
  renderCounts.map = 0;
  renderCounts.card = 0;
});

describe("PosterCanvas interaction rendering", () => {
  it("keeps the map layer out of destination-card preview renders", () => {
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

    flushSync(() => card.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      pointerId: 1,
      clientX: 120,
      clientY: 120,
    })));
    flushSync(() => card.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      pointerId: 1,
      clientX: 200,
      clientY: 180,
    })));
    flushSync(() => vi.advanceTimersByTime(100));

    expect(renderCounts.map).toBe(1);

    flushSync(() => root.unmount());
    container.remove();
  });

  it("keeps destination cards out of renders driven by unrelated canvas state", () => {
    const project = createProjectDocument({
      students: [
        { id: "student-1", name: "林舟", university: "北京大学", city: "北京市", visibility: true },
        { id: "student-2", name: "沈青", university: "浙江大学", city: "杭州市", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} onMoveCard={vi.fn()} />));

    expect(container.querySelectorAll("[data-destination-card]")).toHaveLength(2);
    expect(renderCounts.card).toBe(2);

    flushSync(() => root.render(
      <PosterCanvas project={project} onMoveCard={vi.fn()} showGrid selectedTextId="text-title" />,
    ));

    expect(container.querySelector("[data-editor-grid]")).not.toBeNull();
    expect(renderCounts.card).toBe(2);

    // A committed card position replaces project.cards, but nothing a card body draws
    // depends on it, so only the wrapping transform is expected to change.
    const movedKey = container.querySelector("[data-destination-card]")!.getAttribute("data-destination-card")!;
    const movedProject = { ...project, cards: { ...project.cards, positions: { [movedKey]: { x: 40, y: 60 } } } };
    flushSync(() => root.render(<PosterCanvas project={movedProject} onMoveCard={vi.fn()} />));

    expect(container.querySelector(`[data-destination-card="${movedKey}"]`)?.getAttribute("transform")).toBe("translate(40 60)");
    expect(renderCounts.card).toBe(2);

    flushSync(() => root.unmount());
    container.remove();
  });
});
