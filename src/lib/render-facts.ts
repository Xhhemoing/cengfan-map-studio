/**
 * 渲染真值 · 卡片层。
 *
 * PosterCanvas 与影子 Agent 曾各自推导卡片几何：画布用投影质心 + 逐行测高，Agent 用
 * 三角函数合成锚点 + `fontSize × 人数` 估高。两套结果对不上，`auto_layout` /
 * `check_health` 报的就不是用户看到的版面。这里是两边共用的分组 id、锚点、分行、
 * 卡高与排版请求；几何原语见 `render-geometry.ts`，健康检查见 `render-health.ts`。
 */
import { DEFAULT_CARD_EXPRESSION_TEMPLATES, formatCardExpression } from "./card-expression";
import {
  solveCardLayout,
  type CardLayoutInput,
  type CardLayoutMode,
  type CardPlacement,
} from "./card-layout";
import { cardLayoutCache, createCardLayoutCacheKey } from "./card-layout-cache";
import type { CardLayoutWorkerRequest } from "./card-layout-worker-protocol";
import { wrapCardText, type CardTextFragment, type CardTextLine } from "./card-text-layout";
import {
  deriveFixedDisplayFrameFromCardSettings,
  normalizeDisplayFrame,
  type DisplayFrameDefinition,
} from "./display-frame";
import {
  buildCitySections,
  buildLayoutGroups,
  buildSchoolRows,
  schoolRowParts,
  type LayoutGroup,
  type SchoolRowPart,
} from "./layout";
import { findProvinceFeature, type MapFeature, type Position } from "./map-data";
import { DEFAULT_NAME_FORMAT, formatStudentName } from "./name-format";
import type { ProjectDocument } from "./project-document";
import {
  buildLayoutOccupiedAreas,
  buildRenderGeometry,
  chinaMapFeatures,
  computeGuestPanelMetrics,
  mapPointToCanvas,
  type RenderGeometry,
} from "./render-geometry";
import type { CardFontField, CardSettings, MapSettings } from "./scene-document";
import { resolveStudentLocation } from "./student-data";

export function destinationHeight(lineCount: number, rowHeight: number, bottomPadding: number, headerExtra: number): number {
  return 44 + headerExtra + lineCount * rowHeight + bottomPadding;
}

export interface CardDisplayRow {
  key: string;
  parts: SchoolRowPart[];
  remainingPeople: number;
  cityHeading?: string;
  city?: string;
  university?: string;
  names?: string;
}

export interface PreparedCardRow extends CardDisplayRow {
  lines: CardTextLine<CardFontField>[];
}

export function studentFieldParts(
  student: { name: string; university: string; city: string },
  fields: CardSettings["visibleFields"],
): SchoolRowPart[] {
  return fields
    .map((field) => ({ field, value: student[field] }))
    .filter((part): part is SchoolRowPart => Boolean(part.value));
}

export function rowFragments(
  row: CardDisplayRow,
  expression: string,
  context: Parameters<typeof formatCardExpression>[1],
): CardTextFragment<CardFontField>[] {
  if (expression !== DEFAULT_CARD_EXPRESSION_TEMPLATES.row) {
    return [{ text: formatCardExpression(expression, context, row.parts.map((part) => part.value).join(" · ")) }];
  }
  return row.parts.flatMap((part, index) => [
    ...(index > 0 ? [{ text: " · " }] : []),
    { text: part.value, field: part.field },
  ]);
}

export function cardRowsForGroup(
  group: LayoutGroup,
  grouping: CardSettings["grouping"],
  fields: CardSettings["visibleFields"],
  citySubgroups: boolean,
  formatName: (name: string) => string,
): CardDisplayRow[] {
  const students = group.students.map((student) => ({ ...student, name: formatName(student.name) }));
  if (grouping === "university") {
    return students.map((student) => ({
      key: student.id,
      parts: studentFieldParts(student, fields),
      city: student.city,
      university: student.university,
      names: student.name,
      remainingPeople: 0,
    }));
  }

  if (grouping === "province" && citySubgroups) {
    const showCityHeading = fields.includes("city");
    return buildCitySections(students).flatMap((section) => [{
        key: `city-${section.city}`,
        parts: showCityHeading ? [{ field: "city" as const, value: section.city }] : [],
        cityHeading: showCityHeading ? section.city : undefined,
        city: section.city,
        remainingPeople: 0,
      }, ...section.rows.map((row) => ({
        key: row.studentIds[0] ?? `${section.city}-${row.university}`,
        parts: schoolRowParts(row, fields.filter((field) => field !== "city")),
        city: section.city,
        university: row.university,
        names: row.names.join("、"),
        remainingPeople: 0,
      }))]);
  }

  return buildSchoolRows(students).map((row) => ({
    key: row.studentIds[0] ?? row.university,
    parts: schoolRowParts(row, fields, grouping === "city" ? undefined : group.students[0]?.city),
    city: grouping === "city" ? group.title : group.students[0]?.city,
    university: row.university,
    names: row.names.join("、"),
    remainingPeople: 0,
  }));
}

export function resolveCardDisplayFrame(cards: CardSettings): DisplayFrameDefinition {
  return cards.displayFrame === undefined
    ? deriveFixedDisplayFrameFromCardSettings(cards)
    : normalizeDisplayFrame(cards.displayFrame);
}

export function cardHorizontalPadding(displayFrame: DisplayFrameDefinition, cards: CardSettings): number {
  const bodyItem = displayFrame.fixed.items.find((item) => item.id === "name") ?? displayFrame.fixed.items[0];
  return displayFrame.mode === "fixed"
    ? bodyItem?.x ?? cards.horizontalPadding ?? cards.padding
    : displayFrame.style.padding;
}

export interface CardAnchor {
  province: string;
  isInternational: boolean;
  anchorX: number;
  anchorY: number;
}

export interface CardAnchorGeometry {
  map: MapSettings;
  projection: (coordinate: Position) => [number, number] | null;
  centroid: (feature: MapFeature) => [number, number];
}

/** 卡片锚点：优先省会投影点，退回省界质心，再退回地图中心。 */
export function resolveCardAnchor(group: LayoutGroup, geometry: CardAnchorGeometry): CardAnchor {
  const isInternational = group.students.every((student) => student.locationScope === "international");
  const province = isInternational || !group.students[0] ? "" : resolveStudentLocation(group.students[0]).province;
  const feature = findProvinceFeature(chinaMapFeatures(), province);
  const administrativeCenter = feature ? geometry.projection(feature.center) : null;
  const point = administrativeCenter && administrativeCenter.every(Number.isFinite)
    ? administrativeCenter
    : feature
      ? geometry.centroid(feature)
      : [geometry.map.width / 2, geometry.map.height / 2];
  const anchor = mapPointToCanvas(geometry.map, point);
  return { province, isInternational, anchorX: anchor.x, anchorY: anchor.y };
}

export interface PreparedCardFact extends CardAnchor {
  group: LayoutGroup;
  rows: PreparedCardRow[];
  titleLines: CardTextLine<CardFontField>[];
  headerExtra: number;
  width: number;
  height: number;
}

export interface CardFactsInput extends CardAnchorGeometry {
  groups: LayoutGroup[];
  cards: CardSettings;
  canvasWidth: number;
  safeMargin: number;
  lineHeightMultiplier: number;
  horizontalPadding: number;
  dataView: ProjectDocument["dataView"];
}

/** 卡片的真实分行、标题换行与高度。渲染与影子 Agent 共用同一次测量。 */
export function prepareCardFacts(input: CardFactsInput): PreparedCardFact[] {
  const { cards, groups, horizontalPadding, lineHeightMultiplier } = input;
  if (cards.visibleFields.length === 0 || input.dataView === "pins") return [];
  const grouping = cards.grouping;
  const expressionTemplates = cards.expressionTemplates ?? DEFAULT_CARD_EXPRESSION_TEMPLATES;
  const noWrapFields = new Set(cards.noWrapFields ?? []);
  const compactLayout = cards.compactLayout === true || cards.preset === "compact";
  const cardFieldFontSize = (field: CardFontField) => cards.fieldTypography?.[field]?.fontSize
    ?? (field === "city" ? Math.max(9, cards.fontSize - 1) : cards.fontSize);
  const rowFontSize = Math.max(...cards.visibleFields.map(cardFieldFontSize), cardFieldFontSize("city"));
  const rowHeight = Math.max(compactLayout ? 18 : 20, rowFontSize + 6) * lineHeightMultiplier;
  const titleFontSize = cardFieldFontSize("title");
  const cardWidth = Math.min(cards.maxWidth, Math.max(80, input.canvasWidth - input.safeMargin * 2));
  const contentWidth = Math.max(rowFontSize, cardWidth - horizontalPadding * 2);
  const bottomPadding = cards.bottomPadding ?? cards.padding;
  const titleLineHeight = Math.max(16, titleFontSize + 4) * lineHeightMultiplier;
  const formatName = (name: string) => formatStudentName(name, cards.nameFormat ?? DEFAULT_NAME_FORMAT);
  return groups.map((group) => {
    const anchor = resolveCardAnchor(group, input);
    const rows = cardRowsForGroup(group, grouping, cards.visibleFields, cards.citySubgroups !== false, formatName)
      .map((row): PreparedCardRow => {
        const context = {
          group: group.title,
          count: group.count,
          province: grouping === "province" ? group.title : resolveStudentLocation(group.students[0]!).province,
          city: row.city ?? group.students[0]?.city,
          university: row.university,
          names: row.names,
        };
        const fragments = row.cityHeading
          ? [{ text: formatCardExpression(expressionTemplates.city, context, row.cityHeading), field: "city" as const }]
          : rowFragments(row, expressionTemplates.row, context);
        return {
          ...row,
          lines: wrapCardText(fragments, contentWidth, row.cityHeading ? cardFieldFontSize("city") : rowFontSize, {
            preserveFields: noWrapFields,
          }),
        };
      });
    const lineCount = rows.reduce((total, row) => total + row.lines.length, 0);
    const title = formatCardExpression(expressionTemplates.title, {
      group: group.title,
      count: group.count,
      province: grouping === "province" ? group.title : resolveStudentLocation(group.students[0]!).province,
      city: grouping === "city" ? group.title : undefined,
      university: grouping === "university" ? group.students[0]?.university : undefined,
    }, group.title);
    const textureHeaderWidth = cards.showProvinceTexture === true ? 36 : 0;
    const titleWidth = Math.max(titleFontSize, contentWidth - Math.max(42, titleFontSize * 3) - textureHeaderWidth);
    const titleLines = wrapCardText([{ text: title, field: "title" as const }], titleWidth, titleFontSize);
    const headerExtra = Math.max(0, titleLines.length - 1) * titleLineHeight;
    return {
      ...anchor,
      group,
      rows,
      titleLines,
      headerExtra,
      width: cardWidth,
      height: destinationHeight(lineCount, rowHeight, bottomPadding, headerExtra),
    };
  });
}

/** 影子工程的卡片真值：分组 id 与渲染层的 `group.key` 完全一致。 */
export function buildCardFacts(
  project: ProjectDocument,
  geometry: RenderGeometry = buildRenderGeometry(project),
): PreparedCardFact[] {
  return prepareCardFacts({
    groups: buildLayoutGroups(project.students, project.cards.grouping),
    cards: project.cards,
    canvasWidth: project.canvas.width,
    safeMargin: project.canvas.safeMargin,
    lineHeightMultiplier: project.canvas.lineHeight ?? 1,
    horizontalPadding: cardHorizontalPadding(resolveCardDisplayFrame(project.cards), project.cards),
    dataView: project.dataView,
    map: project.map,
    projection: geometry.projection,
    centroid: (feature) => geometry.path.centroid(feature as never),
  });
}

export function toLayoutCards(facts: readonly PreparedCardFact[]): CardLayoutInput[] {
  return facts.map(({ group, anchorX, anchorY, width, height }) => ({ id: group.key, anchorX, anchorY, width, height }));
}

/** 与画布 worker 完全同形的排版请求（真实卡高、真实遮挡区、真实地图内容框）。 */
export function buildLayoutRequest(
  project: ProjectDocument,
  geometry: RenderGeometry = buildRenderGeometry(project),
  facts: readonly PreparedCardFact[] = buildCardFacts(project, geometry),
): CardLayoutWorkerRequest | null {
  if (facts.length === 0) return null;
  const cards = toLayoutCards(facts);
  const bounds = {
    width: project.canvas.width,
    height: project.canvas.height,
    map: geometry.mapContentBounds,
    occupiedAreas: buildLayoutOccupiedAreas({
      textElements: project.textElements,
      guests: project.guests,
      guestHeight: computeGuestPanelMetrics(project.guests, project.canvas.lineHeight ?? 1).height,
      nonProvinceMapAreas: geometry.nonProvinceMapAreas,
      allowMapOverlap: project.cards.allowMapOverlap === true,
    }),
    occupiedPolygons: project.cards.allowMapOverlap === true ? [] : geometry.provincePolygons,
    allowMapOverlap: project.cards.allowMapOverlap === true,
    margin: project.canvas.safeMargin,
    gap: Math.max(10, project.cards.gap),
  };
  const options = {
    mode: (project.cards.layoutMode ?? "quadrant") as CardLayoutMode,
    autoBalance: project.cards.autoBalance !== false,
    connectorStyle: project.cards.connectorStyle,
    connectorWidth: project.cards.connectorWidth,
  };
  return { key: createCardLayoutCacheKey({ cards, bounds, options }), cards, bounds, options };
}

export interface RenderFacts {
  geometry: RenderGeometry;
  cards: PreparedCardFact[];
  layoutRequest: CardLayoutWorkerRequest | null;
  /** 求解结果（未叠加手动位置），与画布 worker 同一批输入。 */
  placements: CardPlacement[];
}

/** 求解一次排版，并与画布 worker 共用同一份缓存（key 已编码全部输入）。 */
export function solveLayoutRequest(request: CardLayoutWorkerRequest): CardPlacement[] {
  const cached = cardLayoutCache.get(request.key);
  if (cached) return cached.placements;
  const result = solveCardLayout(request.cards, request.bounds, request.options);
  cardLayoutCache.set(request.key, result);
  return result.placements;
}

export function buildRenderFacts(project: ProjectDocument): RenderFacts {
  const geometry = buildRenderGeometry(project);
  const cards = buildCardFacts(project, geometry);
  const layoutRequest = buildLayoutRequest(project, geometry, cards);
  return {
    geometry,
    cards,
    layoutRequest,
    placements: layoutRequest ? solveLayoutRequest(layoutRequest) : [],
  };
}

/** 手动位置优先，其余沿用求解结果。 */
export function effectiveCardPlacement(project: ProjectDocument, placement: CardPlacement): CardPlacement {
  const manual = project.cards.positions?.[placement.id];
  return manual ? { ...placement, x: manual.x, y: manual.y } : placement;
}
