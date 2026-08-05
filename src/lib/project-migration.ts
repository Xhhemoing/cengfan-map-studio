import type { ProjectSnapshot } from "./project-document";
import { resolveCity } from "./search-catalog";
import {
  createDefaultScene,
  normalizeScene,
  type AssetElement,
  type CanvasText,
  type CanvasTextRole,
  type ProvinceStyle,
  type MapRenderSource,
  type TextAlign,
} from "./scene-document";
import type { DataViewId, MapTemplateId, Student } from "./project-data";
import type { CardGrouping, CardPreset, VisibleField } from "./template-document";
import { normalizeEdgeStyle, type EdgeStyle } from "./edge-styles";
import { normalizeDisplayFrame } from "./display-frame";

export interface ProvincePosition {
  x: number;
  y: number;
}

export interface ProjectMigrationOptions {
  provincePositions?: Record<string, ProvincePosition>;
}

type UnknownRecord = Record<string, unknown>;

const TEMPLATE_IDS: MapTemplateId[] = ["original", "cartoon", "grain", "q", "scenery", "regional"];
const DATA_VIEW_IDS: DataViewId[] = ["province", "pins", "heat", "city", "university"];
const LEGACY_DATA_VIEW_ALIASES: Record<string, DataViewId> = { student: "province" };
const CARD_PRESETS: CardPreset[] = ["standard", "compact", "ticket", "photo", "borderless"];
const CARD_GROUPINGS: CardGrouping[] = ["province", "city", "university"];
const LEGACY_CARD_GROUPING_ALIASES: Record<string, CardGrouping> = { student: "province" };
const VISIBLE_FIELDS: VisibleField[] = ["name", "university", "city"];
const TEXT_ROLES: CanvasTextRole[] = [
  "eyebrow",
  "title",
  "subtitle",
  "stats",
  "watermark",
  "note",
  "custom",
];
const BUILT_IN_TEXT_IDS = new Set([
  "text-eyebrow",
  "text-title",
  "text-subtitle",
  "text-stats",
  "text-watermark",
  "text-note",
]);

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(maximum, Math.max(minimum, numeric)) : fallback;
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function getEdgeStyle(value: unknown): EdgeStyle {
  return normalizeEdgeStyle(value, "solid");
}

function getProvinceStyles(value: unknown): Record<string, ProvinceStyle> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, provinceValue]) => {
      if (!provinceValue || typeof provinceValue !== "object" || Array.isArray(provinceValue)) return [key, {}];
      const record = provinceValue as Record<string, unknown>;
      const style: ProvinceStyle = {};
      if (typeof record.fill === "string") style.fill = record.fill;
      if (typeof record.textureSrc === "string") style.textureSrc = record.textureSrc;
      if (typeof record.visible === "boolean") style.visible = record.visible;
      if (typeof record.labelFontId === "string" && record.labelFontId) style.labelFontId = record.labelFontId;
      const appearance = asRecord(record.appearance);
      if (appearance?.kind === "manual-color" && typeof appearance.color === "string") {
        style.appearance = { kind: "manual-color", color: appearance.color };
      }
      if (
        (appearance?.kind === "feature" || appearance?.kind === "texture")
        && typeof appearance.assetId === "string"
        && typeof appearance.src === "string"
      ) {
        const scaleValue = typeof appearance.scale === "number" && Number.isFinite(appearance.scale)
          ? Math.min(2.5, Math.max(0.3, appearance.scale))
          : undefined;
        const opacityValue = typeof appearance.opacity === "number" && Number.isFinite(appearance.opacity)
          ? Math.min(1, Math.max(0, appearance.opacity))
          : undefined;
        const positiveSize = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0
          ? value
          : undefined;
        const naturalWidth = positiveSize(appearance.naturalWidth);
        const naturalHeight = positiveSize(appearance.naturalHeight);
        const customWidth = positiveSize(appearance.customWidth);
        const customHeight = positiveSize(appearance.customHeight);
        const offsetX = appearance.offsetX !== undefined
          ? (typeof appearance.offsetX === "number" && Number.isFinite(appearance.offsetX) ? appearance.offsetX : 0)
          : undefined;
        const offsetY = appearance.offsetY !== undefined
          ? (typeof appearance.offsetY === "number" && Number.isFinite(appearance.offsetY) ? appearance.offsetY : 0)
          : undefined;
        const sizingMode = appearance.sizingMode === "natural" || appearance.sizingMode === "custom"
          ? appearance.sizingMode
          : "province";
        style.appearance = {
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
      return [key, style];
    }),
  );
}

function getProvinceTextureUniformSize(value: unknown) {
  const record = asRecord(value);
  return {
    enabled: record?.enabled === true,
    width: clamp(record?.width, 1, 2000, 100),
    height: clamp(record?.height, 1, 2000, 80),
  };
}

function getMapRenderSource(value: unknown): MapRenderSource {
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

function uniqueFields(value: unknown, fallback: VisibleField[]): VisibleField[] {
  if (!Array.isArray(value)) return [...fallback];
  const fields = value.filter((item): item is VisibleField => isOneOf(item, VISIBLE_FIELDS));
  return fields.length > 0 ? [...new Set(fields)] : [...fallback];
}

function migrateNoWrapFields(value: unknown): VisibleField[] {
  if (!Array.isArray(value)) return [];
  return VISIBLE_FIELDS.filter((field) => value.includes(field));
}

function getTemplateId(payload: UnknownRecord): MapTemplateId {
  const value = payload.templateId ?? payload.template;
  return isOneOf(value, TEMPLATE_IDS) ? value : "original";
}

function getDataView(payload: UnknownRecord): DataViewId {
  if (isOneOf(payload.dataView, DATA_VIEW_IDS)) return payload.dataView;
  if (typeof payload.dataView === "string" && payload.dataView in LEGACY_DATA_VIEW_ALIASES) {
    return LEGACY_DATA_VIEW_ALIASES[payload.dataView]!;
  }
  return "province";
}

function getCardGrouping(value: unknown, fallback: CardGrouping): CardGrouping {
  if (isOneOf(value, CARD_GROUPINGS)) return value;
  if (typeof value === "string" && value in LEGACY_CARD_GROUPING_ALIASES) {
    return LEGACY_CARD_GROUPING_ALIASES[value]!;
  }
  return fallback;
}

function getVersion(payload: UnknownRecord): number {
  return Math.max(0, Math.floor(finiteNumber(payload.version, 0)));
}

function migrateStudents(value: unknown): Student[] {
  if (!Array.isArray(value)) return [];

  const students: Student[] = [];
  const usedIds = new Set<string>();
  for (const [index, item] of value.entries()) {
    const record = asRecord(item);
    if (!record) continue;

    const name = asString(record.name);
    const university = asString(record.university ?? record.school);
    const rawCity = asString(record.city);
    if (
      typeof record.name !== "string"
      || (typeof record.university !== "string" && typeof record.school !== "string")
      || typeof record.city !== "string"
    ) {
      continue;
    }

    const requestedId = asString(record.id);
    let id = requestedId || `student-${index + 1}`;
    if (usedIds.has(id)) {
      let suffix = 2;
      const baseId = id;
      do {
        id = `${baseId}-${suffix}`;
        suffix += 1;
      } while (usedIds.has(id));
    }
    usedIds.add(id);

    const locationScope = record.locationScope === "international" ? "international" : undefined;
    const manualProvince = locationScope ? "" : asString(record.province);
    students.push({
      id,
      name,
      university,
      city: locationScope ? rawCity : resolveCity(rawCity).city || rawCity,
      ...(manualProvince ? { province: manualProvince } : {}),
      ...(locationScope ? { locationScope } : {}),
      visibility: record.visibility !== false,
    });
  }
  return students;
}

function validTextRole(value: unknown): CanvasTextRole | null {
  return isOneOf(value, TEXT_ROLES) ? value : null;
}

function validTextAlign(value: unknown): TextAlign {
  return isOneOf(value, ["left", "center", "right"] as const) ? value : "left";
}

function textIdForRole(role: CanvasTextRole): string {
  return `text-${role}`;
}

function uniqueTextId(requested: string, usedIds: Set<string>, index: number): string {
  const base = requested || `text-custom-${index + 1}`;
  if (!usedIds.has(base)) return base;
  let suffix = 2;
  let candidate = `${base}-${suffix}`;
  while (usedIds.has(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

function migrateTextElements(payload: UnknownRecord, defaults: CanvasText[], isV2: boolean): CanvasText[] {
  const source = Array.isArray(payload.textElements) ? payload.textElements : [];
  const byId = new Map(defaults.map((element) => [element.id, { ...element }]));
  const usedIds = new Set(byId.keys());
  let legacyNoteMigrated = false;

  for (const [index, item] of source.entries()) {
    const record = asRecord(item);
    if (!record) continue;

    const requestedId = asString(record.id);
    const requestedRole = validTextRole(record.role);
    const idRole = BUILT_IN_TEXT_IDS.has(requestedId)
      ? validTextRole(requestedId.replace(/^text-/, ""))
      : null;
    const isLegacyNote = !isV2 && !requestedRole && !legacyNoteMigrated;
    const role = requestedRole ?? idRole ?? (isLegacyNote ? "note" : "custom");
    if (isLegacyNote) legacyNoteMigrated = true;

    const isBuiltIn = role !== "custom";
    const id = isBuiltIn
      ? textIdForRole(role)
      : uniqueTextId(requestedId, usedIds, index);
    const base = byId.get(id) ?? {
      id,
      role,
      content: "",
      x: role === "note" ? 745 : 72,
      y: role === "note" ? 905 : 72,
      fontSize: role === "note" ? 20 : 24,
      color: role === "note" ? "#c85d4b" : "#1c3154",
      fontWeight: 500,
      textAlign: role === "note" ? "center" : "left",
      maxWidth: 320,
      visibility: true,
    } satisfies CanvasText;

    const content = typeof record.content === "string"
      ? record.content
      : typeof record.text === "string"
        ? record.text
        : base.content;
    const next: CanvasText = {
      ...base,
      id,
      role,
      content,
      x: finiteNumber(record.x, base.x),
      y: finiteNumber(record.y, base.y),
      fontSize: clamp(record.fontSize, 8, 240, base.fontSize),
      color: asString(record.color, base.color),
      fontWeight: clamp(record.fontWeight, 100, 900, base.fontWeight),
      ...(typeof record.fontId === "string" && record.fontId ? { fontId: record.fontId } : {}),
      textAlign: validTextAlign(record.textAlign),
      maxWidth: clamp(record.maxWidth, 40, 6000, base.maxWidth),
      visibility: record.visibility !== false,
    };

    byId.set(id, next);
    usedIds.add(id);
  }

  return [...byId.values()];
}

function safePosition(value: unknown, fallback: ProvincePosition): ProvincePosition {
  const record = asRecord(value);
  return {
    x: finiteNumber(record?.x, fallback.x),
    y: finiteNumber(record?.y, fallback.y),
  };
}

function assetSlug(value: string): string {
  const slug = value.trim().replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "");
  return slug || "asset";
}

function migrateAssetElement(
  item: UnknownRecord,
  fallback: { id: string; province?: string; x: number; y: number; width: number; height: number },
  legacy: boolean,
): AssetElement {
  const assetId = asString(item.assetId || item.id, fallback.id);
  const province = asString(item.province, fallback.province ?? "");
  const scale = clamp(item.scale, 0.1, 4, 1);
  const width = legacy ? fallback.width * scale : clamp(item.width, 1, 6000, fallback.width);
  const height = legacy ? fallback.height * scale : clamp(item.height, 1, 6000, fallback.height);
  const element: AssetElement = {
    id: asString(item.id, fallback.id),
    assetId,
    label: asString(item.label, assetId),
    src: asString(item.src),
    kind: legacy
      ? "landmark"
      : isOneOf(item.kind, ["province-texture", "landmark", "decoration"] as const)
      ? item.kind
      : "landmark",
    x: finiteNumber(item.x, fallback.x),
    y: finiteNumber(item.y, fallback.y),
    width,
    height,
    rotation: finiteNumber(item.rotation, 0),
    opacity: clamp(item.opacity, 0, 1, 1),
    zIndex: Math.floor(finiteNumber(item.zIndex, 0)),
    visibility: item.visibility !== false,
  };
  if (province) element.province = province;
  return element;
}

function migrateAssets(
  payload: UnknownRecord,
  options: ProjectMigrationOptions,
  isV2: boolean,
): AssetElement[] {
  if (isV2 && Array.isArray(payload.assetElements)) {
    return payload.assetElements.flatMap((item) => {
      const record = asRecord(item);
      return record ? [migrateAssetElement(record, { id: "asset-element" , x: 0, y: 0, width: 120, height: 120 }, false)] : [];
    });
  }

  const style = asRecord(payload.style);
  const sources = asRecord(style?.regionalAssets) ?? asRecord(payload.regionalAssets);
  if (!sources) return [];

  const elements: AssetElement[] = [];
  for (const [provinceKey, value] of Object.entries(sources)) {
    if (!Array.isArray(value)) continue;
    const province = provinceKey.trim();
    const position = safePosition(options.provincePositions?.[province], { x: 0, y: 0 });
    for (const [index, item] of value.entries()) {
      const record = asRecord(item);
      if (!record) continue;
      const assetId = asString(record.id, `${assetSlug(province)}-${index + 1}`);
      const baseId = `asset-element-${assetSlug(province)}-${assetSlug(assetId)}`;
      const uniqueId = elements.some((element) => element.id === baseId)
        ? `${baseId}-${index + 1}`
        : baseId;
      elements.push(migrateAssetElement(record, {
        id: uniqueId,
        province,
        x: position.x,
        y: position.y,
        width: 120,
        height: 120,
      }, true));
      elements[elements.length - 1]!.id = uniqueId;
      elements[elements.length - 1]!.province = province;
    }
  }
  return elements;
}

function sourceStyle(payload: UnknownRecord): UnknownRecord {
  return asRecord(payload.style) ?? {};
}

function stringFromSources(
  sources: UnknownRecord[],
  key: string,
  fallback: string,
): string {
  for (const source of sources) {
    if (typeof source[key] === "string") return source[key] as string;
  }
  return fallback;
}

export function migrateProjectPayload(
  input: unknown,
  options: ProjectMigrationOptions = {},
): ProjectSnapshot {
  const payload = asRecord(input) ?? {};
  const isV2 = Number(payload.schemaVersion) === 2;
  const templateId = getTemplateId(payload);
  const dataView = getDataView(payload);
  const defaults = createDefaultScene(templateId);
  const style = sourceStyle(payload);
  const canvasInput = asRecord(payload.canvas);
  const mapInput = asRecord(payload.map);
  const cardsInput = asRecord(payload.cards);
  const sources = [style, payload];

  const visibleFields = uniqueFields(
    isV2 ? cardsInput?.visibleFields ?? style.visibleFields : style.visibleFields,
    defaults.cards.visibleFields,
  );
  const migratedNoWrapFields = migrateNoWrapFields(
    isV2
      ? cardsInput?.noWrapFields ?? style.noWrapFields ?? payload.noWrapFields
      : style.noWrapFields ?? payload.noWrapFields,
  );
  const cardPreset = isOneOf(
    isV2 ? cardsInput?.preset ?? style.cardPreset : style.cardPreset,
    CARD_PRESETS,
  )
    ? (isV2 ? cardsInput?.preset ?? style.cardPreset : style.cardPreset) as CardPreset
    : defaults.cards.preset;
  const grouping = getCardGrouping(cardsInput?.grouping, defaults.cards.grouping);

  const backgroundColor = stringFromSources(
    isV2 && canvasInput ? [canvasInput, ...sources] : sources,
    "backgroundColor",
    defaults.canvas.backgroundColor,
  );
  const backgroundImageSrc = stringFromSources(
    isV2 && canvasInput ? [canvasInput, ...sources] : sources,
    "backgroundImageSrc",
    "",
  );
  const hasCanonicalMapScale = isV2 && mapInput?.scale !== undefined && mapInput.scale !== defaults.map.scale;
  const mapScale = clamp(
    hasCanonicalMapScale ? mapInput?.scale : style.mapScale ?? mapInput?.scale,
    0.1,
    3,
    defaults.map.scale,
  );

  const textElements = migrateTextElements(payload, defaults.textElements, isV2);
  const assetElements = migrateAssets(payload, options, isV2);
  const guestsInput = asRecord(payload.guests);
  const scene = normalizeScene({
    canvas: {
      ...defaults.canvas,
      ...(isV2 && canvasInput ? canvasInput : {}),
      ...(isV2 ? {} : { width: 1500, height: 1000 }),
      backgroundColor,
      ...(backgroundImageSrc ? { backgroundImageSrc } : {}),
      backgroundFit: isV2 && isOneOf(canvasInput?.backgroundFit, ["cover", "contain", "stretch"] as const)
        ? canvasInput.backgroundFit
        : defaults.canvas.backgroundFit,
      backgroundOpacity: isV2 ? clamp(canvasInput?.backgroundOpacity, 0, 1, defaults.canvas.backgroundOpacity) : 1,
    },
    map: {
      ...defaults.map,
      ...(isV2 && mapInput ? mapInput : {}),
      ...(isV2 ? {} : { x: 350, y: 120, width: 800, height: 690 }),
      scale: mapScale,
      edgeStyle: isV2 && mapInput ? getEdgeStyle(mapInput.edgeStyle) : defaults.map.edgeStyle,
      edgeWidth: isV2 && mapInput ? clamp(mapInput.edgeWidth, 0, 20, defaults.map.edgeWidth ?? 1) : defaults.map.edgeWidth ?? 1,
      showProvinceLabels: isV2 && mapInput ? mapInput.showProvinceLabels !== false : defaults.map.showProvinceLabels,
      collapseSouthChinaSea: isV2 && mapInput?.collapseSouthChinaSea === true,
      fillMode: isV2 && mapInput?.fillMode === "manual" ? "manual" : "heat",
      emptyProvinceFill: isV2 && mapInput?.emptyProvinceFill === "transparent" ? "transparent" : "land-color",
      renderSource: isV2 ? getMapRenderSource(mapInput?.renderSource) : { kind: "vector" },
      provinceStyles: isV2 && mapInput ? getProvinceStyles(mapInput.provinceStyles) : defaults.map.provinceStyles,
      provinceTextureUniformSize: isV2 ? getProvinceTextureUniformSize(mapInput?.provinceTextureUniformSize) : defaults.map.provinceTextureUniformSize,
    },
    cards: {
      ...defaults.cards,
      ...(cardsInput ? cardsInput : {}),
      ...(cardsInput?.positions && typeof cardsInput.positions === "object" && !Array.isArray(cardsInput.positions)
        ? { positions: cardsInput.positions as Record<string, { x: number; y: number }> }
        : {}),
      preset: cardPreset,
      grouping,
      visibleFields,
      noWrapFields: migratedNoWrapFields,
      connectorDash: isV2 && cardsInput ? getEdgeStyle(cardsInput.connectorDash ?? defaults.cards.connectorDash) : defaults.cards.connectorDash,
      ...(isV2 && cardsInput?.displayFrame !== undefined
        ? { displayFrame: normalizeDisplayFrame(cardsInput.displayFrame, defaults.cards.displayFrame) }
        : {}),
    },
    guests: {
      ...defaults.guests,
      ...(isV2 && guestsInput ? guestsInput : {}),
      people: isV2 && Array.isArray(guestsInput?.people) ? guestsInput.people as typeof defaults.guests.people : defaults.guests.people,
    },
    textElements,
    assetElements,
  });

  const nextStyle = {
    cardPreset: scene.cards.preset,
    mapScale: scene.map.scale,
    backgroundColor: scene.canvas.backgroundColor,
    ...(scene.canvas.backgroundImageSrc ? { backgroundImageSrc: scene.canvas.backgroundImageSrc } : {}),
    visibleFields: [...scene.cards.visibleFields],
    regionalAssets: {},
  } satisfies ProjectSnapshot["style"];

  return {
    schemaVersion: 2,
    students: migrateStudents(payload.students),
    templateId,
    dataView,
    canvas: scene.canvas,
    map: scene.map,
    cards: scene.cards,
    guests: scene.guests,
    textElements: scene.textElements,
    assetElements: scene.assetElements,
    style: nextStyle,
    version: getVersion(payload),
  };
}
