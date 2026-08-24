import type { ProjectDocument } from "./project-document";
import type { Student } from "./project-data";
import { resolveStudentLocation } from "./student-data";
import { duplicateStudentIds } from "./data-duplicate";

export interface DataHealthSummary {
  total: number;
  visible: number;
  hidden: number;
  international: number;
  unresolved: number;
  missingRequired: number;
  duplicate: number;
}

export type DataIssueKind =
  | "missing-field"
  | "unresolved-location"
  | "manual-province"
  | "international"
  | "hidden"
  | "duplicate";

export interface DataIssue {
  /**
   * Stable `kind:studentId` identifier so the UI can key, locate and dedupe
   * rows. Always populated by {@link listDataIssues}; use
   * {@link resolveDataIssueId} when an issue comes from another source.
   */
  id?: string;
  studentId: string;
  studentName: string;
  kind: DataIssueKind;
  detail: string;
  severity: "warning" | "info";
}

/** One student produces at most one issue per kind, so this pair is unique. */
export function dataIssueId(kind: DataIssueKind, studentId: string): string {
  return `${kind}:${studentId}`;
}

export function resolveDataIssueId(issue: DataIssue): string {
  return issue.id ?? dataIssueId(issue.kind, issue.studentId);
}

function missingFields(student: Student): string[] {
  const fields: string[] = [];
  if (!(student.name ?? "").trim()) fields.push("姓名");
  if (!(student.university ?? "").trim()) fields.push("院校");
  if (!(student.city ?? "").trim()) fields.push("城市");
  return fields;
}

function createIssue(
  student: Student,
  kind: DataIssueKind,
  detail: string,
  severity: DataIssue["severity"],
): DataIssue {
  return {
    id: dataIssueId(kind, student.id),
    studentId: student.id,
    studentName: (student.name ?? "").trim() || "未命名学生",
    kind,
    detail,
    severity,
  };
}

export function buildDataHealthSummary(project: ProjectDocument): DataHealthSummary {
  let visible = 0;
  let international = 0;
  let unresolved = 0;
  let missingRequired = 0;
  const duplicateIds = duplicateStudentIds(project.students);

  for (const student of project.students) {
    if (student.visibility === false) {
      // Hidden records remain part of the project data and health summary.
    } else {
      visible += 1;
    }
    if (student.locationScope === "international") {
      international += 1;
    } else if (resolveStudentLocation(student).status === "unresolved") {
      unresolved += 1;
    }
    if (missingFields(student).length > 0) missingRequired += 1;
  }

  return {
    total: project.students.length,
    visible,
    hidden: project.students.length - visible,
    international,
    unresolved,
    missingRequired,
    duplicate: duplicateIds.size,
  };
}

export function listDataIssues(project: ProjectDocument): DataIssue[] {
  const missing: DataIssue[] = [];
  const unresolved: DataIssue[] = [];
  const manualProvince: DataIssue[] = [];
  const international: DataIssue[] = [];
  const hidden: DataIssue[] = [];
  const duplicate: DataIssue[] = [];
  const duplicateIds = duplicateStudentIds(project.students);

  for (const student of project.students) {
    const fields = missingFields(student);
    if (fields.length > 0) {
      missing.push(createIssue(student, "missing-field", `缺少${fields.join("、")}`, "warning"));
    }
    if (student.locationScope !== "international" && resolveStudentLocation(student).status === "unresolved") {
      unresolved.push(createIssue(student, "unresolved-location", `无法定位城市：${(student.city ?? "").trim() || "未填写"}`, "warning"));
    }
    if (student.province?.trim()) {
      manualProvince.push(createIssue(student, "manual-province", `使用省份覆盖：${student.province.trim()}`, "info"));
    }
    if (student.locationScope === "international") {
      international.push(createIssue(student, "international", `海外去向：${(student.city ?? "").trim() || "未填写"}`, "info"));
    }
    if (duplicateIds.has(student.id)) {
      duplicate.push(createIssue(student, "duplicate", "姓名、院校、城市和去向类型与其他记录一致", "warning"));
    }
    if (student.visibility === false) {
      hidden.push(createIssue(student, "hidden", "记录已隐藏，不会出现在海报中", "info"));
    }
  }

  return [...missing, ...unresolved, ...manualProvince, ...international, ...hidden, ...duplicate];
}
