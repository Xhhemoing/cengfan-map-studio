export type RenderMode = "high" | "normal" | "low" | "fixed";

export interface RenderSettings {
  mode: RenderMode;
  fixedFps: number;
}

export const DEFAULT_RENDER_SETTINGS: RenderSettings = { mode: "normal", fixedFps: 20 };

const MODE_FPS: Record<Exclude<RenderMode, "fixed">, number> = {
  high: 30,
  normal: 20,
  low: 10,
};

export function normalizeRenderSettings(value: unknown): RenderSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_RENDER_SETTINGS };
  const record = value as Record<string, unknown>;
  if (record.mode !== "high" && record.mode !== "low" && record.mode !== "fixed" && record.mode !== "normal") {
    return { ...DEFAULT_RENDER_SETTINGS };
  }
  const mode: RenderMode = record.mode;
  const numericFps = Number(record.fixedFps);
  const fixedFps = Number.isFinite(numericFps)
    ? Math.min(30, Math.max(0.2, Math.round(numericFps * 10) / 10))
    : DEFAULT_RENDER_SETTINGS.fixedFps;
  return { mode, fixedFps };
}

export function renderIntervalMs(settings: RenderSettings): number {
  const normalized = normalizeRenderSettings(settings);
  const fps = normalized.mode === "fixed" ? normalized.fixedFps : MODE_FPS[normalized.mode];
  return Math.floor(1000 / fps);
}
