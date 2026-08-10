/**
 * Generate the checked-in university emblem map
 * (`src/data/university-emblems.ts`) from the processed webp assets in
 * `public/emblems/` and the source manifest (`assets-src/emblems-source/_manifest.json`).
 *
 * The manifest records which universities have an emblem and their source
 * (eol.cn official channel or the community PNG collection); the processed
 * 128px webp files in `public/emblems/` are named by university name. Schools
 * without any emblem are listed in `universityEmblemsMissing` so the UI can
 * fall back to a text placeholder.
 *
 * Usage:
 *   npm run data:sync:china-university-emblems
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EMBLEM_URL_PREFIX = "/emblems/";

/**
 * @typedef {Object} EmblemManifestEntry
 * @property {"eol" | "repo"} type
 * @property {number} [sid] eol.cn school id (eol type).
 * @property {string} [file] Community PNG file name (repo type).
 */

export function parseManifest(payload) {
  const entries = new Map();
  for (const [name, info] of Object.entries(payload)) {
    if (!info || typeof info !== "object") continue;
    if (info.type !== "eol" && info.type !== "repo") continue;
    if (info.type === "eol" && typeof info.sid !== "number") continue;
    if (info.type === "repo" && typeof info.file !== "string") continue;
    entries.set(name, info);
  }
  return entries;
}

export function renderEmblemsModule(entries, allUniversityNames, existingFiles) {
  const lines = [...entries.keys()].sort((a, b) => a.localeCompare(b, "zh-CN")).map((name) => {
    return `  ${JSON.stringify(name)}: ${JSON.stringify(`${EMBLEM_URL_PREFIX}${name}.webp`)},`;
  });
  const missing = allUniversityNames
    .filter((name) => !entries.has(name))
    .sort((a, b) => a.localeCompare(b, "zh-CN"))
    .map((name) => `  ${JSON.stringify(name)},`);
  const stale = [...entries.keys()].filter((name) => !existingFiles.has(`${name}.webp`));
  return `/**
 * China university emblem map (name -> webp asset under /public/emblems).
 *
 * Emblems are 128px webp cutouts (background removed with the same four-corner
 * sampling algorithm as src/lib/background-removal.ts) generated from two
 * sources: the eol.cn official school channel (majority) and a community PNG
 * collection (fallback). Regenerate with:
 *
 *   npm run data:sync:china-university-emblems
 */

/** Map of university name to emblem asset path (static, served from /public). */
export const universityEmblems: Record<string, string> = {
${lines.join("\n")}
};

/** Universities with no emblem available (use a text placeholder instead). */
export const universityEmblemsMissing: string[] = [
${missing.join("\n")}
];

/** Emblem map stats for tests and diagnostics. */
export const universityEmblemStats = {
  total: ${allUniversityNames.length},
  withEmblem: ${entries.size},
  missing: ${missing.length},
};
`;
}

export async function syncChinaUniversityEmblems(options = {}) {
  const root = options.root ?? process.cwd();
  const manifestFile = options.manifestFile ?? resolve(root, "assets-src/emblems-source/_manifest.json");
  const emblemsDir = options.emblemsDir ?? resolve(root, "public/emblems");
  const target = options.target ?? resolve(root, "src/data/university-emblems.ts");
  const universitiesFile = options.universitiesFile ?? resolve(root, "src/data/china-universities.ts");

  const [manifestRaw, universitiesRaw, files] = await Promise.all([
    readFile(manifestFile, "utf8"),
    readFile(universitiesFile, "utf8"),
    readdir(emblemsDir),
  ]);
  const entries = parseManifest(JSON.parse(manifestRaw));
  const names = [...universitiesRaw.matchAll(/name: "([^"]+)"/g)].map((m) => m[1]);
  const minRows = options.minRows ?? 2000;
  if (names.length < minRows) throw new Error(`大学名单行数异常（${names.length}）`);
  if (entries.size < minRows) throw new Error(`校徽映射行数异常（${entries.size}）`);
  const existing = new Set(files);
  const stale = [...entries.keys()].filter((name) => !existing.has(`${name}.webp`));
  if (stale.length > 0) throw new Error(`存在缺少产物文件的校徽（${stale.slice(0, 5).join("、")}…）`);

  await writeFile(target, renderEmblemsModule(entries, names, existing), "utf8");
  return { total: names.length, withEmblem: entries.size, missing: names.length - entries.size, target };
}

const isCli = Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const result = await syncChinaUniversityEmblems();
    console.log(
      `[data:sync:china-university-emblems] wrote src/data/university-emblems.ts (${result.withEmblem}/${result.total} universities)`,
    );
  } catch (error) {
    console.error(`[data:sync:china-university-emblems] ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
