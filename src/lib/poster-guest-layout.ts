import type { GuestPanelSettings, GuestPerson, TextStyleOverride } from "./scene-document";

/** Truncate a single-line guest text (name / title / note) with an ellipsis. */
export function truncateGuestText(text: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

const GUEST_CUSTOM_MAX_LINES = 14;

/** Wrap the panel's free-form custom text into display lines (hard wrap by width, cap the line count). */
export function wrapGuestCustomText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  for (const rawLine of text.split("\n")) {
    let rest = rawLine;
    while (rest.length > maxChars) {
      if (lines.length >= GUEST_CUSTOM_MAX_LINES) break;
      lines.push(rest.slice(0, maxChars));
      rest = rest.slice(maxChars);
    }
    if (lines.length >= GUEST_CUSTOM_MAX_LINES) {
      if (rest.length > 0) {
        const last = lines[GUEST_CUSTOM_MAX_LINES - 1];
        if (last) lines[GUEST_CUSTOM_MAX_LINES - 1] = `${last.slice(0, maxChars - 1)}…`;
      }
      break;
    }
    lines.push(rest);
  }
  return lines;
}

/** Fallback panel rendered when a project document predates the guests field. */
export const FALLBACK_GUEST_PANEL: GuestPanelSettings = {
  title: "特邀嘉宾 · 老师名单",
  x: 48,
  y: 780,
  width: 280,
  padding: 14,
  background: "#ffffff",
  opacity: 0.92,
  textColor: "#1c3154",
  fontSize: 13,
  visibility: true,
  people: [],
};

/** All derived measurements for the guest panel (list and card modes). */
export interface GuestPanelMetrics {
  visibleGuests: GuestPerson[];
  titleTypography: TextStyleOverride;
  peopleTypography: TextStyleOverride;
  titleFontSize: number;
  peopleFontSize: number;
  noteFontSize: number;
  displayMode: "list" | "cards";
  listAvatarSize: number;
  listUsesAvatar: boolean;
  listAvatarGap: number;
  /** Height of one guest row in list mode (avatar or text line + optional note). */
  rowHeight: number;
  cardGap: number;
  cardColumns: number;
  cardWidth: number;
  cardAvatarSize: number;
  cardTitleLine: number;
  cardSubLine: number;
  cardHasTitle: boolean;
  cardHasNote: boolean;
  cardHeight: number;
  customText: string;
  customLines: string[];
  customLineHeight: number;
  /** Gap between the header divider and the first custom-text baseline, scaled with the font size. */
  customTopGap: number;
  customHeight: number;
  /** Total panel height: padding + header + custom text + rows/cards. */
  panelHeight: number;
}

/** Derive every layout measurement the guest panel needs. Pure function of the
 *  panel settings and the canvas line-height multiplier. */
export function computeGuestPanelMetrics(guests: GuestPanelSettings, lineHeightMultiplier: number): GuestPanelMetrics {
  const visibleGuests = guests.people.filter((person) => person.visibility !== false);
  const titleTypography = guests.titleTypography ?? {};
  const peopleTypography = guests.peopleTypography ?? {};
  const titleFontSize = titleTypography.fontSize ?? guests.fontSize + 1;
  const peopleFontSize = peopleTypography.fontSize ?? guests.fontSize;
  const noteFontSize = Math.max(10, peopleFontSize - 2);
  const displayMode = guests.displayMode === "cards" ? "cards" as const : "list" as const;
  const listAvatarSize = Math.max(22, peopleFontSize + 8);
  const listUsesAvatar = visibleGuests.some((person) => person.avatarSrc);
  const listAvatarGap = listUsesAvatar ? listAvatarSize + 8 : 0;
  const noteLineHeight = Math.max(13, noteFontSize + 3) * lineHeightMultiplier;
  const listNoteLines = visibleGuests.some((person) => person.note) ? noteLineHeight : 0;
  const rowHeight = Math.max(listAvatarSize, Math.max(16, peopleFontSize + 6) * lineHeightMultiplier) + listNoteLines;
  const cardGap = 10;
  const cardMinWidth = 92;
  const cardColumns = Math.max(1, Math.floor((guests.width - guests.padding * 2 + cardGap) / (cardMinWidth + cardGap)));
  const cardWidth = (guests.width - guests.padding * 2 - (cardColumns - 1) * cardGap) / cardColumns;
  const cardAvatarSize = 40;
  const cardTitleLine = Math.max(15, peopleFontSize + 5) * lineHeightMultiplier;
  const cardSubLine = Math.max(12, Math.max(10, peopleFontSize - 2) + 3) * lineHeightMultiplier;
  const cardHasTitle = visibleGuests.some((person) => person.title);
  const cardHasNote = visibleGuests.some((person) => person.note);
  const cardHeight = 6 + cardAvatarSize + 6 + cardTitleLine
    + (cardHasTitle ? cardSubLine : 0)
    + (cardHasNote ? cardSubLine : 0) + 6;
  const cardRows = Math.max(1, Math.ceil(visibleGuests.length / Math.max(1, cardColumns)));
  const customText = guests.customText ?? "";
  const customMaxChars = Math.max(8, Math.floor((guests.width - guests.padding * 2 - listAvatarGap) / peopleFontSize));
  const customLines = customText ? wrapGuestCustomText(customText, customMaxChars) : [];
  const customLineHeight = Math.max(16, peopleFontSize + 4) * lineHeightMultiplier;
  const customTopGap = Math.round(peopleFontSize * 0.9) + 11;
  const customHeight = customLines.length > 0
    ? customTopGap + (customLines.length - 1) * customLineHeight + Math.round(peopleFontSize * 0.35) + 8
    : 0;
  const panelHeight = guests.padding * 2 + 28 + customHeight
    + (displayMode === "cards"
      ? cardRows * cardHeight + (cardRows - 1) * cardGap
      : Math.max(1, visibleGuests.length) * rowHeight);
  return {
    visibleGuests,
    titleTypography,
    peopleTypography,
    titleFontSize,
    peopleFontSize,
    noteFontSize,
    displayMode,
    listAvatarSize,
    listUsesAvatar,
    listAvatarGap,
    rowHeight,
    cardGap,
    cardColumns,
    cardWidth,
    cardAvatarSize,
    cardTitleLine,
    cardSubLine,
    cardHasTitle,
    cardHasNote,
    cardHeight,
    customText,
    customLines,
    customLineHeight,
    customTopGap,
    customHeight,
    panelHeight,
  };
}
