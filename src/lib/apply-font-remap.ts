import type { ProjectDocument } from "./project-document";
import type { CardFontField } from "./scene-document";

export interface FontRemapResult {
  project: ProjectDocument;
  /** 被改写的字体引用数量；为 0 时 `project` 与传入的是同一个对象。 */
  rewritten: number;
}

/**
 * Follow a remap to the id that survived deduplication. Several copies can collapse in successive
 * passes, so the links are chased until they end; the seen set stops a cycle from looping forever.
 */
function resolverFor(fontIdRemap: Record<string, string>): (fontId: string | undefined) => string | undefined {
  const remap = new Map(Object.entries(fontIdRemap));
  return (fontId) => {
    if (!fontId) return fontId;
    let current = fontId;
    const seen = new Set<string>([current]);
    for (;;) {
      const next = remap.get(current);
      if (!next || seen.has(next)) return current;
      seen.add(next);
      current = next;
    }
  };
}

/**
 * Rewrite every font reference in the project that points at a deduped font id.
 *
 * Importing a resource pack drops incoming fonts whose bytes are already stored, so a scene that
 * still names the dropped id resolves to nothing and its text silently falls back to the default
 * font. Ids outside the remap are left alone, which keeps an import without duplicates a no-op.
 */
export function applyFontIdRemap(project: ProjectDocument, fontIdRemap: Record<string, string>): FontRemapResult {
  if (Object.keys(fontIdRemap).length === 0) return { project, rewritten: 0 };
  const resolve = resolverFor(fontIdRemap);
  let rewritten = 0;
  const remapFontId = (fontId: string | undefined): string | undefined => {
    const next = resolve(fontId);
    if (next !== fontId) rewritten += 1;
    return next;
  };

  const fieldFonts = Object.fromEntries(
    Object.entries(project.cards.fieldFonts ?? {}).map(([field, fontId]) => [field, remapFontId(fontId)]),
  ) as Partial<Record<CardFontField, string>>;
  const provinceStyles = Object.fromEntries(
    Object.entries(project.map.provinceStyles ?? {}).map(([province, style]) => [
      province,
      { ...style, labelFontId: remapFontId(style.labelFontId) },
    ]),
  );
  const provinceLabelFontId = remapFontId(project.map.provinceLabelFontId);
  const titleFontId = remapFontId(project.guests.titleFontId);
  const peopleFontId = remapFontId(project.guests.peopleFontId);
  const people = project.guests.people.map((person) => ({ ...person, fontId: remapFontId(person.fontId) }));
  const textElements = project.textElements.map((text) => ({ ...text, fontId: remapFontId(text.fontId) }));

  if (rewritten === 0) return { project, rewritten: 0 };
  return {
    project: {
      ...project,
      map: { ...project.map, provinceLabelFontId, provinceStyles },
      cards: { ...project.cards, fieldFonts },
      guests: { ...project.guests, titleFontId, peopleFontId, people },
      textElements,
    },
    rewritten,
  };
}
