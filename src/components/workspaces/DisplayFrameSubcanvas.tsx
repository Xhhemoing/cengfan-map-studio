import { useRef, useState, type PointerEvent } from "react";
import type { DisplayFrameDefinition, DisplayFrameFixedItem } from "../../lib/display-frame";
import {
  displayFrameTextBaseline,
  displayFrameTextX,
  resolveDisplayFrameItemPaint,
  resolveDisplayFrameSurface,
} from "../../lib/display-frame-style";
import { resolveFontFamily, type UserFont } from "../../lib/fonts";

const LOCAL_WIDTH = 240;
const LOCAL_HEIGHT = 160;

function itemLabel(item: DisplayFrameFixedItem): string {
  if (item.kind === "field") {
    return ({ title: "标题", name: "姓名", university: "院校", city: "城市" } as const)[item.field ?? "title"];
  }
  if (item.kind === "text") return item.content || "自定义文字";
  return item.decoration === "line" ? "分隔线" : "矩形装饰";
}

function itemPreview(item: DisplayFrameFixedItem): string {
  if (item.kind === "field") {
    return ({ title: "北京市", name: "林舟", university: "北京大学", city: "北京市" } as const)[item.field ?? "title"];
  }
  return item.content || "自定义文字";
}

export function DisplayFrameSubcanvas({
  frame,
  selectedItemId,
  onSelectItem,
  onChangeItem,
  userFonts = [],
}: {
  frame: DisplayFrameDefinition;
  selectedItemId: string | null;
  onSelectItem: (id: string) => void;
  onChangeItem: (id: string, patch: Partial<DisplayFrameFixedItem>) => void;
  userFonts?: UserFont[];
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<{ id: string; mode: "move" | "resize"; startX: number; startY: number; originX: number; originY: number; originWidth: number; originHeight: number } | null>(null);
  // Local preview refs for smooth drag without per-frame React state commits
  const dragPreviewRef = useRef<{ id: string; el: SVGElement | null; raf: number | null; next: { x: number; y: number } | null } | null>(null);
  const sortedItems = frame.fixed.items.slice().sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id));
  const selected = selectedItemId ? frame.fixed.items.find((item) => item.id === selectedItemId) : null;
  const surface = resolveDisplayFrameSurface(frame.style);
  const paddingGuide = Math.min(surface.padding, LOCAL_WIDTH / 2 - 2, LOCAL_HEIGHT / 2 - 2);

  const pointForEvent = (event: PointerEvent<SVGGElement>) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const bounds = svg.getBoundingClientRect();
    const width = bounds.width || LOCAL_WIDTH;
    const height = bounds.height || LOCAL_HEIGHT;
    return {
      x: (event.clientX - bounds.left) * LOCAL_WIDTH / width,
      y: (event.clientY - bounds.top) * LOCAL_HEIGHT / height,
    };
  };

  const beginMove = (item: DisplayFrameFixedItem, event: PointerEvent<SVGGElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointForEvent(event);
    onSelectItem(item.id);
    setDrag({ id: item.id, mode: "move", startX: point.x, startY: point.y, originX: item.x, originY: item.y, originWidth: item.width, originHeight: item.height });
    // Prepare local preview element for smooth drag
    const g = event.currentTarget as unknown as SVGElement;
    dragPreviewRef.current = { id: item.id, el: g, raf: null, next: null };
  };

  const beginResize = (item: DisplayFrameFixedItem, event: PointerEvent<SVGRectElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointForEvent(event as unknown as PointerEvent<SVGGElement>);
    onSelectItem(item.id);
    setDrag({ id: item.id, mode: "resize", startX: point.x, startY: point.y, originX: item.x, originY: item.y, originWidth: item.width, originHeight: item.height });
  };

  const moveItem = (event: PointerEvent<SVGGElement | SVGRectElement>) => {
    if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const point = pointForEvent(event as unknown as PointerEvent<SVGGElement>);
    if (drag.mode === "resize") {
      onChangeItem(drag.id, { width: Math.round(drag.originWidth + point.x - drag.startX), height: Math.round(drag.originHeight + point.y - drag.startY) });
      return;
    }
    const deltaX = Math.round(point.x - drag.startX);
    const deltaY = Math.round(point.y - drag.startY);
    // Live local preview via DOM transform to avoid per-frame React commits (prevents stutter)
    const preview = dragPreviewRef.current;
    if (preview && preview.id === drag.id && preview.el) {
      preview.next = { x: drag.originX + deltaX, y: drag.originY + deltaY };
      if (preview.raf) cancelAnimationFrame(preview.raf);
      preview.raf = requestAnimationFrame(() => {
        if (preview.el) preview.el.setAttribute("transform", `translate(${deltaX} ${deltaY})`);
        preview.raf = null;
      });
      return;
    }
    onChangeItem(drag.id, { x: drag.originX + deltaX, y: drag.originY + deltaY });
  };

  const endMove = (event: PointerEvent<SVGGElement | SVGRectElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    // Commit the last previewed position, then drop the local transform so React owns the geometry again.
    const preview = dragPreviewRef.current;
    if (preview) {
      if (preview.raf) cancelAnimationFrame(preview.raf);
      preview.el?.removeAttribute("transform");
      if (preview.next && drag?.mode === "move") onChangeItem(preview.id, preview.next);
    }
    dragPreviewRef.current = null;
    setDrag(null);
  };

  return (
    <section className="display-frame-subcanvas" aria-label="展示框局部预览">
      <div className="display-frame-subcanvas__heading">
        <strong>局部子画布</strong>
        <small>拖动元素调整框内位置</small>
      </div>
      <svg
        ref={svgRef}
        className="display-frame-subcanvas__surface"
        viewBox={`0 0 ${LOCAL_WIDTH} ${LOCAL_HEIGHT}`}
        role="img"
        aria-label="展示框局部预览"
        onPointerDown={() => onSelectItem("")}
      >
        <rect
          data-display-frame-surface
          data-display-frame-mode={frame.mode}
          x={0.5}
          y={0.5}
          width={LOCAL_WIDTH - 1}
          height={LOCAL_HEIGHT - 1}
          rx={surface.borderRadius}
          fill={surface.background}
          fillOpacity={surface.opacity}
          stroke={surface.borderColor}
          strokeWidth={surface.borderWidth}
        />
        {paddingGuide > 0 && (
          <rect
            data-display-frame-padding-guide={paddingGuide}
            className="display-frame-subcanvas__padding-guide"
            x={paddingGuide}
            y={paddingGuide}
            width={LOCAL_WIDTH - paddingGuide * 2}
            height={LOCAL_HEIGHT - paddingGuide * 2}
            fill="none"
          />
        )}
        {sortedItems.map((item) => {
          const isSelected = item.id === selectedItemId;
          const paint = resolveDisplayFrameItemPaint(item, surface);
          const fontFamily = resolveFontFamily(paint.fontId, userFonts);
          return (
            <g
              key={item.id}
              data-display-frame-item={item.id}
              data-display-frame-kind={item.kind}
              className={isSelected ? "is-selected" : undefined}
              tabIndex={0}
              role="button"
              aria-label={`选择${itemLabel(item)}`}
              onClick={(event) => { event.stopPropagation(); onSelectItem(item.id); }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectItem(item.id);
                }
              }}
              onPointerDown={(event) => beginMove(item, event)}
              onPointerMove={moveItem}
              onPointerUp={endMove}
              onPointerCancel={endMove}
            >
              {item.kind === "decoration" && item.decoration === "line" ? (
                <line
                  data-display-frame-decoration={item.id}
                  x1={item.x}
                  y1={item.y}
                  x2={item.x + item.width}
                  y2={item.y}
                  stroke={paint.color}
                  strokeWidth={paint.strokeWidth}
                  opacity={paint.opacity}
                />
              ) : item.kind === "decoration" ? (
                <rect
                  data-display-frame-decoration={item.id}
                  x={item.x}
                  y={item.y}
                  width={item.width}
                  height={item.height}
                  fill={paint.fill}
                  stroke={paint.color}
                  strokeWidth={paint.strokeWidth}
                  opacity={paint.opacity}
                />
              ) : (
                <text
                  data-display-frame-text={item.id}
                  data-display-frame-weight={paint.fontWeight}
                  x={displayFrameTextX(item, paint)}
                  y={displayFrameTextBaseline(item, paint)}
                  fill={paint.fill}
                  fontSize={paint.fontSize}
                  fontWeight={paint.fontWeight}
                  fontFamily={fontFamily}
                  textAnchor={paint.textAnchor}
                  dominantBaseline="alphabetic"
                  opacity={paint.opacity}
                >
                  {itemPreview(item)}
                </text>
              )}
              <rect className="display-frame-subcanvas__hit-area" x={item.x} y={item.y} width={Math.max(item.width, 12)} height={Math.max(item.height, 12)} fill="transparent" />
              {isSelected && <>
                <rect className="display-frame-subcanvas__selection" x={item.x - 2} y={item.y - 2} width={item.width + 4} height={item.height + 4} rx={2} fill="none" />
                <rect
                  data-display-frame-resize-handle={item.id}
                  className="display-frame-subcanvas__resize-handle"
                  x={item.x + item.width - 3}
                  y={item.y + item.height - 3}
                  width={6}
                  height={6}
                  onPointerDown={(event) => beginResize(item, event)}
                  onPointerMove={(event) => { event.stopPropagation(); moveItem(event); }}
                  onPointerUp={(event) => { event.stopPropagation(); endMove(event); }}
                  onPointerCancel={(event) => { event.stopPropagation(); endMove(event); }}
                />
              </>}
            </g>
          );
        })}
      </svg>
      <p className="display-frame-subcanvas__status" aria-live="polite">
        {selected ? `已选择：${itemLabel(selected)}` : "选择一个图层以编辑其属性"}
      </p>
    </section>
  );
}
