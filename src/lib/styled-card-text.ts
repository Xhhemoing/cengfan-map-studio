import type { CardTextFragment, CardTextLine } from "./card-text-layout";
import { estimateCardTextWidth } from "./card-text-measurement";
import { resolveFontFamily, type UserFont } from "./fonts";
import type { CardFontField, CardSettings } from "./scene-document";

export const DEFAULT_CARD_FONT_FAMILY = '"Noto Sans SC", sans-serif';
export interface CardTextMeasureStyle { fontFamily: string; fontSize: number; fontWeight?: number }
export type CardTextMeasure = (text: string, style: CardTextMeasureStyle) => number;

export interface StyledCardTextOptions {
  fontSize: number;
  fontWeight?: number;
  fieldTypography?: CardSettings["fieldTypography"];
  fieldFonts?: CardSettings["fieldFonts"];
  userFonts?: UserFont[];
  preserveFields?: ReadonlySet<CardFontField>;
  measureText?: CardTextMeasure;
}

function fragmentFont(fragment: CardTextFragment<CardFontField>, options: StyledCardTextOptions): CardTextMeasureStyle {
  return {
    fontSize: (fragment.field ? options.fieldTypography?.[fragment.field]?.fontSize : undefined) ?? options.fontSize,
    fontFamily: resolveFontFamily(fragment.field ? options.fieldFonts?.[fragment.field] : undefined, options.userFonts ?? []) ?? DEFAULT_CARD_FONT_FAMILY,
    fontWeight: options.fontWeight,
  };
}

function measuredWidth(text: string, font: CardTextMeasureStyle, measureText?: CardTextMeasure): number {
  const actual = measureText?.(text, font);
  return actual !== undefined && Number.isFinite(actual) && actual >= 0 ? actual : estimateCardTextWidth(text, font.fontSize);
}

export function measureStyledCardText(fragments: CardTextFragment<CardFontField>[], options: StyledCardTextOptions): number {
  return fragments.reduce((width, fragment) => width + measuredWidth(fragment.text, fragmentFont(fragment, options), options.measureText), 0);
}

/** Wrap semantic spans at their own font/size, retaining every character and field binding. */
export function wrapStyledCardText(
  fragments: CardTextFragment<CardFontField>[], availableWidth: number, options: StyledCardTextOptions,
): CardTextLine<CardFontField>[] {
  const lines: CardTextLine<CardFontField>[] = [[]];
  const width = Math.max(1, availableWidth);
  let lineWidth = 0;
  const append = (text: string, field: CardFontField | undefined) => {
    const line = lines[lines.length - 1]!;
    const previous = line[line.length - 1];
    if (previous && previous.field === field) previous.text += text;
    else line.push({ text, ...(field ? { field } : {}) });
  };
  for (const fragment of fragments) {
    const font = fragmentFont(fragment, options);
    const measure = (text: string) => measuredWidth(text, font, options.measureText);
    const wholeWidth = measure(fragment.text);
    if (fragment.field && options.preserveFields?.has(fragment.field)) {
      if (lineWidth > 0 && lineWidth + wholeWidth > width) { lines.push([]); lineWidth = 0; }
      append(fragment.text, fragment.field);
      lineWidth += wholeWidth;
      continue;
    }
    // Measuring each growing fragment preserves font kerning/ligatures within its current line.
    let segment = "";
    let segmentWidth = 0;
    for (const character of Array.from(fragment.text)) {
      const nextWidth = measure(segment + character);
      const delta = nextWidth - segmentWidth;
      if (lineWidth > 0 && lineWidth + delta > width) {
        lines.push([]); segment = character; segmentWidth = measure(character);
        append(character, fragment.field); lineWidth = segmentWidth;
      } else {
        append(character, fragment.field); lineWidth += delta; segment += character; segmentWidth = nextWidth;
      }
    }
  }
  return lines.filter((line) => line.length > 0);
}
