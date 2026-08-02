import { getVisibleStudents, type Student } from "./project-data";
import { resolveStudentLocation } from "./student-data";
import type { CardGrouping } from "./template-document";
export { chooseLayoutStrategy, type LayoutStrategy } from "./layout-strategy";

export type LayoutStudent = Student;

export interface LayoutGroup {
  key: string;
  title: string;
  count: number;
  students: LayoutStudent[];
}

export interface LayoutSchoolRow {
  university: string;
  names: string[];
  studentIds: string[];
}

export interface LayoutCitySection {
  city: string;
  count: number;
  rows: LayoutSchoolRow[];
}


function groupBy(
  students: LayoutStudent[],
  getKey: (student: LayoutStudent) => string,
  getTitle: (student: LayoutStudent, key: string) => string = (_student, key) => key,
  sort: "count" | "title" = "count",
): LayoutGroup[] {
  const map = new Map<string, LayoutStudent[]>();
  for (const student of students) {
    const key = getKey(student) || "未知";
    const list = map.get(key) ?? [];
    list.push(student);
    map.set(key, list);
  }

  return [...map.entries()]
    .map(([key, records]) => ({
      key,
      title: getTitle(records[0]!, key),
      count: records.length,
      students: records,
    }))
    .sort((left, right) => sort === "title"
      ? left.title.localeCompare(right.title, "zh-CN")
      : right.count - left.count || left.title.localeCompare(right.title, "zh-CN"));
}

export function buildLayoutGroups(
  students: LayoutStudent[],
  grouping: CardGrouping,
): LayoutGroup[] {
  const visibleStudents = getVisibleStudents(students);
  const internationalStudents = visibleStudents.filter((student) => student.locationScope === "international");
  const chinaStudents = visibleStudents.filter((student) => student.locationScope !== "international");
  const internationalGroup = internationalStudents.length === 0
    ? []
    : [{ key: "海外", title: "海外", count: internationalStudents.length, students: internationalStudents }];

  switch (grouping) {
    case "province":
      return [...groupBy(
        chinaStudents,
        (student) => resolveStudentLocation(student).province || "未知",
        (_student, key) => key,
        "title",
      ), ...internationalGroup];
    case "city":
      return [...groupBy(chinaStudents, (student) => student.city || "未知"), ...internationalGroup];
    case "university":
      return [...groupBy(
        chinaStudents,
        (student) => student.university || "未知院校",
        (student, key) => `${key} · ${student.city || "未知城市"}`,
      ), ...internationalGroup];
    default:
      return [...groupBy(
        chinaStudents,
        (student) => resolveStudentLocation(student).province || "未知",
        (_student, key) => key,
        "title",
      ), ...internationalGroup];
  }
}

/** Merge same-university students into one display row within a province/city card. */
export function buildSchoolRows(students: LayoutStudent[]): LayoutSchoolRow[] {
  const map = new Map<string, LayoutSchoolRow>();
  for (const student of students) {
    const university = student.university.trim() || "未知院校";
    const existing = map.get(university);
    if (existing) {
      existing.names.push(student.name);
      existing.studentIds.push(student.id);
      continue;
    }
    map.set(university, {
      university,
      names: [student.name],
      studentIds: [student.id],
    });
  }
  return [...map.values()].sort((left, right) =>
    right.names.length - left.names.length
    || left.university.localeCompare(right.university, "zh-CN"));
}

export function buildCitySections(students: LayoutStudent[]): LayoutCitySection[] {
  const cityGroups = new Map<string, LayoutStudent[]>();
  for (const student of students) {
    const city = student.city.trim() || "未知城市";
    const records = cityGroups.get(city) ?? [];
    records.push(student);
    cityGroups.set(city, records);
  }
  return [...cityGroups.entries()]
    .map(([city, records]) => ({
      city,
      count: records.length,
      rows: buildSchoolRows(records),
    }))
    .sort((left, right) => right.count - left.count || left.city.localeCompare(right.city, "zh-CN"));
}

export type SchoolRowField = "name" | "university" | "city";

export interface SchoolRowPart {
  field: SchoolRowField;
  value: string;
}

/** Structured field parts for a school row (supports per-field fonts). Empty when
 *  the configured visible fields produce no content — callers must respect that. */
export function schoolRowParts(
  row: LayoutSchoolRow,
  fields: readonly SchoolRowField[],
  city?: string,
): SchoolRowPart[] {
  const showUniversity = fields.includes("university");
  const showName = fields.includes("name");
  const showCity = fields.includes("city") && Boolean(city);
  const parts: SchoolRowPart[] = [];
  if (showUniversity) parts.push({ field: "university", value: row.university });
  if (showName) parts.push({ field: "name", value: row.names.join("、") });
  if (showCity && city) parts.push({ field: "city", value: city });
  return parts;
}

export function formatSchoolRow(
  row: LayoutSchoolRow,
  fields: readonly SchoolRowField[],
  city?: string,
): string {
  return schoolRowParts(row, fields, city)
    .map((part) => part.value)
    .join(" · ");
}
