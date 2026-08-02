/**
 * Compute the actual geographic content bounds of the map in canvas pixels.
 *
 * The map's outer frame (`MapSettings.x/y/width/height`) is just a container.
 * The real geography — what cards must avoid and what anchors radiate from —
 * is either:
 *   - the union of projected province AABBs (vector mode), or
 *   - the placement rect of an aligned custom overlay image (image mode).
 *
 * Using this instead of the raw frame makes card layout track the visible
 * geography in real time as the user scales, pans, or re-aligns the map.
 */
import type { MapSettings } from "./scene-document";
import { defaultSouthSeaInsetFrame } from "./south-china-sea";

export interface ContentBoundsInput {
  map: MapSettings;
  /** Projected province AABBs in canvas pixels (from `mapPath.bounds` × scale). */
  provinceAreas: { x: number; y: number; width: number; height: number }[];
}

export interface ContentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function union(rects: { x: number; y: number; width: number; height: number }[]): ContentBounds | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    if (!Number.isFinite(r.x) || !Number.isFinite(r.y) || r.width <= 0 || r.height <= 0) continue;
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function imageContentBounds(map: MapSettings): ContentBounds | null {
  const source = map.renderSource;
  if (source?.kind !== "image" || !source.alignment) return null;
  const { x, y, width, height, rotation } = source.alignment;
  if (width <= 1 || height <= 1 || ![x, y, width, height, rotation].every(Number.isFinite)) return null;

  const radians = rotation * Math.PI / 180;
  const rotatedWidth = Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians));
  const rotatedHeight = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians));
  return mapLocalBoundsToCanvas(map, {
    x: x + (width - rotatedWidth) / 2,
    y: y + (height - rotatedHeight) / 2,
    width: rotatedWidth,
    height: rotatedHeight,
  });
}

function mapLocalBoundsToCanvas(map: MapSettings, bounds: ContentBounds): ContentBounds {
  const centerX = map.width / 2;
  const centerY = map.height / 2;
  return {
    x: map.x + centerX + (bounds.x - centerX) * map.scale,
    y: map.y + centerY + (bounds.y - centerY) * map.scale,
    width: bounds.width * map.scale,
    height: bounds.height * map.scale,
  };
}

function southSeaInsetBounds(map: MapSettings): ContentBounds | null {
  if (map.collapseSouthChinaSea !== true) return null;
  return mapLocalBoundsToCanvas(map, defaultSouthSeaInsetFrame(map.width, map.height));
}

export function computeMapOccupiedAreas(input: ContentBoundsInput): ContentBounds[] {
  const imageBounds = imageContentBounds(input.map);
  const insetBounds = southSeaInsetBounds(input.map);
  const source = input.map.renderSource;
  const transformedFrame = mapLocalBoundsToCanvas(input.map, {
    x: 0,
    y: 0,
    width: input.map.width,
    height: input.map.height,
  });
  if (source?.kind === "image") {
    const visibleImageBounds = imageBounds ?? transformedFrame;
    const areas = source.composition === "overlay"
      ? [...input.provinceAreas, visibleImageBounds]
      : [visibleImageBounds];
    return insetBounds ? [...areas, insetBounds] : areas;
  }
  const areas = input.provinceAreas.length > 0
    ? input.provinceAreas
    : [transformedFrame];
  return insetBounds ? [...areas, insetBounds] : areas;
}

/**
 * Resolve the actual content bounds in canvas pixels.
 *
 * - Image overlay with `alignment`: the aligned content rect (the image *is*
 *   the geography). Falls back to the frame if placement collapses.
 * - Image replace/overlay without alignment: the full frame.
 * - Vector: the union of projected province AABBs, falling back to the frame
 *   if province bounds are unavailable or degenerate.
 */
export function computeMapContentBounds(input: ContentBoundsInput): ContentBounds {
  const { map } = input;
  const frame = mapLocalBoundsToCanvas(map, { x: 0, y: 0, width: map.width, height: map.height });

  const source = map.renderSource;
  const imageBounds = imageContentBounds(map);
  if (source?.kind === "image") {
    const visibleImageBounds = imageBounds ?? frame;
    if (source.composition !== "overlay") return visibleImageBounds;
    return union(computeMapOccupiedAreas(input)) ?? visibleImageBounds;
  }

  const provinceUnion = union(computeMapOccupiedAreas(input));
  if (provinceUnion && provinceUnion.width > 1 && provinceUnion.height > 1) {
    return provinceUnion;
  }
  return frame;
}
