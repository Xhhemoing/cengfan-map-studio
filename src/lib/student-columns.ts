/**
 * 学生名单的列口径：字段名、中文标签、可识别的表头别名，以及给用户看的描述函数。
 * 解析器（`binary-import.ts`）与面板（`DataWorkspace.tsx`）都要用同一份口径，
 * 放在这里避免「解析认得 `所在城市`、提示却只会说 `城市`」这类两头各说各话。
 */
export type StudentColumn = "name" | "university" | "city" | "locationScope";

export const REQUIRED_COLUMNS = ["name", "university", "city"] as const;

export const STUDENT_COLUMN_LABELS: Record<StudentColumn, string> = {
  name: "学生姓名",
  university: "录取院校",
  city: "城市",
  locationScope: "去向类型",
};

export const HEADER_ALIASES: Record<StudentColumn, readonly string[]> = {
  name: ["姓名", "学生", "学生姓名", "名字", "name", "student", "student name", "full name"],
  university: [
    "院校",
    "录取院校",
    "录取学校",
    "大学",
    "学校",
    "就读学校",
    "就读院校",
    "university",
    "school",
    "college",
    "enrolled university",
  ],
  city: ["城市", "所在城市", "目的地城市", "city", "destination city", "location"],
  locationScope: ["去向类型", "去向", "地区类型", "destination type", "location scope", "scope"],
};

/** 面板与提示里点名列时统一走这里，标签口径与 XLSX 模板表头一致。 */
export function describeStudentColumns(fields: readonly StudentColumn[]): string {
  return fields.map((field) => STUDENT_COLUMN_LABELS[field]).join("、");
}

/**
 * 缺列提示里回显「还认得哪些写法」。只列中文别名：
 * 英文表头对班委没有参考价值，列出来反而把提示撑长。
 */
export function describeHeaderAliases(field: StudentColumn): string {
  return HEADER_ALIASES[field].filter((alias) => /[\u4e00-\u9fa5]/.test(alias)).join(" / ");
}
