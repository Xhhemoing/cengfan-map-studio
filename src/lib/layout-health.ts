import {
  CONNECTOR_ANCHOR_EXEMPT_RADIUS,
  segmentRectOverlapLength,
  trimSegmentsNearAnchor,
} from "./connector-geometry";
import { mmToPx, normalizePrintBleedMm } from "./print-bleed";

export type LayoutHealthIssueKind =
  | "overflow"
  | "out-of-bounds"
  | "occlusion"
  | "unreadable-text"
  | "connector-conflict"
  | "connector-crosses-card"
  | "object-in-bleed";

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
  /** 引线出发的那张卡片。它的边框就是引线起点，贴着自己走不算穿卡。 */
  cardId?: string;
  /** 地理锚点。锚点周围的会合区是共锚点花束，不参与穿卡判定。 */
  anchor?: LayoutHealthPoint;
}

export interface LayoutHealthInput {
  /** `width`/`height` are the trim box; `printBleedMm` extends the print sheet outside it. */
  canvas: { width: number; height: number; safeMargin?: number; printBleedMm?: number };
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

/** Layers that may legitimately run full-bleed (背景、地图底图) are exempt from the trim check. */
const BLEED_SENSITIVE_KINDS: ReadonlySet<LayoutHealthObject["kind"]> = new Set(["card", "text", "asset", "guests"]);

type BleedRisk = "in-bleed" | "near-trim";

/**
 * `print-bleed` treats the canvas as the trim box and grows the bleed outwards, so an object
 * crossing a canvas edge already prints inside the bleed and risks being cut off.
 */
function bleedRisk(bounds: LayoutHealthBounds, canvas: LayoutHealthInput["canvas"], quietZone: number): BleedRisk | null {
  const smallest = Math.min(
    bounds.x,
    bounds.y,
    canvas.width - (bounds.x + bounds.width),
    canvas.height - (bounds.y + bounds.height),
  );
  if (smallest < -EPSILON) return "in-bleed";
  return smallest < quietZone - EPSILON ? "near-trim" : null;
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

/**
 * 引线要压进卡片正身多少像素才算「穿过去」。
 *
 * 判定用的是卡内弦长而不是「碰到没有」：擦过一个角、或者沿着边框走一小截，
 * 画面上看不出线压在卡上，报出来只会把真正从卡片正中穿过去的那条淹掉。4px
 * 是连接线自身描边的量级。
 */
const CARD_CROSSING_MIN_CHORD = 4;

/**
 * 参与穿卡判定的折线：先把锚点周围的会合区裁掉。
 *
 * 共锚点的一束引线必然在锚点处交汇，而锚点常常正落在某张卡片身上（卡片就摆在
 * 自己省份上方）。那种「最后十几像素扎进卡里」是花束的固有形状，不是排版事故；
 * 同一半径之外的部分照常判定，所以真的从卡片正身穿过去仍然会报。
 */
function crossingSegments(connector: LayoutHealthConnector) {
  return connector.anchor
    ? trimSegmentsNearAnchor(connector.segments, connector.anchor, CONNECTOR_ANCHOR_EXEMPT_RADIUS)
    : connector.segments;
}

function boundingBox(segments: readonly { start: LayoutHealthPoint; end: LayoutHealthPoint }[]): LayoutHealthBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const segment of segments) {
    for (const point of [segment.start, segment.end]) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * 两个盒子完全错开。和 {@link overlaps} 不同，这里贴边接触算「没错开」：一条正
 * 压在卡片边框上走的引线，包围盒是零宽的，不能被当成够不着而提前筛掉。
 */
function separated(left: LayoutHealthBounds, right: LayoutHealthBounds): boolean {
  return left.x > right.x + right.width
    || left.x + left.width < right.x
    || left.y > right.y + right.height
    || left.y + left.height < right.y;
}

/**
 * Whether an overlap between two objects on the same layer is worth reporting.
 *
 * 展示框 share one `cards.zIndex`, so a pair of stacked cards always compares
 * equal and would otherwise never warn — the case a user most needs to see.
 * Other kinds stay exempt: their reported heights are estimates, and one text
 * or 素材 drawn over another on the same layer is usually deliberate, so
 * warning on every such pair would bury the real overlaps in noise.
 */
function sameLayerOcclusionMatters(left: LayoutHealthObject, right: LayoutHealthObject): boolean {
  return left.kind === "card" && right.kind === "card";
}

export function checkLayoutHealth(input: LayoutHealthInput): LayoutHealthIssue[] {
  const issues: LayoutHealthIssue[] = [];
  const visibleObjects = input.objects
    .filter((object) => object.visible !== false)
    .map((object) => ({ object, bounds: resolvedBounds(object, input.cardsPositions) }));
  const bleedMm = normalizePrintBleedMm(input.canvas.printBleedMm);
  const bleedPx = bleedMm > 0 ? mmToPx(bleedMm) : 0;

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
    if (bleedPx > 0 && BLEED_SENSITIVE_KINDS.has(object.kind)) {
      const risk = bleedRisk(bounds, input.canvas, bleedPx);
      if (risk) {
        issues.push({
          id: object.id,
          kind: "object-in-bleed",
          severity: "warning",
          detail: risk === "in-bleed"
            ? `${object.id} 落在出血区（裁切线之外），裁切后可能被切掉`
            : `${object.id} 距裁切线不足 ${bleedMm}mm`,
        });
      }
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
      if (leftZ === rightZ && !sameLayerOcclusionMatters(left.object, right.object)) continue;
      // Equal z means paint order decides, and that is input order.
      const back = leftZ <= rightZ ? left.object : right.object;
      const front = leftZ <= rightZ ? right.object : left.object;
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

  const visibleCards = visibleObjects.filter((entry) => entry.object.kind === "card");
  for (const connector of visibleConnectors) {
    const segments = crossingSegments(connector);
    if (segments.length === 0) continue;
    // curve 会被采样成 16 段，逐段对每张卡做裁剪很快就上万次。要留下 4px 弦长，
    // 整条线的包围盒必然与卡片相交，一次包围盒比较就能筛掉绝大多数卡片。
    const reach = boundingBox(segments);
    for (const { object, bounds } of visibleCards) {
      if (object.id === connector.cardId || separated(reach, bounds)) continue;
      // 折线的各段互不重叠，逐段弦长相加就是这条线压在卡内的总长度。
      const chord = segments.reduce((total, segment) => total + segmentRectOverlapLength(segment, bounds), 0);
      if (chord < CARD_CROSSING_MIN_CHORD) continue;
      issues.push({
        id: `${connector.id}:${object.id}`,
        kind: "connector-crosses-card",
        severity: "warning",
        detail: `${connector.cardId ?? connector.id} 的连接线从 ${object.id} 上穿过`,
      });
    }
  }

  return issues;
}
