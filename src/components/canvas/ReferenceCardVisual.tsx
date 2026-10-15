import { memo } from "react";
import { universityEmblems } from "../../data/university-emblems";
import { type CardTextLine } from "../../lib/card-text-layout";
import { wrapStyledCardText } from "../../lib/styled-card-text";
import { resolveFontFamily, type UserFont } from "../../lib/fonts";
import { DEFAULT_CARD_FONT_FAMILY } from "../../lib/styled-card-text";
import type { LayoutGroup } from "../../lib/layout";
import { referenceCardMetrics, type ReferenceCardMetrics } from "../../lib/reference-card-metrics";
import type { CardFontField, CardPresentation, CardSettings } from "../../lib/scene-document";
import type { PreparedCardRow } from "./DestinationCard";

export type ReferenceCardPresentation = Exclude<CardPresentation, "standard">;
const REFERENCE_CARD_COLORS = ["#e95646", "#f3c847", "#efb8c6", "#3d8fc2", "#263b78"] as const;

/** Deterministic decorative accent; editable background/text colors remain authoritative. */
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

/** Public line summary used by previews; the renderer retains the semantic fragments. */
export function referenceRowLines(rows: PreparedCardRow[]) {
  let start = 0;
  return rows.map((row) => {
    const texts = row.lines.map((line) => line.map((fragment) => fragment.text).join(""));
    const entry = { row, start, texts };
    start += texts.length;
    return entry;
  });
}

export interface ReferenceCardVisualProps {
  presentation: ReferenceCardPresentation;
  group: LayoutGroup;
  rows: PreparedCardRow[];
  titleLines?: CardTextLine<CardFontField>[];
  referenceMetrics?: ReferenceCardMetrics;
  width: number;
  height: number;
  accent: string;
  background: string;
  opacity: number;
  textColor: string;
  fontSize: number;
  edgeColor: string;
  titleFont?: string;
  fieldFonts?: CardSettings["fieldFonts"];
  fieldTypography?: CardSettings["fieldTypography"];
  userFonts?: UserFont[];
  showCount?: boolean;
  horizontalPadding?: number;
  topPadding?: number;
  lineHeightMultiplier?: number;
}

/** All reference styles paint the same prepared text and measured geometry as auto-layout. */
export const ReferenceCardVisual = memo(function ReferenceCardVisual({
  presentation, group, rows, titleLines: preparedTitleLines, referenceMetrics: preparedMetrics,
  width, height, accent, background, opacity, textColor, fontSize, edgeColor, titleFont,
  fieldFonts, fieldTypography, userFonts = [], showCount = presentation === "glass-stat",
  horizontalPadding = 8, topPadding, lineHeightMultiplier = 1,
}: ReferenceCardVisualProps) {
  const metricInput = { presentation, width, fontSize, fieldTypography, fieldFonts, userFonts, horizontalPadding, topPadding, lineHeightMultiplier, showCount, count: group.count };
  const initialMetrics = preparedMetrics ?? referenceCardMetrics(metricInput);
  const titleLines = preparedTitleLines ?? wrapStyledCardText([{ text: group.title, field: "title" }], initialMetrics.titleWidth, {
    fontSize: initialMetrics.titleFontSize, fontWeight: presentation === "city-label" ? 900 : 800,
    fieldTypography, fieldFonts, userFonts,
  });
  const metrics = preparedMetrics ?? referenceCardMetrics({
    ...metricInput, titleLineCount: titleLines.length,
    bodyLineCount: rows.reduce((count, row) => count + row.lines.length, 0),
  });
  const titleColor = fieldTypography?.title?.color ?? textColor;
  const titleFamily = resolveFontFamily(fieldFonts?.title, userFonts) ?? titleFont ?? DEFAULT_CARD_FONT_FAMILY;

  const pill = presentation === "color-pill";
  const stat = presentation === "glass-stat";
  const hasEmblem = presentation === "emblem-list" || presentation === "city-label";
  let lineIndex = 0;
  const body = rows.flatMap((row) => {
    const heading = Boolean(row.cityHeading);
    const rowFontSize = fieldTypography?.[heading ? "city" : "name"]?.fontSize ?? (heading ? Math.max(9, fontSize - 1) : fontSize);
    const rowColor = heading ? fieldTypography?.city?.color ?? accent : textColor;
    const emblem = hasEmblem && !heading && row.university ? universityEmblems[row.university] : undefined;
    const rowStart = lineIndex;
    const x = pill ? width / 2 : heading || !emblem ? metrics.horizontalPadding : metrics.bodyX;
    const nodes = row.lines.map((line, index) => {
      const baseline = metrics.bodyBaseline + lineIndex++ * metrics.rowHeight;
      return <text key={`${row.key}-${index}`} data-card-row-line={row.key} data-city-section={heading ? row.cityHeading : undefined}
        x={x} y={baseline} textAnchor={pill ? "middle" : "start"} fill={rowColor}
        fontSize={rowFontSize} fontWeight={heading ? 800 : pill || presentation === "city-label" ? 600 : 500}>
        {line.map((fragment, fragmentIndex) => <tspan key={fragmentIndex}
          data-card-field={fragment.field}
          fontFamily={resolveFontFamily(fragment.field ? fieldFonts?.[fragment.field] : undefined, userFonts) ?? DEFAULT_CARD_FONT_FAMILY}
          fontSize={fragment.field ? fieldTypography?.[fragment.field]?.fontSize ?? (heading ? rowFontSize : fontSize) : fontSize}
          fill={fragment.field ? fieldTypography?.[fragment.field]?.color ?? rowColor : textColor}
        >{fragment.text}</tspan>)}
      </text>;
    });
    return emblem ? [
      <image key={`${row.key}-emblem`} href={emblem} x={metrics.horizontalPadding} y={metrics.bodyBaseline + rowStart * metrics.rowHeight - 14}
        width={18} height={18} preserveAspectRatio="xMidYMid meet" />,
      ...nodes,
    ] : nodes;
  });

  const surfaceTop = pill ? Math.max(0, metrics.titleBaseline - metrics.titleFontSize + 10) : 0;
  return <g data-card-visual={presentation}>
    <rect data-reference-card-surface x={0} y={surfaceTop} width={width} height={pill ? Math.max(36, height - surfaceTop) : height}
      rx={pill ? Math.min(28, Math.max(18, height / 3)) : stat ? 4 : 0}
      fill={background} fillOpacity={opacity} stroke={stat ? edgeColor : undefined} strokeOpacity={stat ? 0.7 : undefined} />
    {presentation === "emblem-list" && <>
      <path d={`M20 19 Q${Math.round(width * 0.35)} 10 ${Math.round(width * 0.68)} 18`} fill="none" stroke="#f1c84b" strokeWidth={13} strokeLinecap="round" opacity={0.85} />
      <circle cx={11} cy={14} r={5} fill="#e24d42" /><path d="M8 18 L11 25 L14 18" fill="#e24d42" />
    </>}
    {stat && <rect x={metrics.horizontalPadding} y={Math.max(0, metrics.titleBaseline - metrics.titleFontSize + 2)} width={15} height={15} rx={3} fill={accent} />}
    {titleLines.map((line, index) => <text key={`title-${index}`} data-card-title-line
      x={metrics.titleX} y={metrics.titleBaseline + index * metrics.titleLineHeight}
      textAnchor={pill ? "middle" : "start"} fill={titleColor} fontSize={metrics.titleFontSize}
      fontWeight={presentation === "city-label" ? 900 : 800} fontFamily={titleFamily} style={{ fontFamily: titleFamily }}
      stroke={presentation === "city-label" ? "#ffffff" : undefined} strokeWidth={presentation === "city-label" ? 2.5 : undefined}
      paintOrder={presentation === "city-label" ? "stroke" : undefined}
    >{line.map((fragment) => fragment.text).join("")}</text>)}
    {body}
    {showCount && <g data-card-count>{metrics.countLines.map((text, index) => <text key={index}
      x={width - metrics.horizontalPadding} y={metrics.countBaseline + index * metrics.countLineHeight} textAnchor="end"
      fill={textColor} fontSize={fontSize} fontWeight={800} fontFamily={titleFamily} style={{ fontFamily: titleFamily }}>{text}</text>)}</g>}
    {stat && <line x1={metrics.horizontalPadding} x2={width - metrics.horizontalPadding} y1={metrics.headerBottom + 7} y2={metrics.headerBottom + 7} stroke={edgeColor} strokeOpacity={0.55} />}
  </g>;
});
