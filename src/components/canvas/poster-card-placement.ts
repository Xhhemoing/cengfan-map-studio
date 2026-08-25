import type { GeoPath, GeoProjection } from "d3-geo";
import { useEffect, useMemo } from "react";
import type { CardArea, CardLayoutMode, CardPolygon } from "../../lib/card-layout";
import { createCardLayoutCacheKey } from "../../lib/card-layout-cache";
import type { CardLayoutWorkerRequest } from "../../lib/card-layout-worker-protocol";
import { DEFAULT_CARD_EXPRESSION_TEMPLATES } from "../../lib/card-expression";
import { buildLayoutGroups } from "../../lib/layout";
import type { ContentBounds } from "../../lib/map-content-bounds";
import { getChinaMapFeatures } from "../../lib/map-data";
import { prepareDestinationCards, type PlacedDestinationCard } from "../../lib/poster-card-rows";
import type { ProjectDocument } from "../../lib/project-document";
import { useCardLayoutWorker } from "./useCardLayoutWorker";

const features = getChinaMapFeatures();

export interface PosterCardPlacementInput {
  project: ProjectDocument;
  visibleStudents: ProjectDocument["students"];
  projection: GeoProjection;
  mapPath: GeoPath;
  mapContentBounds: ContentBounds;
  layoutOccupiedAreas: CardArea[];
  layoutOccupiedPolygons: CardPolygon[];
  horizontalPadding: number;
  lineHeightMultiplier: number;
  exportMode: boolean;
  /** Reports current card locations so a parent can freeze them before a map edit. */
  onCardPositionsResolved?: (positions: Record<string, { x: number; y: number }>) => void;
}

/** Measure the destination cards, resolve their positions through the layout
 *  worker (or synchronously in export mode) and apply manual position overrides. */
export function usePosterCardPlacement({
  project,
  visibleStudents,
  projection,
  mapPath,
  mapContentBounds,
  layoutOccupiedAreas,
  layoutOccupiedPolygons,
  horizontalPadding,
  lineHeightMultiplier,
  exportMode,
  onCardPositionsResolved,
}: PosterCardPlacementInput): PlacedDestinationCard[] {
  const grouping = project.cards.grouping;
  const expressionTemplates = project.cards.expressionTemplates ?? DEFAULT_CARD_EXPRESSION_TEMPLATES;
  const groups = useMemo(() => buildLayoutGroups(visibleStudents, grouping), [grouping, visibleStudents]);
  const noWrapFieldSet = useMemo(
    () => new Set(project.cards.noWrapFields ?? []),
    [project.cards.noWrapFields],
  );
  const preparedCards = useMemo(() => {
    if (project.cards.visibleFields.length === 0 || project.dataView === "pins") return [];
    return prepareDestinationCards({
      groups,
      cards: {
        grouping,
        visibleFields: project.cards.visibleFields,
        compactLayout: project.cards.compactLayout,
        preset: project.cards.preset,
        fieldTypography: project.cards.fieldTypography,
        fontSize: project.cards.fontSize,
        maxWidth: project.cards.maxWidth,
        bottomPadding: project.cards.bottomPadding,
        padding: project.cards.padding,
        nameFormat: project.cards.nameFormat,
        citySubgroups: project.cards.citySubgroups,
        showProvinceTexture: project.cards.showProvinceTexture,
      },
      expressionTemplates: {
        title: expressionTemplates.title,
        city: expressionTemplates.city,
        row: expressionTemplates.row,
      },
      features,
      projection,
      centroid: (feature) => mapPath.centroid(feature as never),
      map: {
        x: project.map.x,
        y: project.map.y,
        width: project.map.width,
        height: project.map.height,
        scale: project.map.scale,
      },
      canvasWidth: project.canvas.width,
      safeMargin: project.canvas.safeMargin,
      horizontalPadding,
      lineHeightMultiplier,
      noWrapFieldSet,
    });
  }, [
    expressionTemplates.city,
    expressionTemplates.row,
    expressionTemplates.title,
    groups,
    grouping,
    horizontalPadding,
    lineHeightMultiplier,
    mapPath,
    noWrapFieldSet,
    project.cards.bottomPadding,
    project.cards.citySubgroups,
    project.cards.compactLayout,
    project.cards.fieldTypography,
    project.cards.fontSize,
    project.cards.maxWidth,
    project.cards.nameFormat,
    project.cards.padding,
    project.cards.preset,
    project.cards.showProvinceTexture,
    project.cards.visibleFields,
    project.canvas.safeMargin,
    project.canvas.width,
    project.dataView,
    project.map.height,
    project.map.scale,
    project.map.width,
    project.map.y,
    project.map.x,
    projection,
  ]);

  const layoutRequest = useMemo<CardLayoutWorkerRequest | null>(() => {
    if (preparedCards.length === 0) return null;
    const layoutMode = (project.cards.layoutMode ?? "quadrant") as CardLayoutMode;
    const cards = preparedCards.map(({ group, anchorX, anchorY, width, height }) => ({
      id: group.key,
      anchorX,
      anchorY,
      width,
      height,
    }));
    const bounds = {
      width: project.canvas.width,
      height: project.canvas.height,
      map: mapContentBounds,
      occupiedAreas: layoutOccupiedAreas,
      occupiedPolygons: layoutOccupiedPolygons,
      allowMapOverlap: project.cards.allowMapOverlap === true,
      margin: project.canvas.safeMargin,
      gap: Math.max(10, project.cards.gap),
    };
    const options = {
      mode: layoutMode,
      autoBalance: project.cards.autoBalance !== false,
      connectorStyle: project.cards.connectorStyle,
      connectorWidth: project.cards.connectorWidth,
      fixedPositions: project.cards.positions,
    };
    return {
      key: createCardLayoutCacheKey({ cards, bounds, options }),
      cards,
      bounds,
      options,
    };
  }, [
    layoutOccupiedAreas,
    layoutOccupiedPolygons,
    mapContentBounds,
    preparedCards,
    project.canvas.height,
    project.canvas.safeMargin,
    project.canvas.width,
    project.cards.allowMapOverlap,
    project.cards.autoBalance,
    project.cards.connectorStyle,
    project.cards.connectorWidth,
    project.cards.gap,
    project.cards.layoutMode,
    project.cards.positions,
  ]);

  const layoutState = useCardLayoutWorker(layoutRequest, exportMode);
  const destinationCards = useMemo(() => {
    if (!layoutRequest || !layoutState.result) return [];
    const placements = new Map(layoutState.result.placements.map((placement) => [placement.id, placement]));
    return preparedCards.flatMap((card) => {
      const placement = placements.get(card.group.key);
      if (!placement) return [];
      const manual = project.cards.positions?.[card.group.key];
      return [manual ? { ...card, placement: { ...placement, x: manual.x, y: manual.y } } : { ...card, placement }];
    });
  }, [layoutRequest, layoutState.result, preparedCards, project.cards.positions]);

  useEffect(() => {
    if (!onCardPositionsResolved || destinationCards.length === 0) return;
    onCardPositionsResolved(Object.fromEntries(destinationCards.map(({ group, placement }) => [group.key, { x: placement.x, y: placement.y }])));
  }, [destinationCards, onCardPositionsResolved]);

  return destinationCards;
}
