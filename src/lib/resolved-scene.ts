import { solveCardLayout, validateCardLayout, type CardLayoutBounds, type CardLayoutOptions, type CardLayoutResult, type CardPlacement } from "./card-layout";
import { cardLayoutCache, createCardLayoutCacheKey } from "./card-layout-cache";
import type { ProjectDocument } from "./project-document";
import type { PreparedCard } from "./prepared-card-content";
import { anchorProjectCards, buildProjectCardContents } from "./resolved-card-content";
import { resolveSceneMapGeometry, sceneTextObstacle } from "./resolved-scene-geometry";
import { createSceneLayoutRequest, mergeScenePlacements, storedCardPlacements, type CardPositions } from "./scene-layout-request";
import { getCardPositionPolicy, getCardScopeKey } from "./card-settings-scope";
import { computeGuestPanelLayout } from "./guest-panel-layout";
import { fingerprintProject } from "./project-digest";
import { checkLayoutHealth, type LayoutHealthInput, type LayoutHealthIssue } from "./layout-health";
import { resolvedSceneHealthInput, resolvedSceneTypographyIssues } from "./resolved-scene-health";
import { createSceneTextMeasurement, getSceneTextMeasurer, type SceneTextOptions } from "./scene-text-measurement";
import { diagnoseCardTypography } from "./card-typography-diagnostics";

export interface ResolvedSceneInput {
  preparedCards: PreparedCard[];
  bounds: CardLayoutBounds;
  mapVisualBounds?: CardLayoutBounds["map"];
  options: CardLayoutOptions;
  key: string;
  measurementStatus: "estimated" | "measured";
  fontRevision?: number;
  typographyIssues?: LayoutHealthIssue[];
}
export interface ResolvedSceneCard extends PreparedCard { placement: CardPlacement }
export interface ResolvedProjectScene {
  revision: string;
  measurementStatus: "estimated" | "measured";
  fontRevision?: number;
  cards: ResolvedSceneCard[];
  bounds: CardLayoutBounds;
  connectors: NonNullable<LayoutHealthInput["connectors"]>;
  layoutStatus: CardLayoutResult["status"];
  diagnostics: LayoutHealthIssue[];
  healthInput: LayoutHealthInput;
  input: ResolvedSceneInput;
}

export function buildResolvedSceneInput(project: ProjectDocument, text: SceneTextOptions = {}): ResolvedSceneInput {
  const measurement = text.measureText ? null : createSceneTextMeasurement(text.userFonts);
  const activeText = measurement ? { ...text, ...measurement.options } : text;
  const geometry = resolveSceneMapGeometry(project.map);
  const preparedCards = anchorProjectCards(project, buildProjectCardContents(project, undefined, activeText), geometry);
  const guests = project.guests;
  const guestAreas = guests.visibility ? [{ x: guests.x, y: guests.y, width: guests.width, height: computeGuestPanelLayout(guests, project.canvas.lineHeight ?? 1).height }] : [];
  const bounds: CardLayoutBounds = {
    width: project.canvas.width, height: project.canvas.height, map: geometry.mapContentBounds,
    margin: project.canvas.safeMargin, gap: Math.max(10, project.cards.gap), allowMapOverlap: project.cards.allowMapOverlap === true,
    occupiedAreas: [...(project.cards.allowMapOverlap ? [] : geometry.nonProvinceMapAreas), ...project.textElements.flatMap((text) => { const area = sceneTextObstacle(text); return area ? [area] : []; }), ...guestAreas],
    occupiedPolygons: project.cards.allowMapOverlap ? [] : geometry.provincePolygons,
  };
  const options: CardLayoutOptions = { mode: project.cards.layoutMode ?? "quadrant", autoBalance: project.cards.autoBalance !== false, connectorStyle: project.cards.connectorStyle, connectorWidth: project.cards.connectorWidth };
  const cards = preparedCards.map(({ group, anchorX, anchorY, width, height }) => ({ id: group.key, anchorX, anchorY, width, height }));
  const typographyIssues = diagnoseCardTypography(project, preparedCards, activeText);
  return { preparedCards, bounds, mapVisualBounds: geometry.mapVisualBounds, options, typographyIssues, key: createCardLayoutCacheKey({ cards, bounds, options, polygonOrigin: { polygons: project.cards.allowMapOverlap ? [] : geometry.centeredProvincePolygons, originX: geometry.mapOriginX, originY: geometry.mapOriginY } }), measurementStatus: measurement?.getStatus() ?? text.getMeasurementStatus?.() ?? text.measurementStatus ?? (text.measureText ? "measured" : "estimated"), fontRevision: measurement?.fontRevision ?? text.fontRevision };
}

/** Manual, frozen and legacy coordinates retain their existing behavior. Saved automatic
 * suggestions are reused only while feasible for the current dimensions and obstacles. */
export function resolveStoredScenePositions(project: ProjectDocument, cards: PreparedCard[], bounds: CardLayoutBounds, preserve = true): CardPositions {
  const source = project.cards.positions ?? {};
  const result: CardPositions = {};
  const automatic: PreparedCard[] = [];
  for (const card of cards) {
    const id = card.group.key;
    if (!source[id]) continue;
    const locked = getCardPositionPolicy(project.cards, id) === "locked";
    if (!preserve && !locked) continue;
    if (!locked && project.cards.positionSources?.[getCardScopeKey(project.cards, id)] === "auto") automatic.push(card);
    else result[id] = source[id]!;
  }
  const placed = storedCardPlacements(cards, bounds, result);
  for (const card of automatic) {
    const candidate = storedCardPlacements([card], bounds, source)[0]!;
    const localBounds = { ...bounds, occupiedAreas: [...(bounds.occupiedAreas ?? []), ...placed] };
    if (!validateCardLayout([candidate], localBounds)) continue;
    result[card.group.key] = source[card.group.key]!;
    placed.push(candidate);
  }
  return result;
}

export function createResolvedSceneSnapshot(project: ProjectDocument, input: ResolvedSceneInput, placements: CardPlacement[], status: CardLayoutResult["status"] = "solved"): ResolvedProjectScene {
  const cards = mergeScenePlacements(input.preparedCards, input.bounds, placements);
  const healthInput = resolvedSceneHealthInput(project, input, cards);
  const diagnostics = [...checkLayoutHealth(healthInput), ...resolvedSceneTypographyIssues(project, input, cards)];
  const valid = cards.length === input.preparedCards.length && validateCardLayout(cards.map((card) => card.placement), input.bounds);
  if (!valid || status === "fallback") diagnostics.push({ id: "layout-result", kind: "layout-unresolved", severity: "warning", detail: "当前排布仍有未满足的空间约束，可整理局部、调整宽度或扩大画布；尚未证明不存在可行方案" });
  return { revision: fingerprintProject(project), measurementStatus: input.measurementStatus, fontRevision: input.fontRevision, cards, bounds: input.bounds, connectors: healthInput.connectors ?? [], layoutStatus: valid && status === "solved" ? "solved" : "fallback", diagnostics, healthInput, input };
}

export function resolveProjectScene(project: ProjectDocument, options: SceneTextOptions & { placements?: CardPlacement[]; preservePositions?: boolean; input?: ResolvedSceneInput; baseScene?: ResolvedProjectScene } = {}): ResolvedProjectScene {
  const reusable = options.baseScene?.revision === fingerprintProject(project) && options.baseScene.fontRevision === getSceneTextMeasurer().getVersion();
  const input = options.input ?? (reusable ? options.baseScene!.input : buildResolvedSceneInput(project, options));
  if (options.placements) return createResolvedSceneSnapshot(project, input, options.placements);
  const positions = resolveStoredScenePositions(project, input.preparedCards, input.bounds, options.preservePositions !== false);
  const request = createSceneLayoutRequest(input.preparedCards, input.bounds, input.options, positions);
  const result = request ? cardLayoutCache.get(request.key) ?? solveCardLayout(request.cards, request.bounds, request.options) : null;
  if (request && result) cardLayoutCache.set(request.key, result);
  const cards = mergeScenePlacements(input.preparedCards, input.bounds, result?.placements ?? [], positions);
  return createResolvedSceneSnapshot(project, input, cards.map((card) => card.placement), result?.status);
}
