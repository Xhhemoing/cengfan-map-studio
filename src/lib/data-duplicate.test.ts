import { describe, expect, it } from "vitest";
import { findDuplicateStudentGroups, normalizeDuplicateKey } from "./data-duplicate";
import type { Student } from "./project-data";

const student = (id: string, patch: Partial<Student> = {}): Student => ({
  id,
  name: " 苏禾 ",
  university: "浙江  大学",
  city: " 杭州市 ",
  visibility: true,
  ...patch,
});

describe("student duplicate detection", () => {
  it("normalizes the four duplicate fields before comparing", () => {
    expect(normalizeDuplicateKey(student("one"))).toBe(normalizeDuplicateKey(student("two", {
      name: "苏禾",
      university: "浙江大学",
      city: "杭州市",
    })));
  });

  it("returns duplicate groups with stable student ids without deleting records", () => {
    const groups = findDuplicateStudentGroups([
      student("one"),
      student("two", { name: "苏禾" }),
      student("different-scope", { locationScope: "international", city: "杭州市" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.studentIds).toEqual(["one", "two"]);
  });
});
