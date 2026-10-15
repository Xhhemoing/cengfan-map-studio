import type { ProjectDocument } from "./project-document";
import type { LayoutHealthInput, LayoutHealthIssue } from "./layout-health";
import type { ResolvedSceneInput, ResolvedSceneCard } from "./resolved-scene";
import { sceneTextBounds } from "./resolved-scene-geometry";
import { computeGuestPanelLayout } from "./guest-panel-layout";
import { CANVAS_LAYER_Z } from "./scene-document";
import { buildConnectorGeometry } from "./connector-geometry";
import { diagnoseCardTypography } from "./card-typography-diagnostics";

/**
 * Typography is part of the resolved scene health result, alongside bounds and
 * connectors. Canvas compilation normally supplies the already measured issues
 * on `input`; custom/Worker snapshots can omit them, in which case we still
 * run the deterministic fallback and mark its source as estimated.
 */
export function resolvedSceneTypographyIssues(
  project: ProjectDocument,
  input: ResolvedSceneInput,
  cards: ResolvedSceneCard[],
): LayoutHealthIssue[] {
  return input.typographyIssues ?? diagnoseCardTypography(project, cards, {
    // A serializable scene carries the status for its already prepared
    // geometry, but without the original measure callback we cannot prove a
    // newly generated diagnostic used Canvas. Be conservative and expose the
    // fallback as estimated rather than claiming a browser measurement.
    measurementStatus: "estimated",
    fontRevision: input.fontRevision,
  });
}

export function resolvedSceneHealthInput(project: ProjectDocument, input: ResolvedSceneInput, cards: ResolvedSceneCard[]): LayoutHealthInput {
  // A background image changes the effective backdrop behind canvas text; its
  // pixels are not represented by the solid-color health model, so contrast
  // must remain unknown instead of comparing against the nominal canvas color.
  const knownCanvasBackground = project.canvas.backgroundImageSrc && project.canvas.backgroundOpacity > 0
    ? undefined
    : project.canvas.backgroundColor;
  const connectors = cards.flatMap((card) => {
    const settings = card.resolvedSettings ?? project.cards;
    if (!card.isInternational && settings.preset === "borderless" && settings.opacity < 0.9) return [];
    const geometry = buildConnectorGeometry({ card: card.placement, anchor: { x: card.anchorX, y: card.anchorY }, preferredSide: card.placement.side, style: settings.connectorStyle });
    return [{ id: `connector:${card.group.key}`, ownerId: card.group.key, segments: geometry.segments }];
  });
  return {
    canvas: project.canvas, connectors,
    objects: [
      { id: "map", kind: "map", zIndex: project.map.zIndex ?? CANVAS_LAYER_Z.map, bounds: input.mapVisualBounds ?? input.bounds.map },
      ...cards.map((card) => {
        const settings = card.resolvedSettings ?? project.cards;
        return {
          id: card.group.key,
          kind: "card" as const,
          zIndex: project.cards.zIndex ?? CANVAS_LAYER_Z.cards,
          bounds: card.placement,
          // Keep card contrast checks grounded in the actual effective surface
          // style. The health checker deliberately skips translucent surfaces,
          // because their map backdrop is not a known solid color.
          content: card.group.title,
          textColor: settings.textColor,
          backgroundColor: settings.background,
          opacity: settings.opacity,
        };
      }),
      ...(project.guests.visibility ? [{ id: "guests", kind: "guests" as const, zIndex: CANVAS_LAYER_Z.guests, bounds: { x: project.guests.x, y: project.guests.y, width: project.guests.width, height: computeGuestPanelLayout(project.guests, project.canvas.lineHeight ?? 1).height } }] : []),
      ...project.textElements.map((text) => ({ id: text.id, kind: "text" as const, zIndex: CANVAS_LAYER_Z.texts, bounds: sceneTextBounds(text), visible: text.visibility && Boolean(text.content.trim()), content: text.content, textColor: text.color, backgroundColor: knownCanvasBackground })),
      ...project.assetElements.map((asset) => ({ id: asset.id, kind: "asset" as const, zIndex: asset.zIndex, bounds: { x: asset.x, y: asset.y, width: asset.width, height: asset.height }, visible: asset.visibility })),
    ],
  };
}
