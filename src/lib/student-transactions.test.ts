import { describe, expect, it } from "vitest";
import {
  appendStudentsTransaction,
  applyStudentPatch,
  deleteStudentTransaction,
  replaceStudentsTransaction,
  setStudentsVisibilityTransaction,
  toggleStudentVisibilityTransaction,
  updateStudentTransaction,
} from "./student-transactions";
import { createProjectDocument } from "./project-document";
import type { Student } from "./project-data";

function student(id: string, overrides: Partial<Student> = {}): Student {
  return { id, name: id, university: "某大学", city: "杭州", province: "浙江省", visibility: true, ...overrides };
}

function documentWith(students: Student[]) {
  return createProjectDocument({ students, templateId: "original", dataView: "province" });
}

describe("applyStudentPatch", () => {
  it("drops the province key instead of leaving it undefined", () => {
    const patched = applyStudentPatch(student("s1"), { province: undefined });

    expect("province" in patched).toBe(false);
  });

  it("drops province and scope together when both are cleared", () => {
    const patched = applyStudentPatch(student("s1", { locationScope: "international" }), {
      province: undefined,
      locationScope: undefined,
    });

    expect("province" in patched).toBe(false);
    expect("locationScope" in patched).toBe(false);
  });

  it("drops only the scope when the province stays", () => {
    const patched = applyStudentPatch(student("s1", { locationScope: "international" }), { locationScope: undefined });

    expect(patched.province).toBe("浙江省");
    expect("locationScope" in patched).toBe(false);
  });

  it("keeps untouched fields", () => {
    const patched = applyStudentPatch(student("s1"), { name: "改名" });

    expect(patched).toMatchObject({ name: "改名", university: "某大学", province: "浙江省" });
  });
});

describe("student transactions", () => {
  it("appends and replaces the roster with import provenance", () => {
    const base = documentWith([student("s1")]);

    const appended = appendStudentsTransaction([student("s2")]);
    const replaced = replaceStudentsTransaction([student("s3")]);

    expect(appended.source).toBe("import");
    expect(appended.apply(base).students.map((item) => item.id)).toEqual(["s1", "s2"]);
    expect(replaced.apply(base).students.map((item) => item.id)).toEqual(["s3"]);
    expect(appended.label).toContain("追加 1 名学生");
  });

  it("edits and deletes a single record without touching the others", () => {
    const base = documentWith([student("s1"), student("s2")]);

    expect(updateStudentTransaction("s1", { name: "改名" }).apply(base).students[0]!.name).toBe("改名");
    expect(updateStudentTransaction("s1", { name: "改名" }).apply(base).students[1]!.name).toBe("s2");
    expect(deleteStudentTransaction("s1").apply(base).students.map((item) => item.id)).toEqual(["s2"]);
  });

  it("flips only the addressed record when toggling visibility", () => {
    const base = documentWith([student("s1"), student("s2", { visibility: false })]);

    const hidden = toggleStudentVisibilityTransaction("s1").apply(base);
    const shown = toggleStudentVisibilityTransaction("s2").apply(base);

    expect(hidden.students[0]!.visibility).toBe(false);
    expect(hidden.students[1]!.visibility).toBe(false);
    expect(shown.students[0]!.visibility).toBe(true);
    expect(shown.students[1]!.visibility).toBe(true);
  });

  it("flips visibility for the whole roster in one labelled step", () => {
    const base = documentWith([student("s1"), student("s2", { visibility: false })]);

    const hide = setStudentsVisibilityTransaction(false);

    expect(hide.label).toBe("全部隐藏学生");
    expect(hide.apply(base).students.every((item) => item.visibility === false)).toBe(true);
    expect(setStudentsVisibilityTransaction(true).apply(base).students.every((item) => item.visibility)).toBe(true);
  });
});
