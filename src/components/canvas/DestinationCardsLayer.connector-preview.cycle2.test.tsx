import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { resolveEdgeStyle } from "../../lib/edge-styles";
import {
  DestinationCardsLayer,
  type DestinationCardsAppearance,
  type DestinationCardsLayerProps,
  type PlacedDestinationCard,
} from "./DestinationCardsLayer";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

const card: PlacedDestinationCard = {
  group: { key: "北京市", title: "北京市", count: 1, students: [] },
  province: "北京市",
  isInternational: false,
  rows: [],
  titleLines: [[{ text: "北京市", field: "title" }]],
  headerExtra: 0,
  width: 180,
  height: 120,
  anchorX: 620,
  anchorY: 300,
  placement: {
    id: "北京市",
    anchorX: 620,
    anchorY: 300,
    x: 100,
    y: 200,
    width: 180,
    height: 120,
    side: "left",
  },
};

const appearance: DestinationCardsAppearance = {
  preset: "standard",
  presentation: "emblem-list",
  connectorStyle: "straight",
  connectorDash: "solid",
  connectorWidth: 2,
  background: "#ffffff",
  opacity: 1,
  textColor: "#1c3154",
  fontSize: 13,
  showProvinceTexture: false,
  activeColor: "#e2703a",
  edgeColor: "#39434e",
  lineHeightMultiplier: 1,
};

afterEach(() => {
  vi.useRealTimers();
  mounted.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

describe("DestinationCardsLayer connector drag preview", () => {
  it("updates only connector paths and preserves emblem-list artwork paths", () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    const root = createRoot(container);
    mounted.push({ root, container });
    const props: DestinationCardsLayerProps = {
      cards: [card],
      style: {} as DestinationCardsLayerProps["style"],
      appearance,
      connectorEdge: resolveEdgeStyle({
        style: "solid",
        color: "#39434e",
        width: 2,
        filterPrefix: "connector-preview-cycle2",
      }),
      dragBounds: {
        width: 1200,
        height: 1600,
        map: { x: 400, y: 200, width: 400, height: 400 },
        occupiedAreas: [],
        occupiedPolygons: [],
        allowMapOverlap: true,
        margin: 24,
        gap: 10,
      },
      exportMode: false,
      renderIntervalMs: 100,
      canvasPoint: (event) => ({ x: event.clientX, y: event.clientY }),
      onMoveCard: vi.fn(),
    };

    flushSync(() => root.render(<svg><DestinationCardsLayer {...props} /></svg>));

    const cardNode = container.querySelector<SVGGElement>('[data-destination-card="北京市"]')!;
    const artworkPath = cardNode.querySelector<SVGPathElement>("path")!;
    const connector = container.querySelector<SVGPathElement>('[data-destination-connector="北京市"]')!;
    const artworkBefore = artworkPath.getAttribute("d");
    const connectorBefore = connector.getAttribute("d");
    expect(artworkBefore).toBeTruthy();

    Object.assign(cardNode, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn(),
    });
    flushSync(() => cardNode.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      pointerId: 1,
      clientX: 110,
      clientY: 210,
    })));
    flushSync(() => cardNode.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      pointerId: 1,
      clientX: 300,
      clientY: 400,
    })));
    flushSync(() => vi.advanceTimersByTime(100));

    const connectorAfter = connector.getAttribute("d");
    expect(connectorAfter).not.toBe(connectorBefore);
    expect(artworkPath.getAttribute("d")).toBe(artworkBefore);
    expect(artworkPath.getAttribute("d")).not.toBe(connectorAfter);
  });
});
