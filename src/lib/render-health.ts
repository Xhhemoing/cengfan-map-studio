/**
 * 渲染真值 · 健康检查层。
 *
 * `check_health` 的输入必须来自渲染真值：逐卡真实尺寸、随 textAlign 校正的文本框、
 * 真实嘉宾面板高度，以及与画布同源的连接线，否则模型看到的问题清单是估算出来的。
 */
import { buildConnectorGeometry } from "./connector-geometry";
import type { LayoutHealthConnector, LayoutHealthInput, LayoutHealthObject } from "./layout-health";
import type { ProjectDocument } from "./project-document";
import { buildRenderFacts, effectiveCardPlacement, type RenderFacts } from "./render-facts";
import { computeGuestPanelMetrics, textElementBounds } from "./render-geometry";
import { CANVAS_LAYER_Z } from "./scene-document";

export function buildHealthInput(
  project: ProjectDocument,
  facts: RenderFacts = buildRenderFacts(project),
): LayoutHealthInput {
  const placements = new Map(facts.placements.map((placement) => [placement.id, placement]));
  const guestHeight = computeGuestPanelMetrics(project.guests, project.canvas.lineHeight ?? 1).height;
  // 卡片 bounds 用求解位置，positionKey 让 cardsPositions 里的手动位置覆盖它，
  // 与画布「手动位置优先」的渲染规则一致。
  const cardObjects: LayoutHealthObject[] = facts.cards.flatMap((fact) => {
    const placement = placements.get(fact.group.key);
    return placement ? [{
      id: fact.group.key,
      kind: "card" as const,
      zIndex: project.cards.zIndex ?? CANVAS_LAYER_Z.cards,
      bounds: { x: placement.x, y: placement.y, width: placement.width, height: placement.height },
      positionKey: fact.group.key,
    }] : [];
  });
  // 与 PosterCanvas 一致：无边框卡片在填充过淡时整条连线不画，
  // 这里也必须省略，否则模型会为画布上不存在的连线报 connector-conflict。
  const connectorsHidden = project.cards.preset === "borderless" && (project.cards.opacity ?? 1) < 0.9;
  const connectors: LayoutHealthConnector[] = connectorsHidden ? [] : facts.cards.flatMap((fact) => {
    const placement = placements.get(fact.group.key);
    if (!placement || fact.isInternational) return [];
    return [{
      id: fact.group.key,
      segments: buildConnectorGeometry({
        card: effectiveCardPlacement(project, placement),
        anchor: { x: fact.anchorX, y: fact.anchorY },
        style: project.cards.connectorStyle,
        preferredSide: placement.side,
      }).segments,
    }];
  });
  const objects: LayoutHealthObject[] = [
    { id: "map", kind: "map", zIndex: project.map.zIndex ?? CANVAS_LAYER_Z.map, bounds: facts.geometry.mapContentBounds },
    ...cardObjects,
    ...(project.guests.visibility === false ? [] : [{
      id: "guests",
      kind: "guests" as const,
      zIndex: CANVAS_LAYER_Z.guests,
      bounds: { x: project.guests.x, y: project.guests.y, width: project.guests.width, height: guestHeight },
    }]),
    ...project.textElements.map((text) => ({
      id: text.id,
      kind: "text" as const,
      zIndex: CANVAS_LAYER_Z.texts,
      bounds: textElementBounds(text),
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
  return {
    canvas: { width: project.canvas.width, height: project.canvas.height, safeMargin: project.canvas.safeMargin },
    objects,
    connectors,
    cardsPositions: project.cards.positions,
    // 省份轮廓与求解器避让用的是同一批多边形，遮挡判定因此和画布上看到的一致；
    // 图片底图没有轮廓（空数组），健康检查自动退回 mapContentBounds。
    mapPolygons: facts.geometry.provincePolygons,
    allowMapOverlap: project.cards.allowMapOverlap === true,
  };
}
