import { memo, useCallback, useEffect, useId, useMemo, useRef, type PointerEvent } from "react";
import { clampDestinationCardPosition, type CardLayoutBounds, type CardPlacement } from "../../lib/card-layout";
import { buildConnectorGeometry, type ConnectorStyle } from "../../lib/connector-geometry";
import { scopeEdgeStyleFilters, type EdgeStyle, type ResolvedEdgeStyle } from "../../lib/edge-styles";
import type { PreparedCard } from "../../lib/prepared-card-content";
import type { CardPresentation, ProvinceStyle } from "../../lib/scene-document";
import type { CardPreset } from "../../lib/template-document";
import { DestinationCard, type DestinationCardStyle } from "./DestinationCard";
import { ReferenceCardVisual, referenceCardColor, type ReferenceCardPresentation } from "./ReferenceCardVisual";
import { clearCanvasPreview, createCanvasPreviewScheduler, scheduleCanvasPreview } from "./CanvasDragPreview";

/** A prepared card with the placement auto-layout (or a manual drag) resolved for it. */
export interface PlacedDestinationCard extends PreparedCard {
  placement: CardPlacement;
}

/**
 * Document settings the connector and card chrome read. Grouped into one memoized object so
 * the layer's `memo` survives edits to unrelated parts of `project.cards`.
 */
export interface DestinationCardsAppearance {
  preset: CardPreset;
  presentation: CardPresentation;
  connectorStyle: ConnectorStyle;
  connectorDash: EdgeStyle;
  connectorWidth: number;
  background: string;
  opacity: number;
  textColor: string;
  fontSize: number;
  showProvinceTexture: boolean;
  /** Resolved CSS font family for reference-card titles; undefined inherits the default. */
  titleFont?: string;
  activeColor: string;
  edgeColor: string;
  provinceStyles?: Record<string, ProvinceStyle>;
  lineHeightMultiplier: number;
}

export interface DestinationCardsLayerProps {
  cards: PlacedDestinationCard[];
  style: DestinationCardStyle;
  appearance: DestinationCardsAppearance;
  connectorEdge: ResolvedEdgeStyle;
  /** Clamp box a dragged card stays inside. */
  dragBounds: CardLayoutBounds;
  exportMode: boolean;
  /** Minimum interval between local drag-preview paints. Final positions always commit immediately. */
  renderIntervalMs: number;
  /** Converts a pointer event into canvas user-space coordinates. */
  canvasPoint: (event: PointerEvent<SVGGElement>) => { x: number; y: number } | null;
  onSelectCards?: () => void;
  onMoveCard?: (id: string, x: number, y: number) => void;
}

/** Extend a connector path so it runs from the card center to its boundary port. The
 *  portion inside the card is covered by the card fill, so the visible line ends flush
 *  at the card edge and its tip stays hidden ("到板块的中心隐藏"). */
function connectorPathToCenter(
  pathData: string,
  port: { x: number; y: number },
  card: { x: number; y: number; width: number; height: number },
): string {
  const centerX = card.x + card.width / 2;
  const centerY = card.y + card.height / 2;
  const format = (value: number) => Number(value.toFixed(3)).toString();
  const rest = pathData.replace(/^M[-\d.]+ [-\d.]+/, "").trim();
  return `M${format(centerX)} ${format(centerY)} L${format(port.x)} ${format(port.y)} ${rest}`;
}

function DestinationCardsLayerView({
  cards,
  style,
  appearance,
  connectorEdge: incomingConnectorEdge,
  dragBounds,
  exportMode,
  renderIntervalMs,
  canvasPoint,
  onSelectCards,
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
    side: CardPlacement["side"];
    connectorStyle: ConnectorStyle;
    borderless: boolean;
    connectorHidden: boolean;
  } | null>(null);
  const cardPreviewScheduler = useRef(createCanvasPreviewScheduler<{ id: string; x: number; y: number }>());

  // The resolved edge style carries document-wide filter ids, so two canvases on one page
  // (editor + template preview) would emit the same `<defs>` id and the first one would win
  // for both. Scoping the ids to this mount keeps each canvas — and its export clone — on
  // its own filters.
  const instanceId = useId();
  const connectorEdge = useMemo(
    () => scopeEdgeStyleFilters(incomingConnectorEdge, instanceId),
    [incomingConnectorEdge, instanceId],
  );

  const updateCardPreview = useCallback((next: { id: string; x: number; y: number }) => {
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
      drag.connectorGroup.querySelectorAll<SVGPathElement>(":scope > path").forEach((path) => path.setAttribute("d", pathData));
    }
  }, []);

  const clearCardPreview = useCallback(() => clearCanvasPreview(cardPreviewScheduler.current), []);

  const scheduleCardPreview = useCallback((next: { id: string; x: number; y: number }) => {
    scheduleCanvasPreview(cardPreviewScheduler.current, next, renderIntervalMs, updateCardPreview);
  }, [renderIntervalMs, updateCardPreview]);

  useEffect(() => () => clearCardPreview(), [clearCardPreview]);

  // Drag handlers are shared by every card and read their card from the DOM key, so the
  // card list does not allocate four closures per card on each render.
  const cardsByKey = useMemo(
    () => new Map(cards.map((card) => [card.group.key, card])),
    [cards],
  );

  const handleCardPointerDown = useCallback((event: PointerEvent<SVGGElement>) => {
    const card = cardsByKey.get(event.currentTarget.getAttribute("data-destination-card") ?? "");
    if (!card) return;
    const point = canvasPoint(event);
    if (!point) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const connectorGroup = event.currentTarget.parentElement;
    if (!connectorGroup) return;
    const placement = card.placement;
    const borderless = appearance.preset === "borderless";
    cardDrag.current = {
      id: card.group.key,
      offsetX: point.x - placement.x,
      offsetY: point.y - placement.y,
      width: placement.width,
      height: placement.height,
      x: placement.x,
      y: placement.y,
      originalX: placement.x,
      originalY: placement.y,
      element: event.currentTarget,
      connectorGroup: connectorGroup as unknown as SVGGElement,
      anchorX: card.anchorX,
      anchorY: card.anchorY,
      side: placement.side,
      connectorStyle: appearance.connectorStyle,
      borderless,
      connectorHidden: !card.isInternational && borderless && (appearance.opacity ?? 1) < 0.9,
    };
  }, [appearance.connectorStyle, appearance.opacity, appearance.preset, canvasPoint, cardsByKey]);

  const handleCardPointerMove = useCallback((event: PointerEvent<SVGGElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || !cardDrag.current) return;
    const point = canvasPoint(event);
    if (!point) return;
    const drag = cardDrag.current;
    const position = clampDestinationCardPosition({
      x: point.x - drag.offsetX,
      y: point.y - drag.offsetY,
      width: drag.width,
      height: drag.height,
    }, dragBounds);
    drag.x = Math.round(position.x);
    drag.y = Math.round(position.y);
    scheduleCardPreview({ id: drag.id, x: drag.x, y: drag.y });
  }, [canvasPoint, dragBounds, scheduleCardPreview]);

  const handleCardPointerUp = useCallback((event: PointerEvent<SVGGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const drag = cardDrag.current;
    if (drag) onMoveCard?.(drag.id, drag.x, drag.y);
    clearCardPreview();
    cardDrag.current = null;
  }, [clearCardPreview, onMoveCard]);

  const handleCardPointerCancel = useCallback(() => {
    const drag = cardDrag.current;
    if (drag) updateCardPreview({ id: drag.id, x: drag.originalX, y: drag.originalY });
    clearCardPreview();
    cardDrag.current = null;
  }, [clearCardPreview, updateCardPreview]);

  const handleSelect = useCallback(() => onSelectCards?.(), [onSelectCards]);

  if (cards.length === 0) return null;

  const cardDragEnabled = !exportMode && Boolean(onMoveCard);
  const borderlessCards = appearance.preset === "borderless";

  return (
    <g
      data-cards-layer
      onClick={!exportMode ? handleSelect : undefined}
      role={!exportMode && onSelectCards ? "button" : undefined}
    >
      {connectorEdge.filters.length > 0 && (
        <defs data-connector-edge-filters>
          {connectorEdge.filters.map((filter) => (
            filter.markupKey === "soft-glow" ? (
              <filter key={filter.id} id={filter.id} x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation={Math.max(1.2, appearance.connectorWidth)} result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            ) : filter.markupKey === "ink" ? (
              <filter key={filter.id} id={filter.id} x="-20%" y="-20%" width="140%" height="140%">
                {/* Fixed seed: an unseeded turbulence is renderer-defined, so exports would
                    not match the editor preview pixel for pixel. */}
                <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="1" result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale={Math.max(0.6, appearance.connectorWidth * 0.35)} />
              </filter>
            ) : null
          ))}
        </defs>
      )}
      {cards.map(({ group, province, isInternational, rows, titleLines, headerExtra, anchorX, anchorY, placement }) => {
        const displayPlacement = placement;
        const provinceAppearance = appearance.provinceStyles?.[province]?.appearance;
        const provinceTexture = appearance.showProvinceTexture
          && provinceAppearance
          && provinceAppearance.kind !== "manual-color"
          ? provinceAppearance
          : null;
        const connector = isInternational ? null : buildConnectorGeometry({
          card: displayPlacement,
          anchor: { x: anchorX, y: anchorY },
          style: appearance.connectorStyle,
          preferredSide: displayPlacement.side,
        });
        // Borderless cards have no border stroke to visually terminate the connector,
        // so the line runs to the card center where the card fill hides it. When the
        // fill is too transparent to cover the line (it would cross the card text),
        // the connector is omitted entirely.
        const connectorHidden = connector !== null && borderlessCards && (appearance.opacity ?? 1) < 0.9;
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
              data-connector-style={appearance.connectorStyle}
              data-connector-dash={appearance.connectorDash}
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
            {!isInternational && <circle data-destination-anchor={group.key} cx={anchorX} cy={anchorY} r={4} fill={appearance.activeColor} />}
            <g
              transform={`translate(${displayPlacement.x} ${displayPlacement.y})`}
              data-destination-card={group.key}
              data-card-preset={appearance.preset}
              data-card-presentation={appearance.presentation}
              className="destination-card"
              onPointerDown={cardDragEnabled ? handleCardPointerDown : undefined}
              onPointerMove={cardDragEnabled ? handleCardPointerMove : undefined}
              onPointerUp={cardDragEnabled ? handleCardPointerUp : undefined}
              onPointerCancel={cardDragEnabled ? handleCardPointerCancel : undefined}
            >
              {appearance.presentation !== "standard" ? (
                <ReferenceCardVisual
                  presentation={appearance.presentation as ReferenceCardPresentation}
                  group={group}
                  rows={rows}
                  width={placement.width}
                  height={placement.height}
                  accent={appearance.provinceStyles?.[province]?.appearance?.kind === "manual-color"
                    ? appearance.provinceStyles[province]!.appearance!.color
                    : referenceCardColor(group.key, appearance.activeColor)}
                  background={appearance.background}
                  opacity={appearance.opacity}
                  textColor={appearance.textColor}
                  fontSize={appearance.fontSize}
                  edgeColor={appearance.edgeColor}
                  titleFont={appearance.titleFont}
                  lineHeightMultiplier={appearance.lineHeightMultiplier}
                />
              ) : (
                <DestinationCard
                  style={style}
                  group={group}
                  province={province}
                  rows={rows}
                  titleLines={titleLines}
                  headerExtra={headerExtra}
                  width={placement.width}
                  height={placement.height}
                  provinceTexture={provinceTexture}
                />
              )}
            </g>
          </g>
        );
      })}
    </g>
  );
}

/** Memoized: connector geometry and card chrome only need to repaint when a placement,
 *  a card style, or a connector setting actually changes. */
export const DestinationCardsLayer = memo(DestinationCardsLayerView);
