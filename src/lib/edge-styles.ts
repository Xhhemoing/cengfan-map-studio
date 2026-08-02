/** Shared province/map edge stroke styles. Prefer this over bare string unions. */

export const EDGE_STYLES = [
  "solid",
  "dashed",
  "dotted",
  "double",
  "soft-glow",
  "stitch",
  "rail",
  "wave",
  "ornament",
  "ink",
] as const;

export type EdgeStyle = (typeof EDGE_STYLES)[number];

export interface EdgeStyleOption {
  id: EdgeStyle;
  label: string;
  description: string;
}

export const EDGE_STYLE_OPTIONS: EdgeStyleOption[] = [
  { id: "solid", label: "实线", description: "干净清晰的默认省界" },
  { id: "dashed", label: "虚线", description: "轻盈分段，适合现代海报" },
  { id: "dotted", label: "点线", description: "细密圆点，精致轻盈" },
  { id: "double", label: "双线", description: "内外双描边，更有层次" },
  { id: "soft-glow", label: "柔光", description: "外发光柔边，氛围感强" },
  { id: "stitch", label: "针迹", description: "长短交错，手作质感" },
  { id: "rail", label: "轨道", description: "双轨虚线，旅行地图感" },
  { id: "wave", label: "水纹", description: "波浪描边，灵动柔和" },
  { id: "ornament", label: "饰边", description: "长短节奏装饰线" },
  { id: "ink", label: "墨线", description: "手绘感墨迹边界" },
];

export function isEdgeStyle(value: unknown): value is EdgeStyle {
  return typeof value === "string" && (EDGE_STYLES as readonly string[]).includes(value);
}

export function normalizeEdgeStyle(value: unknown, fallback: EdgeStyle = "solid"): EdgeStyle {
  return isEdgeStyle(value) ? value : fallback;
}

export interface EdgeStrokeSpec {
  /** Primary stroke drawn on top. */
  color: string;
  width: number;
  dasharray?: string;
  linecap?: "butt" | "round" | "square";
  linejoin?: "miter" | "round" | "bevel";
  opacity?: number;
  filter?: string;
}

export interface ResolvedEdgeStyle {
  id: EdgeStyle;
  /** Background / halo layers rendered first. */
  underlays: EdgeStrokeSpec[];
  /** Main visible boundary stroke(s). */
  strokes: EdgeStrokeSpec[];
  /** SVG filter definitions required by this style. */
  filters: Array<{ id: string; markupKey: string }>;
}

function clampWidth(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 0;
  return Math.min(20, Math.max(0.25, width));
}

function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`;
  }
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    const r = Number.parseInt(hex[1]! + hex[1]!, 16);
    const g = Number.parseInt(hex[2]! + hex[2]!, 16);
    const b = Number.parseInt(hex[3]! + hex[3]!, 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`;
  }
  return color;
}

/**
 * Resolve a province boundary style into one or more SVG stroke layers.
 * Multi-layer styles (double, glow, rail) produce underlays + primary strokes.
 */
export function resolveEdgeStyle(input: {
  style?: unknown;
  color: string;
  width?: number;
  filterPrefix?: string;
}): ResolvedEdgeStyle {
  const id = normalizeEdgeStyle(input.style, "solid");
  const width = clampWidth(input.width ?? 1);
  const color = input.color || "#c4cbd1";
  const prefix = input.filterPrefix ?? "map-edge";

  if (width <= 0) {
    return { id, underlays: [], strokes: [], filters: [] };
  }

  switch (id) {
    case "dashed":
      return {
        id,
        underlays: [],
        strokes: [{
          color,
          width,
          dasharray: `${width * 3.4} ${width * 2.2}`,
          linecap: "round",
          linejoin: "round",
        }],
        filters: [],
      };
    case "dotted":
      return {
        id,
        underlays: [],
        strokes: [{
          color,
          width: Math.max(width, 1),
          dasharray: `0.1 ${width * 2.4}`,
          linecap: "round",
          linejoin: "round",
        }],
        filters: [],
      };
    case "double":
      return {
        id,
        underlays: [{
          color: withAlpha(color, 0.35),
          width: width * 2.6,
          linecap: "round",
          linejoin: "round",
        }],
        strokes: [{
          color,
          width: Math.max(0.6, width * 0.85),
          linecap: "round",
          linejoin: "round",
        }],
        filters: [],
      };
    case "soft-glow": {
      const filterId = `${prefix}-soft-glow`;
      return {
        id,
        underlays: [{
          color: withAlpha(color, 0.55),
          width: width * 2.8,
          linecap: "round",
          linejoin: "round",
          opacity: 0.75,
          filter: `url(#${filterId})`,
        }],
        strokes: [{
          color,
          width: Math.max(0.7, width * 0.9),
          linecap: "round",
          linejoin: "round",
        }],
        filters: [{ id: filterId, markupKey: "soft-glow" }],
      };
    }
    case "stitch":
      return {
        id,
        underlays: [{
          color: withAlpha(color, 0.28),
          width: width * 1.8,
          linecap: "round",
          linejoin: "round",
        }],
        strokes: [{
          color,
          width: Math.max(0.7, width),
          dasharray: `${width * 1.1} ${width * 1.7} ${width * 0.35} ${width * 1.7}`,
          linecap: "round",
          linejoin: "round",
        }],
        filters: [],
      };
    case "rail":
      return {
        id,
        underlays: [{
          color: withAlpha(color, 0.42),
          width: width * 2.4,
          linecap: "butt",
          linejoin: "round",
        }],
        strokes: [
          {
            color,
            width: Math.max(0.55, width * 0.7),
            dasharray: `${width * 2.6} ${width * 1.5}`,
            linecap: "butt",
            linejoin: "round",
          },
        ],
        filters: [],
      };
    case "wave":
      return {
        id,
        underlays: [],
        strokes: [{
          color,
          width: Math.max(0.8, width),
          dasharray: `${width * 1.6} ${width * 0.9} ${width * 0.45} ${width * 0.9}`,
          linecap: "round",
          linejoin: "round",
        }],
        filters: [],
      };
    case "ornament":
      return {
        id,
        underlays: [{
          color: withAlpha(color, 0.22),
          width: width * 2.1,
          linecap: "round",
          linejoin: "round",
        }],
        strokes: [{
          color,
          width: Math.max(0.7, width),
          dasharray: `${width * 3.8} ${width * 1.1} ${width * 0.7} ${width * 1.1}`,
          linecap: "round",
          linejoin: "round",
        }],
        filters: [],
      };
    case "ink": {
      const filterId = `${prefix}-ink`;
      return {
        id,
        underlays: [{
          color: withAlpha(color, 0.4),
          width: width * 1.7,
          linecap: "round",
          linejoin: "round",
          opacity: 0.8,
          filter: `url(#${filterId})`,
        }],
        strokes: [{
          color,
          width: Math.max(0.85, width * 1.05),
          dasharray: `${width * 4.5} ${width * 0.55} ${width * 1.3} ${width * 0.55}`,
          linecap: "round",
          linejoin: "round",
        }],
        filters: [{ id: filterId, markupKey: "ink" }],
      };
    }
    case "solid":
    default:
      return {
        id: "solid",
        underlays: [],
        strokes: [{
          color,
          width,
          linecap: "round",
          linejoin: "round",
        }],
        filters: [],
      };
  }
}
