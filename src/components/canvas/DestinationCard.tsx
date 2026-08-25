import { memo, type ReactNode } from "react";
import type { CardTextLine } from "../../lib/card-text-layout";
import type {
  DisplayFrameField,
  DisplayFrameFixedItem,
  DisplayFrameFlowBlock,
  DisplayFrameItemStyle,
  DisplayFrameMode,
  DisplayFrameStyle,
} from "../../lib/display-frame";
import {
  displayFrameTextBaseline,
  displayFrameTextX,
  resolveDisplayFrameBlockPaint,
  resolveDisplayFrameFieldFontSize,
  resolveDisplayFrameFieldPaint,
  resolveDisplayFrameItemPaint,
  resolveDisplayFrameSurface,
  type DisplayFrameTextAnchor,
  type ResolvedDisplayFramePaint,
  type ResolvedDisplayFrameSurface,
} from "../../lib/display-frame-style";
import {
  DESTINATION_CARD_COUNT_BASELINE,
  DESTINATION_CARD_PHOTO_INITIAL_FONT_WEIGHT,
  destinationCardAvatar,
  destinationCardBodyBaseline,
  destinationCardBodyRowHeight,
  destinationCardBodyTop,
  destinationCardDividerY,
  destinationCardHeaderOffset,
  destinationCardSurfaceChrome,
  destinationCardTextureBox,
  destinationCardTicketOrnaments,
  destinationCardTitleBaseline,
  destinationCardTitleTop,
  destinationCardTitleX,
} from "../../lib/destination-card-metrics";
import { resolveFontFamily, type UserFont } from "../../lib/fonts";
import type { LayoutGroup } from "../../lib/layout";
import type { PreparedCardRow } from "../../lib/prepared-card-content";
import type { CardFontField, ProvinceAppearance, TextStyleOverride } from "../../lib/scene-document";
import type { CardPreset } from "../../lib/template-document";

// The row shapes live in `lib/prepared-card-content` (the module that builds them) so the
// solver side never has to import from a component; re-exported here for existing callers.
export type { CardDisplayRow, PreparedCardRow } from "../../lib/prepared-card-content";

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
  /** Kept for the canvas contract; body rows resolve their size through `fieldTypography`. */
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

/**
 * Paint the card itself supplies for one field. The frame wins wherever it defines a token,
 * so `fieldTypography`/`fieldFonts` reach the renderer through the shared resolver cascade
 * instead of a private fallback chain.
 */
function cardFieldFallback(style: DestinationCardStyle, field: DisplayFrameField, bold: boolean): DisplayFrameItemStyle {
  const typography = style.fieldTypography?.[field];
  const fontId = style.fieldFonts?.[field];
  return {
    color: typography?.color ?? style.textColor,
    fontSize: typography?.fontSize ?? resolveDisplayFrameFieldFontSize(field, style.fontSize),
    fontWeight: bold ? "bold" : "normal",
    ...(fontId ? { fontId } : {}),
  };
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
    flowContentStart,
    horizontalPadding,
    lineHeightMultiplier,
    rowHeight,
    userFonts,
  } = style;
  const headerOffset = destinationCardHeaderOffset(preset);
  // The card falls back to its own paint when the frame leaves a slot empty, then the shared
  // resolver fills in every remaining optional token exactly like the display-frame renderer.
  const surface = resolveDisplayFrameSurface({
    ...frameStyle,
    background: frameStyle.background || style.background,
    opacity: frameStyle.opacity ?? style.opacity,
    borderColor: frameStyle.borderColor ?? style.edgeColor,
  });
  const chrome = destinationCardSurfaceChrome(preset, surface);
  const dividerY = destinationCardDividerY(headerExtra);
  const ticketOrnaments = preset === "ticket" ? destinationCardTicketOrnaments(width, height) : null;
  const avatar = preset === "photo" ? destinationCardAvatar(horizontalPadding) : null;

  // Fixed items own their box, so alignment anchors inside it; flow blocks have no box and
  // anchor inside the card's padding box instead.
  const flowAnchorX = (anchor: DisplayFrameTextAnchor): number => {
    if (anchor === "middle") return width / 2;
    if (anchor === "end") return width - horizontalPadding;
    return horizontalPadding;
  };
  const anchorXFor = (item: DisplayFrameFixedItem | undefined, paint: ResolvedDisplayFramePaint): number =>
    (frameMode === "fixed" && item ? displayFrameTextX(item, paint) : flowAnchorX(paint.textAnchor));

  // Titles are bold by default, but an explicit weight — including "normal" — always wins.
  const titleFallback = cardFieldFallback(style, "title", true);
  const titlePaint = frameMode === "fixed" && frameTitleItem
    ? resolveDisplayFrameItemPaint(frameTitleItem, surface, titleFallback)
    : resolveDisplayFrameFieldPaint({ field: "title", style: flowTitleBlock?.style, fallback: titleFallback }, surface);
  const titleX = destinationCardTitleX({
    anchorX: anchorXFor(frameTitleItem, titlePaint),
    headerOffset,
    hasTexture: provinceTexture !== null,
  });
  // Fixed rows share the body item's box but not its typography: the city heading keeps its own
  // colour and size, so only alignment and opacity of that item join the cascade.
  const fixedRowStyle: DisplayFrameItemStyle | undefined = frameMode === "fixed" && frameBodyItem?.style
    ? {
      ...(frameBodyItem.style.align ? { align: frameBodyItem.style.align } : {}),
      ...(frameBodyItem.style.opacity !== undefined ? { opacity: frameBodyItem.style.opacity } : {}),
    }
    : undefined;

  const titleTop = destinationCardTitleTop({
    mode: frameMode,
    ...(frameTitleItem ? { fixedItemY: frameTitleItem.y } : {}),
    ...(flowTitleBlock ? { flowSpacing: flowTitleBlock.spacing } : {}),
  });
  const bodyTop = destinationCardBodyTop({
    mode: frameMode,
    ...(frameBodyItem ? { fixedItemY: frameBodyItem.y } : {}),
    flowContentStart,
    flowTitleFontSize,
  });

  let lineIndex = 0;
  const bodyLines = rows.flatMap((row) => row.lines.map((line, index) => {
    const rowField: DisplayFrameField = row.cityHeading ? "city" : "name";
    const block = frameMode === "flow" ? (rowField === "city" ? style.flowCityBlock : style.flowNameBlock) : undefined;
    const fallback = cardFieldFallback(style, rowField, Boolean(row.cityHeading));
    const paint = block
      ? resolveDisplayFrameBlockPaint(block, surface, fallback)
      : resolveDisplayFrameFieldPaint({ field: rowField, style: fixedRowStyle, fallback }, surface);
    const rowLineHeight = destinationCardBodyRowHeight({
      mode: frameMode,
      solvedRowHeight: rowHeight,
      fontSize: paint.fontSize,
      ...(block?.lineHeight !== undefined ? { lineHeight: block.lineHeight } : {}),
    });
    const y = destinationCardBodyBaseline({ top: bodyTop, headerExtra, lineIndex, rowHeight: rowLineHeight });
    lineIndex += 1;
    return (
      <text
        key={`${row.key}-${index}`}
        data-city-section={index === 0 ? row.cityHeading : undefined}
        data-card-row-line={row.key}
        // No preset header offset here: it only clears the header band, and the body wrap
        // width knows nothing about it (see `destinationCardHeaderOffset`).
        x={anchorXFor(frameBodyItem, paint)}
        y={y}
        textAnchor={paint.textAnchor}
        fill={paint.fill}
        fontSize={paint.fontSize}
        fontWeight={paint.fontWeight}
        opacity={paint.opacity}
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
        rx={chrome.borderRadius}
        fill={surface.background}
        fillOpacity={surface.opacity}
        stroke={chrome.stroke}
        strokeWidth={chrome.strokeWidth}
        data-display-frame-mode={frameMode}
      />
      {provinceTexture && (
        <image
          data-card-province-texture={province}
          href={provinceTexture.src}
          {...destinationCardTextureBox(horizontalPadding, headerOffset)}
          opacity={provinceTexture.opacity ?? 1}
          preserveAspectRatio="xMidYMid meet"
          pointerEvents="none"
        />
      )}
      {ticketOrnaments && <><rect data-card-accent {...ticketOrnaments.accent} fill={style.activeColor} /><circle {...ticketOrnaments.punch} fill={style.activeColor} /></>}
      {avatar && <><circle data-card-avatar cx={avatar.cx} cy={avatar.cy} r={avatar.r} fill={style.activeColor} opacity={avatar.opacity} /><text x={avatar.cx} y={avatar.initialBaseline} textAnchor="middle" fill={style.activeColor} fontWeight={DESTINATION_CARD_PHOTO_INITIAL_FONT_WEIGHT} fontSize={avatar.fontSize}>{group.title.slice(0, 1)}</text></>}
      {customFrameItems.map((item) => renderDisplayFrameItem(item, surface, userFonts))}
      {titleLines.map((line, index) => (
        <text
          key={`title-${index}`}
          data-card-title-line
          x={titleX}
          y={destinationCardTitleBaseline({
            top: titleTop,
            index,
            fontSize: flowTitleFontSize,
            // The document line height, not the flow block's own: the solver charged the
            // wrapped title lines to `headerExtra` at this multiplier, and a second line
            // stepping any further would drop out of the header band it reserved.
            lineHeight: lineHeightMultiplier,
          })}
          textAnchor={titlePaint.textAnchor}
          fontWeight={titlePaint.fontWeight}
          // The solved card height counts title lines at this size, so the layout size wins
          // over a frame item that disagrees with it.
          fontSize={flowTitleFontSize}
          fill={titlePaint.fill}
          fontFamily={resolveFontFamily(titlePaint.fontId, userFonts)}
          opacity={titlePaint.opacity}
        >{line.map((fragment) => fragment.text).join("")}</text>
      ))}
      {style.showCount && <text x={width - horizontalPadding} y={DESTINATION_CARD_COUNT_BASELINE} fill={style.activeColor} textAnchor="end" fontWeight={700} fontSize={style.fontSize} fontFamily={resolveFontFamily(style.fieldFonts?.title, userFonts)}>{group.count} 人</text>}
      {chrome.showDivider && <line x1={horizontalPadding} x2={width - horizontalPadding} y1={dividerY} y2={dividerY} stroke={style.edgeColor} />}
      {bodyLines}
    </>
  );
});
