import { CARD_TEMPLATE_VISUAL_DEFAULTS } from "./card-templates";
import type { ProjectDocument } from "./project-document";
import type { CanvasText, CardSettings, MapSettings, ProvinceStyle, SceneDocument } from "./scene-document";
import type { TemplateDocument } from "./template-document";
import type { CustomTemplateRecord } from "./template-store";

function pick<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(keys.map((key) => [key, structuredClone(value[key])])) as Pick<T, K>;
}

const MAP_PAINT_KEYS = [
  "opacity", "landColor", "activeColor", "edgeColor", "edgeStyle", "edgeWidth", "provinceLabelFontId",
  "provinceLabelTypography", "fillMode", "dataPalette", "shadow", "heatScale", "emptyProvinceFill",
] as const satisfies readonly (keyof MapSettings)[];

/** Copy province paint, retaining target visibility and texture placement. */
function provincePaint(current: MapSettings, source: MapSettings): MapSettings["provinceStyles"] {
  const result = structuredClone(current.provinceStyles ?? {});
  for (const [province, style] of Object.entries(source.provinceStyles ?? {})) {
    const target = result[province] ?? {};
    const appearance = style.appearance;
    let nextAppearance: ProvinceStyle["appearance"] = appearance;
    if (appearance && appearance.kind !== "manual-color") {
      const targetAppearance = target.appearance;
      nextAppearance = {
        ...pick(appearance, ["kind", "assetId", "src", "fit", "opacity"]),
        ...(targetAppearance && targetAppearance.kind !== "manual-color"
          ? pick(targetAppearance, ["scale", "overflow", "sizingMode", "naturalWidth", "naturalHeight", "customWidth", "customHeight", "offsetX", "offsetY"])
          : {}),
      };
    }
    result[province] = { ...target, ...pick(style, ["fill", "textureSrc", "labelFontId"]), appearance: structuredClone(nextAppearance) };
  }
  return result;
}

/** Source text is only a role-based style reference; ids, wording and placement belong to the project. */
function styleTexts(current: CanvasText[], source: CanvasText[]): CanvasText[] {
  return current.map((text) => {
    const reference = source.find((candidate) => candidate.role === text.role);
    return reference ? { ...text, ...pick(reference, ["fontSize", "fontWeight", "fontId", "color"]) } : text;
  });
}

function visualScene(project: ProjectDocument, source: SceneDocument): ProjectDocument {
  const visualCardKeys = Object.keys(CARD_TEMPLATE_VISUAL_DEFAULTS) as (keyof typeof CARD_TEMPLATE_VISUAL_DEFAULTS)[];
  return {
    ...project,
    canvas: { ...project.canvas, ...pick(source.canvas, ["backgroundColor", "backgroundImageSrc", "backgroundFit", "backgroundOpacity", "lineHeight"]) },
    map: { ...project.map, ...pick(source.map, MAP_PAINT_KEYS), provinceStyles: provincePaint(project.map, source.map) },
    cards: {
      ...project.cards,
      ...pick(source.cards, visualCardKeys),
      ...pick(source.cards, ["templateId", "connectorColor", "connectorWidth"]),
      displayFrame: undefined,
    },
    guests: {
      ...project.guests,
      ...pick(source.guests, ["background", "opacity", "textColor", "fontSize", "titleFontId", "peopleFontId", "titleTypography", "peopleTypography"]),
    },
    textElements: styleTexts(project.textElements, source.textElements),
  };
}

function legacyVisual(project: ProjectDocument, source: TemplateDocument): ProjectDocument {
  const compact = source.cards.preset === "compact";
  const cards: CardSettings = {
    ...project.cards,
    ...CARD_TEMPLATE_VISUAL_DEFAULTS,
    preset: source.cards.preset,
    compactLayout: compact,
    padding: source.cards.padding,
    horizontalPadding: source.cards.padding,
    bottomPadding: source.cards.padding,
    background: source.cards.background,
    textColor: source.cards.textColor,
    connectorStyle: source.connectors.style === "line" ? "straight" : source.connectors.style === "polyline" ? "elbow" : "curve",
    connectorColor: source.connectors.color,
    connectorWidth: source.connectors.width,
    connectorDash: source.connectors.dashed ? "dashed" : "solid",
    templateId: undefined,
    displayFrame: undefined,
  };
  return {
    ...project,
    canvas: { ...project.canvas, backgroundColor: source.background.color, backgroundImageSrc: source.background.imageSrc, backgroundOpacity: source.background.opacity },
    map: {
      ...project.map,
      ...pick(source.map, ["landColor", "activeColor", "edgeColor", "edgeStyle", "edgeWidth", "fillMode", "emptyProvinceFill"]),
      provinceStyles: provincePaint(project.map, { ...project.map, provinceStyles: source.map.provinceStyles }),
    },
    cards,
  };
}

function legacyLayout(project: ProjectDocument, source: TemplateDocument): ProjectDocument {
  const visual = legacyVisual(project, source);
  return {
    ...visual,
    map: { ...visual.map, x: source.map.offsetX, y: source.map.offsetY, scale: source.map.scale, showProvinceLabels: source.map.showProvinceLabels },
    cards: { ...visual.cards, grouping: source.cards.grouping, maxWidth: source.cards.maxWidth, visibleFields: [...source.visibleFields] },
    style: { ...visual.style, regionalAssets: structuredClone(source.regionalAssets) },
  };
}

/** The saved scope is the application contract, including for older records containing a full scene. */
export function applySavedTemplate(project: ProjectDocument, template: CustomTemplateRecord): ProjectDocument {
  let result: ProjectDocument;
  if (template.scope === "visual") {
    result = template.scene ? visualScene(project, template.scene) : legacyVisual(project, template.document);
  } else if (template.scene) {
    const scene = structuredClone(template.scene);
    result = { ...project, ...scene, guests: scene.guests ?? project.guests };
  } else {
    result = legacyLayout(project, template.document);
  }
  const grouping = result.cards.grouping;
  return {
    ...result,
    templateId: template.baseTemplateId,
    dataView: template.scope === "visual" ? project.dataView : grouping,
    style: {
      ...result.style,
      cardPreset: result.cards.preset,
      mapScale: result.map.scale,
      backgroundColor: result.canvas.backgroundColor,
      backgroundImageSrc: result.canvas.backgroundImageSrc,
      visibleFields: [...result.cards.visibleFields],
    },
  };
}
