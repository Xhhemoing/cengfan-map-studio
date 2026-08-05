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

export interface LayoutHealthInput {
  canvas: { width: number; height: number; safeMargin?: number };
  objects: readonly LayoutHealthObject[];
  connectors?: readonly LayoutHealthConnector[];
  cardsPositions?: Record<string, LayoutHealthPoint>;
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

function orientation(a: LayoutHealthPoint, b: LayoutHealthPoint, c: LayoutHealthPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(point: LayoutHealthPoint, start: LayoutHealthPoint, end: LayoutHealthPoint): boolean {
  return Math.abs(orientation(start, end, point)) <= EPSILON
    && point.x >= Math.min(start.x, end.x) - EPSILON
    && point.x <= Math.max(start.x, end.x) + EPSILON
    && point.y >= Math.min(start.y, end.y) - EPSILON
    && point.y <= Math.max(start.y, end.y) + EPSILON;
}

function segmentsIntersect(
  left: { start: LayoutHealthPoint; end: LayoutHealthPoint },
  right: { start: LayoutHealthPoint; end: LayoutHealthPoint },
): boolean {
  const leftStart = orientation(left.start, left.end, right.start);
  const leftEnd = orientation(left.start, left.end, right.end);
  const rightStart = orientation(right.start, right.end, left.start);
  const rightEnd = orientation(right.start, right.end, left.end);
  if (((leftStart > EPSILON && leftEnd < -EPSILON) || (leftStart < -EPSILON && leftEnd > EPSILON))
    && ((rightStart > EPSILON && rightEnd < -EPSILON) || (rightStart < -EPSILON && rightEnd > EPSILON))) return true;
  return onSegment(right.start, left.start, left.end)
    || onSegment(right.end, left.start, left.end)
    || onSegment(left.start, right.start, right.end)
    || onSegment(left.end, right.start, right.end);
}

function connectorConflict(left: LayoutHealthConnector, right: LayoutHealthConnector): boolean {
  return left.segments.some((leftSegment) => right.segments.some((rightSegment) => segmentsIntersect(leftSegment, rightSegment)));
}

export function checkLayoutHealth(input: LayoutHealthInput): LayoutHealthIssue[] {
  const issues: LayoutHealthIssue[] = [];
  const visibleObjects = input.objects
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

  for (let leftIndex = 0; leftIndex < visibleObjects.length; leftIndex += 1) {
    const left = visibleObjects[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < visibleObjects.length; rightIndex += 1) {
      const right = visibleObjects[rightIndex]!;
      if (!overlaps(left.bounds, right.bounds)) continue;
      const leftZ = left.object.zIndex ?? 0;
      const rightZ = right.object.zIndex ?? 0;
      if (leftZ === rightZ) continue;
      const back = leftZ < rightZ ? left.object : right.object;
      const front = leftZ < rightZ ? right.object : left.object;
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
