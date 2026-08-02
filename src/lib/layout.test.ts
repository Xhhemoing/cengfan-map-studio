import { describe, expect, it } from "vitest";
import {
  buildCitySections,
  buildLayoutGroups,
  buildSchoolRows,
  chooseLayoutStrategy,
  formatSchoolRow,
  schoolRowParts,
  type LayoutStudent,
} from "./layout";

const students: LayoutStudent[] = [
  { id: "1", name: "林舟", university: "北京大学", city: "北京市", visibility: true },
  { id: "2", name: "陈宁", university: "清华大学", city: "北京市", visibility: true },
  { id: "3", name: "苏禾", university: "浙江大学", city: "杭州市", visibility: true },
  { id: "4", name: "顾言", university: "复旦大学", city: "上海市", visibility: true },
  { id: "5", name: "沈青", university: "南京大学", city: "南京市", visibility: true },
  { id: "6", name: "周岚", university: "北京大学", city: "北京市", visibility: true },
];

describe("layout engine", () => {
  it("groups by province, city, or university", () => {
    const provinceKeys = buildLayoutGroups(students, "province").map((group) => group.key);
    expect(provinceKeys).toEqual(["北京市", "江苏省", "上海市", "浙江省"]);
    expect(new Set(provinceKeys)).toEqual(new Set(["北京市", "浙江省", "上海市", "江苏省"]));
    expect(buildLayoutGroups(students, "city")[0]).toMatchObject({
      key: "北京市",
      count: 3,
    });
    expect(buildLayoutGroups(students, "university")).toHaveLength(5);
  });

  it("ensures every student appears exactly once", () => {
    for (const grouping of ["province", "city", "university"] as const) {
      const groups = buildLayoutGroups(students, grouping);
      const ids = groups.flatMap((group) => group.students.map((student) => student.id));
      expect(ids).toHaveLength(students.length);
      expect(new Set(ids).size).toBe(students.length);
    }
  });

  it("excludes hidden students before grouping cards", () => {
    const groups = buildLayoutGroups(
      [...students, { ...students[0]!, id: "hidden", visibility: false }],
      "province",
    );

    expect(groups.flatMap((group) => group.students.map((student) => student.id))).not.toContain(
      "hidden",
    );
  });

  it("merges same-school students inside a province card", () => {
    const beijing = buildLayoutGroups(students, "province").find((group) => group.key === "北京市")!;
    const rows = buildSchoolRows(beijing.students);
    expect(rows).toEqual([
      {
        university: "北京大学",
        names: ["林舟", "周岚"],
        studentIds: ["1", "6"],
      },
      {
        university: "清华大学",
        names: ["陈宁"],
        studentIds: ["2"],
      },
    ]);
    expect(formatSchoolRow(rows[0]!, ["name", "university", "city"], "北京市")).toBe(
      "北京大学 · 林舟、周岚 · 北京市",
    );
    expect(schoolRowParts(rows[0]!, ["name", "university", "city"], "北京市")).toEqual([
      { field: "university", value: "北京大学" },
      { field: "name", value: "林舟、周岚" },
      { field: "city", value: "北京市" },
    ]);
  });

  it("respects hidden fields without forcing a fallback value", () => {
    const beijing = buildLayoutGroups(students, "province").find((group) => group.key === "北京市")!;
    const rows = buildSchoolRows(beijing.students);

    expect(schoolRowParts(rows[0]!, ["name"], "北京市")).toEqual([{ field: "name", value: "林舟、周岚" }]);
    expect(schoolRowParts(rows[0]!, ["city"], "北京市")).toEqual([{ field: "city", value: "北京市" }]);
    expect(schoolRowParts(rows[0]!, ["university"], "北京市")).toEqual([{ field: "university", value: "北京大学" }]);
    // Unchecking the school field must not silently bring the university back.
    expect(schoolRowParts(rows[0]!, [], "北京市")).toEqual([]);
  });

  it("groups province-card content into stably sorted city sections", () => {
    const sections = buildCitySections([
      { id: "nb-1", name: "甲", university: "宁波大学", city: "宁波市", province: "浙江省", visibility: true },
      { id: "hz-1", name: "乙", university: "浙江大学", city: "杭州市", province: "浙江省", visibility: true },
      { id: "hz-2", name: "丙", university: "浙江大学", city: "杭州市", province: "浙江省", visibility: true },
    ]);

    expect(sections.map((section) => section.city)).toEqual(["杭州市", "宁波市"]);
    expect(sections[0]).toMatchObject({
      count: 2,
      rows: [{ university: "浙江大学", names: ["乙", "丙"] }],
    });
    expect(sections.flatMap((section) => section.rows.flatMap((row) => row.studentIds))).toHaveLength(3);
  });

  it("recommends denser layout as class size grows", () => {
    expect(chooseLayoutStrategy(24)).toEqual({
      grouping: "province",
      cardPreset: "standard",
      densify: false,
    });
    expect(chooseLayoutStrategy(42)).toEqual({
      grouping: "province",
      cardPreset: "standard",
      densify: false,
    });
    expect(chooseLayoutStrategy(63)).toEqual({
      grouping: "province",
      cardPreset: "compact",
      densify: true,
    });
    expect(chooseLayoutStrategy(88)).toMatchObject({
      densify: true,
      warning: expect.stringContaining("70"),
    });
  });
});
