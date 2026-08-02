import { resolveStudentLocation } from "./student-data";

export interface Student {
  id: string;
  name: string;
  university: string;
  city: string;
  province?: string;
  /** International destinations render as cards but never map to the China layer. */
  locationScope?: "china" | "international";
  visibility: boolean;
}

export interface ProvinceSummary {
  province: string;
  count: number;
  students: Student[];
}

/** `regional` remains readable for historical projects but is not shown as a new built-in preset. */
export type MapTemplateId = "original" | "cartoon" | "grain" | "q" | "scenery" | "regional";
export type DataViewId = "province" | "pins" | "heat" | "city" | "university";

export const sampleStudents: Student[] = [
  { id: "student-1", name: "林舟", university: "北京大学", city: "北京市", visibility: true },
  { id: "student-2", name: "陈宁", university: "清华大学", city: "北京市", visibility: true },
  { id: "student-3", name: "苏禾", university: "浙江大学", city: "杭州市", visibility: true },
  { id: "student-4", name: "顾言", university: "复旦大学", city: "上海市", visibility: true },
  { id: "student-5", name: "沈青", university: "南京大学", city: "南京市", visibility: true },
  { id: "student-6", name: "唐诺", university: "武汉大学", city: "武汉市", visibility: true },
  { id: "student-7", name: "程川", university: "四川大学", city: "成都市", visibility: true },
  { id: "student-8", name: "江月", university: "中山大学", city: "广州市", visibility: true },
  { id: "student-9", name: "温然", university: "西安交通大学", city: "西安市", visibility: true },
  { id: "student-10", name: "陆迟", university: "哈尔滨工业大学", city: "哈尔滨市", visibility: true },
  { id: "student-11", name: "周野", university: "厦门大学", city: "厦门市", visibility: true },
  { id: "student-12", name: "许棠", university: "湖南大学", city: "长沙市", visibility: true },
];

export function getVisibleStudents(students: Student[]): Student[] {
  return students.filter((student) => student.visibility !== false);
}

export function buildProvinceSummary(students: Student[]): ProvinceSummary[] {
  const groups = new Map<string, Student[]>();

  for (const student of getVisibleStudents(students)) {
    if (student.locationScope === "international") continue;
    const province = resolveStudentLocation(student).province || "未知";
    const records = groups.get(province) ?? [];
    records.push(student);
    groups.set(province, records);
  }

  return [...groups.entries()]
    .map(([province, records]) => ({ province, count: records.length, students: records }))
    .sort((left, right) => right.count - left.count || left.province.localeCompare(right.province, "zh-CN"));
}
