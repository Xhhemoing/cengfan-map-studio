import type { ProjectDocument } from "./project-document";
import type { Student } from "./project-data";
import { resolveStudentLocation } from "./student-data";
import { duplicateStudentIds } from "./data-duplicate";
import { trimImportCell } from "./import-data";

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
   * rows. Optional on the input type because issue literals are built in
   * several places; everything produced by {@link listDataIssues} is a
   * {@link ResolvedDataIssue} and therefore always carries one. Read it with
   * {@link resolveDataIssueId} so a hand-built issue behaves identically.
   */
  id?: string;
  studentId: string;
  studentName: string;
  kind: DataIssueKind;
  detail: string;
  severity: "warning" | "info";
}

/** A {@link DataIssue} whose stable id is guaranteed by the type system. */
export type ResolvedDataIssue = DataIssue & { id: string };

/** One student produces at most one issue per kind, so this pair is unique. */
export function dataIssueId(kind: DataIssueKind, studentId: string): string {
  return `${kind}:${studentId}`;
}

export function resolveDataIssueId(issue: DataIssue): string {
  return issue.id ?? dataIssueId(issue.kind, issue.studentId);
}

/** Guarantees the stable id on an issue that came from somewhere else. */
export function withDataIssueId(issue: DataIssue): ResolvedDataIssue {
  return { ...issue, id: resolveDataIssueId(issue) };
}

/**
 * Emptiness is judged with {@link trimImportCell}, the same rule the import
 * pipeline uses: a cell holding only a BOM or a zero-width space looks filled
 * in to `trim()` but renders as nothing, so it has to count as missing here too
 * — otherwise the record shows up as a nameless row with no warning at all.
 */
function missingFields(student: Student): string[] {
  const fields: string[] = [];
  if (!trimImportCell(student.name)) fields.push("姓名");
  if (!trimImportCell(student.university)) fields.push("院校");
  if (!trimImportCell(student.city)) fields.push("城市");
  return fields;
}

function createIssue(
  student: Student,
  kind: DataIssueKind,
  detail: string,
  severity: DataIssue["severity"],
): ResolvedDataIssue {
  return {
    id: dataIssueId(kind, student.id),
    studentId: student.id,
    studentName: trimImportCell(student.name) || "未命名学生",
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

/** Every returned issue carries its stable `kind:studentId` id. */
export function listDataIssues(project: ProjectDocument): ResolvedDataIssue[] {
  const missing: ResolvedDataIssue[] = [];
  const unresolved: ResolvedDataIssue[] = [];
  const manualProvince: ResolvedDataIssue[] = [];
  const international: ResolvedDataIssue[] = [];
  const hidden: ResolvedDataIssue[] = [];
  const duplicate: ResolvedDataIssue[] = [];
  const duplicateIds = duplicateStudentIds(project.students);

  for (const student of project.students) {
    const fields = missingFields(student);
    if (fields.length > 0) {
      missing.push(createIssue(student, "missing-field", `缺少${fields.join("、")}`, "warning"));
    }
    if (student.locationScope !== "international" && resolveStudentLocation(student).status === "unresolved") {
      unresolved.push(createIssue(student, "unresolved-location", `无法定位城市：${trimImportCell(student.city) || "未填写"}`, "warning"));
    }
    const province = trimImportCell(student.province);
    if (province) {
      manualProvince.push(createIssue(student, "manual-province", `使用省份覆盖：${province}`, "info"));
    }
    if (student.locationScope === "international") {
      international.push(createIssue(student, "international", `海外去向：${trimImportCell(student.city) || "未填写"}`, "info"));
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
