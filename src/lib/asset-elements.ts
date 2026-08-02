import { createId } from "./ids";
import type { StudioAsset } from "./assets";
import type { AssetElement } from "./scene-document";

export interface CanvasPosition {
  x: number;
  y: number;
}

const DEFAULT_SIZE = 120;

function createAssetElement(input: {
  asset: StudioAsset;
  kind: AssetElement["kind"];
  position: CanvasPosition;
  province?: string;
}): AssetElement {
  return {
    id: createId("asset-element"),
    assetId: input.asset.id,
    label: input.asset.label,
    src: input.asset.src,
    kind: input.kind,
    ...(input.province ? { province: input.province } : {}),
    x: input.position.x,
    y: input.position.y,
    width: DEFAULT_SIZE,
    height: DEFAULT_SIZE,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    visibility: true,
  };
}

export function createProvinceTextureElement(asset: StudioAsset, province: string): AssetElement {
  return createAssetElement({ asset, kind: "province-texture", province, position: { x: 0, y: 0 } });
}

export function createLandmarkElement(
  asset: StudioAsset,
  province: string,
  centroid: CanvasPosition,
): AssetElement {
  return createAssetElement({ asset, kind: "landmark", province, position: centroid });
}

export function createDecorationElement(asset: StudioAsset, position: CanvasPosition): AssetElement {
  return createAssetElement({ asset, kind: "decoration", position });
}

export function duplicateAssetElement(element: AssetElement): AssetElement {
  return {
    ...element,
    id: createId("asset-element"),
    x: element.x + 16,
    y: element.y + 16,
  };
}

export function deleteAssetElement(elements: AssetElement[], id: string): AssetElement[] {
  return elements.filter((element) => element.id !== id);
}

export function sortAssetElementsByLayer(elements: AssetElement[]): AssetElement[] {
  return elements
    .map((element, index) => ({ element, index }))
    .sort((left, right) => left.element.zIndex - right.element.zIndex || left.index - right.index)
    .map(({ element }) => element);
}
