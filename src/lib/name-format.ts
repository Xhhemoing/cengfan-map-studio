import { pinyin } from "pinyin-pro";

/** 卡片名单姓名格式（伪代码模板）。
 *
 * 模板由占位符与字面字符（如 * x X）组成，例如：
 * - "{name}"            → 完整姓名（默认）
 * - "{surname}xx"       → 王小明 → 王xx（保留姓，其余打码）
 * - "X{rest}"           → 王小明 → X小明（姓打码为 X）
 * - "{surname}*{last}"  → 王小明 → 王*明（姓 + * + 末字）
 *
 * 模板不含任何占位符时视为固定文本（如 "Xxx" 会用于全部姓名）。
 * 含未知占位符时回退为完整姓名。
 */

export const DEFAULT_NAME_FORMAT = "{name}";

export interface NameFormatPreset {
  value: string;
  label: string;
}

export const NAME_FORMAT_PRESETS: NameFormatPreset[] = [
  { value: "{name}", label: "完整姓名" },
  { value: "{surname}xx", label: "姓xx" },
  { value: "X{rest}", label: "Xxx" },
  { value: "{surname}*{last}", label: "姓*某" },
  { value: "{initial}**", label: "首字**" },
  { value: "initials-title", label: "Wxm（首字母）" },
  { value: "initials-lower", label: "wxm（小写首字母）" },
  { value: "initials-upper", label: "WXM（大写首字母）" },
  { value: "surname-mask-last", label: "王*明（姓+末字）" },
  { value: "surname-given-initials-lower", label: "王xm（姓+名首字母）" },
];

const NAME_PLACEHOLDER_PATTERN = /\{([^{}]+)\}/g;
const SUPPORTED_NAME_PLACEHOLDERS = new Set(["name", "surname", "given", "initial", "initials", "surnameInitial", "givenInitials", "last", "rest"]);
const BUILT_IN_NAME_FORMATS = new Set([
  "initials-title",
  "initials-lower",
  "initials-upper",
  "surname-mask-last",
  "surname-given-initials-lower",
]);

/** 常见复姓：{surname} 优先按两字姓切分，避免 欧阳娜娜 → 欧xx。 */
const COMPOUND_SURNAMES = new Set([
  "欧阳", "太史", "端木", "上官", "司马", "东方", "独孤", "南宫", "万俟", "闻人",
  "夏侯", "诸葛", "尉迟", "公羊", "赫连", "澹台", "皇甫", "宗政", "濮阳", "公冶",
  "太叔", "申屠", "公孙", "慕容", "仲孙", "钟离", "长孙", "宇文", "司徒", "鲜于",
  "司空", "闾丘", "子车", "亓官", "司寇", "巫马", "公西", "颛孙", "壤驷", "公良",
  "漆雕", "乐正", "宰父", "谷梁", "拓跋", "夹谷", "轩辕", "令狐", "段干", "百里",
  "呼延", "东郭", "南门", "羊舌", "微生", "梁丘", "左丘", "公伯", "西门", "公祖",
  "公乘", "贯丘", "公皙", "南荣", "东里", "东宫", "仲长", "子书", "子桑", "即墨",
  "达奚", "褚师", "完颜", "那拉",
]);

export interface SurnameSplit {
  surname: string;
  given: string;
}

/** Zero-width characters survive `trim()` and would fake a longer name. */
const INVISIBLE_NAME_CHARS = /[\uFEFF\u200b-\u200d\u2060]/g;

/** Every middle dot a transliterated name arrives with, unified to `·`. */
const NAME_MIDDLE_DOTS = /[·・･•‧∙⋅]/g;

/** A space between two Chinese characters is alignment padding, not a word break. */
const PADDED_CJK_SPACE = /([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g;

/** Cleans up copy/paste decoration but keeps the spaces that separate words. */
function normalizeNameSpacing(value: unknown): string {
  return String(value ?? "")
    .replace(INVISIBLE_NAME_CHARS, "")
    .replace(NAME_MIDDLE_DOTS, "·")
    .replace(/\s+/g, " ")
    .replace(/\s*·\s*/g, "·")
    .trim();
}

/**
 * Roster-facing name cleanup, applied on import and before formatting:
 * zero-width characters go, every middle-dot variant becomes `·`, repeated or
 * full-width spaces collapse, and the padding spaces a spreadsheet uses to
 * align a two-character name ("林 舟") disappear. Spaces between Latin words
 * stay, because they separate the surname from the given name.
 */
export function normalizeStudentName(value: unknown): string {
  return normalizeNameSpacing(value).replace(PADDED_CJK_SPACE, "$1");
}

export function splitSurname(name: string): SurnameSplit {
  // A middle dot is the explicit separator of a transliterated name and beats
  // both the space rule and the compound-surname table.
  const spaced = normalizeNameSpacing(name);
  const dot = spaced.indexOf("·");
  if (dot > 0) {
    return { surname: normalizeStudentName(spaced.slice(0, dot)), given: normalizeStudentName(spaced.slice(dot + 1)) };
  }
  const words = spaced.split(" ").filter(Boolean);
  if (words.length >= 2) {
    return { surname: normalizeStudentName(words[0]), given: normalizeStudentName(words.slice(1).join(" ")) };
  }
  const characters = Array.from(normalizeStudentName(spaced));
  if (characters.length >= 3 && COMPOUND_SURNAMES.has(characters.slice(0, 2).join(""))) {
    return { surname: characters.slice(0, 2).join(""), given: characters.slice(2).join("") };
  }
  return { surname: characters[0] ?? "", given: characters.slice(1).join("") };
}

function initials(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const words = trimmed.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.map((word) => Array.from(word)[0] ?? "") : Array.from(trimmed)).join("").toUpperCase();
}

function pinyinInitials(value: string): string {
  return pinyin(value.trim(), { toneType: "none", type: "array" })
    .map((word) => word.charAt(0))
    .join("");
}

function formatBuiltInName(name: string, format: string, surname: string, given: string, last: string): string | null {
  if (!BUILT_IN_NAME_FORMATS.has(format)) return null;
  const fullInitials = pinyinInitials(name);
  switch (format) {
    case "initials-title": return fullInitials ? fullInitials.charAt(0).toUpperCase() + fullInitials.slice(1).toLowerCase() : name;
    case "initials-lower": return fullInitials.toLowerCase();
    case "initials-upper": return fullInitials.toUpperCase();
    case "surname-mask-last": return `${surname}*${last}`;
    case "surname-given-initials-lower": return `${surname}${pinyinInitials(given).toLowerCase()}`;
    default: return name;
  }
}

function givenInitials(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const words = trimmed.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.map((word) => Array.from(word)[0] ?? "") : Array.from(trimmed).slice(0, 1)).join("").toUpperCase();
}

/** A template typed with a Chinese IME arrives with full-width braces. */
function normalizeTemplateSource(template: unknown): string {
  return typeof template === "string" ? template.replace(/｛/g, "{").replace(/｝/g, "}").trim() : "";
}

export function formatStudentName(name: string, template: string): string {
  const trimmed = normalizeStudentName(name);
  const source = normalizeTemplateSource(template);
  if (!trimmed || !source || source === DEFAULT_NAME_FORMAT) return trimmed;
  const { surname, given } = splitSurname(trimmed);
  const characters = Array.from(trimmed);
  const builtIn = formatBuiltInName(trimmed, source, surname, given, characters[characters.length - 1] ?? "");
  if (builtIn !== null) return builtIn;
  const placeholders = [...source.matchAll(NAME_PLACEHOLDER_PATTERN)].map((match) => match[1] ?? "");
  if (placeholders.some((placeholder) => !SUPPORTED_NAME_PLACEHOLDERS.has(placeholder))) return trimmed;
  const values: Record<string, string> = {
    name: trimmed,
    surname,
    given,
    initial: characters[0] ?? "",
    initials: initials(trimmed),
    surnameInitial: initials(surname).slice(0, 1),
    givenInitials: givenInitials(given),
    last: characters[characters.length - 1] ?? "",
    rest: characters.slice(1).join(""),
  };
  const formatted = source.replace(NAME_PLACEHOLDER_PATTERN, (_match, placeholder: string) => values[placeholder] ?? "");
  return formatted.trim() || trimmed;
}

export function normalizeNameFormat(value: unknown): string {
  const source = normalizeTemplateSource(value);
  if (!source) return DEFAULT_NAME_FORMAT;
  if (BUILT_IN_NAME_FORMATS.has(source)) return source;
  const placeholders = [...source.matchAll(NAME_PLACEHOLDER_PATTERN)].map((match) => match[1] ?? "");
  if (placeholders.some((placeholder) => !SUPPORTED_NAME_PLACEHOLDERS.has(placeholder))) return DEFAULT_NAME_FORMAT;
  return source;
}
