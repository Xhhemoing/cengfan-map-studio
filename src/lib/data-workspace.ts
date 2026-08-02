import type { ImportCandidate } from "./import-data";
import {
  buildStudentRecords,
  type StudentIssue,
} from "./student-data";
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
