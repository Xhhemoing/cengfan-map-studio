import { chinaCities, chinaProvinces, type CityCatalogEntry } from "../data/china-locations";
import {
  chinaUniversities,
  type UniversityCatalogEntry,
} from "../data/china-universities";
import { getProvinceNames, toShortProvinceName } from "./map-data";

export type CityResolution = {
  city: string;
  province: string;
  status: "resolved" | "unresolved";
};

function normalizeCatalogText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\-_.，。、；：()（）【】\[\]]/g, "");
}

function getSearchVariants(value: string): string[] {
  const normalized = normalizeCatalogText(value);
  const withoutSuffix = normalized.replace(/(大学|学院|学校|市|特别行政区|自治区|省|州|地区)$/u, "");
  return withoutSuffix && withoutSuffix !== normalized
    ? [normalized, withoutSuffix]
    : [normalized];
}

/**
 * Suffix-free short form used by exact city resolution ONLY. Unlike the
 * province-only `toShortProvinceName` in map-data.ts, city resolution must also
 * strip the generic prefecture markers `州` / `地区` / `盟` so inputs like `阿里`
 * and `兴安` resolve to `阿里地区` / `兴安盟` exactly as `searchCities` finds them.
 */
const CITY_SUFFIXES = ["特别行政区", "自治区", "自治州", "地区", "盟", "州", "市"];

function toShortCityName(name: string): string {
  const suffix = CITY_SUFFIXES.find((candidate) => name.endsWith(candidate));
  return suffix ? name.slice(0, -suffix.length) : name;
}

function getMatchRank(query: string, value: string): number | null {
  if (value === query) return 0;
  if (value.startsWith(query)) return 1;
  if (value.includes(query)) return 3;
  return null;
}

/**
 * Alias ranks are deliberately interleaved with name ranks: an exact alias
 * (浙大 → 浙江大学) is as precise as an exact name and must outrank any
 * substring name match (北京北大方正软件职业技术学院 matches 北大 only by
 * substring), otherwise search surfaces look-alike names above the real school.
 */
function getAliasRank(query: string, value: string): number | null {
  if (value === query) return 0;
  if (value.startsWith(query)) return 2;
  if (value.includes(query)) return 4;
  return null;
}

function searchCatalog<T extends { name: string; aliases: string[] }>(
  entries: T[],
  query: string,
  limit: number,
): T[] {
  const normalizedQuery = normalizeCatalogText(query);
  if (!normalizedQuery || limit <= 0) return [];

  const ranked = entries.flatMap((entry, index) => {
    const nameVariants = getSearchVariants(entry.name).map((variant) => getMatchRank(normalizedQuery, variant));
    const aliasVariants = (entry.aliases ?? []).flatMap(getSearchVariants).map((variant) => getAliasRank(normalizedQuery, variant));
    const ranks = [...nameVariants, ...aliasVariants].filter((rank): rank is number => rank !== null);
    if (ranks.length === 0) return [];
    const rank = Math.min(...ranks);
    return [{ entry, rank, index }];
  });

  return ranked
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .slice(0, Math.floor(limit))
    .map(({ entry }) => entry);
}

export function searchCities(query: string, limit = 8): CityCatalogEntry[] {
  return searchCatalog(chinaCities, query, limit);
}

export function searchUniversities(query: string, limit = 8): UniversityCatalogEntry[] {
  return searchCatalog(chinaUniversities, query, limit);
}

export type UniversityResolution = {
  university: string;
  city: string;
  province: string;
  status: "resolved" | "unresolved";
};

/**
 * Exact-match lookup used by `resolveUniversity`: the query must equal a
 * university's canonical name or one of its aliases exactly (after
 * normalization). Substring/prefix/loose-suffix matches never resolve, so
 * partial input like `浙江` cannot silently turn into `浙江大学`. The first
 * catalog match wins (the catalog is sorted by name, so canonical rows precede
 * look-alikes with the same variants, e.g. `安徽大学` before `安徽大学江淮学院`).
 */
function findExactUniversity(query: string): UniversityCatalogEntry | undefined {
  const normalized = normalizeCatalogText(query);
  return chinaUniversities.find((entry) => {
    if (normalizeCatalogText(entry.name) === normalized) return true;
    return (entry.aliases ?? []).some((alias) => normalizeCatalogText(alias) === normalized);
  });
}

/**
 * Map a university onto its canonical city and province. Returns the exact
 * catalog school name so a typed alias (`浙大`) normalizes to `浙江大学`;
 * unknown schools stay unresolved so callers can fall back to manual input.
 */
export function resolveUniversity(university: string): UniversityResolution {
  const normalizedInput = university.trim();
  if (!normalizedInput) {
    return { university: "", city: "", province: "", status: "unresolved" };
  }
  const matched = findExactUniversity(normalizedInput);
  if (!matched) {
    return { university: normalizedInput, city: "", province: "", status: "unresolved" };
  }
  const cityResolution = resolveCity(matched.city);
  return {
    university: matched.name,
    city: cityResolution.status === "resolved" ? cityResolution.city : matched.city,
    province: resolveProvinceName(matched.province),
    status: "resolved",
  };
}

export function searchProvinces(query: string, limit = 8): string[] {
  return searchCatalog(
    chinaProvinces.map((province) => ({ name: province.name, aliases: [] })),
    query,
    limit,
  ).map((entry) => entry.name);
}

/**
 * Module-level exact-match index over every city variant (canonical name,
 * aliases, short name, and province+city composites). Built once because
 * `chinaCities` is static; `resolveCity` uses it instead of a linear scan, so
 * bulk resolution over thousands of rows stays fast and never degrades with
 * catalog growth. First catalog match wins, mirroring the previous find().
 */
const cityResolutionIndex: ReadonlyMap<string, CityCatalogEntry> = (() => {
  const index = new Map<string, CityCatalogEntry>();
  const addVariant = (entry: CityCatalogEntry, variant: string) => {
    const normalized = normalizeCatalogText(variant);
    if (normalized && !index.has(normalized)) index.set(normalized, entry);
  };
  for (const entry of chinaCities) {
    const cityNames = [entry.name, ...(entry.aliases ?? []), toShortCityName(entry.name)];
    for (const city of cityNames) {
      addVariant(entry, city);
      for (const province of [entry.province, toShortProvinceName(entry.province)]) {
        addVariant(entry, province + city);
      }
    }
  }
  return index;
})();

export function resolveCity(city: string): CityResolution {
  const normalizedInput = city.trim();
  if (!normalizedInput) {
    return {
      city: "",
      province: "",
      status: "unresolved",
    };
  }

  const matched = cityResolutionIndex.get(normalizeCatalogText(normalizedInput));

  if (!matched) {
    return {
      city: normalizedInput,
      province: "",
      status: "unresolved",
    };
  }

  return {
    city: matched.name,
    province: matched.province,
    status: "resolved",
  };
}

/** Map free-form province input onto the canonical GeoJSON province name when possible. */
export function resolveProvinceName(province: string): string {
  const normalizedInput = province.trim();
  if (!normalizedInput) return "";

  const provinces = getProvinceNames();
  const exact = provinces.find(
    (name) => normalizeCatalogText(name) === normalizeCatalogText(normalizedInput),
  );
  if (exact) return exact;

  const byShortName = provinces.find(
    (name) =>
      normalizeCatalogText(toShortProvinceName(name)) === normalizeCatalogText(normalizedInput)
      || normalizeCatalogText(toShortProvinceName(name)) === normalizeCatalogText(toShortProvinceName(normalizedInput)),
  );
  return byShortName ?? normalizedInput;
}
