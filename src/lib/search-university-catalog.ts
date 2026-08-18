import {
  chinaUniversities,
  type UniversityCatalogEntry,
} from "../data/china-universities";
import {
  normalizeCatalogText,
  resolveCity,
  resolveProvinceName,
  searchCatalog,
} from "./search-catalog";

export type UniversityResolution = {
  university: string;
  city: string;
  province: string;
  status: "resolved" | "unresolved";
};

export function searchUniversities(query: string, limit = 8): UniversityCatalogEntry[] {
  return searchCatalog(chinaUniversities, query, limit);
}

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
