/**
 * Micro-benchmark for canvas/display-frame public library operations.
 * Run with: npm run perf:canvas
 */
import { performance } from "node:perf_hooks";
import { geoMercator, geoPath } from "d3-geo";
import { createServer } from "vite";
import { solveCardLayout } from "../src/lib/card-layout";
import { wrapCardText } from "../src/lib/card-text-layout";
import {
  buildCardLayoutBenchFixture,
  buildDisplayFrameBenchFixtures,
  buildLongNameFragments,
  medianDuration,
} from "../src/lib/canvas-render-metrics";
import {
  deriveFixedDisplayFrameFromCardSettings,
  normalizeDisplayFrame,
} from "../src/lib/display-frame";
import type { MapFeature } from "../src/lib/map-data";

let benchmarkSink: unknown;

function measure(
  name: string,
  n: number,
  operation: () => unknown,
  sampleCount = 7,
): void {
  benchmarkSink = operation();
  const samples: number[] = [];
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const start = performance.now();
    benchmarkSink = operation();
    samples.push(performance.now() - start);
  }
  console.log(`name=${name} n=${n} ms=${medianDuration(samples).toFixed(3)}`);
}

for (const count of [1, 50, 200]) {
  const fixtures = buildDisplayFrameBenchFixtures(count);
  measure("normalizeDisplayFrame", count, () =>
    fixtures.frames.map((frame) => normalizeDisplayFrame(frame)));
  measure("deriveFixedDisplayFrameFromCardSettings", count, () =>
    fixtures.cards.map((cards) => deriveFixedDisplayFrameFromCardSettings(cards)));
}

for (const count of [50, 200]) {
  const fragments = buildLongNameFragments(count);
  measure("wrapCardText", count, () =>
    wrapCardText(fragments, 220, 13, { preserveFields: new Set(["name"]) }));
}

for (const [count, width, height] of [
  [24, 1500, 1000],
  [60, 2200, 1400],
] as const) {
  const fixture = buildCardLayoutBenchFixture(count, width, height);
  measure(`solveCardLayout_${width}x${height}`, count, () =>
    solveCardLayout(fixture.cards, fixture.bounds, {
      mode: "quadrant",
      autoBalance: true,
      connectorStyle: "curve",
      connectorWidth: 1.5,
    }), 5);
}

// Vite's SSR loader resolves the same `?raw` GeoJSON import used by the app.
const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});
try {
  const mapData = await vite.ssrLoadModule("/src/lib/map-data.ts") as {
    getChinaMapFeatures: () => MapFeature[];
  };
  const features = mapData.getChinaMapFeatures();
  const featureCollection = { type: "FeatureCollection", features };
  measure("geoMercatorGeoPath", features.length, () => {
    const projection = geoMercator().fitExtent(
      [[0, 0], [800, 690]],
      featureCollection as never,
    );
    const path = geoPath(projection);
    return features.map((feature) => path(feature as never));
  }, 5);
} finally {
  await vite.close();
}

void benchmarkSink;
