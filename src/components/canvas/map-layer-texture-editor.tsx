import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { ProvinceTextureRecord, TexturePreview } from "./map-data-textures";

function eventPoint(event: ReactPointerEvent<SVGGraphicsElement>) {
  const ctm = event.currentTarget.getScreenCTM?.();
  const svg = event.currentTarget.ownerSVGElement;
  if (ctm && svg) {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }
  return { x: event.clientX, y: event.clientY };
}

/**
 * Focusable, draggable frames over province textures. The live drag offset is
 * lifted to the caller (`preview`) because it feeds back into texture layout.
 */
export function ProvinceTextureEditors({
  records,
  selectedProvince,
  preview,
  onPreviewChange,
  onSelectProvince,
  onMoveProvinceTexture,
}: {
  records: readonly ProvinceTextureRecord[];
  selectedProvince: string | null;
  preview: TexturePreview | null;
  onPreviewChange: (preview: TexturePreview | null) => void;
  onSelectProvince: (province: string) => void;
  onMoveProvinceTexture?: (province: string, offsetX: number, offsetY: number) => void;
}) {
  const textureDrag = useRef<{
    province: string;
    pointerId: number;
    pointerX: number;
    pointerY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  return records.map((texture) => {
    const selected = selectedProvince === texture.feature.name;
    const automaticOffsetX = texture.rect.x - texture.unadjustedRect.x;
    const automaticOffsetY = texture.rect.y - texture.unadjustedRect.y;
    const startOffsetX = preview?.province === texture.feature.name
      ? preview.offsetX
      : (texture.layout.offsetX ?? 0) + automaticOffsetX;
    const startOffsetY = preview?.province === texture.feature.name
      ? preview.offsetY
      : (texture.layout.offsetY ?? 0) + automaticOffsetY;
    return (
      <g
        key={`province-texture-editor-${texture.feature.id}`}
        data-province-texture-editor={texture.feature.id}
        data-province-texture-selection={selected ? texture.feature.id : undefined}
        data-texture-offset-x={startOffsetX}
        data-texture-offset-y={startOffsetY}
        role="button"
        tabIndex={0}
        aria-label={`调整${texture.feature.name}贴图位置`}
        style={{ cursor: onMoveProvinceTexture ? "move" : "pointer" }}
        onClick={(event) => { event.stopPropagation(); onSelectProvince(texture.feature.name); }}
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelectProvince(texture.feature.name);
          if (!onMoveProvinceTexture) return;
          const point = eventPoint(event);
          event.currentTarget.setPointerCapture?.(event.pointerId);
          textureDrag.current = {
            province: texture.feature.name,
            pointerId: event.pointerId,
            pointerX: point.x,
            pointerY: point.y,
            offsetX: startOffsetX,
            offsetY: startOffsetY,
          };
        }}
        onPointerMove={(event) => {
          const drag = textureDrag.current;
          if (!drag) return;
          const point = eventPoint(event);
          onPreviewChange({
            province: drag.province,
            offsetX: drag.offsetX + point.x - drag.pointerX,
            offsetY: drag.offsetY + point.y - drag.pointerY,
          });
        }}
        onPointerUp={(event) => {
          const drag = textureDrag.current;
          if (!drag) return;
          const point = eventPoint(event);
          const offsetX = drag.offsetX + point.x - drag.pointerX;
          const offsetY = drag.offsetY + point.y - drag.pointerY;
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          textureDrag.current = null;
          onPreviewChange(null);
          onMoveProvinceTexture?.(drag.province, Math.round(offsetX), Math.round(offsetY));
        }}
        onPointerCancel={() => {
          textureDrag.current = null;
          onPreviewChange(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelectProvince(texture.feature.name);
          }
        }}
      >
        <rect
          x={texture.rect.x}
          y={texture.rect.y}
          width={texture.rect.width}
          height={texture.rect.height}
          fill="transparent"
          stroke={selected ? "#d05a45" : "transparent"}
          strokeWidth={selected ? 2 : 0}
          strokeDasharray={selected ? "6 4" : undefined}
          clipPath={texture.overflow ? undefined : `url(#province-texture-clip-${texture.feature.id})`}
        />
      </g>
    );
  });
}
