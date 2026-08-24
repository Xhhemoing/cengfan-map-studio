import type { GuestPanelSettings, GuestPerson, TextStyleOverride } from "./scene-document";

/** Panel used when a document predates the guests block. Frozen so canvas layers stay memo-stable. */
export const DEFAULT_GUEST_PANEL: GuestPanelSettings = {
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

export const GUEST_CUSTOM_MAX_LINES = 14;

const GUEST_CARD_GAP = 10;
const GUEST_CARD_MIN_WIDTH = 92;
const GUEST_CARD_AVATAR_SIZE = 40;

/** Truncate a single-line guest text (name / title / note) with an ellipsis. */
export function truncateGuestText(text: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

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

export interface GuestPanelLayout {
  visibleGuests: GuestPerson[];
  titleTypography: TextStyleOverride;
  peopleTypography: TextStyleOverride;
  titleFontSize: number;
  peopleFontSize: number;
  noteFontSize: number;
  displayMode: "list" | "cards";
  /** Avatar diameter in list mode. */
  listAvatarSize: number;
  listUsesAvatar: boolean;
  /** Horizontal offset applied to list text so it clears the avatar column. */
  listAvatarGap: number;
  listRowHeight: number;
  listNoteMaxChars: number;
  cardGap: number;
  cardColumns: number;
  cardWidth: number;
  cardHeight: number;
  cardRows: number;
  cardAvatarSize: number;
  cardTitleLine: number;
  cardSubLine: number;
  cardHasTitle: boolean;
  cardHasNote: boolean;
  customText: string;
  customLines: string[];
  customLineHeight: number;
  customTopGap: number;
  customHeight: number;
  /** Total panel height; also the obstacle height auto-layout keeps cards away from. */
  height: number;
}

/** Derive every metric the guests panel draws with, so both layout and painting agree. */
export function computeGuestPanelLayout(
  guests: GuestPanelSettings,
  lineHeightMultiplier: number,
): GuestPanelLayout {
  const visibleGuests = guests.people.filter((person) => person.visibility !== false);
  const titleTypography = guests.titleTypography ?? {};
  const peopleTypography = guests.peopleTypography ?? {};
  const titleFontSize = titleTypography.fontSize ?? guests.fontSize + 1;
  const peopleFontSize = peopleTypography.fontSize ?? guests.fontSize;
  const noteFontSize = Math.max(10, peopleFontSize - 2);
  const displayMode = guests.displayMode === "cards" ? "cards" : "list";
  const listAvatarSize = Math.max(22, peopleFontSize + 8);
  const listUsesAvatar = visibleGuests.some((person) => person.avatarSrc);
  const listAvatarGap = listUsesAvatar ? listAvatarSize + 8 : 0;
  const noteLineHeight = Math.max(13, noteFontSize + 3) * lineHeightMultiplier;
  const listNoteLines = visibleGuests.some((person) => person.note) ? noteLineHeight : 0;
  const listRowHeight = Math.max(listAvatarSize, Math.max(16, peopleFontSize + 6) * lineHeightMultiplier) + listNoteLines;
  const contentWidth = guests.width - guests.padding * 2;
  const cardColumns = Math.max(1, Math.floor((contentWidth + GUEST_CARD_GAP) / (GUEST_CARD_MIN_WIDTH + GUEST_CARD_GAP)));
  const cardWidth = (contentWidth - (cardColumns - 1) * GUEST_CARD_GAP) / cardColumns;
  const cardTitleLine = Math.max(15, peopleFontSize + 5) * lineHeightMultiplier;
  const cardSubLine = Math.max(12, Math.max(10, peopleFontSize - 2) + 3) * lineHeightMultiplier;
  const cardHasTitle = visibleGuests.some((person) => person.title);
  const cardHasNote = visibleGuests.some((person) => person.note);
  const cardHeight = 6 + GUEST_CARD_AVATAR_SIZE + 6 + cardTitleLine
    + (cardHasTitle ? cardSubLine : 0)
    + (cardHasNote ? cardSubLine : 0) + 6;
  const cardRows = Math.max(1, Math.ceil(visibleGuests.length / Math.max(1, cardColumns)));
  const customText = guests.customText ?? "";
  const customMaxChars = Math.max(8, Math.floor((contentWidth - listAvatarGap) / peopleFontSize));
  const customLines = customText ? wrapGuestCustomText(customText, customMaxChars) : [];
  const customLineHeight = Math.max(16, peopleFontSize + 4) * lineHeightMultiplier;
  // Gap between the header divider and the first custom-text baseline, scaled with the font size.
  const customTopGap = Math.round(peopleFontSize * 0.9) + 11;
  const customHeight = customLines.length > 0
    ? customTopGap + (customLines.length - 1) * customLineHeight + Math.round(peopleFontSize * 0.35) + 8
    : 0;
  const height = guests.padding * 2 + 28 + customHeight
    + (displayMode === "cards"
      ? cardRows * cardHeight + (cardRows - 1) * GUEST_CARD_GAP
      : Math.max(1, visibleGuests.length) * listRowHeight);

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
    listRowHeight,
    listNoteMaxChars: Math.max(8, Math.floor((contentWidth - listAvatarGap) / noteFontSize)),
    cardGap: GUEST_CARD_GAP,
    cardColumns,
    cardWidth,
    cardHeight,
    cardRows,
    cardAvatarSize: GUEST_CARD_AVATAR_SIZE,
    cardTitleLine,
    cardSubLine,
    cardHasTitle,
    cardHasNote,
    customText,
    customLines,
    customLineHeight,
    customTopGap,
    customHeight,
    height,
  };
}

/** Baseline of the first guest row / top edge of the first guest card row. */
export function guestContentTop(guests: GuestPanelSettings, layout: GuestPanelLayout): number {
  return guests.padding + 30 + layout.titleFontSize + layout.customHeight;
}
