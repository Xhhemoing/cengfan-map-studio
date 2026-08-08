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
  if (value.includes(query)) return 2;
  return null;
}

function getAliasRank(query: string, value: string): number | null {
  if (value === query) return 3;
  if (value.startsWith(query)) return 4;
  if (value.includes(query)) return 5;
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
    const aliasVariants = entry.aliases.flatMap(getSearchVariants).map((variant) => getAliasRank(normalizedQuery, variant));
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

export function searchProvinces(query: string, limit = 8): string[] {
  return searchCatalog(
    chinaProvinces.map((province) => ({ name: province.name, aliases: [] })),
    query,
    limit,
  ).map((entry) => entry.name);
}

function cityMatchesInput(entry: CityCatalogEntry, normalizedInput: string): boolean {
  const cityNames = [entry.name, ...entry.aliases, toShortCityName(entry.name)]
    .map(normalizeCatalogText);
  if (cityNames.includes(normalizedInput)) return true;

  const provinceNames = [entry.province, toShortProvinceName(entry.province)]
    .map(normalizeCatalogText);
  return provinceNames.some((province) => cityNames.some((city) => province + city === normalizedInput));
}

export function resolveCity(city: string): CityResolution {
  const normalizedInput = city.trim();
  if (!normalizedInput) {
    return {
      city: "",
      province: "",
      status: "unresolved",
    };
  }

  const matched = chinaCities.find((entry) => {
    return cityMatchesInput(entry, normalizeCatalogText(normalizedInput));
  });

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
