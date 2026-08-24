import { connectorSegmentsIntersect, segmentIntersectsRect } from "./connector-geometry";

export type LayoutHealthIssueKind =
  | "overflow"
  | "out-of-bounds"
  | "occlusion"
  | "unreadable-text"
  | "connector-conflict";

export type LayoutHealthSeverity = "warning" | "error";

export interface LayoutHealthPoint {
  x: number;
  y: number;
}

export interface LayoutHealthBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutHealthObject {
  id: string;
  kind: "card" | "asset" | "text" | "guests" | "map" | "canvas";
  bounds: LayoutHealthBounds;
  visible?: boolean;
  zIndex?: number;
  positionKey?: string;
  content?: string;
  textColor?: string;
  backgroundColor?: string;
}

export interface LayoutHealthConnector {
  id: string;
  segments: Array<{ start: LayoutHealthPoint; end: LayoutHealthPoint }>;
  visible?: boolean;
}

/** 一块投影后的地图轮廓：第一个环是外壳，其余是洞。 */
export interface LayoutHealthPolygon {
  rings: readonly (readonly LayoutHealthPoint[])[];
  bounds?: LayoutHealthBounds;
}

export interface LayoutHealthInput {
  canvas: { width: number; height: number; safeMargin?: number };
  objects: readonly LayoutHealthObject[];
  connectors?: readonly LayoutHealthConnector[];
  cardsPositions?: Record<string, LayoutHealthPoint>;
  /**
   * 地图省份轮廓。给了就按多边形精判 map 遮挡，不给才退回省份联合 AABB
   * ——联合框里大半是海面与留白，标题压在那里并没有真的盖住地图。
   */
  mapPolygons?: readonly LayoutHealthPolygon[];
  /** 卡片允许压地图（`cards.allowMapOverlap`）：卡片盖住 map 是用户选的排版，不是问题。 */
  allowMapOverlap?: boolean;
}

export interface LayoutHealthIssue {
  id: string;
  kind: LayoutHealthIssueKind;
  severity: LayoutHealthSeverity;
  detail: string;
}

const EPSILON = 0.000001;

function overlaps(left: LayoutHealthBounds, right: LayoutHealthBounds): boolean {
  return left.x < right.x + right.width - EPSILON
    && left.x + left.width > right.x + EPSILON
    && left.y < right.y + right.height - EPSILON
    && left.y + left.height > right.y + EPSILON;
}

function outsideCanvas(bounds: LayoutHealthBounds, canvas: LayoutHealthInput["canvas"]): boolean {
  return bounds.x < 0
    || bounds.y < 0
    || bounds.x + bounds.width > canvas.width
    || bounds.y + bounds.height > canvas.height;
}

function outsideSafeArea(bounds: LayoutHealthBounds, canvas: LayoutHealthInput["canvas"]): boolean {
  const margin = Math.max(0, canvas.safeMargin ?? 0);
  return bounds.x < margin
    || bounds.y < margin
    || bounds.x + bounds.width > canvas.width - margin
    || bounds.y + bounds.height > canvas.height - margin;
}

interface ResolvedObject {
  object: LayoutHealthObject;
  bounds: LayoutHealthBounds;
}

function resolvedBounds(object: LayoutHealthObject, positions: Record<string, LayoutHealthPoint> | undefined): LayoutHealthBounds {
  const position = object.positionKey ? positions?.[object.positionKey] : undefined;
  return position ? { ...object.bounds, x: position.x, y: position.y } : object.bounds;
}

function hexColor(value: string | undefined): [number, number, number] | null {
  if (!value) return null;
  const normalized = value.trim().replace(/^#/, "");
  if (!/^(?:[\da-f]{3}|[\da-f]{6})$/i.test(normalized)) return null;
  const expanded = normalized.length === 3
    ? normalized.split("").map((char) => `${char}${char}`).join("")
    : normalized;
  return [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16)) as [number, number, number];
}

function luminance(color: [number, number, number]): number {
  return color.reduce((sum, channel, index) => {
    const value = channel / 255;
    const linear = value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][index]!;
  }, 0);
}

function hasLowContrast(object: LayoutHealthObject): boolean {
  if (object.kind !== "text" || !object.content?.trim()) return false;
  const foreground = hexColor(object.textColor);
  const background = hexColor(object.backgroundColor);
  if (!foreground || !background) return false;
  const ratio = (Math.max(luminance(foreground), luminance(background)) + 0.05)
    / (Math.min(luminance(foreground), luminance(background)) + 0.05);
  return ratio < 3;
}

// 连线冲突与求解器共用 `connectorSegmentsIntersect`：同锚点花束在锚点处会合不算交叉，
// 否则 city 分组下同省的多张卡刚排完就会被判成 connector-conflict。
function connectorConflict(left: LayoutHealthConnector, right: LayoutHealthConnector): boolean {
  return connectorSegmentsIntersect(left.segments, right.segments);
}

function pointInRing(point: LayoutHealthPoint, ring: readonly LayoutHealthPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const start = ring[previous]!;
    const end = ring[index]!;
    if ((start.y > point.y) !== (end.y > point.y)) {
      const x = start.x + (point.y - start.y) * (end.x - start.x) / (end.y - start.y);
      if (x >= point.x - EPSILON) inside = !inside;
    }
  }
  return inside;
}

function pointInPolygon(point: LayoutHealthPoint, polygon: LayoutHealthPolygon): boolean {
  const [shell, ...holes] = polygon.rings;
  return Boolean(shell && pointInRing(point, shell) && !holes.some((hole) => pointInRing(point, hole)));
}

function polygonBounds(polygon: LayoutHealthPolygon): LayoutHealthBounds | null {
  if (polygon.bounds) return polygon.bounds;
  const points = polygon.rings.flat();
  if (points.length < 3) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

function boundsIntersectsPolygon(bounds: LayoutHealthBounds, polygon: LayoutHealthPolygon): boolean {
  const area = polygonBounds(polygon);
  if (!area || !overlaps(bounds, area)) return false;
  // 矩形完全落在省份里（小卡片压在省中央）时轮廓不与矩形边相交，得先查角点。
  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ];
  if (corners.some((corner) => pointInPolygon(corner, polygon))) return true;
  return polygon.rings.some((ring) => ring.some((point, index) => {
    const next = ring[(index + 1) % ring.length];
    return Boolean(next && segmentIntersectsRect({ start: point, end: next }, bounds));
  }));
}

export function checkLayoutHealth(input: LayoutHealthInput): LayoutHealthIssue[] {
  const issues: LayoutHealthIssue[] = [];
  const visibleObjects: ResolvedObject[] = input.objects
    .filter((object) => object.visible !== false)
    .map((object) => ({ object, bounds: resolvedBounds(object, input.cardsPositions) }));

  for (const { object, bounds } of visibleObjects) {
    if (outsideCanvas(bounds, input.canvas)) {
      issues.push({
        id: object.id,
        kind: "out-of-bounds",
        severity: "error",
        detail: `${object.id} 超出画布边界`,
      });
    } else if (outsideSafeArea(bounds, input.canvas)) {
      issues.push({
        id: object.id,
        kind: "overflow",
        severity: "warning",
        detail: `${object.id} 超出画布安全边距`,
      });
    }
    if (hasLowContrast(object)) {
      issues.push({
        id: object.id,
        kind: "unreadable-text",
        severity: "warning",
        detail: `${object.id} 的文字与背景对比度不足`,
      });
    }
  }

  // map 的 bounds 是省份联合 AABB，里面大半是海面与留白：`mapPolygons` 在场时要求对方
  // 真的压到省份轮廓上；`allowMapOverlap` 打开时卡片压地图是用户选的排版，不再报。
  const mapPolygons = input.mapPolygons ?? [];
  const mapOcclusion = (back: ResolvedObject, front: ResolvedObject): boolean => {
    const map = back.object.kind === "map" ? back : front.object.kind === "map" ? front : null;
    if (!map) return true;
    const other = map === back ? front : back;
    if (input.allowMapOverlap === true && other.object.kind === "card") return false;
    if (mapPolygons.length === 0) return true;
    return mapPolygons.some((polygon) => boundsIntersectsPolygon(other.bounds, polygon));
  };

  for (let leftIndex = 0; leftIndex < visibleObjects.length; leftIndex += 1) {
    const left = visibleObjects[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < visibleObjects.length; rightIndex += 1) {
      const right = visibleObjects[rightIndex]!;
      if (!overlaps(left.bounds, right.bounds)) continue;
      const leftZ = left.object.zIndex ?? 0;
      const rightZ = right.object.zIndex ?? 0;
      if (leftZ === rightZ) continue;
      const backEntry = leftZ < rightZ ? left : right;
      const frontEntry = leftZ < rightZ ? right : left;
      if (!mapOcclusion(backEntry, frontEntry)) continue;
      const back = backEntry.object;
      const front = frontEntry.object;
      issues.push({
        id: `${back.id}:${front.id}`,
        kind: "occlusion",
        severity: "warning",
        detail: `${front.id} 遮挡了 ${back.id}`,
      });
    }
  }

  const visibleConnectors = (input.connectors ?? []).filter((connector) => connector.visible !== false);
  for (let leftIndex = 0; leftIndex < visibleConnectors.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < visibleConnectors.length; rightIndex += 1) {
      const left = visibleConnectors[leftIndex]!;
      const right = visibleConnectors[rightIndex]!;
      if (!connectorConflict(left, right)) continue;
      issues.push({
        id: `${left.id}:${right.id}`,
        kind: "connector-conflict",
        severity: "warning",
        detail: `${left.id} 与 ${right.id} 的连接线发生冲突`,
      });
    }
  }

  return issues;
}
