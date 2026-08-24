import {
  createLabelPattern,
  findColumnIndexes,
  looksLikeHeaderRow,
  matchStudentColumn,
  parseLocationScope,
  REQUIRED_COLUMNS,
  type StudentColumn,
} from "./import-aliases";

export interface ImportCandidate {
  name: string;
  university: string;
  city: string;
  locationScope?: "china" | "international";
  /** 显式省份:选填,有值时覆盖按城市推断的省份;缺省不写该字段,交给下游按城市解析。 */
  province?: string;
  sourceLine: number;
  rawLine: string;
}

type ColumnIndexes = Partial<Record<StudentColumn, number>>;

export interface UnparsedLine {
  sourceLine: number;
  rawLine: string;
  reason: string;
}

export interface TextImportResult {
  candidates: ImportCandidate[];
  unparsed: UnparsedLine[];
  /** 被升为表头而消费掉的行号(1 基);除此之外每一行都会落在 candidates 或 unparsed 里。 */
  headerLine?: number;
}

/** 疑似表头但没认全必填列时的落点理由:宁可报出来,也不静默丢行。 */
export const HEADER_LIKE_REASON = "疑似表头行";

/** 行首制表符代表空列位置,清理缩进时必须保留,否则整行列位会左移。 */
function trimLineEdges(line: string): string {
  return line.replace(/^[^\S\t]+/, "").replace(/\s+$/, "");
}

/** 与解析共用同一套切行规则:OCR 归一化要按行号对齐,不能各写一份。 */
export function splitTextLines(text: string): string[] {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map(trimLineEdges)
    .filter((line) => line.length > 0);
}

function detectDelimiter(line: string): string | null {
  if (line.includes("\t")) return "\t";
  if (line.includes(",")) return ",";
  if (line.includes("，")) return "，";
  if (line.includes(";")) return ";";
  return null;
}

function splitParts(line: string, delimiter: string | null): string[] {
  // 有明确分隔符时空槽即列位:只 trim 不丢弃,否则「张三,,北京市,海外」会把城市读成海外。
  if (delimiter) {
    return line.split(delimiter).map((part) => part.trim());
  }

  return line
    .replace(/^\d+[\.、\)]\s*/, "")
    .split(/[\s,，、;；\-\|]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * 无表头回退:仍按旧的 4 列列位「姓名/院校/城市/去向」。
 * 省份只在识别到表头时才按映射读取,否则模板第 5 列的位置无从确认,
 * 容易把「中国去向」这类值当成省份吃进来。
 */
function toCandidate(
  parts: string[],
  sourceLine: number,
  rawLine: string,
): ImportCandidate | null {
  if (parts.length < 3) return null;
  const [name, university, city, scope] = parts;
  if (!name || !university || !city) return null;
  const locationScope = parseLocationScope(scope);
  return {
    name,
    university,
    city,
    ...(locationScope ? { locationScope } : {}),
    sourceLine,
    rawLine,
  };
}

function cellAt(parts: string[], columnIndex: number | undefined): string {
  return columnIndex === undefined ? "" : (parts[columnIndex] ?? "").trim();
}

/** 识别到表头后按列名映射取值:支持乱序列与模板第 5 列的省份。 */
function toMappedCandidate(
  parts: string[],
  indexes: ColumnIndexes,
  sourceLine: number,
  rawLine: string,
): ImportCandidate | null {
  const name = cellAt(parts, indexes.name);
  const university = cellAt(parts, indexes.university);
  const city = cellAt(parts, indexes.city);
  if (!name || !university || !city) return null;
  const locationScope = parseLocationScope(cellAt(parts, indexes.locationScope));
  const province = cellAt(parts, indexes.province);
  return {
    name,
    university,
    city,
    ...(locationScope ? { locationScope } : {}),
    ...(province ? { province } : {}),
    sourceLine,
    rawLine,
  };
}

function parseLabeledCandidate(
  line: string,
  sourceLine: number,
): ImportCandidate | null {
  const fields = new Map<StudentColumn, string>();
  const matches = Array.from(line.matchAll(createLabelPattern()));
  for (const [index, match] of matches.entries()) {
    const column = matchStudentColumn(match[1]);
    if (!column || fields.has(column)) continue;
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? line.length;
    fields.set(column, line.slice(start, end).replace(/^[\s,，;；|｜]+|[\s,，;；|｜]+$/g, "").trim());
  }
  const name = fields.get("name");
  const university = fields.get("university");
  const city = fields.get("city");
  if (!name || !university || !city) return null;
  const locationScope = parseLocationScope(fields.get("locationScope"));
  const province = fields.get("province");
  return {
    name,
    university,
    city,
    ...(locationScope ? { locationScope } : {}),
    ...(province ? { province } : {}),
    sourceLine,
    rawLine: line,
  };
}

export function parseStudentText(text: string): TextImportResult {
  const lines = splitTextLines(text);
  const candidates: ImportCandidate[] = [];
  const unparsed: UnparsedLine[] = [];
  // 表头可以出现在任意一行(常见「标题 + 表头 + 数据」),认到后续行就按列名取值;没有表头则保持旧的列位解析。
  let headerIndexes: ColumnIndexes | null = null;
  let headerLine: number | undefined;

  lines.forEach((line, index) => {
    const sourceLine = index + 1;
    const labeledCandidate = parseLabeledCandidate(line, sourceLine);
    if (labeledCandidate) {
      candidates.push(labeledCandidate);
      return;
    }
    const delimiter = detectDelimiter(line);
    const parts = splitParts(line, delimiter);
    if (looksLikeHeaderRow(parts)) {
      // 命中两个以上必填别名的行一定不是学生记录:认全必填列就升为表头,
      // 否则记成疑似表头行,绝不让「姓名=姓名」这种假学生进候选。
      if (headerIndexes === null && parts.length >= 3) {
        const indexes = findColumnIndexes(parts);
        if (REQUIRED_COLUMNS.every((field) => indexes[field] !== undefined)) {
          headerIndexes = indexes;
          headerLine = sourceLine;
          return;
        }
      }
      unparsed.push({ sourceLine, rawLine: line, reason: HEADER_LIKE_REASON });
      return;
    }

    const candidate = headerIndexes
      ? toMappedCandidate(parts, headerIndexes, sourceLine, line)
      : toCandidate(parts, sourceLine, line);
    if (candidate) {
      candidates.push(candidate);
      return;
    }

    unparsed.push({
      sourceLine,
      rawLine: line,
      reason: "无法识别学生名称、录取院校和城市",
    });
  });

  return { candidates, unparsed, ...(headerLine === undefined ? {} : { headerLine }) };
}
