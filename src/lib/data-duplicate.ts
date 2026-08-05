import type { Student } from "./project-data";

export interface DuplicateStudentGroup {
  key: string;
  studentIds: string[];
}

function normalizeDuplicateValue(value: string | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, "");
}

export function normalizeDuplicateKey(student: Pick<Student, "name" | "university" | "city" | "locationScope">): string {
  return [
    student.name,
    student.university,
    student.city,
    student.locationScope === "international" ? "international" : "china",
  ].map(normalizeDuplicateValue).join("\u001f");
}

export function findDuplicateStudentGroups(students: Array<Pick<Student, "id" | "name" | "university" | "city" | "locationScope">>): DuplicateStudentGroup[] {
  const groups = new Map<string, string[]>();
  for (const student of students) {
    const key = normalizeDuplicateKey(student);
    const ids = groups.get(key) ?? [];
    ids.push(student.id);
    groups.set(key, ids);
  }
  return [...groups.entries()]
    .filter(([, studentIds]) => studentIds.length > 1)
    .map(([key, studentIds]) => ({ key, studentIds }));
}

export function duplicateStudentIds(students: Array<Pick<Student, "id" | "name" | "university" | "city" | "locationScope">>): Set<string> {
  return new Set(findDuplicateStudentGroups(students).flatMap((group) => group.studentIds));
}
