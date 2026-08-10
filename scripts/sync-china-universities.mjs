/**
 * Synchronize the checked-in China university catalog from the MOE national
 * higher-education institution list (全国普通高等学校名单) published by the
 * Ministry of Education. The attachment is an .xls workbook whose first sheet
 * contains province group rows and university rows:
 *
 *   附件1：
 *   全国普通高等学校名单
 *   （截至2025年6月20日）
 *   序号  学校名称  学校标识码  主管部门  所在地  办学层次  备注
 *   北京市（92所）
 *   1  北京大学  4111010001  教育部  北京市  本科
 *
 * Each row's province comes from the preceding group row (`XX省（N所）`) and
 * the city from the 所在地 column (whitespace-cleaned). Hand-curated aliases
 * from the original checked-in catalog (baseline 33 rows) are merged in by
 * canonical name. The whole result is validated in memory before overwriting
 * the target module, so a bad upstream workbook can never corrupt the
 * checked-in catalog.
 *
 * Usage:
 *   npm run data:sync:china-universities
 */
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

/** Upstream MOE attachment: 全国普通高等学校名单（截至2025年6月20日）. */
export const UNIVERSITIES_URL =
  "http://www.moe.gov.cn/jyb_xxgk/s5743/s5744/A03/202506/W020250729615142156867.xls";

/** First sheet name of the MOE workbook. */
export const UNIVERSITIES_SHEET = "全国普通高等学校名单";

/**
 * @typedef {Object} UniversityRow
 * @property {string} name Canonical university name, e.g. "浙江大学".
 * @property {string} province Canonical province name, e.g. "浙江省".
 * @property {string} city City/prefecture name from the upstream 所在地 column, whitespace-cleaned, e.g. "杭州市".
 * @property {string[]} aliases Short-form aliases kept from the original checked-in catalog.
 */

/** Column indexes in the MOE workbook (0-based). */
const NAME_COLUMN = 1;
const CITY_COLUMN = 4;

/** Matches province group rows like `北京市（92所）`. */
const PROVINCE_GROUP_PATTERN = /^(.+?)（(\d+)所）$/;

/**
 * Hand-curated aliases carried over from the original checked-in catalog
 * (baseline commit a89931a, `src/data/china-universities.ts`), keyed by
 * canonical university name. A key without an upstream match never
 * synthesizes a row.
 */
const LEGACY_ALIASES = {
  "北京大学": ["北大"],
  "清华大学": ["清华"],
  "中国人民大学": ["人大"],
  "北京师范大学": ["北师大"],
  "北京航空航天大学": ["北航"],
  "北京理工大学": ["北理工"],
  "上海交通大学": ["上交", "上海交大"],
  "复旦大学": ["复旦"],
  "同济大学": ["同济"],
  "华东师范大学": ["华东师大"],
  "浙江大学": ["浙大"],
  "南京大学": ["南大"],
  "东南大学": ["东大"],
  "电子科技大学": ["电子科大"],
  "西安交通大学": ["西交", "西交大"],
  "西北工业大学": ["西工大"],
  "哈尔滨工业大学": ["哈工大"],
  "厦门大学": ["厦大"],
  "湖南大学": ["湖大"],
  "中南大学": ["中南"],
  "山东大学": ["山大"],
  "中国海洋大学": ["海大"],
  "吉林大学": ["吉大"],
  "大连理工大学": ["大工"],
  "南开大学": ["南开"],
  "重庆大学": ["重大"],
  "兰州大学": ["兰大"],
};

function cleanCityName(value) {
  return value.replace(/\s+/g, "").trim();
}

function uniquePreservingOrder(values) {
  return [...new Set(values)];
}

/** Parse the MOE workbook rows (二维数组) into university rows. */
export function parseUniversitiesRows(rows) {
  const result = [];
  let province = null;
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const first = String(row[0] ?? "").trim();
    const group = first.match(PROVINCE_GROUP_PATTERN);
    if (group) {
      province = group[1];
      continue;
    }
    const name = String(row[NAME_COLUMN] ?? "").trim();
    const city = cleanCityName(String(row[CITY_COLUMN] ?? ""));
    if (!province || !name || !city) continue;
    result.push({
      name,
      province,
      city,
      aliases: uniquePreservingOrder(LEGACY_ALIASES[name] ?? []),
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

export function renderUniversitiesModule(rows) {
  const lines = rows.map((row) => {
    const aliases = row.aliases.length
      ? `[${row.aliases.map((alias) => JSON.stringify(alias)).join(", ")}]`
      : "[]";
    return `  { name: ${JSON.stringify(row.name)}, province: ${JSON.stringify(row.province)}, city: ${JSON.stringify(row.city)}, aliases: ${aliases} },`;
  });
  return `/**
 * China university catalog generated from the MOE national higher-education
 * institution list attachment at ${UNIVERSITIES_URL}.
 *
 * This file is checked in and ships to browsers as static data. It contains
 * the full ordinary higher-education institution list (本科 + 专科); province
 * comes from the workbook group rows and city from the 所在地 column.
 * Hand-curated short aliases from the original checked-in catalog are merged
 * by canonical name. Regenerate it with:
 *
 *   npm run data:sync:china-universities
 */

export interface UniversityCatalogEntry {
  /** Canonical university name, e.g. "浙江大学". */
  name: string;
  /** Canonical province name the university belongs to, e.g. "浙江省". */
  province: string;
  /** Canonical city/prefecture name, e.g. "杭州市". */
  city: string;
  /** Common short-form aliases (北大, 浙大, ...) used by search. */
  aliases: string[];
}

/** Upstream attachment and row count that generated this file. */
export const chinaUniversitySource = {
  url: ${JSON.stringify(UNIVERSITIES_URL)},
  count: ${rows.length},
};

export const chinaUniversities: UniversityCatalogEntry[] = [
${lines.join("\n")}
];
`;
}

export async function syncChinaUniversities(options = {}) {
  const fetchBuffer = options.fetchBuffer ?? (async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`无法获取大学名单：HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  });
  const target = options.target ?? resolve(fileURLToPath(new URL("..", import.meta.url)), "src/data/china-universities.ts");
  const minRows = options.minRows ?? 2000;

  const buffer = await fetchBuffer(UNIVERSITIES_URL);
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames.find((name) => name === UNIVERSITIES_SHEET) ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("大学名单工作簿中没有可读取的工作表");
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const universityRows = parseUniversitiesRows(rows);
  if (universityRows.length < minRows) {
    throw new Error(`大学名单行数异常（${universityRows.length}），已中止写入`);
  }
  if (universityRows.some((row) => !row.province || !row.city)) {
    throw new Error("存在缺少省份或城市的大学行，已中止写入");
  }
  await writeFile(target, renderUniversitiesModule(universityRows), "utf8");
  return { count: universityRows.length, target };
}

const isCli = Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const result = await syncChinaUniversities();
    console.log(
      `[data:sync:china-universities] wrote src/data/china-universities.ts (${result.count} universities)`,
    );
  } catch (error) {
    console.error(`[data:sync:china-universities] ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
