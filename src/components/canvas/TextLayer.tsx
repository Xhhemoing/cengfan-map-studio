import { useRef, type PointerEvent } from "react";
import { resolveFontFamily, type UserFont } from "../../lib/fonts";
import type { CanvasText } from "../../lib/scene-document";

export interface TextLayerProps {
  textElements: CanvasText[];
  selectedTextId?: string | null;
  exportMode?: boolean;
  userFonts?: UserFont[];
  onSelectText?: (id: string) => void;
  onMoveText?: (id: string, x: number, y: number) => void;
}

function anchorFor(align: CanvasText["textAlign"]): "start" | "middle" | "end" {
  if (align === "center") return "middle";
  if (align === "right") return "end";
  return "start";
}

export function TextLayer({
  textElements,
  selectedTextId = null,
  exportMode = false,
  userFonts = [],
  onSelectText,
  onMoveText,
}: TextLayerProps) {
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
  } | null>(null);

  const pointFromPointer = (event: PointerEvent<SVGGElement>) => {
    const svg = event.currentTarget.ownerSVGElement;
    const matrix = svg?.getScreenCTM()?.inverse();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(matrix);
  };

  return (
    <g data-layer="text">
      {textElements.filter((element) => element.visibility).map((element) => {
        const selected = !exportMode && selectedTextId === element.id;
        const interactive = !exportMode && Boolean(onSelectText || onMoveText);
        return (
          <g
            key={element.id}
            data-text-id={element.id}
            data-max-width={element.maxWidth}
            className={exportMode ? undefined : selected ? "editable-text is-selected" : "editable-text"}
            transform={`translate(${element.x} ${element.y})`}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={interactive ? `选择文本 ${element.content || element.role}` : undefined}
            onDoubleClick={interactive ? () => onSelectText?.(element.id) : undefined}
            onKeyDown={interactive ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectText?.(element.id);
              }
            } : undefined}
            onPointerDown={(event) => {
              if (!interactive || event.detail > 1) return;
              const point = pointFromPointer(event);
              if (!point) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              onSelectText?.(element.id);
              dragRef.current = {
                id: element.id,
                pointerId: event.pointerId,
                offsetX: point.x - element.x,
                offsetY: point.y - element.y,
                moved: false,
              };
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag || drag.id !== element.id || drag.pointerId !== event.pointerId || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
              const point = pointFromPointer(event);
              if (!point) return;
              if (Math.hypot(point.x - element.x - drag.offsetX, point.y - element.y - drag.offsetY) >= 3) {
                drag.moved = true;
              }
            }}
            onPointerUp={(event) => {
              const drag = dragRef.current;
              if (interactive && drag?.id === element.id && drag.pointerId === event.pointerId && event.currentTarget.hasPointerCapture(event.pointerId)) {
                const point = pointFromPointer(event);
                if (drag.moved && point && onMoveText) {
                  onMoveText(element.id, Math.round(point.x - drag.offsetX), Math.round(point.y - drag.offsetY));
                }
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              dragRef.current = null;
            }}
            onPointerCancel={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              dragRef.current = null;
            }}
          >
            {!exportMode && selected && (
              <rect
                data-selection-overlay="text"
                x={element.textAlign === "right" ? -element.maxWidth - 12 : -12}
                y={-element.fontSize - 10}
                width={element.maxWidth + 24}
                height={element.fontSize + 24}
                fill="transparent"
                stroke="#d05a45"
                strokeDasharray="5 4"
                strokeWidth="2"
              />
            )}
            <text
              x={0}
              y={0}
              fill={element.color}
              fontSize={element.fontSize}
              fontWeight={element.fontWeight}
              fontFamily={resolveFontFamily(element.fontId, userFonts)}
              textAnchor={anchorFor(element.textAlign)}
              style={{ maxWidth: element.maxWidth, inlineSize: element.maxWidth }}
            >
              {element.content}
            </text>
          </g>
        );
      })}
    </g>
  );
}
