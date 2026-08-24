import { memo } from "react";
import { universityEmblems } from "../../data/university-emblems";
import type { LayoutGroup } from "../../lib/layout";
import type { CardPresentation } from "../../lib/scene-document";
import type { PreparedCardRow } from "./DestinationCard";

/** Reference poster styles are every presentation except the built-in standard card. */
export type ReferenceCardPresentation = Exclude<CardPresentation, "standard">;

const REFERENCE_CARD_COLORS = ["#e95646", "#f3c847", "#efb8c6", "#3d8fc2", "#263b78"] as const;

/** Deterministic accent per group so a card keeps its colour across re-renders and exports. */
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

interface ReferenceRowLines {
  row: PreparedCardRow;
  /** Index of this row's first line among all body lines of the card. */
  start: number;
  texts: string[];
}

/**
 * Flatten each row into the wrapped lines `wrapCardText` produced. The card height is sized
 * from that same line count, so reference visuals must draw one line per entry instead of
 * joining them back into a single overflowing line.
 */
export function referenceRowLines(rows: PreparedCardRow[]): ReferenceRowLines[] {
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
  width: number;
  height: number;
  accent: string;
  background: string;
  opacity: number;
  textColor: string;
  fontSize: number;
  edgeColor: string;
  titleFont?: string;
}

/** Data-driven reference poster card bodies (colour pill, emblem list, city label, glass stat). */
export const ReferenceCardVisual = memo(function ReferenceCardVisual({
  presentation,
  group,
  rows,
  width,
  height,
  accent,
  background,
  opacity,
  textColor,
  fontSize,
  edgeColor,
  titleFont,
}: ReferenceCardVisualProps) {
  const bodyRows = rows.filter((row) => !row.cityHeading || presentation === "glass-stat");
  const lineHeight = Math.max(17, fontSize + 5);

  if (presentation === "color-pill") {
    const foreground = readableTextColor(accent);
    const bodyStart = 32;
    return (
      <g data-card-visual="color-pill">
        <rect x={0} y={12} width={width} height={Math.max(36, height - 12)} rx={Math.min(28, Math.max(18, height / 3))} fill={accent} fillOpacity={opacity} />
        <text x={width / 2} y={19} textAnchor="middle" fill="#1c3154" fontSize={fontSize + 5} fontWeight={800} fontFamily={titleFont}>{group.title}</text>
        {referenceRowLines(bodyRows).map(({ row, start, texts }) => texts.map((text, index) => (
          <text
            key={`${row.key}-${index}`}
            data-card-row-line={row.key}
            x={width / 2}
            y={bodyStart + (start + index) * lineHeight}
            textAnchor="middle"
            fill={foreground}
            fontSize={fontSize}
            fontWeight={600}
          >{text}</text>
        )))}
      </g>
    );
  }

  if (presentation === "emblem-list") {
    const step = Math.max(22, lineHeight + 3);
    return (
      <g data-card-visual="emblem-list">
        <path d={`M20 19 Q${Math.round(width * 0.35)} 10 ${Math.round(width * 0.68)} 18`} fill="none" stroke="#f1c84b" strokeWidth={13} strokeLinecap="round" opacity={0.85} />
        <circle cx={11} cy={14} r={5} fill="#e24d42" /><path d="M8 18 L11 25 L14 18" fill="#e24d42" />
        <text x={24} y={20} fill="#263b78" fontSize={fontSize + 5} fontWeight={800} fontFamily={titleFont}>{group.title}</text>
        {referenceRowLines(bodyRows).map(({ row, start, texts }) => {
          const emblem = row.university ? universityEmblems[row.university] : undefined;
          return (
            <g key={row.key}>
              {emblem && <image href={emblem} x={7} y={40 + start * step - 14} width={18} height={18} preserveAspectRatio="xMidYMid meet" />}
              {texts.map((text, index) => (
                <text key={index} data-card-row-line={row.key} x={emblem ? 31 : 9} y={40 + (start + index) * step} fill={textColor} fontSize={fontSize} fontWeight={500}>{text}</text>
              ))}
            </g>
          );
        })}
      </g>
    );
  }

  if (presentation === "city-label") {
    return (
      <g data-card-visual="city-label">
        <text x={6} y={fontSize + 8} fill={accent} stroke="#ffffff" strokeWidth={2.5} paintOrder="stroke" fontSize={fontSize + 8} fontWeight={900} fontFamily={titleFont}>{group.title}</text>
        {referenceRowLines(bodyRows).map(({ row, start, texts }) => {
          const emblem = row.university ? universityEmblems[row.university] : undefined;
          return (
            <g key={row.key}>
              {emblem && <image href={emblem} x={7} y={39 + start * lineHeight - 13} width={16} height={16} preserveAspectRatio="xMidYMid meet" />}
              {texts.map((text, index) => (
                <text key={index} data-card-row-line={row.key} x={emblem ? 29 : 8} y={39 + (start + index) * lineHeight} fill={textColor} fontSize={fontSize} fontWeight={600}>{text}</text>
              ))}
            </g>
          );
        })}
      </g>
    );
  }

  return (
    <g data-card-visual="glass-stat">
      <rect width={width} height={height} rx={4} fill={background} fillOpacity={Math.min(0.9, Math.max(0.55, opacity))} stroke={edgeColor} strokeOpacity={0.7} />
      <rect x={8} y={8} width={15} height={15} rx={3} fill={accent} />
      <text x={29} y={20} fill={textColor} fontSize={fontSize + 2} fontWeight={800} fontFamily={titleFont}>{group.title}</text>
      <text x={width - 9} y={20} textAnchor="end" fill={accent} fontSize={fontSize} fontWeight={800}>{group.count} 人</text>
      <line x1={8} x2={width - 8} y1={28} y2={28} stroke={edgeColor} strokeOpacity={0.55} />
      {referenceRowLines(rows).map(({ row, start, texts }) => {
        const isHeading = Boolean(row.cityHeading);
        return texts.map((text, index) => (
          <text
            key={`${row.key}-${index}`}
            data-card-row-line={row.key}
            x={isHeading ? 9 : 15}
            y={46 + (start + index) * lineHeight}
            fill={isHeading ? accent : textColor}
            fontSize={isHeading ? Math.max(9, fontSize - 1) : fontSize}
            fontWeight={isHeading ? 800 : 500}
          >{text}</text>
        ));
      })}
    </g>
  );
});
