/**
 * 识别面板按本类型逐列渲染映射行,省份与其他列一视同仁:参与表头识别、取值,并在面板中可见。
 * 回滚省份列时,把 `"province"` 从本联合类型中去掉即可。
 */
export type StudentColumn = "name" | "university" | "city" | "locationScope" | "province";

/** 省份可选,不进必填列:缺省份时仍按城市推断,不该把整行判为无效。 */
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
  province: ["省份", "省", "所在省份", "所属省份", "省级行政区", "省/直辖市", "province", "state"],
};

export const COLUMN_LABELS: Record<StudentColumn, string> = {
  name: "学生姓名",
  university: "录取院校",
  city: "城市",
  locationScope: "去向类型",
  province: "省份",
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

const REQUIRED_COLUMN_SET: ReadonlySet<string> = new Set(REQUIRED_COLUMNS);

function isRequiredColumn(column: StudentColumn): column is RequiredStudentColumn {
  return REQUIRED_COLUMN_SET.has(column);
}

/** 至少命中两个不同的核心字段(姓名/院校/城市)才当作表头行,避免误吞学生记录;去向类型与省份都不计数。 */
export function looksLikeHeaderRow(parts: string[]): boolean {
  const matched = new Set<RequiredStudentColumn>();
  for (const part of parts) {
    const column = matchStudentColumn(part);
    if (column && isRequiredColumn(column)) matched.add(column);
  }
  return matched.size >= 2;
}

/** 表头单元格 → 列位;同名列取最左一个。Excel 与文本两条路径共用,避免两处各写一份识别规则。 */
export function findColumnIndexes(header: readonly string[]): Partial<Record<StudentColumn, number>> {
  const indexes: Partial<Record<StudentColumn, number>> = {};
  header.forEach((cell, index) => {
    const column = matchStudentColumn(cell);
    if (column && indexes[column] === undefined) indexes[column] = index;
  });
  return indexes;
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
