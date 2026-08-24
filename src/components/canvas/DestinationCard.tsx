import { memo, type ReactNode } from "react";
import type { CardTextLine } from "../../lib/card-text-layout";
import type {
  DisplayFrameFixedItem,
  DisplayFrameFlowBlock,
  DisplayFrameMode,
  DisplayFrameStyle,
} from "../../lib/display-frame";
import { resolveFontFamily, type UserFont } from "../../lib/fonts";
import type { LayoutGroup, SchoolRowPart } from "../../lib/layout";
import type { CardFontField, ProvinceAppearance, TextStyleOverride } from "../../lib/scene-document";
import type { CardPreset } from "../../lib/template-document";

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

/**
 * Card styling shared by every destination card. PosterCanvas memoizes this object so a
 * card only re-renders when a setting it actually reads changes — unrelated edits such as
 * a dragged card position leave the other cards untouched.
 */
export interface DestinationCardStyle {
  preset: CardPreset;
  background: string;
  opacity: number;
  textColor: string;
  fontSize: number;
  showCount: boolean;
  horizontalPadding: number;
  lineHeightMultiplier: number;
  /** Vertical step between body lines in fixed mode. */
  rowHeight: number;
  edgeColor: string;
  activeColor: string;
  fieldFonts?: Partial<Record<CardFontField, string>>;
  fieldTypography?: Partial<Record<CardFontField, TextStyleOverride>>;
  frameMode: DisplayFrameMode;
  frameStyle: DisplayFrameStyle;
  frameTitleItem?: DisplayFrameFixedItem;
  frameBodyItem?: DisplayFrameFixedItem;
  customFrameItems: DisplayFrameFixedItem[];
  flowTitleBlock?: DisplayFrameFlowBlock;
  flowNameBlock?: DisplayFrameFlowBlock;
  flowCityBlock?: DisplayFrameFlowBlock;
  flowTitleFontSize: number;
  flowNameFontSize: number;
  flowContentStart: number;
  userFonts: UserFont[];
}

/** Province artwork shown as a card thumbnail; the manual-color variant has no image. */
export type CardProvinceTexture = Exclude<ProvinceAppearance, { kind: "manual-color" }>;

export interface DestinationCardProps {
  style: DestinationCardStyle;
  group: LayoutGroup;
  province: string;
  rows: PreparedCardRow[];
  titleLines: CardTextLine<CardFontField>[];
  headerExtra: number;
  width: number;
  height: number;
  provinceTexture: CardProvinceTexture | null;
}

function frameTextAnchor(item: DisplayFrameFixedItem): "start" | "middle" | "end" {
  if (item.style?.align === "center") return "middle";
  if (item.style?.align === "right") return "end";
  return "start";
}

function frameTextX(item: DisplayFrameFixedItem): number {
  if (item.style?.align === "center") return item.x + item.width / 2;
  if (item.style?.align === "right") return item.x + item.width;
  return item.x;
}

function renderDisplayFrameItem(item: DisplayFrameFixedItem, frameStyle: { color: string; fontSize: number; align: "left" | "center" | "right" }, userFonts: UserFont[]): ReactNode {
  const color = item.style?.color ?? frameStyle.color;
  if (item.kind === "text") {
    return (
      <text
        key={item.id}
        data-display-frame-text={item.id}
        x={frameTextX(item)}
        y={item.y + Math.min(item.height, item.style?.fontSize ?? frameStyle.fontSize)}
        fill={color}
        fontSize={item.style?.fontSize ?? frameStyle.fontSize}
        fontWeight={item.style?.fontWeight === "bold" ? 700 : item.style?.fontWeight === "medium" ? 500 : undefined}
        fontFamily={resolveFontFamily(item.style?.fontId, userFonts)}
        textAnchor={frameTextAnchor(item)}
        pointerEvents="none"
      >
        {item.content || " "}
      </text>
    );
  }
  if (item.kind === "decoration" && item.decoration === "line") {
    return <line key={item.id} data-display-frame-decoration={item.id} x1={item.x} y1={item.y} x2={item.x + item.width} y2={item.y} stroke={color} strokeWidth={item.style?.strokeWidth ?? 1} pointerEvents="none" />;
  }
  if (item.kind === "decoration") {
    return <rect key={item.id} data-display-frame-decoration={item.id} x={item.x} y={item.y} width={item.width} height={item.height} fill={item.style?.fill ?? "transparent"} stroke={color} strokeWidth={item.style?.strokeWidth ?? 1} pointerEvents="none" />;
  }
  return null;
}

/** Standard (non-reference) destination-card body: surface, custom frame items, title and rows. */
export const DestinationCard = memo(function DestinationCard({
  style,
  group,
  province,
  rows,
  titleLines,
  headerExtra,
  width,
  height,
  provinceTexture,
}: DestinationCardProps) {
  const {
    preset,
    frameMode,
    frameStyle,
    frameTitleItem,
    frameBodyItem,
    customFrameItems,
    flowTitleBlock,
    flowTitleFontSize,
    flowNameFontSize,
    flowContentStart,
    horizontalPadding,
    lineHeightMultiplier,
    rowHeight,
    userFonts,
  } = style;
  const photoOffset = preset === "photo" ? 32 : 0;

  let lineIndex = 0;
  const bodyLines = rows.flatMap((row) => row.lines.map((line, index) => {
    const rowField = row.cityHeading ? "city" : "name";
    const block = frameMode === "flow" ? (rowField === "city" ? style.flowCityBlock : style.flowNameBlock) : undefined;
    const rowFontSize = block?.style?.fontSize ?? style.fieldTypography?.[rowField]?.fontSize ?? (row.cityHeading ? Math.max(9, style.fontSize - 1) : flowNameFontSize);
    const rowLineHeight = frameMode === "flow"
      ? Math.max(16, rowFontSize + 6) * (block?.lineHeight ?? 1.2)
      : rowHeight;
    const y = (frameMode === "fixed" ? frameBodyItem?.y ?? 42 : flowContentStart + flowTitleFontSize + 8) + headerExtra + lineIndex * rowLineHeight;
    lineIndex += 1;
    return (
      <text
        key={`${row.key}-${index}`}
        data-city-section={index === 0 ? row.cityHeading : undefined}
        data-card-row-line={row.key}
        x={frameMode === "fixed" ? frameBodyItem?.x ?? horizontalPadding : horizontalPadding}
        y={y}
        fill={block?.style?.color ?? style.fieldTypography?.[rowField]?.color ?? style.textColor}
        fontSize={rowFontSize}
        fontWeight={row.cityHeading ? 700 : block?.style?.fontWeight === "bold" ? 700 : block?.style?.fontWeight === "medium" ? 500 : undefined}
      >
        {line.map((fragment, fragmentIndex) => (
          <tspan
            key={fragmentIndex}
            fontFamily={resolveFontFamily(fragment.field ? style.fieldFonts?.[fragment.field] : undefined, userFonts)}
            fontSize={fragment.field ? style.fieldTypography?.[fragment.field]?.fontSize : undefined}
            fill={fragment.field ? style.fieldTypography?.[fragment.field]?.color : undefined}
          >{fragment.text}</tspan>
        ))}
      </text>
    );
  }));

  return (
    <>
      <rect
        data-display-frame-surface
        width={width}
        height={height}
        rx={preset === "ticket" ? 12 : preset === "borderless" ? 0 : frameStyle.borderRadius ?? 6}
        fill={frameStyle.background || style.background}
        fillOpacity={frameStyle.opacity ?? style.opacity}
        stroke={preset === "borderless" ? "none" : frameStyle.borderColor ?? style.edgeColor}
        strokeWidth={preset === "borderless" ? undefined : frameStyle.borderWidth ?? 1}
        data-display-frame-mode={frameMode}
      />
      {provinceTexture && (
        <image
          data-card-province-texture={province}
          href={provinceTexture.src}
          x={horizontalPadding + photoOffset}
          y={3}
          width={30}
          height={30}
          opacity={provinceTexture.opacity ?? 1}
          preserveAspectRatio="xMidYMid meet"
          pointerEvents="none"
        />
      )}
      {preset === "ticket" && <><rect data-card-accent width={8} height={height} rx={4} fill={style.activeColor} /><circle cx={width - 18} cy={18} r={7} fill={style.activeColor} opacity={0.2} /></>}
      {preset === "photo" && <><circle data-card-avatar cx={horizontalPadding + 13} cy={21} r={13} fill={style.activeColor} opacity={0.2} /><text x={horizontalPadding + 13} y={25} textAnchor="middle" fill={style.activeColor} fontWeight={700} fontSize={11}>{group.title.slice(0, 1)}</text></>}
      {customFrameItems.map((item) => renderDisplayFrameItem(item, frameStyle, userFonts))}
      {titleLines.map((line, index) => (
        <text
          key={`title-${index}`}
          data-card-title-line
          x={(frameMode === "fixed" ? frameTitleItem?.x ?? horizontalPadding : horizontalPadding) + photoOffset + (provinceTexture ? 36 : 0)}
          y={(frameMode === "fixed" ? frameTitleItem?.y ?? 12 : 12 + (flowTitleBlock?.spacing ?? 0)) + (index + 1) * Math.max(16, flowTitleFontSize + 4) * (flowTitleBlock?.lineHeight ?? lineHeightMultiplier)}
          fontWeight={flowTitleBlock?.style?.fontWeight === "medium" ? 500 : 700}
          fontSize={flowTitleFontSize}
          fill={flowTitleBlock?.style?.color ?? style.fieldTypography?.title?.color ?? style.textColor}
          fontFamily={resolveFontFamily(flowTitleBlock?.style?.fontId ?? style.fieldFonts?.title, userFonts)}
        >{line.map((fragment) => fragment.text).join("")}</text>
      ))}
      {style.showCount && <text x={width - horizontalPadding} y={22} fill={style.activeColor} textAnchor="end" fontWeight={700} fontSize={style.fontSize} fontFamily={resolveFontFamily(style.fieldFonts?.title, userFonts)}>{group.count} 人</text>}
      {preset !== "borderless" && <line x1={horizontalPadding} x2={width - horizontalPadding} y1={30 + headerExtra} y2={30 + headerExtra} stroke={style.edgeColor} />}
      {bodyLines}
    </>
  );
});
