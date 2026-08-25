import type { DataViewId, MapTemplateId } from "./project-data";
import type { CardGrouping, CardPreset, VisibleField } from "./template-document";
import { finiteNumber, isOneOf, type UnknownRecord } from "./project-migration-helpers";

const TEMPLATE_IDS: MapTemplateId[] = ["original", "cartoon", "grain", "q", "scenery", "regional"];
const DATA_VIEW_IDS: DataViewId[] = ["province", "pins", "heat", "city", "university"];
const LEGACY_DATA_VIEW_ALIASES: Record<string, DataViewId> = { student: "province" };
const CARD_PRESETS: CardPreset[] = ["standard", "compact", "ticket", "photo", "borderless"];
const CARD_GROUPINGS: CardGrouping[] = ["province", "city", "university"];
const LEGACY_CARD_GROUPING_ALIASES: Record<string, CardGrouping> = { student: "province" };

export const VISIBLE_FIELDS: VisibleField[] = ["name", "university", "city"];

export function getTemplateId(payload: UnknownRecord): MapTemplateId {
  const value = payload.templateId ?? payload.template;
  return isOneOf(value, TEMPLATE_IDS) ? value : "original";
}

export function getDataView(payload: UnknownRecord): DataViewId {
  if (isOneOf(payload.dataView, DATA_VIEW_IDS)) return payload.dataView;
  if (typeof payload.dataView === "string" && payload.dataView in LEGACY_DATA_VIEW_ALIASES) {
    return LEGACY_DATA_VIEW_ALIASES[payload.dataView]!;
  }
  return "province";
}

export function getCardGrouping(value: unknown, fallback: CardGrouping): CardGrouping {
  if (isOneOf(value, CARD_GROUPINGS)) return value;
  if (typeof value === "string" && value in LEGACY_CARD_GROUPING_ALIASES) {
    return LEGACY_CARD_GROUPING_ALIASES[value]!;
  }
  return fallback;
}

export function getCardPreset(value: unknown, fallback: CardPreset): CardPreset {
  return isOneOf(value, CARD_PRESETS) ? value : fallback;
}

export function getVersion(payload: UnknownRecord): number {
  return Math.max(0, Math.floor(finiteNumber(payload.version, 0)));
}

export function uniqueFields(value: unknown, fallback: VisibleField[]): VisibleField[] {
  if (!Array.isArray(value)) return [...fallback];
  const fields = value.filter((item): item is VisibleField => isOneOf(item, VISIBLE_FIELDS));
  return fields.length > 0 ? [...new Set(fields)] : [...fallback];
}

export function migrateNoWrapFields(value: unknown): VisibleField[] {
  if (!Array.isArray(value)) return [];
  return VISIBLE_FIELDS.filter((field) => value.includes(field));
}
