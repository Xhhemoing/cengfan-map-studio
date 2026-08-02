export interface HeatScale {
  minDepth: number;
  maxDepth: number;
  lowColor: string;
  highColor: string;
}

export const DEFAULT_HEAT_SCALE: HeatScale = {
  minDepth: 1,
  maxDepth: 12,
  lowColor: "#d9f0e5",
  highColor: "#17675e",
};

const HEX_COLOR = /^#[\da-f]{6}$/iu;

function clampDepth(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(999, Math.max(0, Math.round(numeric)));
}

function normalizeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOR.test(value) ? value.toLowerCase() : fallback;
}

export function normalizeHeatScale(value: Partial<HeatScale> | undefined | null): HeatScale {
  const first = clampDepth(value?.minDepth, DEFAULT_HEAT_SCALE.minDepth);
  const second = clampDepth(value?.maxDepth, DEFAULT_HEAT_SCALE.maxDepth);
  return {
    minDepth: Math.min(first, second),
    maxDepth: Math.max(first, second),
    lowColor: normalizeColor(value?.lowColor, DEFAULT_HEAT_SCALE.lowColor),
    highColor: normalizeColor(value?.highColor, DEFAULT_HEAT_SCALE.highColor),
  };
}

function colorChannels(color: string): [number, number, number] {
  const normalized = normalizeColor(color, "#000000");
  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16),
  ];
}

function asHexChannel(value: number): string {
  return Math.min(255, Math.max(0, Math.round(value))).toString(16).padStart(2, "0");
}

export function interpolateHeatColor(lowColor: string, highColor: string, progress: number): string {
  const low = colorChannels(lowColor);
  const high = colorChannels(highColor);
  const ratio = Math.min(1, Math.max(0, progress));
  return `#${low.map((channel, index) => asHexChannel(channel + (high[index]! - channel) * ratio)).join("")}`;
}

export function heatColorForCount(count: number, value?: Partial<HeatScale> | null): string {
  const scale = normalizeHeatScale(value);
  if (count <= scale.minDepth || scale.minDepth === scale.maxDepth) return scale.lowColor;
  if (count >= scale.maxDepth) return scale.highColor;
  return interpolateHeatColor(
    scale.lowColor,
    scale.highColor,
    (count - scale.minDepth) / (scale.maxDepth - scale.minDepth),
  );
}

export function heatPreviewSteps(value?: Partial<HeatScale> | null, stepCount = 5): Array<{ depth: number; color: string }> {
  const scale = normalizeHeatScale(value);
  const count = Math.max(2, Math.round(stepCount));
  return Array.from({ length: count }, (_, index) => {
    const progress = index / (count - 1);
    const depth = Math.round(scale.minDepth + (scale.maxDepth - scale.minDepth) * progress);
    return { depth, color: interpolateHeatColor(scale.lowColor, scale.highColor, progress) };
  });
}
