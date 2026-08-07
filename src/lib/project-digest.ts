import { duplicateStudentIds, findDuplicateStudentGroups } from "./data-duplicate";
import type { ProjectDocument } from "./project-document";
import { buildProvinceSummary } from "./project-data";

export const DIGEST_MAX_BYTES = 8 * 1024;
export const DIGEST_TEXT_LIMIT = 40;

export interface ProjectDigest {
  canvas: {
    width: number;
    height: number;
    safeMargin: number;
    backgroundColor: string;
  };
  map: {
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
    fillMode?: string;
    customProvinceStyles: string[];
  };
  cards: {
    preset: string;
    grouping: string;
    layoutMode?: string;
    visibleFields: string[];
    fontSize: number;
    gap: number;
    hasManualPositions: boolean;
    manualPositionCount: number;
  };
  guests: {
    title: string;
    visibility: boolean;
    peopleCount: number;
  };
  textElements: Array<{
    id: string;
    role: string;
    content: string;
    x: number;
    y: number;
    fontSize: number;
    visibility: boolean;
  }>;
  assetElements: Array<{
    id: string;
    assetId: string;
    label: string;
    kind: string;
    src: string;
    width: number;
    height: number;
    visibility: boolean;
  }>;
  students: {
    total: number;
    hidden: number;
    topProvinces: Array<{ province: string; count: number }>;
    duplicateGroups: number;
    duplicateStudentCount: number;
  };
}

function shortText(value: string, limit = DIGEST_TEXT_LIMIT): string {
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

function assetRef(id: string, src: string): string {
  if (!src) return "";
  if (!src.startsWith("data:")) return shortText(src, 100);
  return `<asset:${id}>`;
}

/**
 * Build the only project representation sent to the model. Binary/data URLs
 * are replaced by stable references and student rows are reduced to counts.
 */
export function buildProjectDigest(project: ProjectDocument): ProjectDigest {
  const provinceSummary = buildProvinceSummary(project.students);
  const duplicateGroups = findDuplicateStudentGroups(project.students);
  const duplicateStudentCount = duplicateStudentIds(project.students).size;
  return {
    canvas: {
      width: project.canvas.width,
      height: project.canvas.height,
      safeMargin: project.canvas.safeMargin,
      backgroundColor: project.canvas.backgroundColor,
    },
    map: {
      x: project.map.x,
      y: project.map.y,
      width: project.map.width,
      height: project.map.height,
      scale: project.map.scale,
      fillMode: project.map.fillMode,
      customProvinceStyles: Object.keys(project.map.provinceStyles ?? {}),
    },
    cards: {
      preset: project.cards.preset,
      grouping: project.cards.grouping,
      layoutMode: project.cards.layoutMode,
      visibleFields: [...project.cards.visibleFields],
      fontSize: project.cards.fontSize,
      gap: project.cards.gap,
      hasManualPositions: Object.keys(project.cards.positions ?? {}).length > 0,
      manualPositionCount: Object.keys(project.cards.positions ?? {}).length,
    },
    guests: {
      title: shortText(project.guests.title),
      visibility: project.guests.visibility,
      peopleCount: project.guests.people.length,
    },
    textElements: project.textElements.map((text) => ({
      id: text.id,
      role: text.role,
      content: shortText(text.content),
      x: text.x,
      y: text.y,
      fontSize: text.fontSize,
      visibility: text.visibility,
    })),
    assetElements: project.assetElements.map((asset) => ({
      id: asset.id,
      assetId: asset.assetId,
      label: shortText(asset.label),
      kind: asset.kind,
      src: assetRef(asset.id, asset.src),
      width: asset.width,
      height: asset.height,
      visibility: asset.visibility,
    })),
    students: {
      total: project.students.length,
      hidden: project.students.filter((student) => student.visibility === false).length,
      topProvinces: provinceSummary.slice(0, 10).map(({ province, count }) => ({ province, count })),
      duplicateGroups: duplicateGroups.length,
      duplicateStudentCount,
    },
  };
}

const LONG_DATA_URL_THRESHOLD = 1024;

function canonicalString(value: string): string {
  if (!value.startsWith("data:") || value.length <= LONG_DATA_URL_THRESHOLD) return JSON.stringify(value);
  return JSON.stringify(`<data-url:length=${value.length};${hash32(value).toString(16).padStart(8, "0")}>`);
}

function stableSerialize(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return canonicalString(value);
  if (typeof value === "number") {
    if (Object.is(value, -0)) return "-0";
    if (Number.isNaN(value)) return "NaN";
    if (value === Infinity) return "Infinity";
    if (value === -Infinity) return "-Infinity";
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return `${typeof value}:${String(value)}`;
}

function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function fingerprintHash(value: string): string {
  return `fnv1a32:${hash32(value).toString(16).padStart(8, "0")}`;
}

/**
 * Fingerprint every executable project field while excluding undo/redo history.
 * The canonical form makes the result independent of object insertion order.
 */
const projectFingerprintCache = new WeakMap<ProjectDocument, string>();

export function fingerprintProject(project: ProjectDocument): string {
  const cached = projectFingerprintCache.get(project);
  if (cached) return cached;
  const { history: _history, ...executableProject } = project;
  const fingerprint = fingerprintHash(stableSerialize(executableProject));
  projectFingerprintCache.set(project, fingerprint);
  return fingerprint;
}

export const buildProjectFingerprint = fingerprintProject;

export function digestByteLength(digest: ProjectDigest): number {
  return new TextEncoder().encode(JSON.stringify(digest)).byteLength;
}
