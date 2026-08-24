import { describe, expect, it } from "vitest";
import {
  buildCardLayoutBenchFixture,
  buildDisplayFrameBenchFixtures,
  buildLongNameFragments,
  buildPosterCanvasBenchFixture,
  medianDuration,
} from "./canvas-render-metrics";

describe("canvas render benchmark metrics", () => {
  it("builds deterministic display-frame fixtures at the requested size", () => {
    const first = buildDisplayFrameBenchFixtures(3);
    const second = buildDisplayFrameBenchFixtures(3);

    expect(first).toEqual(second);
    expect(first.frames).toHaveLength(3);
    expect(first.cards).toHaveLength(3);
    expect(first.frames[0]?.fixed.items.map((item) => item.id)).toEqual([
      "title",
      "name",
      "university",
      "city",
      "caption-0",
      "divider-0",
    ]);
    expect(first.cards[1]?.visibleFields).toEqual(["city", "name"]);
  });

  it("builds long name lists without a trailing separator", () => {
    const fragments = buildLongNameFragments(12);

    expect(fragments).toHaveLength(23);
    expect(fragments[0]).toEqual({ text: "张伟", field: "name" });
    expect(fragments[1]).toEqual({ text: "、", field: "separator" });
    expect(fragments.at(-1)).toEqual({ text: "王芳12", field: "name" });
    expect(buildLongNameFragments(0)).toEqual([]);
  });

  it("builds matching student and destination-group fixtures for render probes", () => {
    const first = buildPosterCanvasBenchFixture(24);
    const second = buildPosterCanvasBenchFixture(24);

    expect(first).toEqual(second);
    expect(first.students).toHaveLength(24);
    expect(new Set(first.students.map((student) => student.province))).toHaveLength(24);
    expect(first.movedCardKey).toBe("北京市");
    expect(buildPosterCanvasBenchFixture(0).movedCardKey).toBeNull();
  });

  it("builds seeded layout inputs and scales their bounds", () => {
    const first = buildCardLayoutBenchFixture(4, 1200, 800, 42);
    const second = buildCardLayoutBenchFixture(4, 1200, 800, 42);
    const otherSeed = buildCardLayoutBenchFixture(4, 1200, 800, 43);

    expect(first).toEqual(second);
    expect(first.cards).toHaveLength(4);
    expect(first.bounds).toMatchObject({ width: 1200, height: 800, margin: 24 });
    expect(first.bounds.occupiedAreas).toHaveLength(2);
    expect(otherSeed.cards).not.toEqual(first.cards);
  });

  it("calculates odd and even medians without mutating samples", () => {
    const samples = [9, 1, 5, 3];

    expect(medianDuration(samples)).toBe(4);
    expect(medianDuration([7, 2, 4])).toBe(4);
    expect(samples).toEqual([9, 1, 5, 3]);
    expect(() => medianDuration([])).toThrow("At least one duration");
    expect(() => medianDuration([1, Number.NaN])).toThrow("finite non-negative");
  });
});
