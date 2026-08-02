import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { AssetElement } from "../../lib/scene-document";
import { ResizeHandles } from "./ResizeHandles";

interface DecorationLayerProps {
  assets: AssetElement[];
  selectedAssetId?: string | null;
  exportMode?: boolean;
  renderIntervalMs?: number;
  onSelectAsset?: (assetId: string) => void;
  onAssetLoadError?: (assetId: string) => void;
  onMoveAsset?: (assetId: string, x: number, y: number) => void;
  onResizeAsset?: (assetId: string, x: number, y: number, width: number, height: number) => void;
}

type AssetPreview = {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
};

function byZIndex(left: AssetElement, right: AssetElement): number {
  return left.zIndex - right.zIndex;
}

export function DecorationLayer({
  assets,
  selectedAssetId = null,
  exportMode = false,
  renderIntervalMs = 0,
  onSelectAsset,
  onAssetLoadError,
  onMoveAsset,
  onResizeAsset,
}: DecorationLayerProps) {
  const visibleAssets = assets.filter((asset) => asset.visibility).sort(byZIndex);
  const dragRef = useRef<{ id: string; x: number; y: number; pointerX: number; pointerY: number } | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const pendingPreviewRef = useRef<AssetPreview | null>(null);
  const [preview, setPreview] = useState<AssetPreview | null>(null);

  const clearScheduledPreview = () => {
    if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
    previewTimerRef.current = null;
    pendingPreviewRef.current = null;
  };

  const schedulePreview = (next: AssetPreview) => {
    if (renderIntervalMs <= 0) {
      setPreview(next);
      return;
    }
    pendingPreviewRef.current = next;
    if (previewTimerRef.current !== null) return;
    previewTimerRef.current = window.setTimeout(() => {
      previewTimerRef.current = null;
      const pending = pendingPreviewRef.current;
      pendingPreviewRef.current = null;
      if (pending) setPreview(pending);
    }, renderIntervalMs);
  };

  useEffect(() => () => clearScheduledPreview(), []);

  const selectAsset = (assetId: string) => {
    if (!exportMode) onSelectAsset?.(assetId);
  };

  const handleKeyDown = (event: KeyboardEvent<SVGGElement>, assetId: string) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectAsset(assetId);
  };

  const eventPoint = (event: PointerEvent<SVGGElement>) => {
    const svg = event.currentTarget.ownerSVGElement;
    const ctm = svg?.getScreenCTM?.();
    if (svg && ctm) {
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const local = point.matrixTransform(ctm.inverse());
      return { x: local.x, y: local.y };
    }
    return { x: event.clientX, y: event.clientY };
  };

  const startMove = (asset: AssetElement, event: PointerEvent<SVGGElement>) => {
    if (exportMode || !onMoveAsset) return;
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = eventPoint(event);
    clearScheduledPreview();
    setPreview(null);
    dragRef.current = { id: asset.id, x: asset.x, y: asset.y, pointerX: point.x, pointerY: point.y };
  };

  const moveAsset = (asset: AssetElement, event: PointerEvent<SVGGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== asset.id) return;
    const point = eventPoint(event);
    schedulePreview({
      id: asset.id,
      x: asset.x + point.x - drag.pointerX,
      y: asset.y + point.y - drag.pointerY,
    });
  };

  const finishMove = (asset: AssetElement, event: PointerEvent<SVGGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== asset.id) return;
    const point = eventPoint(event);
    const nextX = Math.round(asset.x + point.x - drag.pointerX);
    const nextY = Math.round(asset.y + point.y - drag.pointerY);
    dragRef.current = null;
    clearScheduledPreview();
    setPreview(null);
    // A plain click (no movement) must not create a history entry.
    if (nextX === asset.x && nextY === asset.y) return;
    onMoveAsset?.(asset.id, nextX, nextY);
  };

  const cancelMove = (asset: AssetElement) => {
    if (dragRef.current?.id !== asset.id) return;
    dragRef.current = null;
    clearScheduledPreview();
    setPreview(null);
  };

  return (
    <g data-layer="decoration">
      {visibleAssets.map((asset) => {
        const rendered = preview?.id === asset.id
          ? {
              ...asset,
              x: preview.x,
              y: preview.y,
              width: preview.width ?? asset.width,
              height: preview.height ?? asset.height,
            }
          : asset;
        const isSelected = !exportMode && selectedAssetId === asset.id;
        const rotationCenterX = rendered.x + rendered.width / 2;
        const rotationCenterY = rendered.y + rendered.height / 2;
        const interactive = !exportMode && Boolean(onSelectAsset);

        return (
          <g key={asset.id} data-asset-shell={asset.id}>
            <g
              aria-label={interactive ? `Select ${asset.label}` : undefined}
              data-asset-group={asset.id}
              role={interactive ? "button" : undefined}
              tabIndex={interactive ? 0 : undefined}
              transform={`rotate(${asset.rotation} ${rotationCenterX} ${rotationCenterY})`}
              onClick={interactive ? () => selectAsset(asset.id) : undefined}
              onKeyDown={interactive ? (event) => handleKeyDown(event, asset.id) : undefined}
              style={{ touchAction: "none" }}
              onPointerDown={(event) => startMove(asset, event)}
              onPointerMove={(event) => moveAsset(asset, event)}
              onPointerUp={(event) => finishMove(asset, event)}
              onPointerCancel={() => cancelMove(asset)}
            >
              <image
                data-asset-id={asset.id}
                href={asset.src}
                x={rendered.x}
                y={rendered.y}
                width={rendered.width}
                height={rendered.height}
                opacity={rendered.opacity}
                preserveAspectRatio="xMidYMid meet"
                onError={() => onAssetLoadError?.(asset.id)}
              />
              {isSelected && !onResizeAsset && (
                <rect
                  data-asset-selection={asset.id}
                  x={rendered.x}
                  y={rendered.y}
                  width={rendered.width}
                  height={rendered.height}
                  fill="none"
                  pointerEvents="none"
                  stroke="#215d75"
                  strokeDasharray="6 4"
                  strokeWidth="2"
                />
              )}
            </g>
            {isSelected && onResizeAsset && (
              <ResizeHandles
                renderIntervalMs={renderIntervalMs}
                rect={{
                  x: rendered.x,
                  y: rendered.y,
                  width: rendered.width,
                  height: rendered.height,
                  rotation: asset.rotation,
                }}
                onChange={(next) => setPreview({
                  id: asset.id,
                  x: next.x,
                  y: next.y,
                  width: next.width,
                  height: next.height,
                })}
                onCommit={(next) => {
                  setPreview(null);
                  onResizeAsset(
                    asset.id,
                    Math.round(next.x),
                    Math.round(next.y),
                    Math.round(next.width),
                    Math.round(next.height),
                  );
                }}
              />
            )}
          </g>
        );
      })}
    </g>
  );
}
