import { DEFAULT_CARD_EXPRESSION_TEMPLATES } from "./card-expression";
import {
  buildConnectorGeometry,
  CONNECTOR_ANCHOR_EXEMPT_RADIUS,
  trimSegmentsNearAnchor,
} from "./connector-geometry";
import { deriveFixedDisplayFrameFromCardSettings, normalizeDisplayFrame } from "./display-frame";
import { buildLayoutGroups } from "./layout";
import {
  checkLayoutHealth,
  type LayoutHealthConnector,
  type LayoutHealthIssue,
  type LayoutHealthObject,
} from "./layout-health";
import type { MapFeature, Position } from "./map-data";
import { prepareDestinationCards, type PreparedDestinationCard } from "./poster-card-rows";
import { deriveCardFrameLayout } from "./poster-display-frame";
import type { ProjectDocument } from "./project-document";
import type { MapSettings } from "./scene-document";

/** 与 PosterCanvas 相同的水平内边距推导：displayFrame 缺省时按卡片设置生成固定框。 */
function resolveMeasureHorizontalPadding(cards: ProjectDocument["cards"]): number {
  const frame = cards.displayFrame === undefined
    ? deriveFixedDisplayFrameFromCardSettings(cards)
    : normalizeDisplayFrame(cards.displayFrame);
  return deriveCardFrameLayout(frame, cards).horizontalPadding;
}

/**
 * 省级行政中心经纬度，逐字取自 `src/assets/china.geojson` 每个要素的
 * `properties.center`——渲染层的连接线锚点投影的就是这个点。
 *
 * 内联一份是为了让排版体检拿到与画布一致的省份锚点，而不必在体检路径上
 * JSON.parse 582KB 的 geojson（体检会在 Agent 循环、交付页、健康面板里反复
 * 跑）。这不是第二份地理事实：`content-layout-objects.test.ts` 里有一条用例
 * 直接读真 geojson、走渲染层的 `fitFeatureProjection` 逐省比对，数据一旦漂移
 * 立刻红。键是 `toShortProvinceName` 之后的短名。
 */
const PROVINCE_CENTER_COORDINATES: Readonly<Record<string, Position>> = {
  安徽: [117.283042, 31.86119],
  澳门: [113.54909, 22.198951],
  北京: [116.405285, 39.904989],
  重庆: [106.504962, 29.533155],
  福建: [119.306239, 26.075302],
  甘肃: [103.823557, 36.058039],
  广东: [113.280637, 23.125178],
  广西: [108.320004, 22.82402],
  贵州: [106.713478, 26.578343],
  海南: [110.33119, 20.031971],
  河北: [114.502461, 38.045474],
  河南: [113.665412, 34.757975],
  黑龙江: [126.642464, 45.756967],
  湖北: [114.298572, 30.584355],
  湖南: [112.982279, 28.19409],
  吉林: [125.3245, 43.886841],
  江苏: [118.767413, 32.041544],
  江西: [115.892151, 28.676493],
  辽宁: [123.429096, 41.796767],
  内蒙古: [111.670801, 40.818311],
  宁夏: [106.278179, 38.46637],
  青海: [101.778916, 36.623178],
  山东: [117.000923, 36.675807],
  山西: [112.549248, 37.857014],
  陕西: [108.948024, 34.263161],
  上海: [121.472644, 31.231706],
  四川: [104.065735, 30.659462],
  台湾: [121.509062, 25.044332],
  天津: [117.190182, 39.125596],
  西藏: [91.132212, 29.660361],
  香港: [114.173355, 22.320048],
  新疆: [87.617733, 43.792818],
  云南: [102.712251, 25.040609],
  浙江: [120.153576, 30.287459],
};

/**
 * 只带 `center` 的省份要素表。`prepareDestinationCards` 的锚点分支只用到
 * `findProvinceFeature` 的省名匹配与 `feature.center`，几何体不参与计算，
 * 所以这里给一个空多边形；省名匹配（全名/短名/带后缀）沿用产品实现。
 */
const PROVINCE_ANCHOR_FEATURES: MapFeature[] = Object.entries(PROVINCE_CENTER_COORDINATES)
  .map(([shortName, center]) => ({
    type: "Feature" as const,
    id: shortName,
    name: shortName,
    shortName,
    center,
    geometry: { type: "Polygon" as const, coordinates: [] },
  }));

/**
 * 全量省份要素在 d3 `geoMercator().scale(150).translate([0, 0])` 下的投影包围盒。
 * `folded` 对应 `collapseSouthChinaSea`：南海诸岛折进右下角小图后，主图南边界
 * 抬到 `SOUTH_SEA_LAT_THRESHOLD`（北纬 18.15°），整幅图的适配比例随之改变。
 */
const CHINA_PROJECTED_BOUNDS = {
  open: { left: 192.4287, right: 353.6796, top: -166.6915, bottom: -10.0176 },
  folded: { left: 192.4287, right: 353.6796, top: -166.6915, bottom: -48.3141 },
} as const;

const MERCATOR_SCALE = 150;
const DEGREES_TO_RADIANS = Math.PI / 180;

/** d3 `geoMercator().scale(150).translate([0, 0])` 的点变换（y 轴向下）。 */
function projectMercator([longitude, latitude]: Position): Position {
  return [
    MERCATOR_SCALE * longitude * DEGREES_TO_RADIANS,
    -MERCATOR_SCALE * Math.log(Math.tan(Math.PI / 4 + (latitude * DEGREES_TO_RADIANS) / 2)),
  ];
}

/**
 * 复刻 MapLayer 的 `fitFeatureProjection(mainland, [[0, 0], [width, height]])`。
 *
 * d3 的 `fitExtent` 只做等比缩放 + 居中，缩放比与位移完全由要素集合的投影包围盒
 * 决定；包围盒是常量，于是整个投影退化成一个闭式仿射变换，不需要要素几何。
 */
function fitMapProjection(map: Pick<MapSettings, "width" | "height" | "collapseSouthChinaSea">) {
  const bounds = map.collapseSouthChinaSea === true ? CHINA_PROJECTED_BOUNDS.folded : CHINA_PROJECTED_BOUNDS.open;
  const scale = Math.min(map.width / (bounds.right - bounds.left), map.height / (bounds.bottom - bounds.top));
  const offsetX = (map.width - scale * (bounds.left + bounds.right)) / 2;
  const offsetY = (map.height - scale * (bounds.top + bounds.bottom)) / 2;
  return (coordinate: Position): Position => {
    const [x, y] = projectMercator(coordinate);
    return [scale * x + offsetX, scale * y + offsetY];
  };
}

/**
 * 用产品渲染同一套测量函数（prepareDestinationCards）计算每张目的地卡的真实
 * 宽高，以及它在地图上的省份锚点。
 *
 * 卡片宽高只依赖学生分组、字段换行与排版设置，与地理数据无关。锚点则用
 * {@link PROVINCE_CENTER_COORDINATES} + {@link fitMapProjection} 复刻渲染层的
 * 墨卡托投影：不解析 geojson，也不再把所有卡片压到地图中心。认不出的省份
 * （海外、自定义省名）仍按产品实现回落到地图中心——地图围绕自身中心缩放，
 * 中心是缩放不动点。
 */
export function estimateDestinationCardLayouts(project: ProjectDocument): PreparedDestinationCard[] {
  // 与 poster-card-placement 的渲染门槛一致：这两种情形画布上不渲染目的地卡。
  if (project.cards.visibleFields.length === 0 || project.dataView === "pins") return [];
  const templates = project.cards.expressionTemplates ?? DEFAULT_CARD_EXPRESSION_TEMPLATES;
  return prepareDestinationCards({
    groups: buildLayoutGroups(project.students, project.cards.grouping),
    cards: project.cards,
    expressionTemplates: { title: templates.title, city: templates.city, row: templates.row },
    features: PROVINCE_ANCHOR_FEATURES,
    projection: fitMapProjection(project.map),
    // 兜底几何路径用不到（闭式投影恒返回有限值），给地图中心与省份缺失时同解。
    centroid: () => [project.map.width / 2, project.map.height / 2],
    map: project.map,
    canvasWidth: project.canvas.width,
    safeMargin: project.canvas.safeMargin,
    horizontalPadding: resolveMeasureHorizontalPadding(project.cards),
    lineHeightMultiplier: project.canvas.lineHeight ?? 1,
    noWrapFieldSet: new Set(project.cards.noWrapFields ?? []),
  });
}

/**
 * 锚点端的裁剪与豁免半径都住在 `connector-geometry`（引线几何的自然归属地），
 * 这里转出去只是保持体检侧的既有入口。
 *
 * 每条线只裁自己那个锚点，所以省份锚点分开之后仍然成立：同省多张卡（按城市
 * 分组）逐字共用锚点，紧挨着的两个省份锚点（香港/澳门相距约 7px）也落在同一
 * 个豁免圈量级内；真正跨图幅交叉的引线离两个锚点都远，一段都不会被裁掉。
 */
export { CONNECTOR_ANCHOR_EXEMPT_RADIUS, trimSegmentsNearAnchor };

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
      // 带上出发卡与锚点，体检才能把「引线贴着自己的卡身」和「共锚点花束」从
      // 穿卡判定里摘出去，只留下真正压过别人卡片的那一类。
      connectors.push({
        id: `connector-${key}`,
        cardId: key,
        anchor,
        segments,
        visible: project.cards.connectorWidth > 0,
      });
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
