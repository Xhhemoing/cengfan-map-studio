import { normalizeEdgeStyle, type EdgeStyle } from "./edge-styles";
import type { SceneDocument } from "./scene-document";

export type UnknownRecord = Record<string, unknown>;

export interface ProvincePosition {
  x: number;
  y: number;
}

export interface ProjectMigrationOptions {
  provincePositions?: Record<string, ProvincePosition>;
}

/** Shared input for every version adapter: raw payload, legacy `style` block and the template defaults. */
export interface MigrationContext {
  payload: UnknownRecord;
  /** Legacy compatibility block kept next to the canonical scene fields. */
  style: UnknownRecord;
  defaults: SceneDocument;
  /** Payload already stores the canonical scene document layout. */
  isV2: boolean;
  options: ProjectMigrationOptions;
}

export function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

export function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function clamp(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(maximum, Math.max(minimum, numeric)) : fallback;
}

export function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

export function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function getEdgeStyle(value: unknown): EdgeStyle {
  return normalizeEdgeStyle(value, "solid");
}

export function safePosition(value: unknown, fallback: ProvincePosition): ProvincePosition {
  const record = asRecord(value);
  return {
    x: finiteNumber(record?.x, fallback.x),
    y: finiteNumber(record?.y, fallback.y),
  };
}

export function stringFromSources(
  sources: UnknownRecord[],
  key: string,
  fallback: string,
): string {
  for (const source of sources) {
    if (typeof source[key] === "string") return source[key] as string;
  }
  return fallback;
}
