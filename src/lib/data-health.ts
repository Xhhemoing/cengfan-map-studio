import type { ProjectDocument } from "./project-document";
import type { Student } from "./project-data";
import { resolveStudentLocation } from "./student-data";

export interface DataHealthSummary {
  total: number;
  visible: number;
  hidden: number;
  international: number;
  unresolved: number;
  missingRequired: number;
}

export type DataIssueKind =
  | "missing-field"
  | "unresolved-location"
  | "manual-province"
  | "international"
  | "hidden";

export interface DataIssue {
  studentId: string;
  studentName: string;
  kind: DataIssueKind;
  detail: string;
  severity: "warning" | "info";
}

function missingFields(student: Student): string[] {
  const fields: string[] = [];
  if (!student.name.trim()) fields.push("姓名");
  if (!student.university.trim()) fields.push("院校");
  if (!student.city.trim()) fields.push("城市");
  return fields;
}

export function buildDataHealthSummary(project: ProjectDocument): DataHealthSummary {
  let visible = 0;
  let international = 0;
  let unresolved = 0;
  let missingRequired = 0;

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
  };
}

export function listDataIssues(project: ProjectDocument): DataIssue[] {
  const missing: DataIssue[] = [];
  const unresolved: DataIssue[] = [];
  const manualProvince: DataIssue[] = [];
  const international: DataIssue[] = [];
  const hidden: DataIssue[] = [];

  for (const student of project.students) {
    const fields = missingFields(student);
    if (fields.length > 0) {
      missing.push({
        studentId: student.id,
        studentName: student.name || "未命名学生",
        kind: "missing-field",
        detail: `缺少${fields.join("、")}`,
        severity: "warning",
      });
    }
    if (student.locationScope !== "international" && resolveStudentLocation(student).status === "unresolved") {
      unresolved.push({
        studentId: student.id,
        studentName: student.name || "未命名学生",
        kind: "unresolved-location",
        detail: `无法定位城市：${student.city || "未填写"}`,
        severity: "warning",
      });
    }
    if (student.province?.trim()) {
      manualProvince.push({
        studentId: student.id,
        studentName: student.name || "未命名学生",
        kind: "manual-province",
        detail: `使用省份覆盖：${student.province}`,
        severity: "info",
      });
    }
    if (student.locationScope === "international") {
      international.push({
        studentId: student.id,
        studentName: student.name || "未命名学生",
        kind: "international",
        detail: `海外去向：${student.city || "未填写"}`,
        severity: "info",
      });
    }
    if (student.visibility === false) {
      hidden.push({
        studentId: student.id,
        studentName: student.name || "未命名学生",
        kind: "hidden",
        detail: "记录已隐藏，不会出现在海报中",
        severity: "info",
      });
    }
  }

  return [...missing, ...unresolved, ...manualProvince, ...international, ...hidden];
}
