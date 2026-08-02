import { describe, expect, it } from "vitest";
import {
  confirmImportCandidates,
  createEmptyStudentDraft,
  removeStudent,
  toggleStudentVisibility,
  updateStudent,
  updateStudentDraft,
  type StudentDraft,
} from "./data-workspace";
import type { Student } from "./project-data";

const students: Student[] = [
  {
    id: "student-1",
    name: "林舟",
    university: "北京大学",
    city: "北京市",
    visibility: true,
  },
  {
    id: "student-2",
    name: "苏禾",
    university: "浙江大学",
    city: "杭州市",
    visibility: false,
  },
];

describe("data workspace helpers", () => {
  it("creates an empty three-field draft", () => {
    expect(createEmptyStudentDraft()).toEqual({
      name: "",
      university: "",
      city: "",
    });
  });

  it("updates one draft field without touching others", () => {
    const draft: StudentDraft = { name: "林舟", university: "", city: "北京" };
    expect(updateStudentDraft(draft, "university", "北京大学")).toEqual({
      name: "林舟",
      university: "北京大学",
      city: "北京",
    });
  });

  it("updates one student with a stable id without mutating the original record", () => {
    const updated = updateStudent(students, "student-1", { city: "杭州市" });

    expect(updated[0]).toMatchObject({ id: "student-1", city: "杭州市" });
    expect(students[0]?.city).toBe("北京市");
    expect(updated[1]).toBe(students[1]);
  });

  it("toggles only the selected student's visibility", () => {
    const updated = toggleStudentVisibility(students, "student-1");

    expect(updated[0]?.visibility).toBe(false);
    expect(updated[1]).toBe(students[1]);
  });

  it("hides a legacy record whose visibility has not yet been migrated", () => {
    const legacyStudent = {
      id: "student-legacy",
      name: "旧草稿同学",
      university: "北京大学",
      city: "北京市",
    } as unknown as Student;

    expect(toggleStudentVisibility([legacyStudent], "student-legacy")[0]?.visibility).toBe(false);
  });

  it("removes only the selected student", () => {
    expect(removeStudent(students, "student-1")).toEqual([students[1]]);
    expect(students).toHaveLength(2);
  });

  it("confirms selected import candidates into student records", () => {
    const result = confirmImportCandidates([
      {
        name: "林舟",
        university: "北京大学",
        city: "北京",
        sourceLine: 1,
        rawLine: "林舟 北京大学 北京",
        accepted: true,
      },
      {
        name: "无效",
        university: "",
        city: "火星",
        sourceLine: 2,
        rawLine: "无效",
        accepted: true,
      },
      {
        name: "苏禾",
        university: "浙江大学",
        city: "杭州",
        sourceLine: 3,
        rawLine: "苏禾 浙江大学 杭州",
        accepted: false,
      },
    ]);

    expect(result.students).toHaveLength(1);
    expect(result.students[0]).toMatchObject({
      name: "林舟",
      university: "北京大学",
      city: "北京市",
      visibility: true,
    });
    expect(result.students[0]).not.toHaveProperty("province");
    expect(result.rejected).toHaveLength(2);
    expect(result.issues.some((issue) => issue.code === "missing_field")).toBe(true);
  });
});
