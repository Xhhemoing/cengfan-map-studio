import { DEFAULT_CARD_EXPRESSION_TEMPLATES } from "./card-expression";
import { buildConnectorGeometry, type ConnectorSegment, type Point } from "./connector-geometry";
import { deriveFixedDisplayFrameFromCardSettings, normalizeDisplayFrame } from "./display-frame";
import { buildLayoutGroups } from "./layout";
import {
  checkLayoutHealth,
  type LayoutHealthConnector,
  type LayoutHealthIssue,
  type LayoutHealthObject,
} from "./layout-health";
import { prepareDestinationCards, type PreparedDestinationCard } from "./poster-card-rows";
import { deriveCardFrameLayout } from "./poster-display-frame";
import type { ProjectDocument } from "./project-document";

/** 与 PosterCanvas 相同的水平内边距推导：displayFrame 缺省时按卡片设置生成固定框。 */
function resolveMeasureHorizontalPadding(cards: ProjectDocument["cards"]): number {
  const frame = cards.displayFrame === undefined
    ? deriveFixedDisplayFrameFromCardSettings(cards)
    : normalizeDisplayFrame(cards.displayFrame);
  return deriveCardFrameLayout(frame, cards).horizontalPadding;
}

/**
 * 用产品渲染同一套测量函数（prepareDestinationCards）计算每张目的地卡的真实宽高。
 *
 * 卡片宽高只依赖学生分组、字段换行与排版设置，不依赖地理数据；因此传入空的
 * features 与恒 null 的投影即可跳过 geojson 解析与墨卡托投影。锚点此时统一回落
 * 到地图中心（map.x + width/2 —— 地图围绕自身中心缩放，中心是缩放不动点），
 * 恰好可作为连接线体检的地图侧锚点近似。
 */
export function estimateDestinationCardLayouts(project: ProjectDocument): PreparedDestinationCard[] {
  // 与 poster-card-placement 的渲染门槛一致：这两种情形画布上不渲染目的地卡。
  if (project.cards.visibleFields.length === 0 || project.dataView === "pins") return [];
  const templates = project.cards.expressionTemplates ?? DEFAULT_CARD_EXPRESSION_TEMPLATES;
  return prepareDestinationCards({
    groups: buildLayoutGroups(project.students, project.cards.grouping),
    cards: project.cards,
    expressionTemplates: { title: templates.title, city: templates.city, row: templates.row },
    features: [],
    projection: () => null,
    centroid: () => [0, 0],
    map: project.map,
    canvasWidth: project.canvas.width,
    safeMargin: project.canvas.safeMargin,
    horizontalPadding: resolveMeasureHorizontalPadding(project.cards),
    lineHeightMultiplier: project.canvas.lineHeight ?? 1,
    noWrapFieldSet: new Set(project.cards.noWrapFields ?? []),
  });
}

/**
 * 共锚点豁免半径：多张卡的连接线汇入同一个地图锚点时，锚点附近的会合不算冲突
 * （connector-geometry 的去重逻辑同样豁免 24px 内的尾段）。layout-health 的线段
 * 相交判定包含端点接触，所以喂给它之前先把锚点端裁掉这一段。
 */
export const CONNECTOR_ANCHOR_EXEMPT_RADIUS = 24;

function clipPointOnCircle(segment: ConnectorSegment, anchor: Point, radius: number, root: 1 | -1): Point | null {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const fx = segment.start.x - anchor.x;
  const fy = segment.start.y - anchor.y;
  const a = dx * dx + dy * dy;
  if (a <= 0) return null;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const t = (-b + root * Math.sqrt(discriminant)) / (2 * a);
  if (t <= 0 || t >= 1) return null;
  return { x: segment.start.x + dx * t, y: segment.start.y + dy * t };
}

/** 把折线在 anchor 半径内的部分裁掉：整段在圈内的丢弃，跨圈的截断到圆周。 */
export function trimSegmentsNearAnchor(
  segments: readonly ConnectorSegment[],
  anchor: Point,
  radius: number,
): ConnectorSegment[] {
  const radiusSquared = radius * radius;
  const inside = (point: Point) => (point.x - anchor.x) ** 2 + (point.y - anchor.y) ** 2 < radiusSquared;
  return segments.flatMap((segment) => {
    const startInside = inside(segment.start);
    const endInside = inside(segment.end);
    if (startInside && endInside) return [];
    if (!startInside && !endInside) return [segment];
    const clipped = endInside
      ? clipPointOnCircle(segment, anchor, radius, -1)
      : clipPointOnCircle(segment, anchor, radius, 1);
    if (!clipped) return [];
    return endInside
      ? [{ start: segment.start, end: clipped }]
      : [{ start: clipped, end: segment.end }];
  });
}

export interface ContentLayoutInput {
  objects: LayoutHealthObject[];
  connectors: LayoutHealthConnector[];
}

/**
 * 由工程文档构造排版体检输入：地图/卡片/嘉宾/文本/素材对象 + 每张手工放置卡片
 * 的连接线折线。卡片使用真实测量宽高与 positions 里的真实坐标；positions 中已
 * 无对应分组的残留键（学生删除、分组切换）不再产生对象——画布上没有那张卡。
 */
export function buildContentLayoutInput(project: ProjectDocument): ContentLayoutInput {
  const positions = project.cards.positions ?? {};
  const positionKeys = Object.keys(positions);
  const measuredCards = positionKeys.length > 0 ? estimateDestinationCardLayouts(project) : [];
  const measuredByKey = new Map(measuredCards.map((card) => [card.group.key, card]));

  const cardObjects: LayoutHealthObject[] = [];
  const connectors: LayoutHealthConnector[] = [];
  for (const key of positionKeys) {
    const measured = measuredByKey.get(key);
    if (!measured) continue;
    const position = positions[key]!;
    const bounds = { x: position.x, y: position.y, width: measured.width, height: measured.height };
    cardObjects.push({ id: key, kind: "card", positionKey: key, zIndex: project.cards.zIndex, bounds });
    const anchor = { x: measured.anchorX, y: measured.anchorY };
    const geometry = buildConnectorGeometry({ card: bounds, anchor, style: project.cards.connectorStyle });
    const segments = trimSegmentsNearAnchor(geometry.segments, anchor, CONNECTOR_ANCHOR_EXEMPT_RADIUS);
    if (segments.length > 0) {
      connectors.push({ id: `connector-${key}`, segments, visible: project.cards.connectorWidth > 0 });
    }
  }

  // 尚无任何手工位置时保留旧的 cards.x/y 汇总占位块（遗留锚点，高度非实测）；
  // pins 视图或无可见字段时画布不渲染目的地卡，占位块也一并省略。
  const legacyCardsPlaceholder: LayoutHealthObject[] =
    positionKeys.length === 0 && project.cards.visibleFields.length > 0 && project.dataView !== "pins"
      ? [{
          id: "cards",
          kind: "card",
          zIndex: project.cards.zIndex,
          bounds: { x: project.cards.x, y: project.cards.y, width: project.cards.maxWidth, height: 180 },
        }]
      : [];

  const objects: LayoutHealthObject[] = [
    {
      id: "map",
      kind: "map",
      zIndex: project.map.zIndex,
      bounds: { x: project.map.x, y: project.map.y, width: project.map.width * project.map.scale, height: project.map.height * project.map.scale },
    },
    ...cardObjects,
    ...legacyCardsPlaceholder,
    ...(project.guests.visibility
      ? [{
          id: "guests",
          kind: "guests" as const,
          zIndex: 20,
          bounds: { x: project.guests.x, y: project.guests.y, width: project.guests.width, height: 120 },
        }]
      : []),
    ...project.textElements.map((text) => ({
      id: text.id,
      kind: "text" as const,
      zIndex: 40,
      bounds: {
        x: text.textAlign === "right" ? text.x - text.maxWidth : text.textAlign === "center" ? text.x - text.maxWidth / 2 : text.x,
        y: text.y - text.fontSize,
        width: text.maxWidth,
        height: text.fontSize * 1.3,
      },
      visible: text.visibility,
      content: text.content,
      textColor: text.color,
      backgroundColor: project.canvas.backgroundColor,
    })),
    ...project.assetElements.map((asset) => ({
      id: asset.id,
      kind: "asset" as const,
      zIndex: asset.zIndex,
      bounds: { x: asset.x, y: asset.y, width: asset.width, height: asset.height },
      visible: asset.visibility,
    })),
  ];

  return { objects, connectors };
}

export function listContentLayoutIssues(project: ProjectDocument): LayoutHealthIssue[] {
  const { objects, connectors } = buildContentLayoutInput(project);
  return checkLayoutHealth({
    canvas: {
      width: project.canvas.width,
      height: project.canvas.height,
      safeMargin: project.canvas.safeMargin,
      printBleedMm: project.canvas.printBleedMm,
    },
    cardsPositions: project.cards.positions,
    objects,
    connectors,
  });
}
