import { describe, expect, it } from "vitest";
import { migrateStudents } from "./project-migration-students";

describe("student migration destination scope", () => {
  it("normalizes every stored overseas spelling onto the canonical international scope", () => {
    const stored = ["international", "overseas", " Abroad ", "海外", "出国"];

    const migrated = migrateStudents(stored.map((locationScope, index) => ({
      id: `student-${index + 1}`,
      name: "苏禾",
      university: "哈佛大学",
      city: "美国·波士顿",
      locationScope,
    })));

    expect(migrated.map((student) => student.locationScope)).toEqual(stored.map(() => "international"));
    // An overseas city is a foreign place name; running it through the China
    // catalog is what used to rewrite it into the nearest Chinese city.
    expect(migrated.every((student) => student.city === "美国·波士顿")).toBe(true);
  });

  it("drops the stale China province stored next to an aliased overseas record", () => {
    const [student] = migrateStudents([{
      id: "student-overseas",
      name: "苏禾",
      university: "哈佛大学",
      city: "美国·波士顿",
      province: "浙江省",
      locationScope: "海外",
    }]);

    expect(student).toEqual({
      id: "student-overseas",
      name: "苏禾",
      university: "哈佛大学",
      city: "美国·波士顿",
      locationScope: "international",
      visibility: true,
    });
  });

  it("keeps a China destination for every value that is not an overseas marker", () => {
    const migrated = migrateStudents([
      { id: "canonical", name: "林舟", university: "浙江大学", city: "杭州", province: "浙江省", locationScope: "china" },
      { id: "negated", name: "林舟", university: "浙江大学", city: "杭州", province: "浙江省", locationScope: "未出国" },
      { id: "unknown", name: "林舟", university: "浙江大学", city: "杭州", province: "浙江省", locationScope: "国内" },
      { id: "not-a-string", name: "林舟", university: "浙江大学", city: "杭州", province: "浙江省", locationScope: true },
      { id: "absent", name: "林舟", university: "浙江大学", city: "杭州", province: "浙江省" },
    ]);

    expect(migrated.every((student) => !("locationScope" in student))).toBe(true);
    expect(migrated.every((student) => student.province === "浙江省")).toBe(true);
    // A China destination still goes through the city catalog.
    expect(migrated.every((student) => student.city === "杭州市")).toBe(true);
  });
});
