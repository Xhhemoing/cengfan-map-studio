/** Safe, recognizable filenames for poster and project-package exports. */
export type PosterExportKind = "png" | "svg" | "project";

export interface ExportFileNameInput {
  projectName?: string | null;
  kind: PosterExportKind;
  scale?: number;
  /** Used only for project packages; defaults to the current YYYY-MM-DD date. */
  date?: string;
}

export const DEFAULT_EXPORT_BASE_NAME = "我的毕业去向图";
export const MAX_EXPORT_BASE_LENGTH = 40;

const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function sanitizeExportBaseName(raw: string | null | undefined): string {
  const withoutControlCharacters = Array.from(raw ?? "")
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 31 && codePoint !== 127;
    })
    .join("");
  const cleaned = Array.from(withoutControlCharacters
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.-]+|[.-]+$/g, "")
    .trim())
    .slice(0, MAX_EXPORT_BASE_LENGTH)
    .join("")
    .trim();

  if (!cleaned || WINDOWS_RESERVED_NAME.test(cleaned)) {
    return DEFAULT_EXPORT_BASE_NAME;
  }
  return cleaned;
}

export function buildExportFileName(input: ExportFileNameInput): string {
  const baseName = sanitizeExportBaseName(input.projectName);
  if (input.kind === "svg") return `${baseName}.svg`;
  if (input.kind === "project") {
    const date = input.date ?? new Date().toISOString().slice(0, 10);
    return `${baseName}-工程包-${date}.json`;
  }

  const scale = Number.isFinite(input.scale) && (input.scale ?? 0) > 0
    ? input.scale
    : 1;
  return `${baseName}-${scale}x.png`;
}
