import type { ReactNode } from "react";
import { universityEmblems } from "../../data/university-emblems";
import type { DisplayFrameDefinition, DisplayFrameFixedItem } from "../../lib/display-frame";
import { resolveFontFamily, type UserFont } from "../../lib/fonts";
import type { LayoutGroup } from "../../lib/layout";
import { readableTextColor, type PreparedCardRow } from "../../lib/poster-card-rows";
import type { CardFrameLayout } from "../../lib/poster-display-frame";
import type { CardFontField, CardPresentation, CardSettings, MapSettings } from "../../lib/scene-document";

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

export function renderReferenceCardVisual({
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
}: {
  presentation: Exclude<CardPresentation, "standard">;
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
}): ReactNode {
  const bodyRows = rows.filter((row) => !row.cityHeading || presentation === "glass-stat");
  const textFor = (row: PreparedCardRow) => row.lines.map((line) => line.map((part) => part.text).join("")).join(" ");
  const lineHeight = Math.max(17, fontSize + 5);

  if (presentation === "color-pill") {
    const foreground = readableTextColor(accent);
    const bodyStart = 32;
    return (
      <g data-card-visual="color-pill">
        <rect x={0} y={12} width={width} height={Math.max(36, height - 12)} rx={Math.min(28, Math.max(18, height / 3))} fill={accent} fillOpacity={opacity} />
        <text x={width / 2} y={19} textAnchor="middle" fill="#1c3154" fontSize={fontSize + 5} fontWeight={800} fontFamily={titleFont}>{group.title}</text>
        {bodyRows.map((row, index) => <text key={row.key} x={width / 2} y={bodyStart + index * lineHeight} textAnchor="middle" fill={foreground} fontSize={fontSize} fontWeight={600}>{textFor(row)}</text>)}
      </g>
    );
  }

  if (presentation === "emblem-list") {
    return (
      <g data-card-visual="emblem-list">
        <path d={`M20 19 Q${Math.round(width * 0.35)} 10 ${Math.round(width * 0.68)} 18`} fill="none" stroke="#f1c84b" strokeWidth={13} strokeLinecap="round" opacity={0.85} />
        <circle cx={11} cy={14} r={5} fill="#e24d42" /><path d="M8 18 L11 25 L14 18" fill="#e24d42" />
        <text x={24} y={20} fill="#263b78" fontSize={fontSize + 5} fontWeight={800} fontFamily={titleFont}>{group.title}</text>
        {bodyRows.map((row, index) => {
          const y = 40 + index * Math.max(22, lineHeight + 3);
          const emblem = row.university ? universityEmblems[row.university] : undefined;
          return <g key={row.key}>{emblem && <image href={emblem} x={7} y={y - 14} width={18} height={18} preserveAspectRatio="xMidYMid meet" />}<text x={emblem ? 31 : 9} y={y} fill={textColor} fontSize={fontSize} fontWeight={500}>{textFor(row)}</text></g>;
        })}
      </g>
    );
  }

  if (presentation === "city-label") {
    return (
      <g data-card-visual="city-label">
        <text x={6} y={fontSize + 8} fill={accent} stroke="#ffffff" strokeWidth={2.5} paintOrder="stroke" fontSize={fontSize + 8} fontWeight={900} fontFamily={titleFont}>{group.title}</text>
        {bodyRows.map((row, index) => {
          const y = 39 + index * lineHeight;
          const emblem = row.university ? universityEmblems[row.university] : undefined;
          return <g key={row.key}>{emblem && <image href={emblem} x={7} y={y - 13} width={16} height={16} preserveAspectRatio="xMidYMid meet" />}<text x={emblem ? 29 : 8} y={y} fill={textColor} fontSize={fontSize} fontWeight={600}>{textFor(row)}</text></g>;
        })}
      </g>
    );
  }

  let bodyIndex = 0;
  return (
    <g data-card-visual="glass-stat">
      <rect width={width} height={height} rx={4} fill={background} fillOpacity={Math.min(0.9, Math.max(0.55, opacity))} stroke={edgeColor} strokeOpacity={0.7} />
      <rect x={8} y={8} width={15} height={15} rx={3} fill={accent} />
      <text x={29} y={20} fill={textColor} fontSize={fontSize + 2} fontWeight={800} fontFamily={titleFont}>{group.title}</text>
      <text x={width - 9} y={20} textAnchor="end" fill={accent} fontSize={fontSize} fontWeight={800}>{group.count} 人</text>
      <line x1={8} x2={width - 8} y1={28} y2={28} stroke={edgeColor} strokeOpacity={0.55} />
      {rows.map((row) => {
        const isHeading = Boolean(row.cityHeading);
        const y = 46 + bodyIndex * lineHeight;
        bodyIndex += 1;
        return <text key={row.key} x={isHeading ? 9 : 15} y={y} fill={isHeading ? accent : textColor} fontSize={isHeading ? Math.max(9, fontSize - 1) : fontSize} fontWeight={isHeading ? 800 : 500}>{textFor(row)}</text>;
      })}
    </g>
  );
}

/** Inner content of a standard-presentation destination card: surface, optional
 *  province texture, preset accents, custom frame items, title, count and rows. */
export function renderStandardCardContent({
  cards,
  map,
  displayFrame,
  frame,
  group,
  province,
  provinceTexture,
  placement,
  titleLines,
  headerExtra,
  rows,
  lineHeightMultiplier,
  userFonts,
}: {
  cards: CardSettings;
  map: Pick<MapSettings, "activeColor" | "edgeColor">;
  displayFrame: DisplayFrameDefinition;
  frame: CardFrameLayout;
  group: LayoutGroup;
  province: string;
  provinceTexture: { src: string; opacity?: number } | null;
  placement: { width: number; height: number };
  titleLines: PreparedCardRow["lines"];
  headerExtra: number;
  rows: PreparedCardRow[];
  lineHeightMultiplier: number;
  userFonts: UserFont[];
}): ReactNode {
  const {
    frameTitleItem,
    frameBodyItem,
    flowBlockFor,
    flowTitleBlock,
    flowTitleFontSize,
    flowNameFontSize,
    flowContentStart,
    customFrameItems,
    horizontalPadding,
  } = frame;
  return <>
    <rect
      data-display-frame-surface
      width={placement.width}
      height={placement.height}
      rx={cards.preset === "ticket" ? 12 : cards.preset === "borderless" ? 0 : displayFrame.style.borderRadius ?? 6}
      fill={displayFrame.style.background || cards.background}
      fillOpacity={displayFrame.style.opacity ?? cards.opacity}
      stroke={cards.preset === "borderless" ? "none" : displayFrame.style.borderColor ?? map.edgeColor}
      strokeWidth={cards.preset === "borderless" ? undefined : displayFrame.style.borderWidth ?? 1}
      data-display-frame-mode={displayFrame.mode}
    />
    {provinceTexture && (
      <image
        data-card-province-texture={province}
        href={provinceTexture.src}
        x={horizontalPadding + (cards.preset === "photo" ? 32 : 0)}
        y={3}
        width={30}
        height={30}
        opacity={provinceTexture.opacity ?? 1}
        preserveAspectRatio="xMidYMid meet"
        pointerEvents="none"
      />
    )}
    {cards.preset === "ticket" && <><rect data-card-accent width={8} height={placement.height} rx={4} fill={map.activeColor} /><circle cx={placement.width - 18} cy={18} r={7} fill={map.activeColor} opacity={0.2} /></>}
    {cards.preset === "photo" && <><circle data-card-avatar cx={horizontalPadding + 13} cy={21} r={13} fill={map.activeColor} opacity={0.2} /><text x={horizontalPadding + 13} y={25} textAnchor="middle" fill={map.activeColor} fontWeight={700} fontSize={11}>{group.title.slice(0, 1)}</text></>}
    {customFrameItems.map((item) => renderDisplayFrameItem(item, displayFrame.style, userFonts))}
    {titleLines.map((line, index) => (
      <text
        key={`title-${index}`}
        data-card-title-line
        x={(displayFrame.mode === "fixed" ? frameTitleItem?.x ?? horizontalPadding : horizontalPadding) + (cards.preset === "photo" ? 32 : 0) + (provinceTexture ? 36 : 0)}
        y={(displayFrame.mode === "fixed" ? frameTitleItem?.y ?? 12 : 12 + (flowTitleBlock?.spacing ?? 0)) + (index + 1) * Math.max(16, flowTitleFontSize + 4) * (flowTitleBlock?.lineHeight ?? lineHeightMultiplier)}
        fontWeight={flowTitleBlock?.style?.fontWeight === "medium" ? 500 : 700}
        fontSize={flowTitleFontSize}
        fill={flowTitleBlock?.style?.color ?? cards.fieldTypography?.title?.color ?? cards.textColor}
        fontFamily={resolveFontFamily(flowTitleBlock?.style?.fontId ?? cards.fieldFonts?.title, userFonts)}
      >{line.map((fragment) => fragment.text).join("")}</text>
    ))}
    {cards.showCount !== false && <text x={placement.width - horizontalPadding} y={22} fill={map.activeColor} textAnchor="end" fontWeight={700} fontSize={cards.fontSize} fontFamily={resolveFontFamily(cards.fieldFonts?.title, userFonts)}>{group.count} 人</text>}
    {cards.preset !== "borderless" && <line x1={horizontalPadding} x2={placement.width - horizontalPadding} y1={30 + headerExtra} y2={30 + headerExtra} stroke={map.edgeColor} />}
    {(() => {
      const rowHeight = Math.max(
        cards.compactLayout === true || cards.preset === "compact" ? 18 : 20,
        Math.max(...cards.visibleFields.map((field) => cards.fieldTypography?.[field]?.fontSize ?? cards.fontSize), cards.fieldTypography?.city?.fontSize ?? Math.max(9, cards.fontSize - 1)) + 6,
      ) * lineHeightMultiplier;
      let lineIndex = 0;
      return rows.flatMap((row) => row.lines.map((line, index) => {
        const rowField: CardFontField = row.cityHeading ? "city" : "name";
        const block = displayFrame.mode === "flow" ? flowBlockFor(rowField) : undefined;
        const rowFontSize = block?.style?.fontSize ?? cards.fieldTypography?.[rowField]?.fontSize ?? (row.cityHeading ? Math.max(9, cards.fontSize - 1) : flowNameFontSize);
        const rowLineHeight = displayFrame.mode === "flow"
          ? Math.max(16, rowFontSize + 6) * (block?.lineHeight ?? 1.2)
          : rowHeight;
        const y = (displayFrame.mode === "fixed" ? frameBodyItem?.y ?? 42 : flowContentStart + flowTitleFontSize + 8) + headerExtra + lineIndex * rowLineHeight;
        lineIndex += 1;
        return (
          <text
            key={`${row.key}-${index}`}
            data-city-section={index === 0 ? row.cityHeading : undefined}
            data-card-row-line={row.key}
            x={displayFrame.mode === "fixed" ? frameBodyItem?.x ?? horizontalPadding : horizontalPadding}
            y={y}
            fill={block?.style?.color ?? cards.fieldTypography?.[rowField]?.color ?? cards.textColor}
            fontSize={rowFontSize}
            fontWeight={row.cityHeading ? 700 : block?.style?.fontWeight === "bold" ? 700 : block?.style?.fontWeight === "medium" ? 500 : undefined}
          >
            {line.map((fragment, fragmentIndex) => (
              <tspan
                key={fragmentIndex}
                fontFamily={resolveFontFamily(fragment.field ? cards.fieldFonts?.[fragment.field] : undefined, userFonts)}
                fontSize={fragment.field ? cards.fieldTypography?.[fragment.field]?.fontSize : undefined}
                fill={fragment.field ? cards.fieldTypography?.[fragment.field]?.color : undefined}
              >{fragment.text}</tspan>
            ))}
          </text>
        );
      }));
    })()}
  </>;
}
