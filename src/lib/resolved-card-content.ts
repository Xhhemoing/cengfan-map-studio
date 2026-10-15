import type { ProjectDocument } from "./project-document";
import { buildLayoutGroups, type LayoutGroup } from "./layout";
import { getVisibleStudents } from "./project-data";
import { buildPreparedCardContents, resolveCardAnchor, type PreparedCard, type PreparedCardContent } from "./prepared-card-content";
import { DEFAULT_CARD_EXPRESSION_TEMPLATES } from "./card-expression";
import { deriveFixedDisplayFrameFromCardSettings, normalizeDisplayFrame } from "./display-frame";
import { destinationCardHeaderOffset } from "./destination-card-metrics";
import { resolveCardSettings } from "./card-settings-scope";
import { findProvinceFeature, getChinaMapFeatures } from "./map-data";
import type { resolveSceneMapGeometry } from "./resolved-scene-geometry";
import type { CardSettings } from "./scene-document";
import type { SceneTextOptions } from "./scene-text-measurement";

function prepareGroups(project: ProjectDocument, cards: CardSettings, groups: LayoutGroup[], text: SceneTextOptions): PreparedCardContent[] {
  const frame = cards.displayFrame === undefined ? deriveFixedDisplayFrameFromCardSettings(cards) : normalizeDisplayFrame(cards.displayFrame);
  const body = frame.fixed.items.find((item) => item.id === "name") ?? frame.fixed.items[0];
  return buildPreparedCardContents({
    groups, grouping: cards.grouping, visibleFields: cards.visibleFields,
    citySubgroups: cards.citySubgroups !== false,
    expressionTemplates: cards.expressionTemplates ?? DEFAULT_CARD_EXPRESSION_TEMPLATES,
    nameFormat: cards.nameFormat, fontSize: cards.fontSize, fieldTypography: cards.fieldTypography,
    fieldFonts: cards.fieldFonts, userFonts: text.userFonts, measureText: text.measureText,
    compactLayout: cards.compactLayout === true || cards.preset === "compact", maxWidth: cards.maxWidth,
    widthMode: cards.widthMode, minWidth: cards.minWidth, minFontSize: cards.minFontSize,
    horizontalPadding: frame.mode === "fixed" ? body?.x ?? cards.horizontalPadding ?? cards.padding : frame.style.padding,
    bottomPadding: cards.bottomPadding ?? cards.padding, topPadding: cards.displayFrame === undefined ? cards.padding : undefined, showProvinceTexture: cards.showProvinceTexture === true,
    headerOffset: destinationCardHeaderOffset(cards.preset), noWrapFields: new Set(cards.noWrapFields ?? []),
    lineHeightMultiplier: project.canvas.lineHeight ?? 1, canvasWidth: project.canvas.width,
    safeMargin: project.canvas.safeMargin, presentation: cards.presentation, showCount: cards.showCount,
  });
}

/** Content preparation is independent from geography, so map gestures do not rewrap text. */
export function buildProjectCardContents(project: ProjectDocument, suppliedGroups?: LayoutGroup[], text: SceneTextOptions = {}): PreparedCardContent[] {
  if (project.dataView === "pins") return [];
  const groups = suppliedGroups ?? buildLayoutGroups(getVisibleStudents(project.students), project.cards.grouping);
  if (!project.cards.styleOverrides || Object.keys(project.cards.styleOverrides).length === 0) {
    return project.cards.visibleFields.length === 0 ? [] : prepareGroups(project, project.cards, groups, text);
  }
  return groups.flatMap((group) => {
    const settings = resolveCardSettings(project.cards, group.key);
    if (settings.visibleFields.length === 0) return [];
    return prepareGroups(project, settings, [group], text).map((card) => ({ ...card, resolvedSettings: settings }));
  });
}

export function anchorProjectCards(
  project: ProjectDocument,
  contents: PreparedCardContent[],
  geometry: Pick<ReturnType<typeof resolveSceneMapGeometry>, "projection" | "mapPath">,
): PreparedCard[] {
  const features = getChinaMapFeatures();
  const anchors = new Map<string, ReturnType<typeof resolveCardAnchor>>();
  return contents.map((content) => {
    let anchor = anchors.get(content.province);
    if (!anchor) {
      const feature = findProvinceFeature(features, content.province);
      const center = feature ? geometry.projection(feature.center) : null;
      const point = center?.every(Number.isFinite) ? center : feature ? geometry.mapPath.centroid(feature as never) : [project.map.width / 2, project.map.height / 2];
      anchor = resolveCardAnchor(point, project.map);
      anchors.set(content.province, anchor);
    }
    return { ...content, ...anchor };
  });
}
