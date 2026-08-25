import { useEffect, useRef } from "react";
import { clampDestinationCardPosition, type CardArea, type CardPolygon } from "../../lib/card-layout";
import { buildConnectorGeometry } from "../../lib/connector-geometry";
import type { DisplayFrameDefinition } from "../../lib/display-frame";
import type { ResolvedEdgeStyle } from "../../lib/edge-styles";
import { resolveFontFamily, type UserFont } from "../../lib/fonts";
import { connectorPathToCenter, referenceCardColor, type PlacedDestinationCard } from "../../lib/poster-card-rows";
import type { CardFrameLayout } from "../../lib/poster-display-frame";
import type { CanvasSettings, CardPresentation, CardSettings, MapSettings, SceneSelection } from "../../lib/scene-document";
import { clearCanvasPreview, createCanvasPreviewScheduler, scheduleCanvasPreview } from "./CanvasDragPreview";
import { canvasPointFromEvent } from "./poster-canvas-pointer";
import { renderReferenceCardVisual, renderStandardCardContent } from "./poster-card-visuals";

export interface DestinationCardsLayerProps {
  placedCards: PlacedDestinationCard[];
  cards: CardSettings;
  map: MapSettings;
  canvas: CanvasSettings;
  connectorEdge: ResolvedEdgeStyle;
  displayFrame: DisplayFrameDefinition;
  frame: CardFrameLayout;
  mapContentBounds: CardArea;
  layoutOccupiedAreas: CardArea[];
  layoutOccupiedPolygons: CardPolygon[];
  lineHeightMultiplier: number;
  userFonts: UserFont[];
  exportMode: boolean;
  /** Minimum interval between local drag-preview paints. Final positions always commit immediately. */
  renderIntervalMs: number;
  onSelect?: (selection: SceneSelection) => void;
  onMoveCard?: (id: string, x: number, y: number) => void;
}

/** 数据展示框图层：连接线 + 各省份/城市/学校板块卡片，支持单卡拖拽（含连接线跟随预览）。 */
export function DestinationCardsLayer({
  placedCards,
  cards,
  map,
  canvas,
  connectorEdge,
  displayFrame,
  frame,
  mapContentBounds,
  layoutOccupiedAreas,
  layoutOccupiedPolygons,
  lineHeightMultiplier,
  userFonts,
  exportMode,
  renderIntervalMs,
  onSelect,
  onMoveCard,
}: DestinationCardsLayerProps) {
  const cardDrag = useRef<{
    id: string;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
    x: number;
    y: number;
    originalX: number;
    originalY: number;
    element: SVGGElement;
    connectorGroup: SVGGElement;
    anchorX: number;
    anchorY: number;
    side: "left" | "right" | "top" | "bottom";
    connectorStyle: CardSettings["connectorStyle"];
    borderless: boolean;
    connectorHidden: boolean;
  } | null>(null);
  const cardPreviewScheduler = useRef(createCanvasPreviewScheduler<{ id: string; x: number; y: number }>());

  const updateCardPreview = (next: { id: string; x: number; y: number }) => {
    const drag = cardDrag.current;
    if (!drag || drag.id !== next.id) return;
    const placement = { x: next.x, y: next.y, width: drag.width, height: drag.height, side: drag.side };
    drag.element.setAttribute("transform", `translate(${next.x} ${next.y})`);
    const connector = drag.connectorHidden ? null : buildConnectorGeometry({
      card: placement,
      anchor: { x: drag.anchorX, y: drag.anchorY },
      style: drag.connectorStyle,
      preferredSide: drag.side,
    });
    const pathData = connector
      ? drag.borderless
        ? connectorPathToCenter(connector.pathData, connector.port, placement)
        : connector.pathData
      : null;
    if (pathData) {
      drag.connectorGroup.querySelectorAll<SVGPathElement>("path").forEach((path) => path.setAttribute("d", pathData));
    }
  };

  const clearCardPreview = () => clearCanvasPreview(cardPreviewScheduler.current);

  const scheduleCardPreview = (next: { id: string; x: number; y: number }) => {
    scheduleCanvasPreview(cardPreviewScheduler.current, next, renderIntervalMs, updateCardPreview);
  };

  useEffect(() => () => {
    clearCardPreview();
  }, []);

  if (placedCards.length === 0) return null;

  return (
    <g
      data-cards-layer
      onClick={!exportMode ? () => onSelect?.({ type: "cards" }) : undefined}
      role={!exportMode && onSelect ? "button" : undefined}
      tabIndex={!exportMode && onSelect ? 0 : undefined}
      aria-label={!exportMode && onSelect ? `选择数据展示框（${placedCards.length} 个板块）` : undefined}
      onKeyDown={!exportMode && onSelect ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect({ type: "cards" });
        }
      } : undefined}
    >
      {connectorEdge.filters.length > 0 && (
        <defs data-connector-edge-filters>
          {connectorEdge.filters.map((filter) => (
            filter.markupKey === "soft-glow" ? (
              <filter key={filter.id} id={filter.id} x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation={Math.max(1.2, cards.connectorWidth)} result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            ) : filter.markupKey === "ink" ? (
              <filter key={filter.id} id={filter.id} x="-20%" y="-20%" width="140%" height="140%">
                <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale={Math.max(0.6, cards.connectorWidth * 0.35)} />
              </filter>
            ) : null
          ))}
        </defs>
      )}
      {placedCards.map(({ group, province, isInternational, rows, titleLines, headerExtra, anchorX, anchorY, placement }) => {
        const displayPlacement = placement;
        const provinceAppearance = map.provinceStyles?.[province]?.appearance;
        const provinceTexture = cards.showProvinceTexture === true
          && provinceAppearance
          && provinceAppearance.kind !== "manual-color"
          ? provinceAppearance
          : null;
        const connector = isInternational ? null : buildConnectorGeometry({
          card: displayPlacement,
          anchor: { x: anchorX, y: anchorY },
          style: cards.connectorStyle,
          preferredSide: displayPlacement.side,
        });
        // Borderless cards have no border stroke to visually terminate the connector,
        // so the line runs to the card center where the card fill hides it. When the
        // fill is too transparent to cover the line (it would cross the card text),
        // the connector is omitted entirely.
        const borderlessCards = cards.preset === "borderless";
        const connectorHidden = connector !== null && borderlessCards && (cards.opacity ?? 1) < 0.9;
        const displayConnector = connector !== null && !connectorHidden
          ? borderlessCards
            ? { ...connector, pathData: connectorPathToCenter(connector.pathData, connector.port, displayPlacement) }
            : connector
          : null;
        const strokeNodes = [
          ...(displayConnector ? connectorEdge.underlays.map((spec, index) => (
            <path
              key={`${group.key}-u-${index}`}
              data-destination-connector-underlay={group.key}
              d={displayConnector.pathData}
              fill="none"
              stroke={spec.color}
              strokeWidth={spec.width}
              strokeDasharray={spec.dasharray}
              strokeLinecap={spec.linecap}
              strokeLinejoin={spec.linejoin}
              opacity={spec.opacity ?? 0.55}
              filter={spec.filter}
              pointerEvents="none"
            />
          )) : []),
          ...(displayConnector ? connectorEdge.strokes.map((spec, index) => (
            <path
              key={`${group.key}-s-${index}`}
              data-destination-connector={index === 0 ? group.key : undefined}
              data-connector-style={cards.connectorStyle}
              data-connector-dash={cards.connectorDash}
              d={displayConnector.pathData}
              fill="none"
              stroke={spec.color}
              strokeWidth={spec.width}
              strokeDasharray={spec.dasharray}
              strokeLinecap={spec.linecap}
              strokeLinejoin={spec.linejoin}
              opacity={spec.opacity ?? 0.85}
              filter={spec.filter}
            />
          )) : []),
        ];
        return (
          <g key={group.key}>
            {strokeNodes}
            {!isInternational && <circle data-destination-anchor={group.key} cx={anchorX} cy={anchorY} r={4} fill={map.activeColor} />}
            <g
              transform={`translate(${displayPlacement.x} ${displayPlacement.y})`}
              data-destination-card={group.key}
              data-card-preset={cards.preset}
              data-card-presentation={cards.presentation ?? "standard"}
              className="destination-card"
              onPointerDown={!exportMode && onMoveCard ? (event) => {
                const point = canvasPointFromEvent(event, canvas.width, canvas.height);
                if (!point) return;
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                const connectorGroup = event.currentTarget.parentElement;
                if (!connectorGroup) return;
                cardDrag.current = {
                  id: group.key,
                  offsetX: point.x - displayPlacement.x,
                  offsetY: point.y - displayPlacement.y,
                  width: displayPlacement.width,
                  height: displayPlacement.height,
                  x: displayPlacement.x,
                  y: displayPlacement.y,
                  originalX: displayPlacement.x,
                  originalY: displayPlacement.y,
                  element: event.currentTarget,
                  connectorGroup: connectorGroup as unknown as SVGGElement,
                  anchorX,
                  anchorY,
                  side: displayPlacement.side,
                  connectorStyle: cards.connectorStyle,
                  borderless: borderlessCards,
                  connectorHidden,
                };
              } : undefined}
              onPointerMove={!exportMode && onMoveCard ? (event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId) || !cardDrag.current) return;
                const point = canvasPointFromEvent(event, canvas.width, canvas.height);
                if (!point) return;
                const drag = cardDrag.current;
                const position = clampDestinationCardPosition({
                  x: point.x - drag.offsetX,
                  y: point.y - drag.offsetY,
                  width: drag.width,
                  height: drag.height,
                }, {
                  width: canvas.width,
                  height: canvas.height,
                  map: mapContentBounds,
                  occupiedAreas: layoutOccupiedAreas,
                  occupiedPolygons: layoutOccupiedPolygons,
                  allowMapOverlap: cards.allowMapOverlap === true,
                  margin: canvas.safeMargin,
                  gap: Math.max(10, cards.gap),
                });
                drag.x = Math.round(position.x);
                drag.y = Math.round(position.y);
                scheduleCardPreview({ id: drag.id, x: drag.x, y: drag.y });
              } : undefined}
              onPointerUp={!exportMode && onMoveCard ? (event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                const drag = cardDrag.current;
                if (drag) onMoveCard(drag.id, drag.x, drag.y);
                clearCardPreview();
                cardDrag.current = null;
              } : undefined}
              onPointerCancel={!exportMode && onMoveCard ? () => {
                const drag = cardDrag.current;
                if (drag) updateCardPreview({ id: drag.id, x: drag.originalX, y: drag.originalY });
                clearCardPreview();
                cardDrag.current = null;
              } : undefined}
            >
              {(cards.presentation ?? "standard") !== "standard" ? renderReferenceCardVisual({
                presentation: cards.presentation as Exclude<CardPresentation, "standard">,
                group,
                rows,
                width: placement.width,
                height: placement.height,
                accent: map.provinceStyles?.[province]?.appearance?.kind === "manual-color"
                  ? map.provinceStyles[province]!.appearance!.color
                  : referenceCardColor(group.key, map.activeColor),
                background: cards.background,
                opacity: cards.opacity,
                textColor: cards.textColor,
                fontSize: cards.fontSize,
                edgeColor: map.edgeColor,
                titleFont: resolveFontFamily(cards.fieldFonts?.title, userFonts),
              }) : renderStandardCardContent({
                cards,
                map,
                displayFrame,
                frame,
                group,
                province,
                provinceTexture,
                placement,
                titleLines,
                headerExtra,
                rows,
                lineHeightMultiplier,
                userFonts,
              })}
            </g>
          </g>
        );
      })}
    </g>
  );
}
