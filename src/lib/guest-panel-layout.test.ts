import { describe, expect, it } from "vitest";
import {
  computeGuestPanelLayout,
  guestContentTop,
  GUEST_CUSTOM_MAX_LINES,
  truncateGuestText,
  wrapGuestCustomText,
} from "./guest-panel-layout";
import type { GuestPanelSettings, GuestPerson } from "./scene-document";

function panel(overrides: Partial<GuestPanelSettings> = {}): GuestPanelSettings {
  return {
    title: "特邀嘉宾",
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
    ...overrides,
  };
}

function person(overrides: Partial<GuestPerson> & { id: string }): GuestPerson {
  return { name: `老师${overrides.id}`, visibility: true, ...overrides };
}

describe("truncateGuestText", () => {
  it("keeps short text and ellipsises anything longer than the budget", () => {
    expect(truncateGuestText("班主任", 8)).toBe("班主任");
    expect(truncateGuestText("桃李满天下万古长青", 5)).toBe("桃李满天…");
    expect(truncateGuestText("任意文本", 0)).toBe("");
  });
});

describe("wrapGuestCustomText", () => {
  it("hard-wraps by width and keeps explicit newlines", () => {
    expect(wrapGuestCustomText("abcdefgh\nij", 3)).toEqual(["abc", "def", "gh", "ij"]);
  });

  it("caps the line count and marks the truncation on the last line", () => {
    const wrapped = wrapGuestCustomText("x".repeat(100), 4);
    expect(wrapped).toHaveLength(GUEST_CUSTOM_MAX_LINES);
    expect(wrapped[GUEST_CUSTOM_MAX_LINES - 1]).toBe("xxx…");
  });

  it("emits one empty line for an empty source line", () => {
    expect(wrapGuestCustomText("", 10)).toEqual([""]);
  });
});

describe("computeGuestPanelLayout", () => {
  it("reserves one list row even when no guest is visible", () => {
    const layout = computeGuestPanelLayout(panel(), 1);
    expect(layout.visibleGuests).toEqual([]);
    expect(layout.displayMode).toBe("list");
    // padding * 2 + header + one placeholder row.
    expect(layout.height).toBe(14 * 2 + 28 + layout.listRowHeight);
  });

  it("skips hidden guests and only reserves the avatar column when one has an image", () => {
    const withoutAvatar = computeGuestPanelLayout(panel({
      people: [person({ id: "g1" }), person({ id: "g2", visibility: false })],
    }), 1);
    expect(withoutAvatar.visibleGuests.map((guest) => guest.id)).toEqual(["g1"]);
    expect(withoutAvatar.listUsesAvatar).toBe(false);
    expect(withoutAvatar.listAvatarGap).toBe(0);

    const withAvatar = computeGuestPanelLayout(panel({
      people: [person({ id: "g1", avatarSrc: "data:image/png;base64,AA==" })],
    }), 1);
    expect(withAvatar.listUsesAvatar).toBe(true);
    expect(withAvatar.listAvatarGap).toBe(withAvatar.listAvatarSize + 8);
  });

  it("adds a note line to every list row as soon as one guest carries a note", () => {
    const plain = computeGuestPanelLayout(panel({
      people: [person({ id: "g1" }), person({ id: "g2" })],
    }), 1);
    const noted = computeGuestPanelLayout(panel({
      people: [person({ id: "g1" }), person({ id: "g2", note: "桃李满天下" })],
    }), 1);
    expect(noted.listRowHeight).toBeGreaterThan(plain.listRowHeight);
    expect(noted.height).toBe(plain.height + (noted.listRowHeight - plain.listRowHeight) * 2);
  });

  it("lays cards out in a grid and grows the panel per row", () => {
    const people = ["g1", "g2", "g3"].map((id) => person({ id }));
    const layout = computeGuestPanelLayout(panel({ displayMode: "cards", people }), 1);
    expect(layout.displayMode).toBe("cards");
    expect(layout.cardColumns).toBe(2);
    expect(layout.cardRows).toBe(2);
    expect(layout.cardWidth).toBe((280 - 14 * 2 - layout.cardGap) / 2);
    expect(layout.height).toBe(14 * 2 + 28 + layout.cardRows * layout.cardHeight + layout.cardGap);
  });

  it("scales row and card metrics with the canvas line height", () => {
    const single = computeGuestPanelLayout(panel({ people: [person({ id: "g1" })] }), 1);
    const loose = computeGuestPanelLayout(panel({ people: [person({ id: "g1" })] }), 1.6);
    expect(loose.listRowHeight).toBeGreaterThan(single.listRowHeight);
    expect(loose.cardTitleLine).toBeCloseTo(single.cardTitleLine * 1.6, 6);
  });

  it("pushes the guest content down by the wrapped custom text block", () => {
    const guests = panel({ customText: "祝各位前程似锦", people: [person({ id: "g1" })] });
    const layout = computeGuestPanelLayout(guests, 1);
    expect(layout.customLines).toEqual(["祝各位前程似锦"]);
    expect(layout.customHeight).toBeGreaterThan(0);
    expect(guestContentTop(guests, layout))
      .toBe(guests.padding + 30 + layout.titleFontSize + layout.customHeight);
    expect(layout.height)
      .toBe(computeGuestPanelLayout(panel({ people: [person({ id: "g1" })] }), 1).height + layout.customHeight);
  });

  it("honours typography overrides for the title and people font sizes", () => {
    const layout = computeGuestPanelLayout(panel({
      titleTypography: { fontSize: 19 },
      peopleTypography: { fontSize: 11, color: "#556677" },
    }), 1);
    expect(layout.titleFontSize).toBe(19);
    expect(layout.peopleFontSize).toBe(11);
    expect(layout.noteFontSize).toBe(10);
    expect(layout.peopleTypography.color).toBe("#556677");
  });
});
