import type { CardLayoutBounds, CardLayoutInput } from "./card-layout";
import { chinaProvinces } from "../data/china-locations";
import {
  createDefaultDisplayFrame,
  type DisplayFrameDefinition,
} from "./display-frame";
import type { Student } from "./project-data";
import {
  createDefaultScene,
  type CardSettings,
  type GuestPerson,
} from "./scene-document";
import type { CardTextFragment } from "./card-text-layout";

export type CanvasBenchTextField = "name" | "separator";

export interface DisplayFrameBenchFixtures {
  frames: DisplayFrameDefinition[];
  cards: CardSettings[];
}

export interface CardLayoutBenchFixture {
  cards: CardLayoutInput[];
  bounds: CardLayoutBounds;
}

export interface PosterCanvasBenchFixture {
  students: Student[];
  movedCardKey: string | null;
}

const BENCH_NAMES = [
  "张伟",
  "王芳",
  "李娜",
  "刘洋",
  "陈晨",
  "杨帆",
  "赵子涵",
  "黄思远",
  "周雨桐",
  "吴嘉豪",
] as const;

function normalizedCount(count: number): number {
  return Math.max(0, Math.floor(count));
}

/** Build varied but valid display-frame/card inputs without timing fixture setup. */
export function buildDisplayFrameBenchFixtures(count: number): DisplayFrameBenchFixtures {
  const size = normalizedCount(count);
  const baseFrame = createDefaultDisplayFrame();
  const baseCards = createDefaultScene("original").cards;
  const frames = Array.from({ length: size }, (_, index): DisplayFrameDefinition => {
    const accent = index % 2 === 0 ? "#1c3154" : "#b64d3f";
    return {
      ...baseFrame,
      mode: index % 3 === 0 ? "flow" : "fixed",
      style: {
        ...baseFrame.style,
        fontSize: 11 + (index % 6),
        color: accent,
        padding: 8 + (index % 8),
        margin: index % 5,
      },
      fieldOrder: index % 2 === 0
        ? ["title", "name", "university", "city"]
        : ["title", "city", "name", "university"],
      fixed: {
        items: [
          ...baseFrame.fixed.items.map((item, itemIndex) => ({
            ...item,
            x: item.x + (index % 7),
            y: item.y + (index % 5),
            style: {
              fontSize: 12 + (itemIndex % 3),
              color: accent,
              align: itemIndex === 0 ? "center" as const : "left" as const,
            },
          })),
          {
            id: `caption-${index}`,
            kind: "text" as const,
            content: "毕业去向",
            x: 18,
            y: 116,
            width: 160,
            height: 24,
            zIndex: 5,
            style: { fontSize: 12, color: accent },
          },
          {
            id: `divider-${index}`,
            kind: "decoration" as const,
            decoration: "line" as const,
            x: 18,
            y: 108,
            width: 180,
            height: 1,
            zIndex: 4,
            style: { strokeWidth: 1 },
          },
        ],
      },
      flow: {
        blocks: baseFrame.flow.blocks.map((block) => ({
          ...block,
          spacing: block.order === 0 ? 0 : 4 + (index % 5),
          lineHeight: 1.1 + (index % 3) * 0.1,
          style: { fontSize: 12 + (block.order % 2), color: accent },
        })),
      },
    };
  });
  const cards = Array.from({ length: size }, (_, index): CardSettings => ({
    ...baseCards,
    maxWidth: 200 + (index % 8) * 10,
    padding: 8 + (index % 6),
    gap: 6 + (index % 5),
    opacity: 0.75 + (index % 6) * 0.05,
    fontSize: 11 + (index % 6),
    visibleFields: index % 2 === 0
      ? ["name", "university", "city"]
      : ["city", "name"],
    fieldFonts: index % 3 === 0 ? { name: "bench-name-font" } : undefined,
    fieldTypography: {
      title: { fontSize: 15 + (index % 4), color: "#1c3154" },
      name: { fontSize: 12 + (index % 3), color: "#b64d3f" },
    },
  }));

  return { frames, cards };
}

/** Build a long destination-card name list with explicit separator fragments. */
export function buildLongNameFragments(count: number): CardTextFragment<CanvasBenchTextField>[] {
  const size = normalizedCount(count);
  return Array.from({ length: size }, (_, index) => {
    const baseName = BENCH_NAMES[index % BENCH_NAMES.length]!;
    const name = index < BENCH_NAMES.length ? baseName : `${baseName}${index + 1}`;
    return [
      { text: name, field: "name" as const },
      ...(index === size - 1 ? [] : [{ text: "、", field: "separator" as const }]),
    ];
  }).flat();
}

/** Build one visible student per province so student and destination-group counts match. */
export function buildPosterCanvasBenchFixture(count: number): PosterCanvasBenchFixture {
  const size = Math.min(normalizedCount(count), chinaProvinces.length);
  const students = chinaProvinces.slice(0, size).map((province, index): Student => ({
    id: `render-student-${index}`,
    name: `同学${index + 1}`,
    university: `性能测试大学${index + 1}`,
    city: province.name,
    province: province.name,
    visibility: true,
  }));
  const movedCardKey = students[0]?.province ?? null;

  return { students, movedCardKey };
}

/** Build a guest-heavy panel fixture for measuring isolated guest-layer work. */
export function buildGuestBenchFixture(count: number): GuestPerson[] {
  const size = normalizedCount(count);
  return Array.from({ length: size }, (_, index) => ({
    id: `render-guest-${index}`,
    name: `嘉宾${index + 1}`,
    title: index % 2 === 0 ? "班主任" : "特邀校友",
    note: index % 3 === 0 ? `给毕业生的寄语 ${index + 1}` : undefined,
    visibility: true,
  }));
}

/** Build deterministic card anchors and occupied areas for solver benchmarks. */
export function buildCardLayoutBenchFixture(
  count: number,
  width = 1500,
  height = 1000,
  seed = 7,
): CardLayoutBenchFixture {
  const size = normalizedCount(count);
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const map = {
    x: width * 0.23,
    y: height * 0.12,
    width: width * 0.54,
    height: height * 0.69,
  };
  const anchors = Array.from({ length: 34 }, (_, index) => ({
    x: map.x + map.width * (0.08 + ((index * 17) % 85) / 100),
    y: map.y + map.height * (0.08 + ((index * 29) % 85) / 100),
  }));
  const cards = Array.from({ length: size }, (_, index): CardLayoutInput => {
    const anchor = anchors[index % anchors.length]!;
    return {
      id: `card-${index}`,
      anchorX: anchor.x + (random() - 0.5) * width * 0.035,
      anchorY: anchor.y + (random() - 0.5) * height * 0.045,
      width: 150 + Math.round(random() * 65),
      height: 64 + Math.round(random() * 42),
    };
  });
  const bounds: CardLayoutBounds = {
    width,
    height,
    map,
    margin: Math.max(24, Math.round(width * 0.02)),
    gap: 12,
    occupiedAreas: [
      {
        x: map.x + map.width * 0.08,
        y: map.y + map.height * 0.08,
        width: map.width * 0.37,
        height: map.height * 0.72,
      },
      {
        x: map.x + map.width * 0.54,
        y: map.y + map.height * 0.2,
        width: map.width * 0.38,
        height: map.height * 0.63,
      },
    ],
  };

  return { cards, bounds };
}

/** Median is stable against one-off runtime noise while retaining milliseconds. */
export function medianDuration(durations: readonly number[]): number {
  if (durations.length === 0) throw new Error("At least one duration is required");
  if (durations.some((duration) => !Number.isFinite(duration) || duration < 0)) {
    throw new Error("Durations must be finite non-negative numbers");
  }
  const sorted = [...durations].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}
