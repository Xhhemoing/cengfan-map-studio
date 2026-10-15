import { buildLayoutGroups } from "./layout";
import type { ProjectDocument } from "./project-document";
import type { SceneSelection } from "./scene-document";
import { normalizeCardExpressionTemplates } from "./card-expression";
import { normalizeNameFormat } from "./name-format";
import type { CardFontField, CardPositionPolicy, CardPositionSource, CardSettings, CardStyleOverride } from "./card-settings-types";

const fontFields: CardFontField[] = ["title", "name", "university", "city"];
const visibleFields = ["name", "university", "city"] as const;
const numericRanges = {
  maxWidth: [80, 6000], padding: [0, 120], horizontalPadding: [0, 240], bottomPadding: [0, 240],
  opacity: [0, 1], fontSize: [8, 48], minWidth: [80, 6000], minFontSize: [8, 48],
} as const;
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const own = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);

/** Ignore selections from another grouping and, when available, deleted/hidden card IDs. */
export function getSelectedCardIds(selection: SceneSelection | undefined, cards: CardSettings, project?: Pick<ProjectDocument, "students">): string[] {
  if (selection?.type !== "cards" || !selection.ids?.length || (selection.scopeGrouping && selection.scopeGrouping !== cards.grouping)) return [];
  const ids = [...new Set(selection.ids.filter((id) => typeof id === "string" && id.trim()))];
  if (!project) return ids;
  const valid = new Set(buildLayoutGroups(project.students, cards.grouping).map((group) => group.key));
  return ids.filter((id) => valid.has(id));
}

/** A province and a city with the same title must never share custom settings. */
export function getCardScopeKey(cards: Pick<CardSettings, "grouping">, id: string): string {
  return `${cards.grouping}:${id}`;
}

export function normalizeCardStyleOverride(value: unknown): CardStyleOverride {
  if (!isRecord(value)) return {};
  const patch: Record<string, unknown> = {};
  for (const [key, [min, max]] of Object.entries(numericRanges)) {
    const number = value[key];
    if (typeof number === "number" && Number.isFinite(number)) patch[key] = Math.min(max, Math.max(min, number));
  }
  for (const key of ["background", "textColor", "templateId"] as const) {
    if (typeof value[key] === "string" && value[key]) patch[key] = value[key];
  }
  for (const key of ["compactLayout", "citySubgroups", "showProvinceTexture", "showCount"] as const) {
    if (typeof value[key] === "boolean") patch[key] = value[key];
  }
  if (value.widthMode === "fixed" || value.widthMode === "content") patch.widthMode = value.widthMode;
  if (["standard", "compact", "ticket", "photo", "borderless"].includes(String(value.preset))) patch.preset = value.preset;
  if (["standard", "color-pill", "emblem-list", "city-label", "glass-stat"].includes(String(value.presentation))) patch.presentation = value.presentation;
  for (const key of ["visibleFields", "noWrapFields"] as const) {
    const fields = value[key];
    if (Array.isArray(fields)) patch[key] = [...new Set(fields.filter((field) => visibleFields.includes(field)))];
  }
  if (isRecord(value.fieldFonts)) {
    const record = value.fieldFonts;
    patch.fieldFonts = Object.fromEntries(fontFields.flatMap((field) => typeof record[field] === "string" && record[field] ? [[field, record[field]]] : []));
  }
  if (isRecord(value.fieldTypography)) {
    const record = value.fieldTypography;
    patch.fieldTypography = Object.fromEntries(fontFields.flatMap((field) => {
      const style = record[field];
      if (!isRecord(style)) return [];
      const result: Record<string, unknown> = {};
      if (typeof style.fontSize === "number" && Number.isFinite(style.fontSize)) result.fontSize = Math.min(48, Math.max(8, style.fontSize));
      if (typeof style.color === "string" && style.color) result.color = style.color;
      return Object.keys(result).length ? [[field, result]] : [];
    }));
  }
  if (isRecord(value.expressionTemplates)) patch.expressionTemplates = normalizeCardExpressionTemplates(value.expressionTemplates);
  if (typeof value.nameFormat === "string") patch.nameFormat = normalizeNameFormat(value.nameFormat);
  return patch as CardStyleOverride;
}

export function normalizeCardScopedSettings(cards: CardSettings): Pick<CardSettings, "styleOverrides" | "positionPolicies" | "positionSources"> {
  const styleOverrides = isRecord(cards.styleOverrides)
    ? Object.fromEntries(Object.entries(cards.styleOverrides).flatMap(([key, value]) => {
      const style = normalizeCardStyleOverride(value);
      return Object.keys(style).length ? [[key, style]] : [];
    })) : {};
  const filterRecord = <T extends string>(value: unknown, allowed: readonly T[]): Record<string, T> => isRecord(value)
    ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, T] => allowed.includes(entry[1] as T))) : {};
  return {
    styleOverrides,
    positionPolicies: filterRecord(cards.positionPolicies, ["locked", "preserve", "auto"] as const),
    positionSources: filterRecord(cards.positionSources, ["manual", "frozen", "auto"] as const),
  };
}

/** Missing properties inherit global settings; each field inherits independently. */
export function resolveCardSettings(cards: CardSettings, id: string): CardSettings {
  const key = getCardScopeKey(cards, id);
  const patch = own(cards.styleOverrides ?? {}, key) ? cards.styleOverrides?.[key] : undefined;
  const { styleOverrides: _overrides, ...base } = cards;
  if (!patch) return base;
  const fieldTypography = { ...base.fieldTypography };
  for (const field of fontFields) {
    if (patch.fieldTypography?.[field]) fieldTypography[field] = { ...fieldTypography[field], ...patch.fieldTypography[field] };
  }
  return { ...base, ...patch, minWidth: Math.min(patch.maxWidth ?? base.maxWidth, patch.minWidth ?? base.minWidth ?? 80), fieldFonts: { ...base.fieldFonts, ...patch.fieldFonts }, fieldTypography };
}

export function patchCardStyles(cards: CardSettings, ids: readonly string[], value: Partial<CardSettings>): CardSettings {
  const patch = normalizeCardStyleOverride(value);
  if (!Object.keys(patch).length) return cards;
  const styleOverrides = { ...cards.styleOverrides };
  for (const id of new Set(ids)) {
    const key = getCardScopeKey(cards, id);
    const previous = styleOverrides[key] ?? {};
    const fieldTypography = { ...previous.fieldTypography };
    for (const field of fontFields) {
      if (patch.fieldTypography?.[field]) fieldTypography[field] = { ...fieldTypography[field], ...patch.fieldTypography[field] };
    }
    styleOverrides[key] = { ...previous, ...patch,
      ...(patch.fieldFonts ? { fieldFonts: { ...previous.fieldFonts, ...patch.fieldFonts } } : {}),
      ...(patch.fieldTypography ? { fieldTypography } : {}),
    };
  }
  return { ...cards, styleOverrides };
}

export function resetCardStyles(cards: CardSettings, ids: readonly string[]): CardSettings {
  const styleOverrides = { ...cards.styleOverrides };
  for (const id of ids) delete styleOverrides[getCardScopeKey(cards, id)];
  return { ...cards, styleOverrides };
}

export function getCardPositionPolicy(cards: CardSettings, id: string): CardPositionPolicy {
  const key = getCardScopeKey(cards, id);
  const policy = own(cards.positionPolicies ?? {}, key) ? cards.positionPolicies?.[key] : undefined;
  return policy ?? (own(cards.positions ?? {}, id) ? "preserve" : "auto");
}

export function getCardPositionSource(cards: CardSettings, id: string): CardPositionSource | "legacy" {
  const key = getCardScopeKey(cards, id);
  return cards.positionSources?.[key] ?? (own(cards.positions ?? {}, id) ? "legacy" : "auto");
}

export function setCardPositionPolicy(cards: CardSettings, ids: readonly string[], policy: CardPositionPolicy): CardSettings {
  const positionPolicies = { ...cards.positionPolicies };
  const positions = { ...cards.positions };
  const positionSources = { ...cards.positionSources };
  for (const id of ids) {
    const key = getCardScopeKey(cards, id);
    positionPolicies[key] = policy;
    if (policy === "auto") { delete positions[id]; positionSources[key] = "auto"; }
  }
  return { ...cards, positionPolicies, positions, positionSources };
}
