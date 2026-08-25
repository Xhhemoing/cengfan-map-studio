import { DEFAULT_CARD_EXPRESSION_TEMPLATES, formatCardExpression, type CardExpressionTemplates } from "./card-expression";
import { wrapCardText, type CardTextFragment, type CardTextLine } from "./card-text-layout";
import {
  buildCitySections,
  buildSchoolRows,
  schoolRowParts,
  type LayoutGroup,
  type LayoutStudent,
  type SchoolRowPart,
} from "./layout";
import { DEFAULT_NAME_FORMAT, formatStudentName } from "./name-format";
import type { CardFontField, CardSettings } from "./scene-document";
import { resolveStudentLocation } from "./student-data";
import type { VisibleField } from "./template-document";
import {
  DESTINATION_CARD_HEADER_HEIGHT,
  DESTINATION_CARD_TEXTURE_HEADER_WIDTH,
  destinationCardFixedRowHeight,
  destinationCardRowFontSize,
  destinationCardTitleLineHeight,
} from "./destination-card-metrics";

/** One body row of a destination card, before its text is wrapped. */
export interface CardDisplayRow {
  key: string;
  parts: SchoolRowPart[];
  remainingPeople: number;
  cityHeading?: string;
  city?: string;
  university?: string;
  names?: string;
}

/** A display row wrapped to the card's content width. */
export interface PreparedCardRow extends CardDisplayRow {
  lines: CardTextLine<CardFontField>[];
}

/** Everything a destination card draws that depends only on its content and typography.
 *  Deliberately free of map pan/zoom so panning the map never re-wraps card text. */
export interface PreparedCardContent {
  group: LayoutGroup;
  province: string;
  isInternational: boolean;
  rows: PreparedCardRow[];
  titleLines: CardTextLine<CardFontField>[];
  headerExtra: number;
  width: number;
  height: number;
}

/** A prepared card placed against the current map transform. */
export interface PreparedCard extends PreparedCardContent, CardAnchor {}

export interface PreparedCardContentOptions {
  groups: LayoutGroup[];
  grouping: CardSettings["grouping"];
  visibleFields: readonly VisibleField[];
  /** Show city headings inside province-grouped cards. */
  citySubgroups: boolean;
  expressionTemplates: CardExpressionTemplates;
  nameFormat?: string;
  fontSize: number;
  fieldTypography?: CardSettings["fieldTypography"];
  /** Already resolved from `cards.compactLayout` / the compact preset. */
  compactLayout: boolean;
  maxWidth: number;
  /** Left/right whitespace inside the card, as resolved by the display frame. */
  horizontalPadding: number;
  bottomPadding: number;
  /** Reserves header width for the province thumbnail. */
  showProvinceTexture: boolean;
  /**
   * Header width a preset ornament already occupies (`destinationCardHeaderOffset`). The title
   * starts after it, so only the title wrap width pays for it — body rows keep the padding box.
   */
  headerOffset?: number;
  /** Fields that must never be split across lines. */
  noWrapFields?: ReadonlySet<CardFontField>;
  lineHeightMultiplier: number;
  canvasWidth: number;
  safeMargin: number;
}

/** Shared vertical/horizontal metrics every card in a document uses. */
export interface PreparedCardMetrics {
  /** Largest size a body line can paint; body text wraps and steps against it. */
  rowFontSize: number;
  /** Fixed-mode step between body lines, the one the card renderer walks rows with. */
  rowHeight: number;
  titleFontSize: number;
  titleLineHeight: number;
  cardWidth: number;
  contentWidth: number;
  /** Available width for the title once the count badge and thumbnail are reserved. */
  titleWidth: number;
}

/** Effective font size of one card field, falling back to the card font size
 *  (city rows sit one step smaller unless overridden). */
export function cardFieldFontSize(
  field: CardFontField,
  fontSize: number,
  fieldTypography?: CardSettings["fieldTypography"],
): number {
  return fieldTypography?.[field]?.fontSize
    ?? (field === "city" ? Math.max(9, fontSize - 1) : fontSize);
}

/** Card height: header block + wrapped title overflow + body rows + bottom padding. */
export function destinationCardHeight(
  lineCount: number,
  rowHeight: number,
  bottomPadding: number,
  headerExtra: number,
): number {
  return DESTINATION_CARD_HEADER_HEIGHT + headerExtra + lineCount * rowHeight + bottomPadding;
}

export function computePreparedCardMetrics(options: PreparedCardContentOptions): PreparedCardMetrics {
  const fieldFontSize = (field: CardFontField) => cardFieldFontSize(field, options.fontSize, options.fieldTypography);
  const rowFontSize = destinationCardRowFontSize({
    // A row field keeps the card font size even when it is `city`: only the city *heading*
    // shrinks one step, and it joins the step separately below.
    visibleFieldFontSizes: options.visibleFields.map((field) => options.fieldTypography?.[field]?.fontSize ?? options.fontSize),
    cityHeadingFontSize: fieldFontSize("city"),
  });
  const titleFontSize = fieldFontSize("title");
  const cardWidth = Math.min(options.maxWidth, Math.max(80, options.canvasWidth - options.safeMargin * 2));
  const contentWidth = Math.max(rowFontSize, cardWidth - options.horizontalPadding * 2);
  const textureHeaderWidth = options.showProvinceTexture ? DESTINATION_CARD_TEXTURE_HEADER_WIDTH : 0;
  const headerOffset = options.headerOffset ?? 0;
  return {
    rowFontSize,
    rowHeight: destinationCardFixedRowHeight({
      rowFontSize,
      compactLayout: options.compactLayout,
      lineHeightMultiplier: options.lineHeightMultiplier,
    }),
    titleFontSize,
    titleLineHeight: destinationCardTitleLineHeight(titleFontSize, options.lineHeightMultiplier),
    cardWidth,
    contentWidth,
    titleWidth: Math.max(
      titleFontSize,
      contentWidth - Math.max(42, titleFontSize * 3) - textureHeaderWidth - headerOffset,
    ),
  };
}

function studentFieldParts(
  student: { name: string; university: string; city: string },
  fields: readonly VisibleField[],
): SchoolRowPart[] {
  return fields
    .map((field) => ({ field, value: student[field] }))
    .filter((part): part is SchoolRowPart => Boolean(part.value));
}

function rowFragments(
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

/** Display rows for one layout group, before text wrapping. */
export function cardRowsForGroup(
  group: LayoutGroup,
  grouping: CardSettings["grouping"],
  fields: readonly VisibleField[],
  citySubgroups: boolean,
  formatName: (name: string) => string,
): CardDisplayRow[] {
  const students: LayoutStudent[] = group.students.map((student) => ({ ...student, name: formatName(student.name) }));
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

/**
 * Wrap every card's text and size its box. Pure: the result is valid for any map
 * pan/zoom, so PosterCanvas can memoize it without the map transform as a dependency
 * and attach anchors separately (see {@link resolveCardAnchor}).
 */
export function buildPreparedCardContents(options: PreparedCardContentOptions): PreparedCardContent[] {
  const metrics = computePreparedCardMetrics(options);
  const fieldFontSize = (field: CardFontField) => cardFieldFontSize(field, options.fontSize, options.fieldTypography);
  const formatName = (name: string) => formatStudentName(name, options.nameFormat ?? DEFAULT_NAME_FORMAT);
  const { expressionTemplates, grouping } = options;

  return options.groups.map((group) => {
    const isInternational = group.students.every((student) => student.locationScope === "international");
    const province = isInternational || !group.students[0] ? "" : resolveStudentLocation(group.students[0]).province;
    const rows = cardRowsForGroup(group, grouping, options.visibleFields, options.citySubgroups, formatName)
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
          lines: wrapCardText(
            fragments,
            metrics.contentWidth,
            row.cityHeading ? fieldFontSize("city") : metrics.rowFontSize,
            { preserveFields: options.noWrapFields },
          ),
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
    const titleLines = wrapCardText([{ text: title, field: "title" as const }], metrics.titleWidth, metrics.titleFontSize);
    const headerExtra = Math.max(0, titleLines.length - 1) * metrics.titleLineHeight;
    return {
      group,
      province,
      isInternational,
      rows,
      titleLines,
      headerExtra,
      width: metrics.cardWidth,
      height: destinationCardHeight(lineCount, metrics.rowHeight, options.bottomPadding, headerExtra),
    };
  });
}

/** Map pan/zoom fields an anchor is placed against. */
export interface MapAnchorTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

export interface CardAnchor {
  anchorX: number;
  anchorY: number;
}

/**
 * Place a projected map point in canvas space. A non-finite coordinate (province missing
 * from the projection) falls back to the map center so the connector still has a target.
 */
export function resolveCardAnchor(
  point: ArrayLike<number> | null | undefined,
  map: MapAnchorTransform,
): CardAnchor {
  const centerX = map.width / 2;
  const centerY = map.height / 2;
  const pointX = point?.[0];
  const pointY = point?.[1];
  return {
    anchorX: Number.isFinite(pointX) ? map.x + centerX + (pointX! - centerX) * map.scale : map.x + centerX,
    anchorY: Number.isFinite(pointY) ? map.y + centerY + (pointY! - centerY) * map.scale : map.y + centerY,
  };
}
