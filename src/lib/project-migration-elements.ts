import type { AssetElement, CanvasText, CanvasTextRole, TextAlign } from "./scene-document";
import {
  asRecord,
  asString,
  clamp,
  finiteNumber,
  isOneOf,
  safePosition,
  type MigrationContext,
  type UnknownRecord,
} from "./project-migration-helpers";

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

function defaultTextElement(id: string, role: CanvasTextRole): CanvasText {
  return {
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
  };
}

export function migrateTextElements(context: MigrationContext): CanvasText[] {
  const { defaults, isV2, payload } = context;
  const source = Array.isArray(payload.textElements) ? payload.textElements : [];
  const byId = new Map(defaults.textElements.map((element) => [element.id, { ...element }]));
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
    // The first role-less legacy element is the old free-form wish note.
    const isLegacyNote = !isV2 && !requestedRole && !legacyNoteMigrated;
    const role = requestedRole ?? idRole ?? (isLegacyNote ? "note" : "custom");
    if (isLegacyNote) legacyNoteMigrated = true;

    const isBuiltIn = role !== "custom";
    const id = isBuiltIn
      ? textIdForRole(role)
      : uniqueTextId(requestedId, usedIds, index);
    const base = byId.get(id) ?? defaultTextElement(id, role);

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

/** Legacy drafts stored decorations per province under `style.regionalAssets`. */
function migrateLegacyRegionalAssets(context: MigrationContext): AssetElement[] {
  const { options, payload, style } = context;
  const sources = asRecord(style.regionalAssets) ?? asRecord(payload.regionalAssets);
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
      const element = migrateAssetElement(record, {
        id: uniqueId,
        province,
        x: position.x,
        y: position.y,
        width: 120,
        height: 120,
      }, true);
      element.id = uniqueId;
      element.province = province;
      elements.push(element);
    }
  }
  return elements;
}

export function migrateAssetElements(context: MigrationContext): AssetElement[] {
  const { isV2, payload } = context;
  if (isV2 && Array.isArray(payload.assetElements)) {
    return payload.assetElements.flatMap((item) => {
      const record = asRecord(item);
      return record
        ? [migrateAssetElement(record, { id: "asset-element", x: 0, y: 0, width: 120, height: 120 }, false)]
        : [];
    });
  }
  return migrateLegacyRegionalAssets(context);
}
