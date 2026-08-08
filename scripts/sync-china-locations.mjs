/**
 * Synchronize the checked-in China province/city catalog from the
 * `province-city-china` npm package (MIT).
 *
 * Reads ONLY `package/dist/province.json` and `package/dist/city.json` from the
 * package tarball — district and town payloads are never touched. Validates the
 * whole result in memory before overwriting the target module, so a bad upstream
 * release can never corrupt the checked-in catalog.
 *
 * Usage:
 *   npm run data:sync:china-locations            # latest release
 *   npm run data:sync:china-locations -- --version 8.5.8
 */
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

/** npm registry metadata endpoint for the upstream package. */
export const REGISTRY_URL = "https://registry.npmjs.org/province-city-china";

const PROVINCE_ENTRY = "package/dist/province.json";
const CITY_ENTRY = "package/dist/city.json";

/**
 * Municipality / special-region / Taiwan compatibility rows. The upstream
 * `city.json` ships no city rows for these provinces, while consumers have long
 * relied on these canonical city names and aliases. Rows are only synthesized
 * when the matching province exists upstream; an existing upstream city row is
 * enriched with the aliases instead of being duplicated.
 */
const COMPATIBILITY_CITIES = [
  { provinceName: "北京市", cityName: "北京市", aliases: ["北京", "帝都"] },
  { provinceName: "上海市", cityName: "上海市", aliases: ["上海", "魔都"] },
  { provinceName: "天津市", cityName: "天津市", aliases: ["天津", "津"] },
  { provinceName: "重庆市", cityName: "重庆市", aliases: ["重庆", "渝"] },
  { provinceName: "香港特别行政区", cityName: "香港特别行政区", aliases: ["香港", "HongKong", "HK"] },
  { provinceName: "澳门特别行政区", cityName: "澳门特别行政区", aliases: ["澳门", "Macao"] },
  { provinceName: "台湾省", cityName: "台北市", aliases: ["台北"] },
];

/**
 * Resolve which release to sync. A pinned `version` must exist in the registry;
 * otherwise the `latest` dist-tag is used. Returns the resolved version string
 * and its tarball URL.
 */
async function resolveRelease({ version, fetch }) {
  const response = await fetch(REGISTRY_URL, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`failed to fetch ${REGISTRY_URL}: HTTP ${response.status}`);
  }
  let metadata;
  try {
    metadata = await response.json();
  } catch (error) {
    throw new Error(`invalid registry metadata for province-city-china: ${error.message}`);
  }
  if (!metadata || typeof metadata !== "object" || !metadata.versions || typeof metadata.versions !== "object") {
    throw new Error("invalid registry metadata: missing versions map");
  }
  const release = version ?? metadata["dist-tags"]?.latest;
  const entry = release ? metadata.versions[release] : undefined;
  const tarball = entry?.dist?.tarball;
  if (typeof release !== "string" || typeof tarball !== "string") {
    throw new Error(`version "${version ?? metadata["dist-tags"]?.latest ?? ""}" not found in the province-city-china registry`);
  }
  return { version: release, tarball };
}

async function fetchTarball(tarballUrl, fetch) {
  const response = await fetch(tarballUrl);
  if (!response.ok) {
    throw new Error(`failed to fetch tarball ${tarballUrl}: HTTP ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

const textDecoder = new TextDecoder();

function readString(buffer, start, maxLength) {
  const terminator = buffer.indexOf(0, start);
  const end = terminator === -1 || terminator > start + maxLength ? start + maxLength : terminator;
  return textDecoder.decode(buffer.subarray(start, end));
}

/** Extract PAX `path=` overrides from an extended header payload. */
function parsePaxPath(text) {
  let path = null;
  for (const record of text.split("\n")) {
    const match = /^\d+ path=(.*)$/.exec(record);
    if (match) path = match[1];
  }
  return path;
}

/**
 * Minimal gzip-tar reader (ustar, plus GNU long-name and PAX path headers for
 * robustness). Returns a map of entry path -> file bytes.
 */
function parseTar(buffer) {
  const files = new Map();
  let offset = 0;
  let longName = null;
  let paxPath = null;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = readString(header, 0, 100);
    const size = Number.parseInt(readString(header, 124, 12).trim() || "0", 8) || 0;
    const typeflag = String.fromCharCode(header[156]);
    const prefix = readString(header, 345, 155);
    const data = buffer.subarray(offset + 512, offset + 512 + size);
    const padded = Math.ceil(size / 512) * 512;
    if (typeflag === "L") {
      longName = readString(data, 0, size);
    } else if (typeflag === "x") {
      paxPath = parsePaxPath(readString(data, 0, size));
    } else if (typeflag === "0" || typeflag === "\0") {
      const fullName = paxPath ?? longName ?? (prefix ? `${prefix}/${name}` : name);
      files.set(fullName, data);
    }
    if (typeflag !== "L" && typeflag !== "x") {
      longName = null;
      paxPath = null;
    }
    offset += 512 + padded;
  }
  return files;
}

function parseJsonPayload(buffer, entryPath) {
  try {
    return JSON.parse(new TextDecoder().decode(buffer));
  } catch (error) {
    throw new Error(`could not parse ${entryPath}: ${error.message}`);
  }
}

/** Unpack the tarball and return only the province and city payload rows. */
function extractProvinceCity(tarballBuffer) {
  const files = parseTar(gunzipSync(tarballBuffer));
  const province = files.get(PROVINCE_ENTRY);
  const city = files.get(CITY_ENTRY);
  if (!province) throw new Error(`tarball is missing ${PROVINCE_ENTRY}`);
  if (!city) throw new Error(`tarball is missing ${CITY_ENTRY}`);
  return {
    provinceRows: parseJsonPayload(province, PROVINCE_ENTRY),
    cityRows: parseJsonPayload(city, CITY_ENTRY),
  };
}

function assertRow(row, label) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    throw new Error(`invalid ${label}: expected an object row`);
  }
  for (const field of ["code", "name", "province"]) {
    if (typeof row[field] !== "string" || row[field].trim() === "") {
      throw new Error(`invalid ${label}: missing ${field}`);
    }
  }
}

function assertUnique(entries, kind, getKey) {
  const seen = new Set();
  for (const entry of entries) {
    const key = getKey(entry);
    if (seen.has(key)) throw new Error(`duplicate ${kind} code "${key}"`);
    seen.add(key);
  }
}

/**
 * Validate upstream rows, attach canonical province names to cities, and
 * synthesize compatibility entries. Throws before anything is written whenever
 * the upstream data is inconsistent.
 */
function normalizeLocationRows(provinceRows, cityRows) {
  if (!Array.isArray(provinceRows)) throw new Error("invalid province.json: expected an array");
  if (!Array.isArray(cityRows)) throw new Error("invalid city.json: expected an array");

  const provinces = provinceRows.map((row, index) => {
    assertRow(row, `province row ${index}`);
    return { code: String(row.code), name: String(row.name), prefix: String(row.province) };
  });
  assertUnique(provinces, "province", (entry) => entry.code);
  assertUnique(provinces, "province", (entry) => entry.name);

  // Every city's explicit `province` field must map to an existing province and
  // match the leading digits of its own code; the code-prefix fallback must not
  // paper over an inconsistent upstream row.
  const prefixToProvince = new Map();
  for (const province of provinces) {
    prefixToProvince.set(province.prefix, province);
    prefixToProvince.set(province.code.slice(0, 2), province);
  }

  const cities = cityRows.map((row, index) => {
    assertRow(row, `city row ${index}`);
    const code = String(row.code);
    const name = String(row.name);
    const explicitProvince = String(row.province);
    const province = prefixToProvince.get(explicitProvince);
    if (!province || explicitProvince !== code.slice(0, 2)) {
      throw new Error(`city "${code} ${name}" references province "${row.province}" inconsistent with its code`);
    }
    return { code, name, province: province.name, aliases: [] };
  });
  assertUnique(cities, "city", (entry) => entry.code);

  // Municipality / special-region / Taiwan compatibility entries.
  const provinceByName = new Map(provinces.map((province) => [province.name, province]));
  for (const spec of COMPATIBILITY_CITIES) {
    const province = provinceByName.get(spec.provinceName);
    if (!province) continue;
    const existing = cities.find((city) => city.name === spec.cityName && city.province === province.name);
    if (existing) {
      for (const alias of spec.aliases) {
        if (!existing.aliases.includes(alias)) existing.aliases.push(alias);
      }
    } else {
      cities.push({ code: province.code, name: spec.cityName, province: province.name, aliases: [...spec.aliases] });
    }
  }

  provinces.sort(compareByCode);
  cities.sort(compareByCode);
  return {
    provinces: provinces.map(({ prefix: _prefix, ...entry }) => entry),
    cities,
  };
}

function compareByCode(left, right) {
  return left.code.localeCompare(right.code) || left.name.localeCompare(right.name);
}

function quote(value) {
  return JSON.stringify(value);
}

function formatProvince({ code, name }) {
  return `{ code: ${quote(code)}, name: ${quote(name)} }`;
}

function formatCity({ code, name, province, aliases }) {
  const aliasText = aliases.length === 0 ? "[]" : `[${aliases.map(quote).join(", ")}]`;
  return `{ code: ${quote(code)}, name: ${quote(name)}, province: ${quote(province)}, aliases: ${aliasText} }`;
}

/** Deterministic TypeScript module text for the validated catalog. */
function renderCatalog({ provinces, cities }, version) {
  return `/**
 * China province/city catalog generated from the \`province-city-china\` npm package.
 *
 * This file is checked in and ships to browsers as static data. It contains
 * province and prefecture-level city data only; district and town data is never
 * loaded during synchronization. Regenerate it with:
 *
 *   npm run data:sync:china-locations [-- --version <semver>]
 */

export interface ProvinceCatalogEntry {
  /** Six-digit national administrative division code, e.g. "330000". */
  code: string;
  /** Canonical province name, e.g. "浙江省". */
  name: string;
}

export interface CityCatalogEntry {
  /** Six-digit prefecture-level code, e.g. "330100". */
  code: string;
  /** Canonical prefecture-level city name, e.g. "杭州市". */
  name: string;
  /** Canonical province name the city belongs to, e.g. "浙江省". */
  province: string;
  /** Common aliases (北京, 上海, HongKong, ...) used by search and compat code. */
  aliases: string[];
}

/** Upstream package and exact release that generated this file. */
export const chinaLocationSource = { registry: ${quote("province-city-china")}, version: ${quote(version)} };

export const chinaProvinces: ProvinceCatalogEntry[] = [
${provinces.map((entry) => `  ${formatProvince(entry)},`).join("\n")}
];

export const chinaCities: CityCatalogEntry[] = [
${cities.map((entry) => `  ${formatCity(entry)},`).join("\n")}
];
`;
}

/**
 * Resolve a release, fetch and validate the upstream province/city payloads, and
 * write the generated catalog module. The target file is only overwritten once
 * the entire result has been validated.
 *
 * `fetch` and `outputPath` are injectable so unit tests run fully offline.
 *
 * @returns {{ version: string, provinces: number, cities: number }}
 */
export async function syncChinaLocations({ version, fetch = globalThis.fetch, outputPath } = {}) {
  const release = await resolveRelease({ version, fetch });
  const tarball = await fetchTarball(release.tarball, fetch);
  const { provinceRows, cityRows } = extractProvinceCity(tarball);
  const catalog = normalizeLocationRows(provinceRows, cityRows);
  const target = outputPath ?? new URL("../src/data/china-locations.ts", import.meta.url);
  await writeFile(target, renderCatalog(catalog, release.version), "utf8");
  return {
    version: release.version,
    provinces: catalog.provinces.length,
    cities: catalog.cities.length,
  };
}

function parseCliArgs(argv) {
  let version;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--version") {
      version = argv[index + 1];
      if (version === undefined) throw new Error("--version requires a semver value");
      index += 1;
    } else if (arg.startsWith("--version=")) {
      version = arg.slice("--version=".length);
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  return { version };
}

const isCli = Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const { version } = parseCliArgs(process.argv.slice(2));
    const result = await syncChinaLocations({ version });
    console.log(
      `[data:sync:china-locations] wrote src/data/china-locations.ts from province-city-china@${result.version} ` +
        `(${result.provinces} provinces, ${result.cities} cities)`,
    );
  } catch (error) {
    console.error(`[data:sync:china-locations] ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
