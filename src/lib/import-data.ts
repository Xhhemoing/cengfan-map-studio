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
}

/** 行首制表符代表空列位置,清理缩进时必须保留,否则整行列位会左移。 */
function trimLineEdges(line: string): string {
  return line.replace(/^[^\S\t]+/, "").replace(/\s+$/, "");
}

function splitLines(text: string): string[] {
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
  const lines = splitLines(text);
  const candidates: ImportCandidate[] = [];
  const unparsed: UnparsedLine[] = [];
  // 首行是表头时记下列映射,后续行按列名取值;没有表头则保持旧的列位解析。
  let headerIndexes: ColumnIndexes | null = null;

  lines.forEach((line, index) => {
    const labeledCandidate = parseLabeledCandidate(line, index + 1);
    if (labeledCandidate) {
      candidates.push(labeledCandidate);
      return;
    }
    const delimiter = detectDelimiter(line);
    const parts = splitParts(line, delimiter);
    if (index === 0 && looksLikeHeaderRow(parts) && parts.length >= 3) {
      const indexes = findColumnIndexes(parts);
      // 三个必填列没认全就不用映射:漏认一列会把整批数据判成无效,不如退回列位解析。
      headerIndexes = REQUIRED_COLUMNS.every((field) => indexes[field] !== undefined) ? indexes : null;
      return;
    }

    const candidate = headerIndexes
      ? toMappedCandidate(parts, headerIndexes, index + 1, line)
      : toCandidate(parts, index + 1, line);
    if (candidate) {
      candidates.push(candidate);
      return;
    }

    unparsed.push({
      sourceLine: index + 1,
      rawLine: line,
      reason: "无法识别学生名称、录取院校和城市",
    });
  });

  return { candidates, unparsed };
}
