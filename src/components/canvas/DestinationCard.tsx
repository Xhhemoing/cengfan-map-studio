import { memo, type ReactNode } from "react";
import type { CardTextLine } from "../../lib/card-text-layout";
import type {
  DisplayFrameFixedItem,
  DisplayFrameFlowBlock,
  DisplayFrameMode,
  DisplayFrameStyle,
} from "../../lib/display-frame";
import {
  displayFrameFontWeightValue,
  displayFrameTextBaseline,
  displayFrameTextX,
  resolveDisplayFrameFieldFontSize,
  resolveDisplayFrameItemPaint,
  resolveDisplayFrameSurface,
  type ResolvedDisplayFrameSurface,
} from "../../lib/display-frame-style";
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

function renderDisplayFrameItem(item: DisplayFrameFixedItem, surface: ResolvedDisplayFrameSurface, userFonts: UserFont[]): ReactNode {
  const paint = resolveDisplayFrameItemPaint(item, surface);
  if (item.kind === "text") {
    return (
      <text
        key={item.id}
        data-display-frame-text={item.id}
        x={displayFrameTextX(item, paint)}
        y={displayFrameTextBaseline(item, paint)}
        fill={paint.fill}
        fontSize={paint.fontSize}
        fontWeight={paint.fontWeight}
        fontFamily={resolveFontFamily(paint.fontId, userFonts)}
        textAnchor={paint.textAnchor}
        opacity={paint.opacity}
        pointerEvents="none"
      >
        {item.content || " "}
      </text>
    );
  }
  if (item.kind === "decoration" && item.decoration === "line") {
    return <line key={item.id} data-display-frame-decoration={item.id} x1={item.x} y1={item.y} x2={item.x + item.width} y2={item.y} stroke={paint.color} strokeWidth={paint.strokeWidth} opacity={paint.opacity} pointerEvents="none" />;
  }
  if (item.kind === "decoration") {
    return <rect key={item.id} data-display-frame-decoration={item.id} x={item.x} y={item.y} width={item.width} height={item.height} fill={paint.fill} stroke={paint.color} strokeWidth={paint.strokeWidth} opacity={paint.opacity} pointerEvents="none" />;
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
  // The card falls back to its own paint when the frame leaves a slot empty, then the shared
  // resolver fills in every remaining optional token exactly like the display-frame renderer.
  const surface = resolveDisplayFrameSurface({
    ...frameStyle,
    background: frameStyle.background || style.background,
    opacity: frameStyle.opacity ?? style.opacity,
    borderColor: frameStyle.borderColor ?? style.edgeColor,
  });

  // In fixed mode the frame items own the alignment; flow mode stacks everything at the padding.
  const titlePaint = frameMode === "fixed" && frameTitleItem ? resolveDisplayFrameItemPaint(frameTitleItem, surface) : undefined;
  const bodyPaint = frameMode === "fixed" && frameBodyItem ? resolveDisplayFrameItemPaint(frameBodyItem, surface) : undefined;
  // Titles are bold by default, but an explicit weight — including "normal" — always wins.
  const titleFontWeight = titlePaint?.fontWeight
    ?? displayFrameFontWeightValue(flowTitleBlock?.style?.fontWeight, 700);
  const titleX = (titlePaint && frameTitleItem ? displayFrameTextX(frameTitleItem, titlePaint) : horizontalPadding)
    + photoOffset
    + (provinceTexture ? 36 : 0);
  const bodyX = bodyPaint && frameBodyItem ? displayFrameTextX(frameBodyItem, bodyPaint) : horizontalPadding;

  let lineIndex = 0;
  const bodyLines = rows.flatMap((row) => row.lines.map((line, index) => {
    const rowField = row.cityHeading ? "city" : "name";
    const block = frameMode === "flow" ? (rowField === "city" ? style.flowCityBlock : style.flowNameBlock) : undefined;
    const rowFontSize = block?.style?.fontSize
      ?? style.fieldTypography?.[rowField]?.fontSize
      ?? (row.cityHeading ? resolveDisplayFrameFieldFontSize("city", style.fontSize) : flowNameFontSize);
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
        x={bodyX}
        y={y}
        textAnchor={bodyPaint?.textAnchor}
        fill={block?.style?.color ?? style.fieldTypography?.[rowField]?.color ?? style.textColor}
        fontSize={rowFontSize}
        fontWeight={displayFrameFontWeightValue(block?.style?.fontWeight, row.cityHeading ? 700 : 400)}
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
        rx={preset === "ticket" ? 12 : preset === "borderless" ? 0 : surface.borderRadius}
        fill={surface.background}
        fillOpacity={surface.opacity}
        stroke={preset === "borderless" ? "none" : surface.borderColor}
        strokeWidth={preset === "borderless" ? undefined : surface.borderWidth}
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
      {customFrameItems.map((item) => renderDisplayFrameItem(item, surface, userFonts))}
      {titleLines.map((line, index) => (
        <text
          key={`title-${index}`}
          data-card-title-line
          x={titleX}
          y={(frameMode === "fixed" ? frameTitleItem?.y ?? 12 : 12 + (flowTitleBlock?.spacing ?? 0)) + (index + 1) * Math.max(16, flowTitleFontSize + 4) * (flowTitleBlock?.lineHeight ?? lineHeightMultiplier)}
          textAnchor={titlePaint?.textAnchor}
          fontWeight={titleFontWeight}
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
