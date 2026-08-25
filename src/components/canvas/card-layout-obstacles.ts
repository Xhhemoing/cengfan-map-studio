import type { CardArea } from "../../lib/card-layout";
import type { AssetElement, CanvasText } from "../../lib/scene-document";

/**
 * Obstacle assembly for destination-card auto-layout and for the clamp a dragged card obeys.
 *
 * Two document switches gate two disjoint obstacle sets, and neither may leak into the other:
 * `allowMapOverlap` releases the map geometry (the caller drops those rects from
 * `bounds.occupiedAreas`), `allowElementOverlap` releases what this module collects — the
 * guest panel, the poster texts and the visible decorations — which the solver relaxes from
 * `bounds.elementAreas` on its own.
 */

/** Box a text element covers, following its alignment. Empty or hidden text blocks nothing. */
export function textLayoutObstacle(text: CanvasText): CardArea | null {
  if (!text.visibility || !text.content.trim()) return null;
  const x = text.textAlign === "right"
    ? text.x - text.maxWidth
    : text.textAlign === "center"
      ? text.x - text.maxWidth / 2
      : text.x;
  return { x, y: text.y - text.fontSize, width: text.maxWidth, height: text.fontSize * 1.3 };
}

/**
 * Axis-aligned box a visible decoration covers. Rotation is folded into the extent so a tilted
 * decoration still reserves the space its corners reach; a decoration that is hidden or fully
 * transparent paints nothing and therefore blocks nothing.
 */
export function decorationLayoutObstacle(asset: AssetElement): CardArea | null {
  if (asset.visibility === false || asset.opacity <= 0) return null;
  const radians = (asset.rotation ?? 0) * Math.PI / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const width = asset.width * cos + asset.height * sin;
  const height = asset.width * sin + asset.height * cos;
  return {
    x: asset.x + (asset.width - width) / 2,
    y: asset.y + (asset.height - height) / 2,
    width,
    height,
  };
}

export interface ElementObstacleInput {
  texts: readonly CanvasText[];
  decorations: readonly AssetElement[];
  /** Resolved guest-panel box, or null when the panel is hidden. */
  guests: CardArea | null;
}

/** Every non-map rect a destination card avoids while `allowElementOverlap` stays off. */
export function collectElementObstacles({ texts, decorations, guests }: ElementObstacleInput): CardArea[] {
  const areas: CardArea[] = [];
  for (const text of texts) {
    const area = textLayoutObstacle(text);
    if (area) areas.push(area);
  }
  if (guests) areas.push(guests);
  for (const decoration of decorations) {
    const area = decorationLayoutObstacle(decoration);
    if (area) areas.push(area);
  }
  return areas;
}
