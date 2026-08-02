export interface CardTextFragment<T = string> {
  text: string;
  field?: T;
}

export type CardTextLine<T = string> = CardTextFragment<T>[];

export interface WrapCardTextOptions<T = string> {
  /**
   * Fields whose fragments must never be split across lines: when the current
   * line cannot fit the whole fragment, it moves to the next line intact.
   * A fragment that alone exceeds the available width still wraps per character
   * so no content is ever lost.
   */
  preserveFields?: ReadonlySet<T>;
}

function characterWidth(character: string, fontSize: number): number {
  if (/\s/u.test(character)) return fontSize * 0.35;
  if ((character.codePointAt(0) ?? 0) <= 0xff) return fontSize * 0.58;
  return fontSize;
}

function fragmentWidth<T>(fragment: CardTextFragment<T>, fontSize: number): number {
  let width = 0;
  for (const character of Array.from(fragment.text)) width += characterWidth(character, fontSize);
  return width;
}

function appendFragment<T>(line: CardTextLine<T>, character: string, field: T | undefined): void {
  const previous = line[line.length - 1];
  if (previous && previous.field === field) {
    previous.text += character;
    return;
  }
  line.push({ text: character, field });
}

/**
 * Wrap SVG text deterministically without relying on browser text measurement.
 * CJK glyphs use one em; Latin glyphs and whitespace use conservative fractions.
 */
export function wrapCardText<T = string>(
  fragments: CardTextFragment<T>[],
  availableWidth: number,
  fontSize: number,
  options: WrapCardTextOptions<T> = {},
): CardTextLine<T>[] {
  const width = Math.max(fontSize, availableWidth);
  const lines: CardTextLine<T>[] = [[]];
  let lineWidth = 0;

  for (const fragment of fragments) {
    const wholeWidth = fragmentWidth(fragment, fontSize);
    const preserve = options.preserveFields !== undefined
      && fragment.field !== undefined
      && options.preserveFields.has(fragment.field);
    if (preserve) {
      if (lineWidth > 0 && lineWidth + wholeWidth > width) {
        lines.push([]);
        lineWidth = 0;
      }
      for (const character of Array.from(fragment.text)) {
        appendFragment(lines[lines.length - 1]!, character, fragment.field);
      }
      lineWidth += wholeWidth;
      continue;
    }
    for (const character of Array.from(fragment.text)) {
      const nextWidth = characterWidth(character, fontSize);
      if (lineWidth > 0 && lineWidth + nextWidth > width) {
        lines.push([]);
        lineWidth = 0;
      }
      appendFragment(lines[lines.length - 1]!, character, fragment.field);
      lineWidth += nextWidth;
    }
  }

  return lines.filter((line) => line.length > 0);
}
