import { describe, expect, it } from "vitest";
import {
  buildStudentRecords,
  isOverseasStudent,
  normalizeCityName,
  resolveCityLocation,
  resolveStudentLocation,
  validateStudentInput,
  type StudentInput,
} from "./student-data";
import { duplicateStudentIds } from "./data-duplicate";
import type { Student } from "./project-data";

describe("student data", () => {
  it("validates required three fields", () => {
    const issues = validateStudentInput({
      name: "  ",
      university: "北京大学",
      city: "北京市",
    });

    expect(issues).toEqual([
      {
        code: "missing_field",
        field: "name",
        level: "error",
        message: "学生名称不能为空",
      },
    ]);
  });

  it("normalizes city aliases and derives province", () => {
    expect(normalizeCityName("杭州")).toBe("杭州市");
    expect(resolveCityLocation("杭州市")).toEqual({
      city: "杭州市",
      province: "浙江省",
      status: "resolved",
    });
    expect(resolveCityLocation("未知镇")).toEqual({
      city: "未知镇",
      province: "",
      status: "unresolved",
    });
  });

  it("uses an explicit manual province when available", () => {
    const student: Student = {
      id: "student-1",
      name: "林舟",
      university: "北京大学",
      city: "火星市",
      province: "北京市",
      visibility: false,
    };

    expect(resolveStudentLocation(student)).toMatchObject({
      city: "火星市",
      province: "北京市",
      status: "resolved",
    });
  });

  it("keeps a custom manual province resolved with its original name", () => {
    const student: Student = {
      id: "student-1",
      name: "林舟",
      university: "北京大学",
      city: "火星市",
      province: "火星省",
      visibility: true,
    };

    expect(resolveStudentLocation(student)).toMatchObject({
      city: "火星市",
      province: "火星省",
      status: "resolved",
    });
  });

  it("ignores a province override that only holds invisible characters", () => {
    // A zero-width cell survives trim() and would otherwise mark an unlocatable
    // city as resolved, silently retiring the 城市未匹配 warning.
    const student: Student = {
      id: "student-1",
      name: "林舟",
      university: "北京大学",
      city: "火星市",
      province: "\u200b\uFEFF",
      visibility: true,
    };

    expect(resolveStudentLocation(student)).toMatchObject({
      city: "火星市",
      province: "",
      status: "unresolved",
    });
  });

  it("ignores a province left behind on an overseas destination", () => {
    // Imports strip the province of an overseas row, but a hand-edited project
    // file or an older archive can still carry one. Read as an override it puts
    // 哈佛大学 into the 浙江省 card and the 浙江省 pin on the China map.
    const student: Student = {
      id: "student-1",
      name: "苏禾",
      university: "哈佛大学",
      city: "美国·波士顿",
      province: "浙江省",
      locationScope: "international",
      visibility: true,
    };

    expect(resolveStudentLocation(student)).toEqual({
      city: "美国·波士顿",
      province: "",
      status: "unresolved",
    });
  });

  it("ignores a Chinese city on an overseas record instead of deriving its province", () => {
    // The city column alone used to decide the province, so an overseas record
    // whose city happens to match the China catalog was placed on the map even
    // without a province cell to blame.
    const student: Student = {
      id: "student-1",
      name: "苏禾",
      university: "香港大学",
      city: "杭州市",
      locationScope: "international",
      visibility: true,
    };

    expect(resolveStudentLocation(student)).toEqual({
      city: "杭州市",
      province: "",
      status: "unresolved",
    });
    expect(resolveCityLocation("杭州市").province).toBe("浙江省");
  });

  it("keeps resolving a record that is explicitly a China destination", () => {
    const student: Student = {
      id: "student-1",
      name: "林舟",
      university: "浙江大学",
      city: "杭州市",
      locationScope: "china",
      visibility: true,
    };

    expect(isOverseasStudent(student)).toBe(false);
    expect(isOverseasStudent({ locationScope: undefined })).toBe(false);
    expect(isOverseasStudent({ locationScope: "international" })).toBe(true);
    expect(resolveStudentLocation(student)).toMatchObject({ province: "浙江省", status: "resolved" });
  });

  it("reads a stored overseas record exactly as the importer built it", () => {
    const imported = buildStudentRecords([
      { name: "苏禾", university: "哈佛大学", city: "美国·波士顿", province: "浙江省", locationScope: "international" },
    ]).students[0]!;
    const handEdited: Student = { ...imported, province: "浙江省" };

    expect(resolveStudentLocation(handEdited)).toEqual(resolveStudentLocation(imported));
  });

  it("builds student records and flags unresolved cities and duplicates", () => {
    const inputs: StudentInput[] = [
      { name: "林舟", university: "北京大学", city: "北京" },
      { name: "林舟", university: "北京大学", city: "北京市" },
      { name: "小陈", university: "神秘大学", city: "火星市" },
    ];

    const result = buildStudentRecords(inputs);

    expect(result.students).toHaveLength(3);
    expect(result.students[0]).toEqual({
      id: expect.stringMatching(/^student-/),
      name: "林舟",
      university: "北京大学",
      city: "北京市",
      visibility: true,
    });
    expect(result.students[2]).not.toHaveProperty("province");
    expect(result.students[2]).not.toHaveProperty("major");
    expect(result.students[2]).not.toHaveProperty("locationStatus");
    expect(result.students[2]).not.toHaveProperty("raw");
    expect(result.issues.some((issue) => issue.code === "duplicate_name")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "unresolved_city")).toBe(true);
  });

  it("derives a student's location from city when manual province is absent", () => {
    const student: Student = {
      id: "student-1",
      name: "林舟",
      university: "北京大学",
      city: "北京市",
      visibility: false,
    };

    expect(resolveStudentLocation(student)).toMatchObject({
      city: "北京市",
      province: "北京市",
      status: "resolved",
    });
  });

  it("keys duplicate warnings on name and university, not on the name alone", () => {
    const sameSchool = buildStudentRecords([
      { name: "林舟", university: "北京大学", city: "北京市" },
      { name: "林舟", university: "北京大学", city: "北京市" },
    ]);
    const differentSchools = buildStudentRecords([
      { name: "林舟", university: "北京大学", city: "北京市" },
      { name: "林舟", university: "浙江大学", city: "杭州市" },
    ]);

    expect(sameSchool.issues.filter((issue) => issue.code === "duplicate_name")).toEqual([
      expect.objectContaining({ level: "warning", message: "存在重复学生记录：林舟 · 北京大学" }),
    ]);
    expect(differentSchools.issues.some((issue) => issue.code === "duplicate_name")).toBe(false);
  });

  it("keeps a manual province and treats the record as located", () => {
    const result = buildStudentRecords([
      { name: "林舟", university: "火星学院", city: "火星城", province: "火星省" },
    ]);

    expect(result.students[0]).toMatchObject({ city: "火星城", province: "火星省" });
    expect(result.issues.some((issue) => issue.code === "unresolved_city")).toBe(false);
  });

  it("does not require or keep a Chinese province for an overseas destination", () => {
    const result = buildStudentRecords([
      { name: "周晴", university: "哈佛大学", city: "美国·波士顿", province: "马萨诸塞州", locationScope: "international" },
    ]);

    expect(result.students[0]).toMatchObject({ city: "美国·波士顿", locationScope: "international" });
    expect(result.students[0]).not.toHaveProperty("province");
    expect(result.issues).toEqual([]);
  });

  it("still reports an unresolved China city when no province override is given", () => {
    const result = buildStudentRecords([
      { name: "林舟", university: "火星学院", city: "火星城" },
    ]);

    expect(result.issues).toEqual([
      expect.objectContaining({ code: "unresolved_city", studentIndex: 0 }),
    ]);
  });

  it("rejects a name made only of invisible characters", () => {
    for (const name of ["   ", "\u3000", "\u200b", "\uFEFF "]) {
      expect(validateStudentInput({ name, university: "北京大学", city: "北京市" })).toEqual([
        expect.objectContaining({ code: "missing_field", field: "name", level: "error" }),
      ]);
    }

    const built = buildStudentRecords([
      { name: "\u200b", university: "北京大学", city: "北京市" },
      { name: " 林舟 ", university: "北京大学", city: "北京市" },
    ]);

    expect(built.issues).toEqual([
      expect.objectContaining({ code: "missing_field", field: "name", studentIndex: 0 }),
    ]);
    expect(built.students[0]?.name).toBe("");
    expect(built.students[1]?.name).toBe("林舟");
  });

  it("stores the cleaned spelling of a padded or dotted imported name", () => {
    const result = buildStudentRecords([
      { name: "林  舟", university: "北京大学", city: "北京市" },
      { name: "苏\u00a0禾", university: "浙江大学", city: "杭州市" },
      { name: "阿依古丽・买买提", university: "新疆大学", city: "乌鲁木齐市" },
      { name: "Wang  Xiao Ming", university: "北京大学", city: "北京市" },
    ]);

    expect(result.students.map((student) => student.name)).toEqual([
      "林舟",
      "苏禾",
      "阿依古丽·买买提",
      "Wang Xiao Ming",
    ]);
  });

  it("treats names that differ only in padding as the same duplicate record", () => {
    const result = buildStudentRecords([
      { name: "林舟", university: "北京大学", city: "北京市" },
      { name: "林 舟", university: "北京大学", city: "北京市" },
    ]);

    expect(result.issues.filter((issue) => issue.code === "duplicate_name")).toEqual([
      expect.objectContaining({ message: "存在重复学生记录：林舟 · 北京大学" }),
    ]);
  });

  it("keeps a city-only input as an error-flagged record naming both gaps", () => {
    const result = buildStudentRecords([{ name: "  ", university: "", city: "杭州市" }]);

    expect(result.issues.map((issue) => issue.field)).toEqual(["name", "university"]);
    expect(result.issues.every((issue) => issue.level === "error")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "unresolved_city")).toBe(false);
  });

  it("flags a duplicate whose school differs only in full-width letters", () => {
    // Typed with a Chinese IME left in full-width mode. Before the NFKC fold
    // the import review said the roster was clean and the health panel then
    // reported both rows as 重复记录.
    const result = buildStudentRecords([
      { name: "苏禾", university: "Harvard University", city: "美国·波士顿", locationScope: "international" },
      { name: "苏禾", university: "Ｈａｒｖａｒｄ　Ｕｎｉｖｅｒｓｉｔｙ", city: "美国·波士顿", locationScope: "international" },
    ]);

    expect(result.issues.filter((issue) => issue.code === "duplicate_name")).toEqual([
      expect.objectContaining({ level: "warning", message: "存在重复学生记录：苏禾 · Harvard University" }),
    ]);
  });

  it("flags a duplicate whose school differs only in middle-dot variant", () => {
    const result = buildStudentRecords([
      { name: "苏禾", university: "圣彼得堡·国立大学", city: "俄罗斯·圣彼得堡", locationScope: "international" },
      { name: "苏禾", university: "圣彼得堡・国立大学", city: "俄罗斯·圣彼得堡", locationScope: "international" },
    ]);

    expect(result.issues.filter((issue) => issue.code === "duplicate_name")).toHaveLength(1);
  });

  it("flags a duplicate whose name differs only in full-width letters", () => {
    const result = buildStudentRecords([
      { name: "Ｌｉｎ Ｚｈｏｕ", university: "北京大学", city: "北京市" },
      { name: "Lin Zhou", university: "北京大学", city: "北京市" },
    ]);

    expect(result.issues.filter((issue) => issue.code === "duplicate_name")).toHaveLength(1);
    // Only the grouping key is folded; each record keeps the spelling as typed.
    expect(result.students.map((student) => student.name)).toEqual(["Ｌｉｎ Ｚｈｏｕ", "Lin Zhou"]);
  });

  it("agrees with the roster health grouping on which records are duplicates", () => {
    const result = buildStudentRecords([
      { name: "苏禾", university: "Harvard University", city: "美国·波士顿", locationScope: "international" },
      { name: "苏禾", university: "Ｈａｒｖａｒｄ　Ｕｎｉｖｅｒｓｉｔｙ", city: "美国·波士顿", locationScope: "international" },
      { name: "林舟", university: "北京大学", city: "北京市" },
    ]);

    const flaggedAtImport = result.issues.filter((issue) => issue.code === "duplicate_name").length > 0;

    expect(flaggedAtImport).toBe(true);
    expect(duplicateStudentIds(result.students).size).toBe(2);
  });

  it("keeps two genuinely different schools out of the duplicate warning", () => {
    const result = buildStudentRecords([
      { name: "苏禾", university: "北京大学", city: "北京市" },
      { name: "苏禾", university: "北京师范大学", city: "北京市" },
    ]);

    expect(result.issues.some((issue) => issue.code === "duplicate_name")).toBe(false);
  });

  it("trims confirmed fields without persisting source-only input", () => {
    const result = buildStudentRecords([
      {
        name: "苏禾",
        university: "浙江大学",
        city: "杭州市",
        raw: { name: "苏禾", university: "浙江大学", city: "杭州市" },
      },
    ]);

    expect(result.students[0]?.name).toBe("苏禾");
    expect(result.students[0]?.university).toBe("浙江大学");
    expect(result.students[0]?.city).toBe("杭州市");
    expect(result.students[0]).not.toHaveProperty("raw");
  });
});
