import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const renderCounts = vi.hoisted(() => ({ card: 0, reference: 0 }));
// Drop adaptation is the solver's job; stubbing it keeps these tests about what the layer
// forwards and commits rather than about which neighbour the real solver picks.
const adapt = vi.hoisted(() => ({
  impl: null as null | ((...args: unknown[]) => unknown),
  calls: [] as unknown[][],
}));

// Counts the connector geometry the layer asks for, including the imperative rebuilds a
// drag issues per paint — a card that shows no connector must not compute one.
const connectorGeometry = vi.hoisted(() => ({ calls: [] as unknown[][] }));

vi.mock("../../lib/connector-geometry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/connector-geometry")>();
  return {
    ...actual,
    buildConnectorGeometry: (...args: Parameters<typeof actual.buildConnectorGeometry>) => {
      connectorGeometry.calls.push(args);
      return actual.buildConnectorGeometry(...args);
    },
  };
});

vi.mock("../../lib/card-layout-adapt", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/card-layout-adapt")>();
  return {
    ...actual,
    adaptCardLayout: (...args: unknown[]) => {
      adapt.calls.push(args);
      return adapt.impl ? adapt.impl(...args) : args[0];
    },
  };
});

// Plain (unmemoized) stubs: they re-run exactly when the layer body re-runs, which makes
// them the probe for the layer's own memo.
vi.mock("./DestinationCard", () => ({
  DestinationCard: function CountingDestinationCard() {
    renderCounts.card += 1;
    return <g data-card-body />;
  },
}));
vi.mock("./ReferenceCardVisual", () => ({
  referenceCardColor: () => "#123456",
  ReferenceCardVisual: function CountingReferenceCard() {
    renderCounts.reference += 1;
    return <g data-reference-card-body />;
  },
}));

import { DestinationCardsLayer, type DestinationCardsLayerProps } from "./DestinationCardsLayer";
import type { CardPlacement } from "../../lib/card-layout";
import { resolveEdgeStyle } from "../../lib/edge-styles";
import { DRAG_BOUNDS, appearance, card, draggable, layerProps } from "./destination-cards-layer-test-fixtures";

const mounted: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = [];

function render(overrides: Partial<DestinationCardsLayerProps> = {}) {
  const container = document.createElement("div");
  const root = createRoot(container);
  mounted.push({ root, container });
  const props = layerProps(overrides);
  flushSync(() => root.render(<svg><DestinationCardsLayer {...props} /></svg>));
  return { container, root, props };
}

afterEach(() => {
  vi.useRealTimers();
  renderCounts.card = 0;
  renderCounts.reference = 0;
  adapt.impl = null;
  adapt.calls.length = 0;
  connectorGeometry.calls.length = 0;
  while (mounted.length > 0) {
    const entry = mounted.pop()!;
    flushSync(() => entry.root.unmount());
    entry.container.remove();
  }
});

describe("DestinationCardsLayer", () => {
  it("keeps the frozen canvas data attribute names for cards, connectors and anchors", () => {
    const { container } = render();

    expect(container.querySelector("[data-cards-layer]")).not.toBeNull();
    const cardNode = container.querySelector('[data-destination-card="北京市"]')!;
    expect(cardNode.getAttribute("transform")).toBe("translate(100 200)");
    expect(cardNode.getAttribute("data-card-preset")).toBe("standard");
    expect(cardNode.getAttribute("data-card-presentation")).toBe("standard");

    const connector = container.querySelector('[data-destination-connector="北京市"]')!;
    expect(connector.getAttribute("data-connector-style")).toBe("straight");
    expect(connector.getAttribute("data-connector-dash")).toBe("dashed");
    expect(connector.getAttribute("d")).toMatch(/^M/);

    const anchor = container.querySelector('[data-destination-anchor="北京市"]')!;
    expect(anchor.getAttribute("cx")).toBe("620");
    expect(anchor.getAttribute("cy")).toBe("300");
  });

  it("renders nothing when there is no placed card", () => {
    const { container } = render({ cards: [] });
    expect(container.querySelector("[data-cards-layer]")).toBeNull();
  });

  it("omits the connector and the anchor dot for an international group", () => {
    const { container } = render({
      cards: [card({ group: { key: "海外", title: "海外", count: 2, students: [] }, isInternational: true })],
    });

    expect(container.querySelector('[data-destination-card="海外"]')).not.toBeNull();
    expect(container.querySelector("[data-destination-connector]")).toBeNull();
    expect(container.querySelector("[data-destination-anchor]")).toBeNull();
  });

  it("emits the connector filter defs the resolved edge style asks for", () => {
    const { container } = render({
      connectorEdge: resolveEdgeStyle({ style: "soft-glow", color: "#39434e", width: 2, filterPrefix: "connector-edge" }),
    });
    const filter = container.querySelector("[data-connector-edge-filters] filter")!;
    expect(filter).not.toBeNull();
    // Scoped, but still derived from the document-wide prefix so the style stays recognizable.
    expect(filter.getAttribute("id")).toMatch(/^connector-edge-soft-glow-[A-Za-z0-9_-]+$/);
    expect(container.querySelector('[data-destination-connector-underlay="北京市"]')?.getAttribute("filter"))
      .toBe(`url(#${filter.getAttribute("id")})`);
  });

  it("gives two canvases on one page their own connector filter ids", () => {
    const glow = resolveEdgeStyle({ style: "soft-glow", color: "#39434e", width: 2, filterPrefix: "connector-edge" });
    const container = document.createElement("div");
    const root = createRoot(container);
    mounted.push({ root, container });
    // Both canvases live in the same React tree, the way the editor and a template preview do.
    flushSync(() => root.render(
      <>
        <svg data-canvas="editor"><DestinationCardsLayer {...layerProps({ connectorEdge: glow })} /></svg>
        <svg data-canvas="preview"><DestinationCardsLayer {...layerProps({ connectorEdge: glow })} /></svg>
      </>,
    ));

    const [editorFilter, previewFilter] = Array.from(
      container.querySelectorAll("[data-connector-edge-filters] filter"),
    ).map((node) => node.getAttribute("id")!);
    expect(editorFilter).toBeTruthy();
    expect(editorFilter).not.toBe(previewFilter);

    for (const [canvas, filterId] of [["editor", editorFilter], ["preview", previewFilter]] as const) {
      const scope = container.querySelector(`[data-canvas="${canvas}"]`)!;
      expect(scope.querySelector('[data-destination-connector-underlay="北京市"]')?.getAttribute("filter"))
        .toBe(`url(#${filterId})`);
      // The reference must resolve inside its own canvas, including after an export clone.
      expect(scope.querySelector(`#${filterId}`)).not.toBeNull();
    }
  });

  it("moves the card and its connector imperatively during a drag, then commits on release", () => {
    vi.useFakeTimers();
    const onMoveCard = vi.fn();
    const { container } = render({ onMoveCard, renderIntervalMs: 100 });
    const node = draggable(container);
    const connector = container.querySelector('[data-destination-connector="北京市"]')!;
    const before = connector.getAttribute("d");
    connectorGeometry.calls.length = 0;

    flushSync(() => node.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: 110, clientY: 210 })));
    flushSync(() => node.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: 300, clientY: 400 })));
    // Throttled: nothing paints until the interval elapses.
    expect(node.getAttribute("transform")).toBe("translate(100 200)");

    flushSync(() => vi.advanceTimersByTime(100));
    expect(node.getAttribute("transform")).toBe("translate(290 390)");
    expect(connector.getAttribute("d")).not.toBe(before);
    expect(connectorGeometry.calls.length).toBeGreaterThan(0);
    expect(onMoveCard).not.toHaveBeenCalled();

    flushSync(() => node.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 })));
    expect(onMoveCard).toHaveBeenCalledWith("北京市", 290, 390);
  });

  it("keeps the drag preview of an international card free of a connector", () => {
    vi.useFakeTimers();
    const onMoveCard = vi.fn();
    const { container } = render({
      cards: [card({
        group: { key: "海外", title: "海外", count: 2, students: [] },
        province: "海外",
        isInternational: true,
      })],
      onMoveCard,
      renderIntervalMs: 100,
    });
    const node = draggable(container, "海外");
    connectorGeometry.calls.length = 0;

    flushSync(() => node.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: 110, clientY: 210 })));
    flushSync(() => node.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: 300, clientY: 400 })));
    flushSync(() => vi.advanceTimersByTime(100));

    expect(node.getAttribute("transform")).toBe("translate(290 390)");
    // An international group has no anchor, so the preview must neither compute nor paint a line.
    expect(connectorGeometry.calls).toEqual([]);
    expect(container.querySelectorAll("path")).toHaveLength(0);
    expect(container.querySelector("[data-destination-connector]")).toBeNull();

    flushSync(() => node.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 })));
    expect(onMoveCard).toHaveBeenCalledWith("海外", 290, 390);
  });

  it("keeps drawing the drag preview connector for a domestic card in the same layer", () => {
    vi.useFakeTimers();
    const overseas = card({
      group: { key: "海外", title: "海外", count: 2, students: [] },
      province: "海外",
      isInternational: true,
      placement: { id: "海外", anchorX: 620, anchorY: 300, x: 700, y: 900, width: 180, height: 120, side: "right" },
    });
    const { container } = render({ cards: [card(), overseas], onMoveCard: vi.fn(), renderIntervalMs: 100 });
    const node = draggable(container);
    const connector = container.querySelector('[data-destination-connector="北京市"]')!;
    const before = connector.getAttribute("d");

    flushSync(() => node.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: 110, clientY: 210 })));
    flushSync(() => node.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: 300, clientY: 400 })));
    flushSync(() => vi.advanceTimersByTime(100));

    expect(connector.getAttribute("d")).not.toBe(before);
    expect(container.querySelectorAll("[data-destination-connector]")).toHaveLength(1);
  });

  it("commits the neighbours a drop pushed aside in the same call", () => {
    vi.useFakeTimers();
    const neighbour = card({
      group: { key: "浙江省", title: "浙江省", count: 1, students: [] },
      province: "浙江省",
      placement: { id: "浙江省", anchorX: 620, anchorY: 300, x: 300, y: 380, width: 180, height: 120, side: "left" },
    });
    const still = card({
      group: { key: "广东省", title: "广东省", count: 1, students: [] },
      province: "广东省",
      placement: { id: "广东省", anchorX: 620, anchorY: 300, x: 700, y: 900, width: 180, height: 120, side: "right" },
    });
    // Stands in for the solver: the dragged card lands on its target, the neighbour steps aside.
    adapt.impl = (placements, movedId, nextPosition) => (placements as CardPlacement[]).map((placement) =>
      placement.id === movedId
        ? { ...placement, ...(nextPosition as { x: number; y: number }) }
        : placement.id === "浙江省" ? { ...placement, y: 520.4 } : placement);
    const onMoveCard = vi.fn();
    const { container } = render({ cards: [card(), neighbour, still], onMoveCard, renderIntervalMs: 100 });
    const node = draggable(container);

    flushSync(() => node.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: 110, clientY: 210 })));
    flushSync(() => node.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: 300, clientY: 400 })));
    flushSync(() => vi.advanceTimersByTime(100));
    flushSync(() => node.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 })));

    // The adapter sees the clamped drop position and the same protected geometry the drag used.
    expect(adapt.calls[0]?.[1]).toBe("北京市");
    expect(adapt.calls[0]?.[2]).toEqual({ x: 290, y: 390 });
    expect(adapt.calls[0]?.[3]).toBe(DRAG_BOUNDS);
    // One call, so one undo step: the dragged card and the neighbour that stepped aside.
    expect(onMoveCard).toHaveBeenCalledTimes(1);
    expect(onMoveCard).toHaveBeenCalledWith("北京市", 290, 390, {
      "北京市": { x: 290, y: 390 },
      "浙江省": { x: 300, y: 520 },
    });
  });

  it("keeps the single-card commit when the drop rearranges nothing else", () => {
    vi.useFakeTimers();
    const neighbour = card({
      group: { key: "浙江省", title: "浙江省", count: 1, students: [] },
      province: "浙江省",
      placement: { id: "浙江省", anchorX: 620, anchorY: 300, x: 700, y: 900, width: 180, height: 120, side: "right" },
    });
    const onMoveCard = vi.fn();
    const { container } = render({ cards: [card(), neighbour], onMoveCard, renderIntervalMs: 100 });
    const node = draggable(container);

    flushSync(() => node.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: 110, clientY: 210 })));
    flushSync(() => node.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: 300, clientY: 400 })));
    flushSync(() => vi.advanceTimersByTime(100));
    flushSync(() => node.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 })));

    expect(onMoveCard).toHaveBeenCalledWith("北京市", 290, 390);
  });

  it("restores the original placement when the drag is cancelled", () => {
    vi.useFakeTimers();
    const onMoveCard = vi.fn();
    const { container } = render({ onMoveCard, renderIntervalMs: 100 });
    const node = draggable(container);

    flushSync(() => node.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: 110, clientY: 210 })));
    flushSync(() => node.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: 300, clientY: 400 })));
    flushSync(() => vi.advanceTimersByTime(100));
    flushSync(() => node.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1 })));

    expect(node.getAttribute("transform")).toBe("translate(100 200)");
    expect(onMoveCard).not.toHaveBeenCalled();
  });

  it("drops drag handlers and the selection role in export mode", () => {
    const onMoveCard = vi.fn();
    const onSelectCards = vi.fn();
    const { container } = render({ exportMode: true, onMoveCard, onSelectCards });
    const node = draggable(container);

    expect(container.querySelector("[data-cards-layer]")?.getAttribute("role")).toBeNull();
    flushSync(() => node.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: 110, clientY: 210 })));
    flushSync(() => node.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 })));
    flushSync(() => container.querySelector("[data-cards-layer]")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(onMoveCard).not.toHaveBeenCalled();
    expect(onSelectCards).not.toHaveBeenCalled();
  });

  it("reports a cards selection on click in editor mode", () => {
    const onSelectCards = vi.fn();
    const { container } = render({ onSelectCards });
    const layer = container.querySelector("[data-cards-layer]")!;

    expect(layer.getAttribute("role")).toBe("button");
    flushSync(() => layer.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSelectCards).toHaveBeenCalledTimes(1);
  });

  it("routes non-standard presentations to the reference visual", () => {
    const { container } = render({ appearance: appearance({ presentation: "glass-stat" }) });

    expect(container.querySelector("[data-reference-card-body]")).not.toBeNull();
    expect(container.querySelector("[data-card-body]")).toBeNull();
    expect(container.querySelector('[data-destination-card="北京市"]')?.getAttribute("data-card-presentation"))
      .toBe("glass-stat");
  });

  it("skips its own body when every prop is unchanged", () => {
    const props = layerProps();
    const container = document.createElement("div");
    const root = createRoot(container);
    mounted.push({ root, container });
    const paint = () => flushSync(() => root.render(<svg><DestinationCardsLayer {...props} /></svg>));

    paint();
    expect(renderCounts.card).toBe(1);

    paint();
    paint();

    expect(renderCounts.card).toBe(1);
  });
});
