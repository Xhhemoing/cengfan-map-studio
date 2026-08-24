import type { MapRenderSource, MapSettings, ProvinceStyle, SceneDocument } from "./scene-document";
import {
  asRecord,
  clamp,
  finiteNumber,
  getEdgeStyle,
  positiveNumber,
  type MigrationContext,
} from "./project-migration-helpers";

function getProvinceAppearance(value: unknown): ProvinceStyle["appearance"] {
  const appearance = asRecord(value);
  if (!appearance) return undefined;
  if (appearance.kind === "manual-color" && typeof appearance.color === "string") {
    return { kind: "manual-color", color: appearance.color };
  }
  if (
    (appearance.kind !== "feature" && appearance.kind !== "texture")
    || typeof appearance.assetId !== "string"
    || typeof appearance.src !== "string"
  ) {
    return undefined;
  }

  const scaleValue = typeof appearance.scale === "number" && Number.isFinite(appearance.scale)
    ? Math.min(2.5, Math.max(0.3, appearance.scale))
    : undefined;
  const opacityValue = typeof appearance.opacity === "number" && Number.isFinite(appearance.opacity)
    ? Math.min(1, Math.max(0, appearance.opacity))
    : undefined;
  const naturalWidth = positiveNumber(appearance.naturalWidth);
  const naturalHeight = positiveNumber(appearance.naturalHeight);
  const customWidth = positiveNumber(appearance.customWidth);
  const customHeight = positiveNumber(appearance.customHeight);
  const offsetX = appearance.offsetX !== undefined ? finiteNumber(appearance.offsetX, 0) : undefined;
  const offsetY = appearance.offsetY !== undefined ? finiteNumber(appearance.offsetY, 0) : undefined;
  const sizingMode = appearance.sizingMode === "natural" || appearance.sizingMode === "custom"
    ? appearance.sizingMode
    : "province";

  return {
    kind: appearance.kind,
    assetId: appearance.assetId,
    src: appearance.src,
    // Prefer complete display by default for new/legacy unspecified fits.
    fit: appearance.fit === "cover" ? "cover" : "contain",
    ...(scaleValue !== undefined ? { scale: scaleValue } : {}),
    ...(opacityValue !== undefined ? { opacity: opacityValue } : {}),
    ...(appearance.overflow === true ? { overflow: true } : {}),
    sizingMode,
    ...(naturalWidth !== undefined ? { naturalWidth } : {}),
    ...(naturalHeight !== undefined ? { naturalHeight } : {}),
    ...(customWidth !== undefined ? { customWidth } : {}),
    ...(customHeight !== undefined ? { customHeight } : {}),
    ...(offsetX !== undefined ? { offsetX } : {}),
    ...(offsetY !== undefined ? { offsetY } : {}),
  };
}

export function getProvinceStyles(value: unknown): Record<string, ProvinceStyle> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, provinceValue]) => {
      const record = asRecord(provinceValue);
      if (!record) return [key, {}];
      const style: ProvinceStyle = {};
      if (typeof record.fill === "string") style.fill = record.fill;
      if (typeof record.textureSrc === "string") style.textureSrc = record.textureSrc;
      if (typeof record.visible === "boolean") style.visible = record.visible;
      if (typeof record.labelFontId === "string" && record.labelFontId) style.labelFontId = record.labelFontId;
      const appearance = getProvinceAppearance(record.appearance);
      if (appearance) style.appearance = appearance;
      return [key, style];
    }),
  );
}

export function getProvinceTextureUniformSize(value: unknown) {
  const record = asRecord(value);
  return {
    enabled: record?.enabled === true,
    width: clamp(record?.width, 1, 2000, 100),
    height: clamp(record?.height, 1, 2000, 80),
  };
}

export function getMapRenderSource(value: unknown): MapRenderSource {
  const source = asRecord(value);
  if (
    source?.kind === "image"
    && typeof source.assetId === "string"
    && typeof source.src === "string"
    && source.src.length > 0
  ) {
    const alignmentRecord = asRecord(source.alignment);
    const bounds = asRecord(alignmentRecord?.sourceBounds);
    const alignment = alignmentRecord
      ? {
          sourceWidth: Math.max(1, finiteNumber(alignmentRecord.sourceWidth, 1)),
          sourceHeight: Math.max(1, finiteNumber(alignmentRecord.sourceHeight, 1)),
          sourceBounds: {
            x: clamp(bounds?.x, 0, 1, 0),
            y: clamp(bounds?.y, 0, 1, 0),
            width: clamp(bounds?.width, 0.001, 1, 1),
            height: clamp(bounds?.height, 0.001, 1, 1),
          },
          x: finiteNumber(alignmentRecord.x, 0),
          y: finiteNumber(alignmentRecord.y, 0),
          width: Math.max(0.001, finiteNumber(alignmentRecord.width, 1)),
          height: Math.max(0.001, finiteNumber(alignmentRecord.height, 1)),
          rotation: finiteNumber(alignmentRecord.rotation, 0),
        }
      : undefined;
    return {
      kind: "image",
      assetId: source.assetId,
      src: source.src,
      fit: source.fit === "contain" || source.fit === "stretch" ? source.fit : "cover",
      opacity: clamp(source.opacity, 0, 1, 1),
      composition: source.composition === "overlay" ? "overlay" : "replace",
      clipToMap: source.clipToMap === true,
      zIndex: clamp(source.zIndex, -1000, 1000, 25),
      ...(alignment ? { alignment } : {}),
    };
  }
  return { kind: "vector" };
}

/** Legacy drafts kept the map scale in the compatibility `style` block instead of the map settings. */
function getMapScale(context: MigrationContext, mapInput: ReturnType<typeof asRecord>): number {
  const { defaults, isV2, style } = context;
  const hasCanonicalMapScale = isV2 && mapInput?.scale !== undefined && mapInput.scale !== defaults.map.scale;
  return clamp(
    hasCanonicalMapScale ? mapInput?.scale : style.mapScale ?? mapInput?.scale,
    0.1,
    3,
    defaults.map.scale,
  );
}

export function migrateMapSettings(context: MigrationContext): SceneDocument["map"] {
  const { defaults, isV2, payload } = context;
  const mapInput = asRecord(payload.map);
  return {
    ...defaults.map,
    ...(isV2 && mapInput ? mapInput as Partial<MapSettings> : {}),
    ...(isV2 ? {} : { x: 350, y: 120, width: 800, height: 690 }),
    scale: getMapScale(context, mapInput),
    edgeStyle: isV2 && mapInput ? getEdgeStyle(mapInput.edgeStyle) : defaults.map.edgeStyle,
    edgeWidth: isV2 && mapInput ? clamp(mapInput.edgeWidth, 0, 20, defaults.map.edgeWidth ?? 1) : defaults.map.edgeWidth ?? 1,
    showProvinceLabels: isV2 && mapInput ? mapInput.showProvinceLabels !== false : defaults.map.showProvinceLabels,
    collapseSouthChinaSea: isV2 && mapInput?.collapseSouthChinaSea === true,
    fillMode: isV2 && mapInput?.fillMode === "manual" ? "manual" : "heat",
    emptyProvinceFill: isV2 && mapInput?.emptyProvinceFill === "transparent" ? "transparent" : "land-color",
    renderSource: isV2 ? getMapRenderSource(mapInput?.renderSource) : { kind: "vector" },
    provinceStyles: isV2 && mapInput ? getProvinceStyles(mapInput.provinceStyles) : defaults.map.provinceStyles,
    provinceTextureUniformSize: isV2
      ? getProvinceTextureUniformSize(mapInput?.provinceTextureUniformSize)
      : defaults.map.provinceTextureUniformSize,
  };
}
