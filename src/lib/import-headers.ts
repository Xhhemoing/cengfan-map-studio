/**
 * Header engine shared by every roster source (pasted text, CSV, XLSX):
 * cell cleanup, the alias table and the header → student column mapping.
 * `import-data.ts` re-exports this module, so callers keep a single entry.
 */

/** Columns a roster source can provide. `name`/`university`/`city` are required. */
export type StudentColumn = "name" | "university" | "city" | "province" | "locationScope";

export const REQUIRED_STUDENT_COLUMNS = ["name", "university", "city"] as const;

export type RequiredStudentColumn = (typeof REQUIRED_STUDENT_COLUMNS)[number];

export type StudentColumnIndexes = Partial<Record<StudentColumn, number>>;

/**
 * Header aliases used by every roster source. Values are compared after
 * {@link normalizeHeaderCell}, so spacing, casing, BOM, brackets and trailing
 * "必填"-style markers do not have to be listed.
 *
 * Field order below is the claim order: when one header cell could serve two
 * fields, the earlier field wins and the later one stays unmapped. Within a
 * field, alias order is priority order: an earlier alias beats a later one no
 * matter which column it sits in, so "城市" wins over the "生源地" fallback.
 */
export const STUDENT_HEADER_ALIASES: Record<StudentColumn, readonly string[]> = {
  name: ["姓名", "名字", "学生", "学生姓名", "学生名称", "同学", "同学姓名", "name", "student", "studentname", "fullname"],
  university: [
    "院校",
    "学校",
    "去向",
    "录取院校",
    "录取学校",
    "毕业去向",
    "去向院校",
    "升学去向",
    "深造院校",
    "大学",
    "高校",
    "学院",
    "就读学校",
    "就读院校",
    "工作单位",
    "就业单位",
    "单位",
    "university",
    "school",
    "college",
    "institution",
    "enrolleduniversity",
    "destination",
  ],
  city: ["城市", "市", "所在城市", "所在市", "目的地城市", "城市地区", "所在地", "目的地", "city", "destinationcity", "location", "生源地"],
  province: ["省份", "省", "所在省", "所在省份", "省自治区", "省直辖市", "province", "state"],
  locationScope: [
    "去向类型",
    "地区类型",
    "国内海外",
    "国内国外",
    "境内境外",
    "是否海外",
    "是否出国",
    "destinationtype",
    "locationscope",
    "scope",
  ],
};

export const REQUIRED_COLUMN_LABELS: Record<RequiredStudentColumn, string> = {
  name: "姓名",
  university: "院校",
  city: "城市",
};

const STUDENT_COLUMN_ORDER = Object.keys(STUDENT_HEADER_ALIASES) as StudentColumn[];

/** Zero-width characters survive `trim()` and would fake a filled-in cell. */
const INVISIBLE_CELL_CHARS = /[\uFEFF\u200b-\u200d\u2060]/g;

/** Trims a source cell, treating BOM and zero-width characters as blank. */
export function trimImportCell(value: unknown): string {
  return String(value ?? "").replace(INVISIBLE_CELL_CHARS, "").trim();
}

export function isBlankImportCell(value: unknown): boolean {
  return trimImportCell(value) === "";
}

/**
 * Strips BOM, whitespace, separators and decoration so header aliases stay
 * short. Slashes and enumeration marks go too, which is what turns the very
 * common "省/直辖市" and "国内/海外" headers into plain aliases.
 */
export function normalizeHeaderCell(value: string): string {
  return trimImportCell(value)
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s_\-()（）[\]【】*＊/／\\、·.]/g, "")
    .replace(/[:：]$/, "")
    .replace(/(必填|选填|可选)$/, "");
}

/** Alias → position in its field's list, so a better alias outbids a nearer column. */
const NORMALIZED_HEADER_ALIASES = new Map<StudentColumn, Map<string, number>>(
  STUDENT_COLUMN_ORDER.map((column) => [
    column,
    new Map(STUDENT_HEADER_ALIASES[column].map((alias, rank) => [normalizeHeaderCell(alias), rank])),
  ]),
);

/**
 * Aliases naming something wider than the column itself: "单位所在城市" is a
 * city column, not a 单位 one. They only count when the whole header cell
 * equals them, otherwise they would claim a neighbouring column.
 */
const EXACT_ONLY_ALIASES = new Set(["单位", "工作单位", "就业单位", "目的地"].map(normalizeHeaderCell));

/**
 * Aliases that may be matched as a substring. Latin aliases are excluded on
 * purpose ("university name" contains "name"), and single characters like
 * "市" / "省" would match almost anything.
 */
const FUZZY_HEADER_ALIASES = new Map<StudentColumn, Array<[string, number]>>(
  STUDENT_COLUMN_ORDER.map((column) => [
    column,
    [...NORMALIZED_HEADER_ALIASES.get(column)!].filter(
      ([alias]) => alias.length >= 2 && /[\u4e00-\u9fff]/.test(alias) && !EXACT_ONLY_ALIASES.has(alias),
    ),
  ]),
);

/** Columns that describe something other than a student destination. */
const NON_STUDENT_HEADER_TOKENS = [
  "学号", "编号", "序号", "备注", "说明", "电话", "手机", "邮箱", "邮件",
  "班级", "性别", "民族", "身份证", "专业", "成绩", "排名", "日期", "时间",
];

const MAX_FUZZY_HEADER_LENGTH = 12;

/**
 * A row matched only by substring is far more likely to be data ("新同学 北京
 * 大学 北京" contains 同学 and 大学) than a header, so substring-only rows must
 * describe almost the whole student contract before they are believed.
 */
const MIN_FUZZY_ONLY_COLUMNS = 3;

/**
 * A cell is only fuzzy-matched when it still reads like a column title. A
 * `标签：值` cell ("姓名：林舟") or a long sentence is data, and treating it as
 * a header would swallow the row it belongs to.
 */
function canFuzzyMatch(cell: string): boolean {
  if (cell.length > MAX_FUZZY_HEADER_LENGTH || /[:：]/.test(cell)) return false;
  return !NON_STUDENT_HEADER_TOKENS.some((token) => cell.includes(token));
}

interface AliasMatch {
  columnIndex: number;
  rank: number;
}

function betterMatch(current: AliasMatch | null, candidate: AliasMatch): AliasMatch {
  if (!current) return candidate;
  if (candidate.rank < current.rank) return candidate;
  return current;
}

function findExactMatch(column: StudentColumn, cells: string[], claimed: Set<number>): AliasMatch | null {
  const aliases = NORMALIZED_HEADER_ALIASES.get(column)!;
  let best: AliasMatch | null = null;
  cells.forEach((cell, columnIndex) => {
    if (!cell || claimed.has(columnIndex)) return;
    const rank = aliases.get(cell);
    if (rank !== undefined) best = betterMatch(best, { columnIndex, rank });
  });
  return best;
}

function findFuzzyMatch(column: StudentColumn, cells: string[], claimed: Set<number>): AliasMatch | null {
  const aliases = FUZZY_HEADER_ALIASES.get(column)!;
  let best: AliasMatch | null = null;
  cells.forEach((cell, columnIndex) => {
    if (!cell || claimed.has(columnIndex) || !canFuzzyMatch(cell)) return;
    for (const [alias, rank] of aliases) {
      if (cell.includes(alias)) best = betterMatch(best, { columnIndex, rank });
    }
  });
  return best;
}

/**
 * Maps header cells to student columns. Every source column is claimed by at
 * most one field so an ambiguous header (e.g. "去向" next to "学校") cannot be
 * silently read as two different fields. Exact alias matches are resolved for
 * all fields first; only then may a remaining field claim a decorated header
 * such as "录取院校名称" by substring.
 */
export function detectHeaderColumns(headers: string[]): StudentColumnIndexes {
  const normalized = headers.map((cell) => normalizeHeaderCell(String(cell ?? "")));
  const indexes: StudentColumnIndexes = {};
  const claimed = new Set<number>();
  let exactMatches = 0;
  let fuzzyMatches = 0;
  const claim = (column: StudentColumn, match: AliasMatch | null) => {
    if (!match) return;
    indexes[column] = match.columnIndex;
    claimed.add(match.columnIndex);
  };
  for (const column of STUDENT_COLUMN_ORDER) {
    const match = findExactMatch(column, normalized, claimed);
    if (match) exactMatches += 1;
    claim(column, match);
  }
  for (const column of STUDENT_COLUMN_ORDER) {
    if (indexes[column] !== undefined) continue;
    const match = findFuzzyMatch(column, normalized, claimed);
    if (match) fuzzyMatches += 1;
    claim(column, match);
  }
  if (exactMatches === 0 && fuzzyMatches < MIN_FUZZY_ONLY_COLUMNS) return {};
  return indexes;
}

export function missingRequiredColumns(indexes: StudentColumnIndexes): RequiredStudentColumn[] {
  return REQUIRED_STUDENT_COLUMNS.filter((column) => indexes[column] === undefined);
}

/** True when a cell is spelled exactly like one of `column`'s own aliases. */
export function isExactHeaderAlias(column: StudentColumn, value: string): boolean {
  const normalized = normalizeHeaderCell(value);
  return normalized !== "" && NORMALIZED_HEADER_ALIASES.get(column)!.has(normalized);
}

/** How many required columns of a mapped row are spelled exactly like a header. */
export function countExactHeaderCells(cells: string[], indexes: StudentColumnIndexes): number {
  return REQUIRED_STUDENT_COLUMNS.filter((column) =>
    isExactHeaderAlias(column, readStudentColumn(cells, indexes, column)),
  ).length;
}

/**
 * Words a totals row puts in the name column. Rosters end with one often
 * enough that importing "合计" as a student is a recurring complaint.
 */
const SUMMARY_ROW_NAMES = new Set(
  ["合计", "总计", "小计", "共计", "汇总", "总人数", "total", "subtotal", "sum"].map(normalizeHeaderCell),
);

/** True when the row is a totals line rather than a student. */
export function isSummaryRow(cells: string[], indexes: StudentColumnIndexes): boolean {
  return SUMMARY_ROW_NAMES.has(normalizeHeaderCell(readStudentColumn(cells, indexes, "name")));
}

/**
 * True when a data row is the header row stated a second time. Stacking two
 * exports into one sheet repeats it, and importing that row would create a
 * student called 姓名. A required cell counts as a repeat when it is spelled
 * like one of its own column's aliases or exactly like the header cell above
 * it, so a decorated header ("学生姓名（中文）") is recognized as well.
 */
export function rowRestatesHeader(
  cells: string[],
  indexes: StudentColumnIndexes,
  headerCells: readonly string[] = [],
): boolean {
  return REQUIRED_STUDENT_COLUMNS.every((column) => {
    const value = readStudentColumn(cells, indexes, column);
    if (!value) return false;
    if (isExactHeaderAlias(column, value)) return true;
    const headerCell = trimImportCell(headerCells[indexes[column] ?? -1]);
    return headerCell !== "" && normalizeHeaderCell(value) === normalizeHeaderCell(headerCell);
  });
}

/** A row of header cells is only treated as a header when it maps at least two fields. */
export function looksLikeStudentHeader(cells: string[]): boolean {
  return Object.keys(detectHeaderColumns(cells)).length >= 2;
}

export function readStudentColumn(cells: string[], indexes: StudentColumnIndexes, column: StudentColumn): string {
  const index = indexes[column];
  if (index === undefined) return "";
  return trimImportCell(cells[index]);
}

/**
 * Names the required cells a mapped row left blank, so a skipped row can say
 * why instead of disappearing silently.
 */
export function missingRequiredCells(cells: string[], indexes: StudentColumnIndexes): RequiredStudentColumn[] {
  return REQUIRED_STUDENT_COLUMNS.filter((column) => readStudentColumn(cells, indexes, column) === "");
}

export function describeMissingCells(columns: readonly RequiredStudentColumn[]): string {
  return `缺少${columns.map((column) => REQUIRED_COLUMN_LABELS[column]).join("、")}`;
}
