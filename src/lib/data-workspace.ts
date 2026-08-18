import type { ImportCandidate } from "./import-data";
import {
  buildStudentRecords,
  type StudentIssue,
} from "./student-data";
import { resolveUniversity } from "./search-university-catalog";
import type { Student } from "./project-data";

export interface StudentDraft {
  name: string;
  university: string;
  city: string;
  province?: string;
  locationScope?: "china" | "international";
}

export interface ImportReviewRow extends ImportCandidate {
  accepted: boolean;
}

export interface ConfirmImportResult {
  students: Student[];
  rejected: ImportReviewRow[];
  issues: StudentIssue[];
}

export function createEmptyStudentDraft(): StudentDraft {
  return {
    name: "",
    university: "",
    city: "",
  };
}

export function updateStudentDraft(
  draft: StudentDraft,
  field: keyof StudentDraft,
  value: string,
): StudentDraft {
  return {
    ...draft,
    [field]: value,
  };
}

/**
 * Apply the university catalog to a draft when the university changes:
 * fills city/province ONLY while they are still empty, so manual overrides
 * typed by the user are never clobbered by auto-completion. Unknown schools
 * and international destinations are left untouched (manual input stays).
 */
export function applyUniversityAutoLocation(
  draft: StudentDraft,
  university: string,
): StudentDraft {
  const next = updateStudentDraft(draft, "university", university);
  if (next.locationScope === "international" || !university.trim()) return next;
  const resolution = resolveUniversity(university);
  if (resolution.status !== "resolved") return next;
  return {
    ...next,
    city: next.city.trim() ? next.city : resolution.city,
    province: next.province?.trim() ? next.province : resolution.province,
  };
}

export function updateStudent(
  students: Student[],
  id: string,
  patch: Partial<Pick<Student, "name" | "university" | "city" | "province">>,
): Student[] {
  return students.map((student) => (student.id === id ? { ...student, ...patch } : student));
}

export function toggleStudentVisibility(students: Student[], id: string): Student[] {
  return students.map((student) =>
    student.id === id ? { ...student, visibility: student.visibility === false } : student,
  );
}

export function removeStudent(students: Student[], id: string): Student[] {
  return students.filter((student) => student.id !== id);
}

export function confirmImportCandidates(
  rows: ImportReviewRow[],
): ConfirmImportResult {
  const accepted = rows.filter((row) => row.accepted);
  const rejected = rows.filter((row) => !row.accepted);
  const built = buildStudentRecords(
    accepted.map((row) => ({
      name: row.name,
      university: row.university,
      city: row.city,
      locationScope: row.locationScope,
      raw: {
        name: row.name,
        university: row.university,
        city: row.city,
      },
    })),
  );

  const validStudents = built.students.filter((student, index) => {
    const hasError = built.issues.some(
      (issue) => issue.studentIndex === index && issue.level === "error",
    );
    return !hasError && student.name && student.university && student.city;
  });

  const invalidAccepted = accepted.filter((_, index) => {
    return built.issues.some(
      (issue) => issue.studentIndex === index && issue.level === "error",
    );
  });

  return {
    students: validStudents,
    rejected: [...rejected, ...invalidAccepted],
    issues: built.issues,
  };
}
