import {
  createLabelPattern,
  looksLikeHeaderRow,
  matchStudentColumn,
  parseLocationScope,
  type StudentColumn,
} from "./import-aliases";

export interface ImportCandidate {
  name: string;
  university: string;
  city: string;
  locationScope?: "china" | "international";
  sourceLine: number;
  rawLine: string;
}

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
  return {
    name,
    university,
    city,
    ...(locationScope ? { locationScope } : {}),
    sourceLine,
    rawLine: line,
  };
}

export function parseDelimitedTable(text: string): ImportCandidate[] {
  const lines = splitLines(text);
  if (lines.length === 0) return [];

  const delimiter = detectDelimiter(lines[0] ?? "") ?? detectDelimiter(lines[1] ?? "") ?? ",";
  const candidates: ImportCandidate[] = [];

  lines.forEach((line, index) => {
    const parts = splitParts(line, delimiter);
    if (index === 0 && looksLikeHeaderRow(parts)) return;
    const candidate = toCandidate(parts, index + 1, line);
    if (candidate) candidates.push(candidate);
  });

  return candidates;
}

export function parseStudentText(text: string): TextImportResult {
  const lines = splitLines(text);
  const candidates: ImportCandidate[] = [];
  const unparsed: UnparsedLine[] = [];

  lines.forEach((line, index) => {
    const labeledCandidate = parseLabeledCandidate(line, index + 1);
    if (labeledCandidate) {
      candidates.push(labeledCandidate);
      return;
    }
    const delimiter = detectDelimiter(line);
    const parts = splitParts(line, delimiter);
    if (index === 0 && looksLikeHeaderRow(parts) && parts.length >= 3) {
      return;
    }

    const candidate = toCandidate(parts, index + 1, line);
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
