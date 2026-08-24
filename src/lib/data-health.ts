import type { ProjectDocument } from "./project-document";
import type { Student } from "./project-data";
import { resolveCityLocation, resolveStudentLocation } from "./student-data";
import { resolveProvinceName } from "./search-catalog";
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
  studentId: string;
  studentName: string;
  kind: DataIssueKind;
  detail: string;
  severity: "warning" | "info";
}

/**
 * 省份字段只有在与城市解析结果不一致时才算真正的「省份覆盖」。
 * 新增学生时院校目录会自动带出与城市一致的省份，这类冗余值不应刷屏待检查。
 * 数据质量告警与地图映射 chip 的「已覆盖」标记都以此为准。
 */
export function isProvinceOverride(student: Student): boolean {
  const cityLocation = resolveCityLocation(student.city);
  if (cityLocation.status !== "resolved") return true;
  return resolveProvinceName(student.province ?? "") !== cityLocation.province;
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
    if (student.province?.trim() && isProvinceOverride(student)) {
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
    if (duplicateIds.has(student.id)) {
      duplicate.push({
        studentId: student.id,
        studentName: student.name || "未命名学生",
        kind: "duplicate",
        detail: "姓名、院校、城市和去向类型与其他记录一致",
        severity: "warning",
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

  return [...missing, ...unresolved, ...manualProvince, ...international, ...hidden, ...duplicate];
}
