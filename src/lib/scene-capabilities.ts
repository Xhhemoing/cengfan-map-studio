/** Shared, serializable contract for model tools, browser validation and capability discovery. */
export type SceneDomain = "canvas" | "map" | "province" | "cards" | "guests" | "text" | "asset";
export interface CapabilitySchema {
  type?: "number" | "string" | "boolean" | "object" | "array";
  enum?: readonly (string | number)[];
  properties?: Record<string, CapabilitySchema>;
  additionalProperties?: boolean | CapabilitySchema;
  items?: CapabilitySchema;
  anyOf?: CapabilitySchema[];
  required?: string[];
  minimum?: number;
  maximum?: number;
  description?: string;
}
const num = (minimum?: number, maximum?: number, unit = "px"): CapabilitySchema => ({ type: "number", minimum, maximum, description: `有限数值，单位 ${unit}；超出范围时由场景规范化并返回实际值。` });
const str: CapabilitySchema = { type: "string" };
const bool: CapabilitySchema = { type: "boolean" };
const choice = (...values: string[]): CapabilitySchema => ({ type: "string", enum: values });
const obj = (properties: Record<string, CapabilitySchema>, additionalProperties: boolean | CapabilitySchema = false): CapabilitySchema => ({ type: "object", properties, additionalProperties });
const arr = (items: CapabilitySchema): CapabilitySchema => ({ type: "array", items });
const typography = obj({ fontSize: num(8, 240), color: str });
const fields = ["title", "name", "university", "city"];
const edge = choice("solid", "dashed", "dotted", "double", "soft-glow", "stitch", "rail", "wave", "ornament", "ink");
const rect = { x: num(), y: num(), width: num(), height: num() };
const appearance = obj({ kind: choice("feature", "texture", "manual-color"), color: str, assetId: str, src: str, fit: choice("cover", "contain"), scale: num(0.1, 10, "ratio"), opacity: num(0, 1, "ratio"), overflow: bool, sizingMode: choice("province", "natural", "custom"), naturalWidth: num(1), naturalHeight: num(1), customWidth: num(1), customHeight: num(1), offsetX: num(), offsetY: num() });
const province = { fill: str, textureSrc: str, visible: bool, labelFontId: str, appearance };
export const SCENE_CAPABILITIES: Record<SceneDomain, Record<string, CapabilitySchema>> = {
  canvas: { width: num(320, 6000), height: num(320, 6000), safeMargin: num(0, 1000), backgroundColor: str, backgroundImageSrc: str, backgroundFit: choice("cover", "contain", "stretch"), backgroundOpacity: num(0, 1, "ratio"), lineHeight: num(0.8, 2.5, "ratio") },
  map: {
    ...rect, scale: num(0.1, 3, "ratio"), zIndex: num(-100, 100, "layer"), opacity: num(0, 1, "ratio"), landColor: str, activeColor: str, edgeColor: str, edgeStyle: edge, edgeWidth: num(0, 8), showProvinceLabels: bool, provinceLabelFontId: str, provinceLabelTypography: typography, collapseSouthChinaSea: bool, fillMode: choice("heat", "manual"), dataPalette: choice("single", "playful", "pastel", "muted"), shadow: bool,
    heatScale: obj({ minDepth: num(0, 999), maxDepth: num(0, 999), lowColor: str, highColor: str }), emptyProvinceFill: choice("land-color", "transparent"),
    renderSource: obj({ kind: choice("vector", "image"), assetId: str, src: str, fit: choice("cover", "contain", "stretch"), opacity: num(0, 1), composition: choice("replace", "overlay"), clipToMap: bool, zIndex: num(-1000, 1000), alignment: obj({ sourceWidth: num(), sourceHeight: num(), sourceBounds: obj(rect), ...rect, rotation: num() }) }),
    provinceStyles: obj({}, obj(province)), provinceTextureUniformSize: obj({ enabled: bool, width: num(1), height: num(1) }), mapBoundaryMargin: num(0, 240),
  },
  province,
  cards: {
    preset: choice("standard", "compact", "ticket", "photo", "borderless"), presentation: choice("standard", "color-pill", "emblem-list", "city-label", "glass-stat"), widthMode: choice("fixed", "content"), minWidth: num(80, 6000), minFontSize: num(8, 48), compactLayout: bool, x: num(), y: num(), maxWidth: num(80, 6000), padding: num(0, 120), horizontalPadding: num(0, 240), bottomPadding: num(0, 240), gap: num(0, 120), columns: { anyOf: [num(1, 20, "columns"), choice("auto")] }, background: str, opacity: num(0, 1, "ratio"), textColor: str, fontSize: num(8, 48),
    fieldFonts: obj(Object.fromEntries(fields.map(field => [field, str]))), fieldTypography: obj(Object.fromEntries(fields.map(field => [field, typography]))), connectorStyle: choice("straight", "elbow", "curve"), connectorColor: str, connectorWidth: num(0.5, 8), connectorDash: edge, visibleFields: arr(choice("name", "university", "city")), noWrapFields: arr(choice("name", "university", "city")), citySubgroups: bool, expressionTemplates: obj({ title: str, city: str, row: str }), nameFormat: str, layoutMode: choice("quadrant", "radial", "right-stack", "grid"), autoBalance: bool, allowMapOverlap: bool, showProvinceTexture: bool, showCount: bool, zIndex: num(-100, 100, "layer"),
  },
  guests: { title: str, x: num(), y: num(), width: num(120, 6000), padding: num(0, 120), background: str, opacity: num(0, 1, "ratio"), textColor: str, fontSize: num(8, 36), titleFontId: str, peopleFontId: str, titleTypography: typography, peopleTypography: typography, displayMode: choice("list", "cards"), customText: str, visibility: bool, people: arr(obj({ id: str, name: str, title: str, note: str, avatarSrc: str, fontId: str, visibility: bool })) },
  text: { role: choice("eyebrow", "title", "subtitle", "stats", "watermark", "note", "custom"), content: str, x: num(), y: num(), fontSize: num(8, 240), color: str, fontWeight: num(100, 900, "weight"), fontId: str, textAlign: choice("left", "center", "right"), maxWidth: num(40, 6000), visibility: bool },
  asset: { assetId: str, label: str, kind: str, province: str, ...rect, rotation: num(-360, 360, "degree"), opacity: num(0, 1, "ratio"), zIndex: num(-100, 100, "layer"), visibility: bool },
};
export const SCENE_DOMAIN_PROPS = Object.fromEntries(Object.entries(SCENE_CAPABILITIES).map(([domain, props]) => [domain, Object.keys(props)])) as Record<SceneDomain, string[]>;
export const PROTECTED_SCENE_FIELDS: Record<SceneDomain, readonly string[]> = {
  canvas: [], map: [], province: [], cards: ["positions", "positionPolicies", "positionSources", "styleOverrides", "grouping", "templateId", "displayFrame"], guests: [], text: ["id"], asset: ["id", "src"],
};
export interface ScenePatchError { domain: SceneDomain; unknownProps: string[]; protectedProps: string[]; availableProps: string[]; invalidValues?: string[] }
export type ScenePatchValidation = { ok: true } | { ok: false; error: ScenePatchError };
export function isSceneDomain(value: string): value is SceneDomain { return Object.hasOwn(SCENE_CAPABILITIES, value); }

/** Scene normalization handles numeric ranges; this validator rejects wrong types, enums and nested fields. */
function matchesSchema(value: unknown, schema: CapabilitySchema, depth = 0): boolean {
  if (depth > 12) return false;
  if (schema.anyOf) return schema.anyOf.some(option => matchesSchema(value, option, depth + 1));
  if (schema.enum && !schema.enum.includes(value as string)) return false;
  if (schema.type === "number") return typeof value === "number" && Number.isFinite(value);
  if (schema.type === "string") return typeof value === "string" && value.length <= 16_384;
  if (schema.type === "boolean") return typeof value === "boolean";
  if (schema.type === "array") return Array.isArray(value) && value.length <= 1000 && value.every(item => matchesSchema(item, schema.items ?? {}, depth + 1));
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    if (schema.required?.some(key => !Object.hasOwn(record, key))) return false;
    return Object.entries(record).every(([key, item]) => {
      if (["__proto__", "prototype", "constructor"].includes(key)) return false;
      const property = Object.hasOwn(schema.properties ?? {}, key) ? schema.properties![key] : schema.additionalProperties;
      return typeof property === "object" ? matchesSchema(item, property, depth + 1) : property === true;
    });
  }
  return true;
}
export function validateScenePatch(domain: SceneDomain, patch: Record<string, unknown>): ScenePatchValidation {
  const availableProps = SCENE_DOMAIN_PROPS[domain];
  const protectedProps = Object.keys(patch).filter(key => PROTECTED_SCENE_FIELDS[domain].includes(key));
  const unknownProps = Object.keys(patch).filter(key => !availableProps.includes(key) && !protectedProps.includes(key));
  const invalidValues = Object.entries(patch).filter(([key, value]) => availableProps.includes(key) && !matchesSchema(value, SCENE_CAPABILITIES[domain][key]!)).map(([key]) => key);
  return unknownProps.length + protectedProps.length + invalidValues.length === 0 ? { ok: true } : { ok: false, error: { domain, unknownProps, protectedProps, availableProps, invalidValues } };
}
export function scenePatchSchema(domain: SceneDomain): CapabilitySchema { return obj(SCENE_CAPABILITIES[domain]); }
