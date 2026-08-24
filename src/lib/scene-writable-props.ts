/**
 * Agent 可写场景属性的单一来源。
 *
 * 服务端校验（server/ai/patch-validator.ts）与前端会话（src/lib/agent-session.ts）
 * 历史上各存一份同名副本，字段一旦只加一侧就会出现「检查器能改、AI 报 PATCH_REJECTED」。
 * 新增可写字段只改这里。
 */
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
    // 检查器「多彩配色 / 地图投影 / 地图边界安全距离」对应的 MapSettings 字段。
    "dataPalette", "shadow", "mapBoundaryMargin",
  ],
  province: ["fill", "textureSrc", "visible", "labelFontId", "appearance"],
  cards: [
    "preset", "displayFrame", "compactLayout", "x", "y", "maxWidth", "padding",
    "horizontalPadding", "bottomPadding", "gap", "columns", "background", "opacity",
    "textColor", "fontSize", "fieldFonts", "fieldTypography", "connectorStyle",
    "connectorColor", "connectorWidth", "connectorDash", "visibleFields", "noWrapFields",
    "citySubgroups", "expressionTemplates", "nameFormat", "layoutMode", "autoBalance",
    "allowMapOverlap", "showProvinceTexture", "showCount", "zIndex",
    // 检查器「语义风格」对应的 CardSettings.presentation。
    "presentation",
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
