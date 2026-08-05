import { describe, expect, it } from "vitest";
import {
  buildStudentRecords,
  normalizeCityName,
  resolveCityLocation,
  resolveStudentLocation,
  validateStudentInput,
  type StudentInput,
} from "./student-data";
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
