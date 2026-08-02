import type { ProjectDocument } from "./project-document";
import type { CardFontField } from "./scene-document";

export type TypographyTarget =
  | { type: "province-label"; province: string }
  | { type: "guest-title" }
  | { type: "guest-person"; id: string }
  | { type: "card-field"; field: CardFontField }
  | { type: "canvas-text"; id: string };

function optionalFontId(fontId: string): string | undefined {
  return fontId || undefined;
}

export function applyTypographyFont(
  project: ProjectDocument,
  target: TypographyTarget,
  fontId: string,
  applyToAll: boolean,
): ProjectDocument {
  const value = optionalFontId(fontId);

  if (target.type === "province-label") {
    if (applyToAll) {
      return {
        ...project,
        map: {
          ...project.map,
          provinceLabelFontId: value,
          provinceStyles: Object.fromEntries(
            Object.entries(project.map.provinceStyles ?? {}).map(([province, style]) => {
              const { labelFontId: _removed, ...rest } = style;
              return [province, rest];
            }),
          ),
        },
      };
    }
    return {
      ...project,
      map: {
        ...project.map,
        provinceStyles: {
          ...project.map.provinceStyles,
          [target.province]: {
            ...project.map.provinceStyles?.[target.province],
            labelFontId: value,
          },
        },
      },
    };
  }

  if (target.type === "guest-title") {
    return { ...project, guests: { ...project.guests, titleFontId: value } };
  }

  if (target.type === "guest-person") {
    if (applyToAll) {
      return {
        ...project,
        guests: {
          ...project.guests,
          peopleFontId: value,
          people: project.guests.people.map(({ fontId: _removed, ...person }) => person),
        },
      };
    }
    return {
      ...project,
      guests: {
        ...project.guests,
        people: project.guests.people.map((person) =>
          person.id === target.id ? { ...person, fontId: value } : person,
        ),
      },
    };
  }

  if (target.type === "card-field") {
    const fieldFonts = { ...(project.cards.fieldFonts ?? {}) };
    if (value) fieldFonts[target.field] = value;
    else delete fieldFonts[target.field];
    return { ...project, cards: { ...project.cards, fieldFonts } };
  }

  const selected = project.textElements.find((text) => text.id === target.id);
  if (!selected) return project;
  return {
    ...project,
    textElements: project.textElements.map((text) => {
      if (text.id === target.id || (applyToAll && text.role === selected.role)) {
        return { ...text, fontId: value };
      }
      return text;
    }),
  };
}
