type EmblemMap = Record<string, string>;

let emblems: EmblemMap | null = null;
let pending: Promise<EmblemMap> | null = null;

/** Synchronous lookup after the catalog chunk has loaded; undefined until then. */
export function peekUniversityEmblem(university: string): string | undefined {
  return emblems?.[university];
}

/** Dynamically loads the emblem catalog so PosterCanvas does not eagerly ship it. */
export function loadUniversityEmblemMap(): Promise<EmblemMap> {
  if (emblems) return Promise.resolve(emblems);
  pending ??= import("../data/university-emblems").then((mod) => {
    emblems = mod.universityEmblems;
    return emblems;
  });
  return pending;
}

/** Test-only reset so lazy-load assertions can start from an empty cache. */
export function resetUniversityEmblemMapForTests(): void {
  emblems = null;
  pending = null;
}
