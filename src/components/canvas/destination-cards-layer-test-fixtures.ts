/**
 * Shared fixtures for the `DestinationCardsLayer` test files: one card shape, one appearance
 * and one clamp box, so the connector-drag suite and the rendering suite describe the same
 * canvas instead of drifting apart.
 */
import { vi } from "vitest";
import type { CardLayoutBounds } from "../../lib/card-layout";
import { resolveEdgeStyle } from "../../lib/edge-styles";
import type { DestinationCardStyle } from "./DestinationCard";
import type { DestinationCardsAppearance, DestinationCardsLayerProps, PlacedDestinationCard } from "./DestinationCardsLayer";

export const CARD_STYLE = {} as DestinationCardStyle;

export const DRAG_BOUNDS: CardLayoutBounds = {
  width: 1200,
  height: 1600,
  map: { x: 400, y: 200, width: 400, height: 400 },
  occupiedAreas: [],
  occupiedPolygons: [],
  allowMapOverlap: true,
  margin: 24,
  gap: 10,
};

export function appearance(overrides: Partial<DestinationCardsAppearance> = {}): DestinationCardsAppearance {
  return {
    preset: "standard",
    presentation: "standard",
    connectorStyle: "straight",
    connectorDash: "dashed",
    connectorWidth: 2,
    background: "#ffffff",
    opacity: 0.95,
    textColor: "#1c3154",
    fontSize: 13,
    showProvinceTexture: false,
    activeColor: "#e2703a",
    edgeColor: "#39434e",
    lineHeightMultiplier: 1,
    ...overrides,
  };
}

export function card(overrides: Partial<PlacedDestinationCard> = {}): PlacedDestinationCard {
  const key = overrides.group?.key ?? "北京市";
  return {
    group: { key, title: key, count: 1, students: [] },
    province: key,
    isInternational: false,
    rows: [],
    titleLines: [[{ text: key, field: "title" }]],
    headerExtra: 0,
    width: 180,
    height: 120,
    anchorX: 620,
    anchorY: 300,
    placement: { id: key, anchorX: 620, anchorY: 300, x: 100, y: 200, width: 180, height: 120, side: "left" },
    ...overrides,
  };
}

export function layerProps(overrides: Partial<DestinationCardsLayerProps> = {}): DestinationCardsLayerProps {
  return {
    cards: [card()],
    style: CARD_STYLE,
    appearance: appearance(),
    connectorEdge: resolveEdgeStyle({ style: "dashed", color: "#39434e", width: 2, filterPrefix: "connector-edge" }),
    dragBounds: DRAG_BOUNDS,
    exportMode: false,
    renderIntervalMs: 0,
    canvasPoint: (event) => ({ x: event.clientX, y: event.clientY }),
    ...overrides,
  };
}

/** jsdom has no pointer capture, so the layer's capture guard needs stubbing to drag at all. */
export function draggable(container: HTMLDivElement, key = "北京市") {
  const node = container.querySelector<SVGGElement>(`[data-destination-card="${key}"]`)!;
  Object.assign(node, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  return node;
}
