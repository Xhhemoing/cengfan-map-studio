import { useEffect, useRef } from "react";
import { resolveFontFamily, type UserFont } from "../../lib/fonts";
import { truncateGuestText, type GuestPanelMetrics } from "../../lib/poster-guest-layout";
import type { GuestPanelSettings, SceneSelection } from "../../lib/scene-document";
import { clearCanvasPreview, createCanvasPreviewScheduler, scheduleCanvasPreview } from "./CanvasDragPreview";
import { canvasPointFromEvent } from "./poster-canvas-pointer";

export interface GuestPanelProps {
  guests: GuestPanelSettings;
  metrics: GuestPanelMetrics;
  /** Stroke color shared with the map theme (panel border, divider, avatar ring). */
  edgeColor: string;
  canvasWidth: number;
  canvasHeight: number;
  userFonts: UserFont[];
  exportMode: boolean;
  /** Minimum interval between local drag-preview paints. Final positions always commit immediately. */
  renderIntervalMs: number;
  onSelect?: (selection: SceneSelection) => void;
  onMoveGuests?: (x: number, y: number) => void;
}

/** 特邀嘉宾面板：标题 + 自定义文字 + 列表/卡片两种人员展示，可整体拖拽。 */
export function GuestPanel({
  guests,
  metrics,
  edgeColor,
  canvasWidth,
  canvasHeight,
  userFonts,
  exportMode,
  renderIntervalMs,
  onSelect,
  onMoveGuests,
}: GuestPanelProps) {
  const guestDrag = useRef<{
    offsetX: number;
    offsetY: number;
    x: number;
    y: number;
    originalX: number;
    originalY: number;
    element: SVGGElement;
  } | null>(null);
  const guestPreviewScheduler = useRef(createCanvasPreviewScheduler<{ x: number; y: number }>());

  const updateGuestPreview = (next: { x: number; y: number }) => {
    const drag = guestDrag.current;
    if (!drag) return;
    drag.element.setAttribute("transform", `translate(${next.x} ${next.y})`);
  };

  const scheduleGuestPreview = (next: { x: number; y: number }) => {
    scheduleCanvasPreview(guestPreviewScheduler.current, next, renderIntervalMs, updateGuestPreview);
  };

  const clearGuestPreview = () => clearCanvasPreview(guestPreviewScheduler.current);

  useEffect(() => () => {
    clearGuestPreview();
  }, []);

  const {
    visibleGuests,
    titleTypography: guestTitleTypography,
    peopleTypography: guestPeopleTypography,
    titleFontSize: guestTitleFontSize,
    peopleFontSize: guestPeopleFontSize,
    noteFontSize: guestNoteFontSize,
    displayMode: guestsDisplayMode,
    listAvatarSize: guestListAvatarSize,
    listUsesAvatar: guestListUsesAvatar,
    listAvatarGap: guestListAvatarGap,
    rowHeight: guestRowHeight,
    cardGap: guestCardGap,
    cardColumns: guestCardColumns,
    cardWidth: guestCardWidth,
    cardAvatarSize: guestCardAvatarSize,
    cardTitleLine: guestCardTitleLine,
    cardSubLine: guestCardSubLine,
    cardHasTitle: guestCardHasTitle,
    cardHeight: guestCardHeight,
    customText: guestCustomText,
    customLines: guestCustomLines,
    customLineHeight: guestCustomLineHeight,
    customTopGap: guestCustomTopGap,
    customHeight: guestCustomHeight,
    panelHeight: guestHeight,
  } = metrics;
  const guestX = guests.x;
  const guestY = guests.y;

  if (guests.visibility === false) return null;

  return (
    <g
      data-guests-layer
      transform={`translate(${guestX} ${guestY})`}
      onClick={!exportMode ? (event) => { event.stopPropagation(); onSelect?.({ type: "guests" }); } : undefined}
      role={!exportMode && onSelect ? "button" : undefined}
      tabIndex={!exportMode && onSelect ? 0 : undefined}
      aria-label="特邀嘉宾"
      onKeyDown={!exportMode && onSelect ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          onSelect({ type: "guests" });
        }
      } : undefined}
      onPointerDown={!exportMode && onMoveGuests ? (event) => {
        const point = canvasPointFromEvent(event, canvasWidth, canvasHeight);
        if (!point) return;
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        guestDrag.current = {
          offsetX: point.x - guestX,
          offsetY: point.y - guestY,
          x: guestX,
          y: guestY,
          originalX: guestX,
          originalY: guestY,
          element: event.currentTarget,
        };
      } : undefined}
      onPointerMove={!exportMode && onMoveGuests ? (event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId) || !guestDrag.current) return;
        const point = canvasPointFromEvent(event, canvasWidth, canvasHeight);
        if (!point) return;
        const nextX = Math.round(Math.min(canvasWidth - guests.width, Math.max(0, point.x - guestDrag.current.offsetX)));
        const nextY = Math.round(Math.min(canvasHeight - guestHeight, Math.max(0, point.y - guestDrag.current.offsetY)));
        guestDrag.current.x = nextX;
        guestDrag.current.y = nextY;
        scheduleGuestPreview({ x: nextX, y: nextY });
      } : undefined}
      onPointerUp={!exportMode && onMoveGuests ? (event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        const drag = guestDrag.current;
        if (drag) onMoveGuests(drag.x, drag.y);
        guestDrag.current = null;
        clearGuestPreview();
      } : undefined}
      onPointerCancel={!exportMode && onMoveGuests ? () => {
        const drag = guestDrag.current;
        if (drag) drag.element.setAttribute("transform", `translate(${drag.originalX} ${drag.originalY})`);
        guestDrag.current = null;
        clearGuestPreview();
      } : undefined}
    >
      <rect
        width={guests.width}
        height={guestHeight}
        rx={10}
        fill={guests.background}
        fillOpacity={guests.opacity}
        stroke={edgeColor}
      />
      <text data-guest-title x={guests.padding} y={guests.padding + guestTitleFontSize} fill={guestTitleTypography.color ?? guests.textColor} fontSize={guestTitleFontSize} fontWeight={700} fontFamily={resolveFontFamily(guests.titleFontId, userFonts)}>
        {guests.title}
      </text>
      <line
        x1={guests.padding}
        x2={guests.width - guests.padding}
        y1={guests.padding + guestTitleFontSize + 8}
        y2={guests.padding + guestTitleFontSize + 8}
        stroke={edgeColor}
      />
      {guestCustomLines.map((line, index) => (
        <text
          key={`guest-custom-${index}`}
          data-guest-custom-text
          x={guests.padding + guestListAvatarGap}
          y={guests.padding + guestTitleFontSize + 8 + guestCustomTopGap + index * guestCustomLineHeight}
          fill={guestPeopleTypography.color ?? guests.textColor}
          fontSize={guestPeopleFontSize}
          fontFamily={resolveFontFamily(guests.peopleFontId, userFonts)}
        >
          {line || " "}
        </text>
      ))}
      {visibleGuests.length === 0 && !guestCustomText ? (
        <text x={guests.padding} y={guests.padding + 36 + guests.fontSize} fill={guests.textColor} fontSize={guests.fontSize} opacity={0.65}>
          在右侧添加老师 / 嘉宾
        </text>
      ) : guestsDisplayMode === "cards" ? visibleGuests.map((person, index) => {
        const col = index % guestCardColumns;
        const row = Math.floor(index / guestCardColumns);
        const cardX = guests.padding + col * (guestCardWidth + guestCardGap);
        const cardY = guests.padding + 30 + guestTitleFontSize + guestCustomHeight + row * (guestCardHeight + guestCardGap);
        const avatarCenterX = guestCardWidth / 2;
        const avatarCenterY = 6 + guestCardAvatarSize / 2;
        const nameBaseline = 6 + guestCardAvatarSize + 6 + guestCardTitleLine;
        const nameMaxChars = Math.max(4, Math.floor((guestCardWidth - 8) / guestPeopleFontSize));
        const subMaxChars = Math.max(4, Math.floor((guestCardWidth - 8) / guestNoteFontSize));
        const noteBaseline = nameBaseline + (guestCardHasTitle ? guestCardSubLine : 0) + guestCardSubLine;
        return (
          <g key={person.id} data-guest-card={person.id} transform={`translate(${cardX} ${cardY})`}>
            <rect
              width={guestCardWidth}
              height={guestCardHeight}
              rx={8}
              fill={guestPeopleTypography.color ?? guests.textColor}
              fillOpacity={0.07}
              stroke={edgeColor}
              strokeOpacity={0.4}
              strokeWidth={1}
            />
            <g data-guest-avatar={person.id}>
              <clipPath id={`guest-avatar-clip-${person.id}`}>
                <circle cx={avatarCenterX} cy={avatarCenterY} r={guestCardAvatarSize / 2} />
              </clipPath>
              <circle
                cx={avatarCenterX}
                cy={avatarCenterY}
                r={guestCardAvatarSize / 2}
                fill={guestPeopleTypography.color ?? guests.textColor}
                fillOpacity={0.14}
                stroke={guestPeopleTypography.color ?? guests.textColor}
                strokeOpacity={0.4}
                strokeWidth={1}
              />
              {person.avatarSrc ? (
                <image
                  href={person.avatarSrc}
                  x={avatarCenterX - guestCardAvatarSize / 2}
                  y={avatarCenterY - guestCardAvatarSize / 2}
                  width={guestCardAvatarSize}
                  height={guestCardAvatarSize}
                  clipPath={`url(#guest-avatar-clip-${person.id})`}
                  preserveAspectRatio="xMidYMid slice"
                />
              ) : (
                <text
                  data-guest-avatar-initial={person.id}
                  x={avatarCenterX}
                  y={avatarCenterY + Math.max(6, guestCardAvatarSize * 0.3)}
                  textAnchor="middle"
                  fill={guestPeopleTypography.color ?? guests.textColor}
                  fontSize={Math.max(14, guestCardAvatarSize * 0.38)}
                  fontWeight={600}
                >
                  {person.name.slice(0, 1)}
                </text>
              )}
            </g>
            <text
              data-guest-person={person.id}
              x={avatarCenterX}
              y={nameBaseline}
              textAnchor="middle"
              fill={guestPeopleTypography.color ?? guests.textColor}
              fontSize={guestPeopleFontSize}
              fontWeight={600}
              fontFamily={resolveFontFamily(person.fontId ?? guests.peopleFontId, userFonts)}
            >
              {truncateGuestText(person.name, nameMaxChars)}
            </text>
            {person.title && (
              <text
                x={avatarCenterX}
                y={nameBaseline + guestCardSubLine}
                textAnchor="middle"
                fill={guestPeopleTypography.color ?? guests.textColor}
                fillOpacity={0.66}
                fontSize={guestNoteFontSize}
                fontFamily={resolveFontFamily(person.fontId ?? guests.peopleFontId, userFonts)}
              >
                {truncateGuestText(person.title, subMaxChars)}
              </text>
            )}
            {person.note && (
              <text
                data-guest-note={person.id}
                x={avatarCenterX}
                y={noteBaseline}
                textAnchor="middle"
                fill={guestPeopleTypography.color ?? guests.textColor}
                fillOpacity={0.72}
                fontSize={guestNoteFontSize}
                fontFamily={resolveFontFamily(person.fontId ?? guests.peopleFontId, userFonts)}
              >
                {truncateGuestText(person.note, subMaxChars)}
              </text>
            )}
          </g>
        );
      }) : visibleGuests.map((person, index) => {
        const nameBaseline = guests.padding + 30 + guestTitleFontSize + guestCustomHeight + index * guestRowHeight;
        const avatarCenterY = nameBaseline - guestPeopleFontSize * 0.35;
        const avatarR = guestListAvatarSize / 2;
        const textX = guests.padding + guestListAvatarGap;
        const noteMaxChars = Math.max(8, Math.floor((guests.width - guests.padding * 2 - guestListAvatarGap) / guestNoteFontSize));
        return (
          <g key={person.id} data-guest-row={person.id}>
            {guestListUsesAvatar && (
              <g data-guest-avatar={person.id}>
                {person.avatarSrc ? (
                  <>
                    <clipPath id={`guest-avatar-clip-${person.id}`}>
                      <circle cx={guests.padding + avatarR} cy={avatarCenterY} r={avatarR} />
                    </clipPath>
                    <circle cx={guests.padding + avatarR} cy={avatarCenterY} r={avatarR} fill={guests.background} stroke={edgeColor} strokeWidth={1} />
                    <image
                      href={person.avatarSrc}
                      x={guests.padding}
                      y={avatarCenterY - avatarR}
                      width={guestListAvatarSize}
                      height={guestListAvatarSize}
                      clipPath={`url(#guest-avatar-clip-${person.id})`}
                      preserveAspectRatio="xMidYMid slice"
                    />
                  </>
                ) : (
                  <circle
                    cx={guests.padding + avatarR}
                    cy={avatarCenterY}
                    r={avatarR}
                    fill={guestPeopleTypography.color ?? guests.textColor}
                    fillOpacity={0.12}
                    stroke={guestPeopleTypography.color ?? guests.textColor}
                    strokeOpacity={0.35}
                    strokeWidth={1}
                  >
                    <title>{person.name}</title>
                  </circle>
                )}
              </g>
            )}
            <text
              data-guest-person={person.id}
              x={textX}
              y={nameBaseline}
              fill={guestPeopleTypography.color ?? guests.textColor}
              fontSize={guestPeopleFontSize}
              fontFamily={resolveFontFamily(person.fontId ?? guests.peopleFontId, userFonts)}
            >
              {person.name}{person.title ? ` · ${person.title}` : ""}
            </text>
            {person.note && (
              <text
                data-guest-note={person.id}
                x={textX}
                y={nameBaseline + guestNoteFontSize + 3}
                fill={guestPeopleTypography.color ?? guests.textColor}
                fillOpacity={0.62}
                fontSize={guestNoteFontSize}
                fontFamily={resolveFontFamily(person.fontId ?? guests.peopleFontId, userFonts)}
              >
                {truncateGuestText(person.note, noteMaxChars)}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
