import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { AssetElement, MapSettings } from "../../lib/scene-document";
import { findProvinceFeature, type MapFeature } from "../../lib/map-data";
import { ResizeHandles } from "./ResizeHandles";

export interface RegionalAssetLayerProps {
  settings: MapSettings;
  features: readonly MapFeature[];
  path: (feature: MapFeature) => string | null | undefined;
  assets: AssetElement[];
  kinds?: AssetElement["kind"][];
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
  return left.zIndex - right.zIndex || left.id.localeCompare(right.id);
}

function svgId(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `province-clip-${safe || "unknown"}`;
}

export function RegionalAssetLayer({
  settings,
  features,
  path,
  assets,
  kinds = ["province-texture", "landmark"],
  selectedAssetId = null,
  exportMode = false,
  renderIntervalMs = 0,
  onSelectAsset,
  onAssetLoadError,
  onMoveAsset,
  onResizeAsset,
}: RegionalAssetLayerProps) {
  const dragRef = useRef<{ id: string; x: number; y: number; pointerX: number; pointerY: number } | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const pendingPreviewRef = useRef<AssetPreview | null>(null);
  const [preview, setPreview] = useState<AssetPreview | null>(null);
  const visibleAssets = assets
    .filter((asset) => asset.visibility && kinds.includes(asset.kind))
    .sort(byZIndex);
  const textureAssets = visibleAssets.filter((asset) => asset.kind === "province-texture");
  const landmarkAssets = visibleAssets.filter((asset) => asset.kind === "landmark");
  const interactive = !exportMode && Boolean(onSelectAsset);

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

  const renderedAsset = (asset: AssetElement): AssetElement => {
    const p = preview?.id === asset.id ? preview : null;
    return p
      ? {
          ...asset,
          x: p.x,
          y: p.y,
          width: p.width ?? asset.width,
          height: p.height ?? asset.height,
        }
      : asset;
  };

  const selectProps = (asset: AssetElement) => ({
    role: interactive ? "button" as const : undefined,
    tabIndex: interactive ? 0 : undefined,
    ariaLabel: interactive ? `选择 ${asset.label}` : undefined,
    onClick: interactive ? () => onSelectAsset?.(asset.id) : undefined,
    onKeyDown: interactive ? (event: React.KeyboardEvent<SVGGElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelectAsset?.(asset.id);
      }
    } : undefined,
  });

  return (
    <g
      data-layer="regional-assets"
      data-map-x={settings.x}
      data-map-y={settings.y}
      data-map-width={settings.width}
      data-map-height={settings.height}
    >
      {textureAssets.length > 0 && (
        <defs>
          {textureAssets.map((asset) => {
            const feature = asset.province ? findProvinceFeature(features, asset.province) : undefined;
            const provincePath = feature ? path(feature) : null;
            return provincePath ? (
              <clipPath id={svgId(asset.id)} key={asset.id}>
                <path d={provincePath} />
              </clipPath>
            ) : null;
          })}
        </defs>
      )}
      {textureAssets.map((asset) => {
        const feature = asset.province ? findProvinceFeature(features, asset.province) : undefined;
        if (!feature || !path(feature)) return null;
        const isSelected = !exportMode && selectedAssetId === asset.id;
        const rotationCenterX = asset.x + asset.width / 2;
        const rotationCenterY = asset.y + asset.height / 2;
        const props = selectProps(asset);
        return (
          <g
            key={asset.id}
            data-asset-group={asset.id}
            role={props.role}
            tabIndex={props.tabIndex}
            aria-label={props.ariaLabel}
            transform={`rotate(${asset.rotation} ${rotationCenterX} ${rotationCenterY})`}
            onClick={props.onClick}
            onKeyDown={props.onKeyDown}
          >
            <image
              data-province-texture={asset.id}
              data-asset-id={asset.id}
              href={asset.src}
              x={asset.x}
              y={asset.y}
              width={asset.width}
              height={asset.height}
              opacity={asset.opacity}
              preserveAspectRatio="xMidYMid slice"
              clipPath={`url(#${svgId(asset.id)})`}
              onError={() => onAssetLoadError?.(asset.id)}
            />
            {isSelected && (
              <rect
                data-asset-selection={asset.id}
                x={asset.x}
                y={asset.y}
                width={asset.width}
                height={asset.height}
                fill="none"
                pointerEvents="none"
                stroke="#d05a45"
                strokeDasharray="6 4"
                strokeWidth="2"
              />
            )}
          </g>
        );
      })}
      {landmarkAssets.map((asset) => {
        const rendered = renderedAsset(asset);
        const isSelected = !exportMode && selectedAssetId === asset.id;
        const rotationCenterX = rendered.x + rendered.width / 2;
        const rotationCenterY = rendered.y + rendered.height / 2;
        const props = selectProps(asset);
        return (
          <g key={asset.id} data-asset-shell={asset.id}>
            <g
              data-asset-group={asset.id}
              role={props.role}
              tabIndex={props.tabIndex}
              aria-label={props.ariaLabel}
              transform={`rotate(${asset.rotation} ${rotationCenterX} ${rotationCenterY})`}
              onClick={props.onClick}
              onKeyDown={props.onKeyDown}
              style={{ touchAction: "none" }}
              onPointerDown={(event) => startMove(asset, event)}
              onPointerMove={(event) => moveAsset(asset, event)}
              onPointerUp={(event) => finishMove(asset, event)}
              onPointerCancel={() => cancelMove(asset)}
            >
              <image
                data-landmark={asset.id}
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
                  stroke="#d05a45"
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
