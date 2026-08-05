import type { Student } from "./project-data";
import { resolveCity, resolveProvinceName } from "./search-catalog";
import { createId } from "./ids";

export interface StudentInput {
  name: string;
  university: string;
  city: string;
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


export function validateStudentInput(input: StudentInput): StudentIssue[] {
  const issues: StudentIssue[] = [];
  if (!input.name.trim()) {
    issues.push({
      code: "missing_field",
      field: "name",
      level: "error",
      message: "学生名称不能为空",
    });
  }
  if (!input.university.trim()) {
    issues.push({
      code: "missing_field",
      field: "university",
      level: "error",
      message: "录取院校不能为空",
    });
  }
  if (!input.city.trim()) {
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

export function resolveStudentLocation(student: Student): {
  city: string;
  province: string;
  status: "resolved" | "unresolved";
} {
  if (student.province?.trim()) {
    const province = resolveProvinceName(student.province);
    return {
      city: student.city,
      // 手动指定省份视为已定位：已知别名归一化为标准省名，自定义省份保留原名称，
      // 使其可以正常进入省份卡片等数据视图，而不是一直标记为未匹配。
      province: province || student.province.trim(),
      status: "resolved",
    };
  }
  return resolveCityLocation(student.city);
}

export function buildStudentRecords(inputs: StudentInput[]): StudentBuildResult {
  const issues: StudentIssue[] = [];
  const students: Student[] = [];
  const nameCounts = new Map<string, number>();

  inputs.forEach((input, index) => {
    const fieldIssues = validateStudentInput(input).map((issue) => ({
      ...issue,
      studentIndex: index,
    }));
    issues.push(...fieldIssues);

    const location = input.locationScope === "international"
      ? { city: input.city.trim(), province: "", status: "unresolved" as const }
      : resolveCityLocation(input.city);
    if (input.locationScope !== "international" && input.city.trim() && location.status === "unresolved") {
      issues.push({
        code: "unresolved_city",
        field: "city",
        level: "warning",
        message: `无法定位城市：${input.city}`,
        studentIndex: index,
      });
    }

    const name = input.name.trim();
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);

    students.push({
      id: createId("student"),
      name,
      university: input.university.trim(),
      city: location.city || input.city.trim(),
      ...(input.locationScope === "international" ? { locationScope: "international" as const } : {}),
      visibility: true,
    });
  });

  for (const [name, count] of nameCounts.entries()) {
    if (name && count > 1) {
      issues.push({
        code: "duplicate_name",
        field: "name",
        level: "warning",
        message: `存在重复学生名称：${name}`,
      });
    }
  }

  return { students, issues };
}
