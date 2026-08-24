import { describe, expect, it } from "vitest";
import { createDefaultGuestPanel, type GuestPerson } from "./scene-document";
import { computeGuestPanelMetrics, visibleGuestPeople } from "./render-geometry";

describe("visibleGuestPeople", () => {
  // 旧文档里的嘉宾可能没有 visibility 字段，仍应视为显示。
  const legacyPerson = { id: "g3", name: "张老师" } as GuestPerson;
  const guests = {
    ...createDefaultGuestPanel(),
    people: [
      { id: "g1", name: "王老师", visibility: true },
      { id: "g2", name: "李老师", visibility: false },
      legacyPerson,
    ],
  };

  it("keeps people whose visibility is not explicitly false", () => {
    expect(visibleGuestPeople(guests).map((person) => person.id)).toEqual(["g1", "g3"]);
    expect(visibleGuestPeople({ people: undefined })).toEqual([]);
  });

  it("is the same list the canvas metrics draw", () => {
    expect(computeGuestPanelMetrics(guests, 1).visibleGuests).toEqual(visibleGuestPeople(guests));
  });
});
