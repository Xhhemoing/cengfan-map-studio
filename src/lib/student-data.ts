import type { Student } from "./project-data";
import { resolveCity, resolveProvinceName } from "./search-catalog";
import { createId } from "./ids";
import { trimImportCell } from "./import-data";
import { normalizeStudentName } from "./name-format";

export interface StudentInput {
  name: string;
  university: string;
  city: string;
  /** Optional manual province override; ignored for overseas destinations. */
  province?: string;
  locationScope?: "china" | "international";
  raw?: {
    name: string;
    university: string;
    city: string;
  };
}

export interface StudentIssue {
  code: "missing_field" | "duplicate_name" | "unresolved_city";
  field?: "name" | "university" | "city";
  level: "error" | "warning";
  message: string;
  studentIndex?: number;
}

export interface StudentBuildResult {
  students: Student[];
  issues: StudentIssue[];
}


/**
 * Required-field checks run on {@link trimImportCell} output, so a cell holding
 * only spaces, a full-width space or a zero-width character is rejected exactly
 * like an empty one instead of creating a nameless record.
 */
export function validateStudentInput(input: StudentInput): StudentIssue[] {
  const issues: StudentIssue[] = [];
  if (!trimImportCell(input.name)) {
    issues.push({
      code: "missing_field",
      field: "name",
      level: "error",
      message: "学生名称不能为空",
    });
  }
  if (!trimImportCell(input.university)) {
    issues.push({
      code: "missing_field",
      field: "university",
      level: "error",
      message: "录取院校不能为空",
    });
  }
  if (!trimImportCell(input.city)) {
    issues.push({
      code: "missing_field",
      field: "city",
      level: "error",
      message: "城市不能为空",
    });
  }
  return issues;
}

export function normalizeCityName(city: string): string {
  return resolveCity(city).city;
}

export function resolveCityLocation(city: string): {
  city: string;
  province: string;
  status: "resolved" | "unresolved";
} {
  return resolveCity(city);
}

/**
 * An overseas destination is stored as `locationScope: "international"`; the
 * import parser folds every 海外 / overseas / abroad wording into that single
 * value. Reading the scope through this helper keeps the literal in one place.
 */
export function isOverseasStudent(student: Pick<Student, "locationScope">): boolean {
  return student.locationScope === "international";
}

/**
 * Where a record sits on the China map. An overseas destination sits nowhere on
 * it, so it comes back with an empty province and `status: "unresolved"` — the
 * same shape {@link buildStudentRecords} gives a freshly imported overseas row.
 * That status means "not on the China map", not "bad data", so a caller that
 * reports 城市未匹配 still has to ask {@link isOverseasStudent} first.
 */
export function resolveStudentLocation(student: Student): {
  city: string;
  province: string;
  status: "resolved" | "unresolved";
} {
  const city = trimImportCell(student.city);
  // A province surviving on an overseas record — hand-edited project file, or an
  // archive written before imports started stripping it — is not an override:
  // honoring it would file 哈佛大学 under 浙江省 in every province view.
  if (isOverseasStudent(student)) {
    return { city, province: "", status: "unresolved" };
  }
  // A province cell holding only zero-width characters is not an override: read
  // like a filled-in one it would mark an unlocatable city as resolved and hide
  // the 城市未匹配 warning the roster should raise.
  const override = trimImportCell(student.province);
  if (override) {
    const province = resolveProvinceName(override);
    return {
      city,
      // 手动指定省份视为已定位：已知别名归一化为标准省名，自定义省份保留原名称，
      // 使其可以正常进入省份卡片等数据视图，而不是一直标记为未匹配。
      province: province || override,
      status: "resolved",
    };
  }
  return resolveCityLocation(city);
}

/**
 * Same folding rule as the roster health grouping in `data-duplicate.ts`: the
 * name cleanup runs first (middle-dot variants, padding spaces, zero-width
 * characters), then NFKC folds full-width letters and digits. Without the fold
 * a school typed with a Chinese IME ("Ｈａｒｖａｒｄ") never matched its
 * half-width twin, so the import review reported no duplicate while the health
 * panel later flagged both records as 重复记录.
 */
function duplicateValue(value: string): string {
  return normalizeStudentName(value)
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/\s+/g, "");
}

function duplicateKey(name: string, university: string): string {
  return `${duplicateValue(name)}\u001f${duplicateValue(university)}`;
}

export function buildStudentRecords(inputs: StudentInput[]): StudentBuildResult {
  const issues: StudentIssue[] = [];
  const students: Student[] = [];
  const duplicateCounts = new Map<string, { name: string; university: string; count: number }>();

  inputs.forEach((input, index) => {
    const fieldIssues = validateStudentInput(input).map((issue) => ({
      ...issue,
      studentIndex: index,
    }));
    issues.push(...fieldIssues);

    const isInternational = isOverseasStudent(input);
    // Overseas destinations never carry a Chinese province, so they are also
    // never reported as an unresolved China city.
    const province = isInternational ? "" : trimImportCell(input.province);
    const city = trimImportCell(input.city);
    const location = isInternational
      ? { city, province: "", status: "unresolved" as const }
      : resolveCityLocation(city);
    if (!isInternational && !province && city && location.status === "unresolved") {
      issues.push({
        code: "unresolved_city",
        field: "city",
        level: "warning",
        message: `无法定位城市：${city}`,
        studentIndex: index,
      });
    }

    // Names arrive padded ("林 舟") or with a stray middle-dot variant; the
    // record keeps the cleaned spelling so cards and duplicate detection agree.
    const name = normalizeStudentName(input.name);
    const university = trimImportCell(input.university);
    const key = duplicateKey(name, university);
    const entry = duplicateCounts.get(key) ?? { name, university, count: 0 };
    entry.count += 1;
    duplicateCounts.set(key, entry);

    students.push({
      id: createId("student"),
      name,
      university,
      city: location.city || city,
      ...(province ? { province } : {}),
      ...(isInternational ? { locationScope: "international" as const } : {}),
      visibility: true,
    });
  });

  for (const { name, university, count } of duplicateCounts.values()) {
    if (name && count > 1) {
      issues.push({
        code: "duplicate_name",
        field: "name",
        level: "warning",
        message: `存在重复学生记录：${name}${university ? ` · ${university}` : ""}`,
      });
    }
  }

  return { students, issues };
}
