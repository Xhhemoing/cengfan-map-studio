export interface CardExpressionTemplates {
  title: string;
  city: string;
  row: string;
}

export const DEFAULT_CARD_EXPRESSION_TEMPLATES: CardExpressionTemplates = {
  title: "{group}",
  city: "{city}",
  row: "{university} · {names}",
};

export type CardExpressionValues = Partial<Record<
  "group" | "count" | "province" | "city" | "university" | "names",
  string | number
>>;

const PLACEHOLDER_PATTERN = /\{([^{}]+)\}/g;
const SUPPORTED_PLACEHOLDERS = new Set(["group", "count", "province", "city", "university", "names"]);

export function formatCardExpression(
  template: string,
  values: CardExpressionValues,
  fallback: string,
): string {
  const source = typeof template === "string" ? template.trim() : "";
  if (!source) return fallback;
  const placeholders = [...source.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1] ?? "");
  if (placeholders.some((placeholder) => !SUPPORTED_PLACEHOLDERS.has(placeholder))) return fallback;
  const formatted = source.replace(PLACEHOLDER_PATTERN, (_match, placeholder: string) => String(values[placeholder as keyof CardExpressionValues] ?? ""));
  return formatted.trim() || fallback;
}

export function normalizeCardExpressionTemplates(value: unknown): CardExpressionTemplates {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const normalize = (key: keyof CardExpressionTemplates) => {
    const candidate = record[key];
    return typeof candidate === "string" && candidate.trim()
      ? candidate.trim()
      : DEFAULT_CARD_EXPRESSION_TEMPLATES[key];
  };
  return {
    title: normalize("title"),
    city: normalize("city"),
    row: normalize("row"),
  };
}
