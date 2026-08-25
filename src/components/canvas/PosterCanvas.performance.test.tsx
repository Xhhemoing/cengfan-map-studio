import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";

const renderCounts = vi.hoisted(() => ({ map: 0, card: 0, guests: 0, canvasBody: 0 }));

vi.mock("./MapLayer", () => ({
  MapLayer: () => {
    renderCounts.map += 1;
    return <g data-map-layer />;
  },
}));
// The real GuestsLayer is memoized, so the stub keeps that shape. The plain outer function is
// re-invoked exactly when the PosterCanvas body re-runs, which makes it the body's render probe.
vi.mock("./GuestsLayer", async () => {
  const { memo } = await import("react");
  const MemoizedStub = memo(function CountingGuestsLayer() {
    renderCounts.guests += 1;
    return <g data-guests-layer />;
  });
  return {
    GuestsLayer: (props: Record<string, unknown>) => {
      renderCounts.canvasBody += 1;
      return <MemoizedStub {...props} />;
    },
  };
});
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

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

afterEach(() => {
  // An assertion throwing before the inline unmount would leave the canvas mounted
  // with its drag render timer armed, racing jsdom teardown for the rest of the run.
  flushSync(() => {
    for (const { root, container } of mounted.splice(0)) {
      root.unmount();
      container.remove();
    }
  });
  vi.useRealTimers();
  renderCounts.map = 0;
  renderCounts.card = 0;
  renderCounts.guests = 0;
  renderCounts.canvasBody = 0;
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
    mounted.push({ root, container });
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

  it("skips the canvas body entirely when no prop it draws from changed", () => {
    const project = createProjectDocument({
      students: [{ id: "student-1", name: "林舟", university: "北京大学", city: "北京市", visibility: true }],
      templateId: "original",
      dataView: "province",
    });
    const onMoveCard = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    // A fresh element every time, so only memo — never React's element-identity bailout —
    // can keep the body from re-running.
    const render = () => flushSync(() => root.render(<PosterCanvas project={project} onMoveCard={onMoveCard} />));
    render();
    // The layout hook commits its solved placements right after mount, so settle first.
    render();
    const settled = renderCounts.canvasBody;

    render();
    render();

    expect(renderCounts.canvasBody).toBe(settled);

    flushSync(() => root.unmount());
    container.remove();
  });

  it("keeps destination cards out of a map pan and zoom", () => {
    const project = createProjectDocument({
      students: [
        { id: "student-1", name: "林舟", university: "北京大学", city: "北京市", visibility: true },
        { id: "student-2", name: "沈青", university: "浙江大学", city: "杭州市", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });
    const onMoveCard = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} onMoveCard={onMoveCard} />));
    flushSync(() => root.render(<PosterCanvas project={project} onMoveCard={onMoveCard} />));

    const anchorBefore = container.querySelector("[data-destination-anchor]")!.getAttribute("cx");
    const settledCards = renderCounts.card;

    // Panning and zooming moves every anchor, so connectors and placements must repaint —
    // but the wrapped text and card sizes a card body draws from cannot change.
    const moved = {
      ...project,
      map: { ...project.map, x: project.map.x + 140, y: project.map.y + 90, scale: project.map.scale * 0.8 },
    };
    flushSync(() => root.render(<PosterCanvas project={moved} onMoveCard={onMoveCard} />));

    expect(container.querySelector("[data-destination-anchor]")!.getAttribute("cx")).not.toBe(anchorBefore);
    expect(renderCounts.card).toBe(settledCards);

    flushSync(() => root.unmount());
    container.remove();
  });

  it("keeps the map and guest layers out of a selection-only re-render", () => {
    const project = createProjectDocument({
      students: [{ id: "student-1", name: "林舟", university: "北京大学", city: "北京市", visibility: true }],
      templateId: "original",
      dataView: "province",
    });
    const onMoveCard = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} onMoveCard={onMoveCard} />));
    flushSync(() => root.render(<PosterCanvas project={project} onMoveCard={onMoveCard} />));

    expect(container.querySelector("[data-guests-layer]")).not.toBeNull();
    const settledBody = renderCounts.canvasBody;
    const settledMap = renderCounts.map;
    const settledGuests = renderCounts.guests;

    flushSync(() => root.render(
      <PosterCanvas project={project} onMoveCard={onMoveCard} selectedTextId="text-title" />,
    ));

    // The body re-runs (a canvas prop changed) but neither layer received new props.
    expect(renderCounts.canvasBody).toBe(settledBody + 1);
    expect(renderCounts.map).toBe(settledMap);
    expect(renderCounts.guests).toBe(settledGuests);

    flushSync(() => root.unmount());
    container.remove();
  });
});
