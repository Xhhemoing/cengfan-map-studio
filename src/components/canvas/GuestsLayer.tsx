import { memo, useCallback, useEffect, useRef, type PointerEvent } from "react";
import { resolveFontFamily, type UserFont } from "../../lib/fonts";
import { guestContentTop, truncateGuestText, type GuestPanelLayout } from "../../lib/guest-panel-layout";
import type { GuestPanelSettings } from "../../lib/scene-document";
import { clearCanvasPreview, createCanvasPreviewScheduler, scheduleCanvasPreview } from "./CanvasDragPreview";

export interface GuestsLayerProps {
  guests: GuestPanelSettings;
  layout: GuestPanelLayout;
  /** Panel border / divider color, shared with the map edge color. */
  edgeColor: string;
  userFonts: UserFont[];
  exportMode: boolean;
  canvasWidth: number;
  canvasHeight: number;
  /** Minimum interval between local drag-preview paints. Final positions always commit immediately. */
  renderIntervalMs: number;
  /** Converts a pointer event into canvas user-space coordinates. */
  canvasPoint: (event: PointerEvent<SVGGElement>) => { x: number; y: number } | null;
  onSelectGuests?: () => void;
  onMoveGuests?: (x: number, y: number) => void;
}

function GuestsLayerView({
  guests,
  layout,
  edgeColor,
  userFonts,
  exportMode,
  canvasWidth,
  canvasHeight,
  renderIntervalMs,
  canvasPoint,
  onSelectGuests,
  onMoveGuests,
}: GuestsLayerProps) {
  const drag = useRef<{
    offsetX: number;
    offsetY: number;
    x: number;
    y: number;
    originalX: number;
    originalY: number;
    element: SVGGElement;
  } | null>(null);
  const previewScheduler = useRef(createCanvasPreviewScheduler<{ x: number; y: number }>());

  const updatePreview = useCallback((next: { x: number; y: number }) => {
    const current = drag.current;
    if (!current) return;
    current.element.setAttribute("transform", `translate(${next.x} ${next.y})`);
  }, []);

  const clearPreview = useCallback(() => clearCanvasPreview(previewScheduler.current), []);

  const schedulePreview = useCallback((next: { x: number; y: number }) => {
    scheduleCanvasPreview(previewScheduler.current, next, renderIntervalMs, updatePreview);
  }, [renderIntervalMs, updatePreview]);

  useEffect(() => () => clearPreview(), [clearPreview]);

  const guestX = guests.x;
  const guestY = guests.y;
  const panelHeight = layout.height;
  const {
    visibleGuests,
    titleTypography,
    peopleTypography,
    titleFontSize,
    peopleFontSize,
    noteFontSize,
    displayMode,
    listAvatarSize,
    listUsesAvatar,
    listAvatarGap,
    listRowHeight,
    listNoteMaxChars,
    cardGap,
    cardColumns,
    cardWidth,
    cardHeight,
    cardAvatarSize,
    cardTitleLine,
    cardSubLine,
    cardHasTitle,
    customText,
    customLines,
    customLineHeight,
    customTopGap,
  } = layout;
  const peopleColor = peopleTypography.color ?? guests.textColor;
  const contentTop = guestContentTop(guests, layout);
  const dragEnabled = !exportMode && Boolean(onMoveGuests);

  const handlePointerDown = useCallback((event: PointerEvent<SVGGElement>) => {
    const point = canvasPoint(event);
    if (!point) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      offsetX: point.x - guestX,
      offsetY: point.y - guestY,
      x: guestX,
      y: guestY,
      originalX: guestX,
      originalY: guestY,
      element: event.currentTarget,
    };
  }, [canvasPoint, guestX, guestY]);

  const handlePointerMove = useCallback((event: PointerEvent<SVGGElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || !drag.current) return;
    const point = canvasPoint(event);
    if (!point) return;
    const nextX = Math.round(Math.min(canvasWidth - guests.width, Math.max(0, point.x - drag.current.offsetX)));
    const nextY = Math.round(Math.min(canvasHeight - panelHeight, Math.max(0, point.y - drag.current.offsetY)));
    drag.current.x = nextX;
    drag.current.y = nextY;
    schedulePreview({ x: nextX, y: nextY });
  }, [canvasHeight, canvasPoint, canvasWidth, guests.width, panelHeight, schedulePreview]);

  const handlePointerUp = useCallback((event: PointerEvent<SVGGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const current = drag.current;
    if (current) onMoveGuests?.(current.x, current.y);
    drag.current = null;
    clearPreview();
  }, [clearPreview, onMoveGuests]);

  const handlePointerCancel = useCallback(() => {
    const current = drag.current;
    if (current) current.element.setAttribute("transform", `translate(${current.originalX} ${current.originalY})`);
    drag.current = null;
    clearPreview();
  }, [clearPreview]);

  const handleClick = useCallback((event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    onSelectGuests?.();
  }, [onSelectGuests]);

  const selectable = !exportMode && Boolean(onSelectGuests);

  return (
    <g
      data-guests-layer
      transform={`translate(${guestX} ${guestY})`}
      onClick={!exportMode ? handleClick : undefined}
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : undefined}
      aria-label="特邀嘉宾"
      onPointerDown={dragEnabled ? handlePointerDown : undefined}
      onPointerMove={dragEnabled ? handlePointerMove : undefined}
      onPointerUp={dragEnabled ? handlePointerUp : undefined}
      onPointerCancel={dragEnabled ? handlePointerCancel : undefined}
    >
      <rect
        width={guests.width}
        height={panelHeight}
        rx={10}
        fill={guests.background}
        fillOpacity={guests.opacity}
        stroke={edgeColor}
      />
      <text data-guest-title x={guests.padding} y={guests.padding + titleFontSize} fill={titleTypography.color ?? guests.textColor} fontSize={titleFontSize} fontWeight={700} fontFamily={resolveFontFamily(guests.titleFontId, userFonts)}>
        {guests.title}
      </text>
      <line
        x1={guests.padding}
        x2={guests.width - guests.padding}
        y1={guests.padding + titleFontSize + 8}
        y2={guests.padding + titleFontSize + 8}
        stroke={edgeColor}
      />
      {customLines.map((line, index) => (
        <text
          key={`guest-custom-${index}`}
          data-guest-custom-text
          x={guests.padding + listAvatarGap}
          y={guests.padding + titleFontSize + 8 + customTopGap + index * customLineHeight}
          fill={peopleColor}
          fontSize={peopleFontSize}
          fontFamily={resolveFontFamily(guests.peopleFontId, userFonts)}
        >
          {line || " "}
        </text>
      ))}
      {visibleGuests.length === 0 && !customText ? (
        <text x={guests.padding} y={guests.padding + 36 + guests.fontSize} fill={guests.textColor} fontSize={guests.fontSize} opacity={0.65}>
          在右侧添加老师 / 嘉宾
        </text>
      ) : displayMode === "cards" ? visibleGuests.map((person, index) => {
        const col = index % cardColumns;
        const row = Math.floor(index / cardColumns);
        const cardX = guests.padding + col * (cardWidth + cardGap);
        const cardY = contentTop + row * (cardHeight + cardGap);
        const avatarCenterX = cardWidth / 2;
        const avatarCenterY = 6 + cardAvatarSize / 2;
        const nameBaseline = 6 + cardAvatarSize + 6 + cardTitleLine;
        const nameMaxChars = Math.max(4, Math.floor((cardWidth - 8) / peopleFontSize));
        const subMaxChars = Math.max(4, Math.floor((cardWidth - 8) / noteFontSize));
        const noteBaseline = nameBaseline + (cardHasTitle ? cardSubLine : 0) + cardSubLine;
        return (
          <g key={person.id} data-guest-card={person.id} transform={`translate(${cardX} ${cardY})`}>
            <rect
              width={cardWidth}
              height={cardHeight}
              rx={8}
              fill={peopleColor}
              fillOpacity={0.07}
              stroke={edgeColor}
              strokeOpacity={0.4}
              strokeWidth={1}
            />
            <g data-guest-avatar={person.id}>
              <clipPath id={`guest-avatar-clip-${person.id}`}>
                <circle cx={avatarCenterX} cy={avatarCenterY} r={cardAvatarSize / 2} />
              </clipPath>
              <circle
                cx={avatarCenterX}
                cy={avatarCenterY}
                r={cardAvatarSize / 2}
                fill={peopleColor}
                fillOpacity={0.14}
                stroke={peopleColor}
                strokeOpacity={0.4}
                strokeWidth={1}
              />
              {person.avatarSrc ? (
                <image
                  href={person.avatarSrc}
                  x={avatarCenterX - cardAvatarSize / 2}
                  y={avatarCenterY - cardAvatarSize / 2}
                  width={cardAvatarSize}
                  height={cardAvatarSize}
                  clipPath={`url(#guest-avatar-clip-${person.id})`}
                  preserveAspectRatio="xMidYMid slice"
                />
              ) : (
                <text
                  data-guest-avatar-initial={person.id}
                  x={avatarCenterX}
                  y={avatarCenterY + Math.max(6, cardAvatarSize * 0.3)}
                  textAnchor="middle"
                  fill={peopleColor}
                  fontSize={Math.max(14, cardAvatarSize * 0.38)}
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
              fill={peopleColor}
              fontSize={peopleFontSize}
              fontWeight={600}
              fontFamily={resolveFontFamily(person.fontId ?? guests.peopleFontId, userFonts)}
            >
              {truncateGuestText(person.name, nameMaxChars)}
            </text>
            {person.title && (
              <text
                x={avatarCenterX}
                y={nameBaseline + cardSubLine}
                textAnchor="middle"
                fill={peopleColor}
                fillOpacity={0.66}
                fontSize={noteFontSize}
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
                fill={peopleColor}
                fillOpacity={0.72}
                fontSize={noteFontSize}
                fontFamily={resolveFontFamily(person.fontId ?? guests.peopleFontId, userFonts)}
              >
                {truncateGuestText(person.note, subMaxChars)}
              </text>
            )}
          </g>
        );
      }) : visibleGuests.map((person, index) => {
        const nameBaseline = contentTop + index * listRowHeight;
        const avatarCenterY = nameBaseline - peopleFontSize * 0.35;
        const avatarR = listAvatarSize / 2;
        const textX = guests.padding + listAvatarGap;
        return (
          <g key={person.id} data-guest-row={person.id}>
            {listUsesAvatar && (
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
                      width={listAvatarSize}
                      height={listAvatarSize}
                      clipPath={`url(#guest-avatar-clip-${person.id})`}
                      preserveAspectRatio="xMidYMid slice"
                    />
                  </>
                ) : (
                  <circle
                    cx={guests.padding + avatarR}
                    cy={avatarCenterY}
                    r={avatarR}
                    fill={peopleColor}
                    fillOpacity={0.12}
                    stroke={peopleColor}
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
              fill={peopleColor}
              fontSize={peopleFontSize}
              fontFamily={resolveFontFamily(person.fontId ?? guests.peopleFontId, userFonts)}
            >
              {person.name}{person.title ? ` · ${person.title}` : ""}
            </text>
            {person.note && (
              <text
                data-guest-note={person.id}
                x={textX}
                y={nameBaseline + noteFontSize + 3}
                fill={peopleColor}
                fillOpacity={0.62}
                fontSize={noteFontSize}
                fontFamily={resolveFontFamily(person.fontId ?? guests.peopleFontId, userFonts)}
              >
                {truncateGuestText(person.note, listNoteMaxChars)}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

export const GuestsLayer = memo(GuestsLayerView);
