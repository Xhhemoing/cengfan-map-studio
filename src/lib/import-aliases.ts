export type StudentColumn = "name" | "university" | "city" | "locationScope";

export const REQUIRED_COLUMNS = ["name", "university", "city"] as const;

export type RequiredStudentColumn = (typeof REQUIRED_COLUMNS)[number];

/**
 * 表头别名的单一事实来源:Excel 列映射、文本表头识别、带标签文本解析共用同一张表。
 */
export const HEADER_ALIASES: Record<StudentColumn, readonly string[]> = {
  name: ["姓名", "学生", "学生姓名", "学生名称", "名字", "name", "student", "student name", "full name"],
  university: [
    "院校",
    "录取院校",
    "录取学校",
    "就读院校",
    "就读学校",
    "大学",
    "学校",
    "university",
    "school",
    "college",
    "enrolled university",
  ],
  city: ["城市", "所在城市", "目的地城市", "city", "destination city", "location"],
  locationScope: ["去向类型", "去向", "地区类型", "destination type", "location scope", "scope"],
};

export const COLUMN_LABELS: Record<StudentColumn, string> = {
  name: "学生姓名",
  university: "录取院校",
  city: "城市",
  locationScope: "去向类型",
};

export function normalizeHeader(value: string): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("zh-CN")
    .replace(/\s|_|-|\(|\)|（|）/g, "");
}

const ALIAS_TO_COLUMN: ReadonlyMap<string, StudentColumn> = new Map(
  (Object.keys(HEADER_ALIASES) as StudentColumn[]).flatMap((column) =>
    HEADER_ALIASES[column].map((alias) => [normalizeHeader(alias), column] as const),
  ),
);

export function matchStudentColumn(value: string | undefined): StudentColumn | null {
  if (!value) return null;
  return ALIAS_TO_COLUMN.get(normalizeHeader(value)) ?? null;
}

/** 至少命中两个不同的核心字段(姓名/院校/城市)才当作表头行,避免误吞学生记录。 */
export function looksLikeHeaderRow(parts: string[]): boolean {
  const matched = new Set<RequiredStudentColumn>();
  for (const part of parts) {
    const column = matchStudentColumn(part);
    if (column && column !== "locationScope") matched.add(column);
  }
  return matched.size >= 2;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 同时接受原样别名与归一化写法(如 `student name` / `studentname`)。
const LABEL_ALTERNATION = [...ALIAS_TO_COLUMN.keys(), ...Object.values(HEADER_ALIASES).flat()]
  .filter((alias, index, all) => all.indexOf(alias) === index)
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join("|");

/** 每次调用返回新实例,避免 `g` 标志的 lastIndex 在调用间残留。 */
export function createLabelPattern(): RegExp {
  return new RegExp(`(${LABEL_ALTERNATION})\\s*[：:]`, "giu");
}

export function parseLocationScope(value: string | undefined): "international" | undefined {
  const normalized = value?.trim().toLocaleLowerCase("zh-CN") ?? "";
  return normalized.includes("海外") || normalized.includes("international") || normalized.includes("overseas")
    ? "international"
    : undefined;
}
