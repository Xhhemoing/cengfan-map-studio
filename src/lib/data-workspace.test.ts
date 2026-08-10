import { describe, expect, it } from "vitest";
import {
  applyUniversityAutoLocation,
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

  describe("applyUniversityAutoLocation", () => {
    it("fills city and province from the university catalog when both are empty", () => {
      const draft = createEmptyStudentDraft();
      const next = applyUniversityAutoLocation(draft, "浙江大学");
      expect(next).toMatchObject({
        university: "浙江大学",
        city: "杭州市",
        province: "浙江省",
      });
    });

    it("fills location from a typed alias", () => {
      const next = applyUniversityAutoLocation(createEmptyStudentDraft(), "浙大");
      expect(next).toMatchObject({
        university: "浙大",
        city: "杭州市",
        province: "浙江省",
      });
    });

    it("never overwrites a manually typed city", () => {
      const draft: StudentDraft = { name: "", university: "", city: "宁波市" };
      const next = applyUniversityAutoLocation(draft, "浙江大学");
      expect(next.city).toBe("宁波市");
      // 城市已手动填，省份仍为空则自动补省份
      expect(next.province).toBe("浙江省");
    });

    it("never overwrites a manually typed province", () => {
      const draft: StudentDraft = { name: "", university: "", city: "", province: "江苏省" };
      const next = applyUniversityAutoLocation(draft, "浙江大学");
      expect(next.province).toBe("江苏省");
      expect(next.city).toBe("杭州市");
    });

    it("leaves unknown universities untouched", () => {
      const draft = createEmptyStudentDraft();
      const next = applyUniversityAutoLocation(draft, "火星大学");
      expect(next).toEqual({ name: "", university: "火星大学", city: "", province: undefined });
    });

    it("leaves international drafts untouched", () => {
      const draft: StudentDraft = { name: "", university: "", city: "美国·波士顿", locationScope: "international" };
      const next = applyUniversityAutoLocation(draft, "哈佛大学");
      expect(next.city).toBe("美国·波士顿");
      expect(next.province).toBeUndefined();
    });

    it("keeps an empty university input empty", () => {
      const draft: StudentDraft = { name: "", university: "", city: "北京市" };
      expect(applyUniversityAutoLocation(draft, "")).toEqual({
        name: "",
        university: "",
        city: "北京市",
      });
    });
  });
});
