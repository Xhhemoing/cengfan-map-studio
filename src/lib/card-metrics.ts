/**
 * Shared card content/sizing math for the poster's destination cards.
 *
 * `PosterCanvas` renders from these prepared contents, and the delivery
 * health check (`App.tsx`) reads the same estimated width/heights so its
 * warnings match what the exported PNG/SVG actually shows instead of a
 * fixed phantom size.
 */
import { DEFAULT_CARD_EXPRESSION_TEMPLATES, formatCardExpression } from "./card-expression";
import { wrapCardText, type CardTextFragment, type CardTextLine } from "./card-text-layout";
import { deriveFixedDisplayFrameFromCardSettings, normalizeDisplayFrame } from "./display-frame";
import {
  buildCitySections,
  buildLayoutGroups,
  buildSchoolRows,
  schoolRowParts,
  type LayoutGroup,
  type SchoolRowPart,
} from "./layout";
import { DEFAULT_NAME_FORMAT, formatStudentName } from "./name-format";
import { getVisibleStudents } from "./project-data";
import type { ProjectDocument } from "./project-document";
import type { CardFontField } from "./scene-document";
import { resolveStudentLocation } from "./student-data";

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

/** Estimated card height: header + body lines + configured bottom padding. */
export function destinationHeight(lineCount: number, rowHeight: number, bottomPadding: number, headerExtra: number): number {
  return 44 + headerExtra + lineCount * rowHeight + bottomPadding;
}

export function studentFieldParts(
  student: { name: string; university: string; city: string },
  fields: ProjectDocument["cards"]["visibleFields"],
): SchoolRowPart[] {
  return fields
    .map((field) => ({ field, value: student[field] }))
    .filter((part): part is SchoolRowPart => Boolean(part.value));
}

export function cardRowsForGroup(
  group: LayoutGroup,
  grouping: ProjectDocument["cards"]["grouping"],
  fields: ProjectDocument["cards"]["visibleFields"],
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

export type CardContentInput = Pick<ProjectDocument, "students" | "dataView" | "cards"> & {
  canvas: Pick<ProjectDocument["canvas"], "width" | "safeMargin" | "lineHeight">;
};

/**
 * Content, wrapping and estimated bounds for every destination card of the
 * current grouping. Anchors (which need the map projection) are added by the
 * canvas on top of this.
 */
export function prepareCardContents(project: CardContentInput): PreparedCardContent[] {
  if (project.cards.visibleFields.length === 0 || project.dataView === "pins") return [];
  const lineHeightMultiplier = project.canvas.lineHeight ?? 1;
  const grouping = project.cards.grouping;
  const groups = buildLayoutGroups(getVisibleStudents(project.students), grouping);
  const expressionTemplates = project.cards.expressionTemplates ?? DEFAULT_CARD_EXPRESSION_TEMPLATES;
  const noWrapFieldSet = new Set(project.cards.noWrapFields ?? []);
  const displayFrame = project.cards.displayFrame === undefined
    ? deriveFixedDisplayFrameFromCardSettings(project.cards)
    : normalizeDisplayFrame(project.cards.displayFrame);
  const frameBodyItem = displayFrame.fixed.items.find((item) => item.id === "name") ?? displayFrame.fixed.items[0];
  const horizontalPadding = displayFrame.mode === "fixed"
    ? frameBodyItem?.x ?? project.cards.horizontalPadding ?? project.cards.padding
    : displayFrame.style.padding;

  const compactLayout = project.cards.compactLayout === true || project.cards.preset === "compact";
  const cardFieldFontSize = (field: CardFontField) => project.cards.fieldTypography?.[field]?.fontSize ?? (field === "city" ? Math.max(9, project.cards.fontSize - 1) : project.cards.fontSize);
  const rowFontSize = Math.max(...project.cards.visibleFields.map(cardFieldFontSize), cardFieldFontSize("city"));
  const rowHeight = Math.max(compactLayout ? 18 : 20, rowFontSize + 6) * lineHeightMultiplier;
  const titleFontSize = cardFieldFontSize("title");
  const cardWidth = Math.min(project.cards.maxWidth, Math.max(80, project.canvas.width - project.canvas.safeMargin * 2));
  const contentWidth = Math.max(rowFontSize, cardWidth - horizontalPadding * 2);
  const bottomPadding = project.cards.bottomPadding ?? project.cards.padding;
  const titleLineHeight = Math.max(16, titleFontSize + 4) * lineHeightMultiplier;
  const formatName = (name: string) => formatStudentName(name, project.cards.nameFormat ?? DEFAULT_NAME_FORMAT);

  return groups.map((group) => {
    const isInternational = group.students.every((student) => student.locationScope === "international");
    const province = isInternational || !group.students[0] ? "" : resolveStudentLocation(group.students[0]).province;
    const rows = cardRowsForGroup(group, grouping, project.cards.visibleFields, project.cards.citySubgroups !== false, formatName).map((row): PreparedCardRow => {
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
    const textureHeaderWidth = project.cards.showProvinceTexture === true ? 36 : 0;
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
      width: cardWidth,
      height: destinationHeight(lineCount, rowHeight, bottomPadding, headerExtra),
    };
  });
}

/** Estimated card rects for layout-health checks, keyed by group key. */
export function estimateCardBounds(project: CardContentInput): Map<string, { width: number; height: number }> {
  return new Map(prepareCardContents(project).map((content) => [content.group.key, { width: content.width, height: content.height }]));
}
