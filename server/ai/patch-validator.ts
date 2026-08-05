export type SceneDomain = "canvas" | "map" | "province" | "cards" | "guests" | "text" | "asset";

/** SceneDocument 各域允许由 Agent 修改的顶层属性。 */
export const SCENE_DOMAIN_PROPS: Record<SceneDomain, readonly string[]> = {
  canvas: [
    "width", "height", "safeMargin", "backgroundColor", "backgroundImageSrc",
    "backgroundFit", "backgroundOpacity", "lineHeight",
  ],
  map: [
    "x", "y", "width", "height", "scale", "zIndex", "opacity", "landColor",
    "activeColor", "edgeColor", "edgeStyle", "edgeWidth", "showProvinceLabels",
    "provinceLabelFontId", "provinceLabelTypography", "collapseSouthChinaSea",
    "fillMode", "heatScale", "emptyProvinceFill", "renderSource", "provinceStyles",
    "provinceTextureUniformSize",
  ],
  province: ["fill", "textureSrc", "visible", "labelFontId", "appearance"],
  cards: [
    "preset", "displayFrame", "compactLayout", "x", "y", "maxWidth", "padding",
    "horizontalPadding", "bottomPadding", "gap", "columns", "background", "opacity",
    "textColor", "fontSize", "fieldFonts", "fieldTypography", "connectorStyle",
    "connectorColor", "connectorWidth", "connectorDash", "visibleFields", "noWrapFields",
    "citySubgroups", "expressionTemplates", "nameFormat", "layoutMode", "autoBalance",
    "allowMapOverlap", "showProvinceTexture", "showCount", "zIndex",
  ],
  guests: [
    "title", "x", "y", "width", "padding", "background", "opacity", "textColor",
    "fontSize", "titleFontId", "peopleFontId", "titleTypography", "peopleTypography",
    "displayMode", "customText", "visibility", "people",
  ],
  text: [
    "role", "content", "x", "y", "fontSize", "color", "fontWeight", "fontId",
    "textAlign", "maxWidth", "visibility",
  ],
  asset: [
    "assetId", "label", "kind", "province", "x", "y", "width", "height", "rotation",
    "opacity", "zIndex", "visibility",
  ],
};

/** 普通场景补丁永远不能触碰的字段。 */
export const PROTECTED_SCENE_FIELDS: Record<SceneDomain, readonly string[]> = {
  canvas: [],
  map: [],
  province: [],
  cards: ["positions"],
  guests: [],
  text: ["id"],
  asset: ["id", "src"],
};

export interface ScenePatchError {
  domain: SceneDomain;
  unknownProps: string[];
  protectedProps: string[];
  availableProps: string[];
}

export type ScenePatchValidation =
  | { ok: true }
  | { ok: false; error: ScenePatchError };

export function isSceneDomain(value: string): value is SceneDomain {
  return Object.prototype.hasOwnProperty.call(SCENE_DOMAIN_PROPS, value);
}

export function validateScenePatch(
  domain: SceneDomain,
  patch: Record<string, unknown>,
): ScenePatchValidation {
  const writable = SCENE_DOMAIN_PROPS[domain];
  const protectedFields = PROTECTED_SCENE_FIELDS[domain];
  const keys = Object.keys(patch);
  const unknownProps = keys.filter((key) => !writable.includes(key) && !protectedFields.includes(key));
  const protectedProps = keys.filter((key) => protectedFields.includes(key));
  if (unknownProps.length === 0 && protectedProps.length === 0) return { ok: true };
  return {
    ok: false,
    error: {
      domain,
      unknownProps,
      protectedProps,
      availableProps: [...writable],
    },
  };
}
