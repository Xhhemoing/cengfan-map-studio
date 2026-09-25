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

interface SourceLine {
  sourceLine: number;
  rawLine: string;
}

function splitLines(text: string): SourceLine[] {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line, index) => ({
      sourceLine: index + 1,
      rawLine: line.replace(/^[^\S\r\n\t]+|[^\S\r\n\t]+$/g, ""),
    }))
    .filter(({ rawLine }) => rawLine.trim().length > 0);
}

function looksLikeHeader(parts: string[]): boolean {
  const normalized = parts.map((part) => part.toLowerCase());
  const headerTokens = new Set([
    "姓名",
    "学生",
    "学生名称",
    "院校",
    "录取院校",
    // 教务导出的「毕业去向」列填的就是院校名，与 binary-import 的表头别名保持一致。
    "毕业去向",
    "去向院校",
    "去向学校",
    "大学",
    "学校",
    "城市",
    "所在城市",
    "name",
    "university",
    "school",
    "city",
  ]);
  const hitCount = normalized.filter((part) => headerTokens.has(part)).length;
  return hitCount >= 2;
}

function detectDelimiter(line: string): string | null {
  if (line.includes("\t")) return "\t";
  if (line.includes(",")) return ",";
  if (line.includes("，")) return "，";
  if (line.includes(";")) return ";";
  return null;
}

function splitParts(line: string, delimiter: string | null): string[] {
  if (delimiter) {
    return line
      .split(delimiter)
      .map((part) => part.trim());
  }

  return line
    .replace(/^\d+[\.、\)]\s*/, "")
    .split(/[\s,，、;；\-\|]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseLocationScope(value: string | undefined): "international" | undefined {
  const normalized = value?.trim().toLocaleLowerCase("zh-CN") ?? "";
  return normalized.includes("海外") || normalized.includes("international") || normalized.includes("overseas")
    ? "international"
    : undefined;
}

function toCandidate(
  parts: string[],
  sourceLine: number,
  rawLine: string,
): ImportCandidate | null {
  if (parts.length < 3) return null;
  const [name, university, city, scope] = parts;
  if (!name || !university || !city) return null;
  return {
    name,
    university,
    city,
    ...(parseLocationScope(scope) ? { locationScope: "international" as const } : {}),
    sourceLine,
    rawLine,
  };
}

function parseLabeledCandidate(
  line: string,
  sourceLine: number,
): ImportCandidate | null {
  const fields = new Map<string, string>();
  // 长别名排在短别名之前：否则「去向院校：」只会从「院校」处起匹配，把「去向」留给上一字段。
  const labelPattern = /(姓名|学生(?:姓名)?|name|就读院校|就读学校|录取院校|毕业去向|去向院校|去向学校|院校|学校|university|school|城市|所在城市|city)\s*[：:]/giu;
  const matches = Array.from(line.matchAll(labelPattern));
  for (const [index, match] of matches.entries()) {
    const label = match[1]!.toLocaleLowerCase("zh-CN");
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? line.length;
    fields.set(label, line.slice(start, end).replace(/^[\s,，;；|｜]+|[\s,，;；|｜]+$/g, "").trim());
  }
  const name = fields.get("姓名") ?? fields.get("学生") ?? fields.get("学生姓名") ?? fields.get("name");
  const university = fields.get("就读院校") ?? fields.get("就读学校") ?? fields.get("录取院校")
    ?? fields.get("毕业去向") ?? fields.get("去向院校") ?? fields.get("去向学校")
    ?? fields.get("院校") ?? fields.get("学校") ?? fields.get("university") ?? fields.get("school");
  const city = fields.get("城市") ?? fields.get("所在城市") ?? fields.get("city");
  return name && university && city ? { name, university, city, sourceLine, rawLine: line } : null;
}

export function parseDelimitedTable(text: string): ImportCandidate[] {
  const lines = splitLines(text);
  if (lines.length === 0) return [];

  const delimiter = detectDelimiter(lines[0]?.rawLine ?? "") ?? detectDelimiter(lines[1]?.rawLine ?? "") ?? ",";
  const candidates: ImportCandidate[] = [];

  lines.forEach(({ rawLine, sourceLine }, index) => {
    const parts = splitParts(rawLine, delimiter);
    if (index === 0 && looksLikeHeader(parts)) return;
    const candidate = toCandidate(parts, sourceLine, rawLine);
    if (candidate) candidates.push(candidate);
  });

  return candidates;
}

export function parseStudentText(text: string): TextImportResult {
  const lines = splitLines(text);
  const candidates: ImportCandidate[] = [];
  const unparsed: UnparsedLine[] = [];

  lines.forEach(({ rawLine, sourceLine }, index) => {
    const labeledCandidate = parseLabeledCandidate(rawLine, sourceLine);
    if (labeledCandidate) {
      candidates.push(labeledCandidate);
      return;
    }
    const delimiter = detectDelimiter(rawLine);
    const parts = splitParts(rawLine, delimiter);
    if (index === 0 && looksLikeHeader(parts) && parts.length >= 3) {
      return;
    }

    const candidate = toCandidate(parts, sourceLine, rawLine);
    if (candidate) {
      candidates.push(candidate);
      return;
    }

    unparsed.push({
      sourceLine,
      rawLine,
      reason: "无法识别学生名称、录取院校和城市",
    });
  });

  return { candidates, unparsed };
}
