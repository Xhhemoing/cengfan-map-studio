import type { CardArea, CardPlacement } from "./card-layout";
import { DEFAULT_CARD_EXPRESSION_TEMPLATES, formatCardExpression } from "./card-expression";
import { wrapCardText, type CardTextFragment, type CardTextLine } from "./card-text-layout";
import {
  buildCitySections,
  buildSchoolRows,
  schoolRowParts,
  type LayoutGroup,
  type SchoolRowPart,
} from "./layout";
import { findProvinceFeature, type MapFeature, type Position } from "./map-data";
import { DEFAULT_NAME_FORMAT, formatStudentName } from "./name-format";
import type { CanvasText, CardFontField, CardSettings, MapSettings } from "./scene-document";
import { resolveStudentLocation } from "./student-data";

export function destinationHeight(lineCount: number, rowHeight: number, bottomPadding: number, headerExtra: number): number {
  return 44 + headerExtra + lineCount * rowHeight + bottomPadding;
}

/** Extend a connector path so it runs from the card center to its boundary port. The
 *  portion inside the card is covered by the card fill, so the visible line ends flush
 *  at the card edge and its tip stays hidden ("到板块的中心隐藏"). */
export function connectorPathToCenter(pathData: string, port: { x: number; y: number }, card: { x: number; y: number; width: number; height: number }): string {
  const centerX = card.x + card.width / 2;
  const centerY = card.y + card.height / 2;
  const format = (value: number) => Number(value.toFixed(3)).toString();
  const rest = pathData.replace(/^M[-\d.]+ [-\d.]+/, "").trim();
  return `M${format(centerX)} ${format(centerY)} L${format(port.x)} ${format(port.y)} ${rest}`;
}

export function textLayoutObstacle(text: CanvasText): CardArea | null {
  if (!text.visibility || !text.content.trim()) return null;
  const x = text.textAlign === "right"
    ? text.x - text.maxWidth
    : text.textAlign === "center"
      ? text.x - text.maxWidth / 2
      : text.x;
  return {
    x,
    y: text.y - text.fontSize,
    width: text.maxWidth,
    height: text.fontSize * 1.3,
  };
}

function studentFieldParts(
  student: { name: string; university: string; city: string },
  fields: CardSettings["visibleFields"],
): SchoolRowPart[] {
  return fields
    .map((field) => ({ field, value: student[field] }))
    .filter((part): part is SchoolRowPart => Boolean(part.value));
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

const REFERENCE_CARD_COLORS = ["#e95646", "#f3c847", "#efb8c6", "#3d8fc2", "#263b78"] as const;

export function referenceCardColor(key: string, fallback: string): string {
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return REFERENCE_CARD_COLORS[hash % REFERENCE_CARD_COLORS.length] ?? fallback;
}

export function readableTextColor(background: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(background);
  if (!match) return "#ffffff";
  const value = Number.parseInt(match[1]!, 16);
  const luminance = ((value >> 16) * 299 + ((value >> 8) & 255) * 587 + (value & 255) * 114) / 1000;
  return luminance > 160 ? "#1c3154" : "#ffffff";
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

/** A destination card measured and pre-wrapped, before collision layout assigns a position. */
export interface PreparedDestinationCard {
  group: LayoutGroup;
  province: string;
  isInternational: boolean;
  rows: PreparedCardRow[];
  titleLines: CardTextLine<CardFontField>[];
  headerExtra: number;
  anchorX: number;
  anchorY: number;
  width: number;
  height: number;
}

/** A prepared card plus the position resolved by the layout solver (or a manual override). */
export interface PlacedDestinationCard extends PreparedDestinationCard {
  placement: CardPlacement;
}

/** Measure every destination card: wrap its rows and title, compute its size and
 *  the province anchor point in canvas pixels. Pure function of card settings,
 *  map placement and the mercator projection. */
export function prepareDestinationCards({
  groups,
  cards,
  expressionTemplates,
  features,
  projection,
  centroid,
  map,
  canvasWidth,
  safeMargin,
  horizontalPadding,
  lineHeightMultiplier,
  noWrapFieldSet,
}: {
  groups: LayoutGroup[];
  /** Narrow Pick so memo callers can keep field-level dependency lists. */
  cards: Pick<CardSettings,
    "grouping" | "visibleFields" | "compactLayout" | "preset" | "fieldTypography" | "fontSize"
    | "maxWidth" | "bottomPadding" | "padding" | "nameFormat" | "citySubgroups" | "showProvinceTexture">;
  expressionTemplates: { title: string; city: string; row: string };
  features: MapFeature[];
  projection: (coordinate: Position) => [number, number] | null;
  centroid: (feature: MapFeature) => [number, number];
  map: Pick<MapSettings, "x" | "y" | "width" | "height" | "scale">;
  canvasWidth: number;
  safeMargin: number;
  horizontalPadding: number;
  lineHeightMultiplier: number;
  noWrapFieldSet: ReadonlySet<CardFontField>;
}): PreparedDestinationCard[] {
  const grouping = cards.grouping;
  const compactLayout = cards.compactLayout === true || cards.preset === "compact";
  const cardFieldFontSize = (field: CardFontField) => cards.fieldTypography?.[field]?.fontSize ?? (field === "city" ? Math.max(9, cards.fontSize - 1) : cards.fontSize);
  const rowFontSize = Math.max(...cards.visibleFields.map(cardFieldFontSize), cardFieldFontSize("city"));
  const rowHeight = Math.max(compactLayout ? 18 : 20, rowFontSize + 6) * lineHeightMultiplier;
  const titleFontSize = cardFieldFontSize("title");
  const cardWidth = Math.min(cards.maxWidth, Math.max(80, canvasWidth - safeMargin * 2));
  const contentWidth = Math.max(rowFontSize, cardWidth - horizontalPadding * 2);
  const bottomPadding = cards.bottomPadding ?? cards.padding;
  const titleLineHeight = Math.max(16, titleFontSize + 4) * lineHeightMultiplier;
  const formatName = (name: string) => formatStudentName(name, cards.nameFormat ?? DEFAULT_NAME_FORMAT);
  return groups.map((group) => {
    const isInternational = group.students.every((student) => student.locationScope === "international");
    const province = isInternational || !group.students[0] ? "" : resolveStudentLocation(group.students[0]).province;
    const feature = findProvinceFeature(features, province);
    const administrativeCenter = feature ? projection(feature.center) : null;
    const point = administrativeCenter && administrativeCenter.every(Number.isFinite)
      ? administrativeCenter
      : feature
        ? centroid(feature)
        : [map.width / 2, map.height / 2];
    const centerX = map.width / 2;
    const centerY = map.height / 2;
    const anchorX = Number.isFinite(point[0]) ? map.x + centerX + (point[0] - centerX) * map.scale : map.x + centerX;
    const anchorY = Number.isFinite(point[1]) ? map.y + centerY + (point[1] - centerY) * map.scale : map.y + centerY;
    const rows = cardRowsForGroup(group, grouping, cards.visibleFields, cards.citySubgroups !== false, formatName).map((row): PreparedCardRow => {
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
      return { ...row, lines: wrapCardText(fragments, contentWidth, row.cityHeading ? cardFieldFontSize("city") : rowFontSize, {
        preserveFields: noWrapFieldSet,
      }) };
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
      group,
      province,
      isInternational,
      rows,
      titleLines,
      headerExtra,
      anchorX,
      anchorY,
      width: cardWidth,
      height: destinationHeight(lineCount, rowHeight, bottomPadding, headerExtra),
    };
  });
}
