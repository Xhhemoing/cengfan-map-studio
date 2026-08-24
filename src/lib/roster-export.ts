import { createImportTemplateSheets } from "./binary-import";
import type { Student } from "./project-data";

export const CHINA_SCOPE_LABEL = "中国去向";
export const INTERNATIONAL_SCOPE_LABEL = "海外去向";

export interface RosterExportOptions {
  /** 只导出地图上可见的记录;默认导出整份名单。 */
  visibleOnly?: boolean;
}

export interface RosterExportSheets {
  data: string[][];
  guide: string[][];
}

/**
 * 导出表头与导入模板同源:导出的 xlsx 可以原样再喂回 `parseExcelWorkbookRows`,
 * 表头别名一旦调整,导入导出两侧同时跟随模板变化。
 */
export function rosterExportHeader(): string[] {
  return [...(createImportTemplateSheets().data[0] ?? [])];
}

export function rosterScopeLabel(locationScope: Student["locationScope"]): string {
  return locationScope === "international" ? INTERNATIONAL_SCOPE_LABEL : CHINA_SCOPE_LABEL;
}

function selectStudents(students: Student[], options: RosterExportOptions): Student[] {
  return options.visibleOnly ? students.filter((student) => student.visibility !== false) : students;
}

export function buildRosterExportRows(students: Student[], options: RosterExportOptions = {}): string[][] {
  return [
    rosterExportHeader(),
    ...selectStudents(students, options).map((student) => [
      student.name.trim(),
      student.university.trim(),
      student.city.trim(),
      rosterScopeLabel(student.locationScope),
    ]),
  ];
}

/** 导出文件同时带上模板的填写说明,便于用户改完再导入。 */
export function buildRosterExportSheets(students: Student[], options: RosterExportOptions = {}): RosterExportSheets {
  return {
    data: buildRosterExportRows(students, options),
    guide: createImportTemplateSheets().guide,
  };
}

export function createRosterExportFilename(now: Date = new Date()): string {
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  return `蹭饭图-学生名单-${stamp}.xlsx`;
}
