import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  vi.useRealTimers();
  renderCounts.map = 0;
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
});
