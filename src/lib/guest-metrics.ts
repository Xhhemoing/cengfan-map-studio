/**
 * Guest panel sizing math shared by the poster renderer and the delivery
 * health check, so occlusion/overflow warnings use the panel's real height
 * instead of a fixed guess.
 */
import type { GuestPanelSettings } from "./scene-document";

export const GUEST_CUSTOM_MAX_LINES = 14;

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

export interface GuestPanelMetrics {
  visibleGuests: GuestPanelSettings["people"];
  guestTitleTypography: NonNullable<GuestPanelSettings["titleTypography"]>;
  guestPeopleTypography: NonNullable<GuestPanelSettings["peopleTypography"]>;
  guestTitleFontSize: number;
  guestPeopleFontSize: number;
  guestNoteFontSize: number;
  guestsDisplayMode: "list" | "cards";
  guestListAvatarSize: number;
  guestListUsesAvatar: boolean;
  guestListAvatarGap: number;
  guestRowHeight: number;
  guestCardGap: number;
  guestCardColumns: number;
  guestCardWidth: number;
  guestCardAvatarSize: number;
  guestCardTitleLine: number;
  guestCardSubLine: number;
  guestCardHasTitle: boolean;
  guestCardHeight: number;
  guestCustomText: string;
  guestCustomLines: string[];
  guestCustomLineHeight: number;
  guestCustomTopGap: number;
  guestCustomHeight: number;
  guestHeight: number;
}

export function computeGuestPanelMetrics(guests: GuestPanelSettings, lineHeightMultiplier: number): GuestPanelMetrics {
  const visibleGuests = guests.people.filter((person) => person.visibility !== false);
  const guestTitleTypography = guests.titleTypography ?? {};
  const guestPeopleTypography = guests.peopleTypography ?? {};
  const guestTitleFontSize = guestTitleTypography.fontSize ?? guests.fontSize + 1;
  const guestPeopleFontSize = guestPeopleTypography.fontSize ?? guests.fontSize;
  const guestNoteFontSize = Math.max(10, guestPeopleFontSize - 2);
  const guestsDisplayMode = guests.displayMode === "cards" ? "cards" as const : "list" as const;
  const guestListAvatarSize = Math.max(22, guestPeopleFontSize + 8);
  const guestListUsesAvatar = visibleGuests.some((person) => person.avatarSrc);
  const guestListAvatarGap = guestListUsesAvatar ? guestListAvatarSize + 8 : 0;
  const guestNoteLineHeight = Math.max(13, guestNoteFontSize + 3) * lineHeightMultiplier;
  const guestListNoteLines = visibleGuests.some((person) => person.note) ? guestNoteLineHeight : 0;
  const guestRowHeight = Math.max(guestListAvatarSize, Math.max(16, guestPeopleFontSize + 6) * lineHeightMultiplier) + guestListNoteLines;
  const guestCardGap = 10;
  const guestCardMinWidth = 92;
  const guestCardColumns = Math.max(1, Math.floor((guests.width - guests.padding * 2 + guestCardGap) / (guestCardMinWidth + guestCardGap)));
  const guestCardWidth = (guests.width - guests.padding * 2 - (guestCardColumns - 1) * guestCardGap) / guestCardColumns;
  const guestCardAvatarSize = 40;
  const guestCardTitleLine = Math.max(15, guestPeopleFontSize + 5) * lineHeightMultiplier;
  const guestCardSubLine = Math.max(12, Math.max(10, guestPeopleFontSize - 2) + 3) * lineHeightMultiplier;
  const guestCardHasTitle = visibleGuests.some((person) => person.title);
  const guestCardHasNote = visibleGuests.some((person) => person.note);
  const guestCardHeight = 6 + guestCardAvatarSize + 6 + guestCardTitleLine
    + (guestCardHasTitle ? guestCardSubLine : 0)
    + (guestCardHasNote ? guestCardSubLine : 0) + 6;
  const guestCardRows = Math.max(1, Math.ceil(visibleGuests.length / Math.max(1, guestCardColumns)));
  const guestCustomText = guests.customText ?? "";
  const guestCustomMaxChars = Math.max(8, Math.floor((guests.width - guests.padding * 2 - guestListAvatarGap) / guestPeopleFontSize));
  const guestCustomLines = guestCustomText ? wrapGuestCustomText(guestCustomText, guestCustomMaxChars) : [];
  const guestCustomLineHeight = Math.max(16, guestPeopleFontSize + 4) * lineHeightMultiplier;
  // Gap between the header divider and the first custom-text baseline, scaled with the font size.
  const guestCustomTopGap = Math.round(guestPeopleFontSize * 0.9) + 11;
  const guestCustomHeight = guestCustomLines.length > 0
    ? guestCustomTopGap + (guestCustomLines.length - 1) * guestCustomLineHeight + Math.round(guestPeopleFontSize * 0.35) + 8
    : 0;
  const guestHeight = guests.padding * 2 + 28 + guestCustomHeight
    + (guestsDisplayMode === "cards"
      ? guestCardRows * guestCardHeight + (guestCardRows - 1) * guestCardGap
      : Math.max(1, visibleGuests.length) * guestRowHeight);
  return {
    visibleGuests,
    guestTitleTypography,
    guestPeopleTypography,
    guestTitleFontSize,
    guestPeopleFontSize,
    guestNoteFontSize,
    guestsDisplayMode,
    guestListAvatarSize,
    guestListUsesAvatar,
    guestListAvatarGap,
    guestRowHeight,
    guestCardGap,
    guestCardColumns,
    guestCardWidth,
    guestCardAvatarSize,
    guestCardTitleLine,
    guestCardSubLine,
    guestCardHasTitle,
    guestCardHeight,
    guestCustomText,
    guestCustomLines,
    guestCustomLineHeight,
    guestCustomTopGap,
    guestCustomHeight,
    guestHeight,
  };
}
