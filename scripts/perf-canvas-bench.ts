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
  buildGuestBenchFixture,
  buildLongNameFragments,
  buildPosterCanvasBenchFixture,
} from "../src/lib/canvas-render-metrics";
import {
  buildPreparedTextBatches,
  installDomGlobals,
  measure,
  printMeasurement,
  readSink,
  retain,
} from "./perf-canvas-bench-harness";
import {
  deriveFixedDisplayFrameFromCardSettings,
  normalizeDisplayFrame,
} from "../src/lib/display-frame";
import type { MapFeature } from "../src/lib/map-data";

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

  const restoreDomGlobals = installDomGlobals();
  try {
    const [{ createElement }, { flushSync }, { createRoot }] = await Promise.all([
      import("react"),
      import("react-dom"),
      import("react-dom/client"),
    ]);
    const [posterModule, projectModule] = await Promise.all([
      vite.ssrLoadModule("/src/components/canvas/PosterCanvas.tsx") as
        Promise<typeof import("../src/components/canvas/PosterCanvas")>,
      vite.ssrLoadModule("/src/lib/project-document.ts") as
        Promise<typeof import("../src/lib/project-document")>,
    ]);
    const PosterCanvas = posterModule.PosterCanvas;
    const createProjectDocument = projectModule.createProjectDocument;
    const onMoveCard = () => undefined;
    const onSelect = () => undefined;
    const renderPoster = (
      root: ReturnType<typeof createRoot>,
      renderedProject: ReturnType<typeof createProjectDocument>,
      selectedTextId: string | null = null,
      onCardPositionsResolved?: (positions: Record<string, { x: number; y: number }>) => void,
    ) => {
      flushSync(() => root.render(createElement(PosterCanvas, {
        project: renderedProject,
        selectedTextId,
        onMoveCard,
        onSelect,
        ...(onCardPositionsResolved ? { onCardPositionsResolved } : {}),
      })));
    };

    for (const count of [8, 24]) {
      const fixture = buildPosterCanvasBenchFixture(count);
      const project = createProjectDocument({
        students: fixture.students,
        templateId: "original",
        dataView: "province",
      });
      const preparedDisplayFrame = deriveFixedDisplayFrameFromCardSettings(project.cards);
      const preparedBodyItem = preparedDisplayFrame.fixed.items.find((item) => item.id === "name")
        ?? preparedDisplayFrame.fixed.items[0];
      const preparedTextBatches = buildPreparedTextBatches(project, fixture.students, preparedBodyItem?.x);
      const noWrapFields = new Set(project.cards.noWrapFields ?? []);
      measure("wrapCardTextPreparedContent", count, () =>
        preparedTextBatches.map((batch) =>
          wrapCardText(batch.fragments, batch.maxWidth, batch.fontSize, {
            preserveFields: noWrapFields,
          })));
      const movedProject = fixture.movedCardKey
        ? {
            ...project,
            cards: {
              ...project.cards,
              positions: {
                ...project.cards.positions,
                [fixture.movedCardKey]: { x: 40, y: 60 },
              },
            },
          }
        : project;
      const mountSample = (): number => {
        const container = document.createElement("div");
        document.body.append(container);
        const root = createRoot(container);
        const start = performance.now();
        renderPoster(root, project);
        const duration = performance.now() - start;
        const renderedCards = container.querySelectorAll("[data-destination-card]").length;
        flushSync(() => root.unmount());
        container.remove();
        if (renderedCards !== count) {
          throw new Error(`PosterCanvas mount rendered ${renderedCards} cards; expected ${count}`);
        }
        retain(renderedCards);
        return duration;
      };

      mountSample();
      printMeasurement(
        "posterCanvasMount",
        count,
        Array.from({ length: 3 }, mountSample),
      );

      const unchangedContainer = document.createElement("div");
      document.body.append(unchangedContainer);
      const unchangedRoot = createRoot(unchangedContainer);
      renderPoster(unchangedRoot, project);
      measure("posterCanvasUnchangedPropsRerender", count, () => {
        renderPoster(unchangedRoot, project);
      });
      if (unchangedContainer.querySelectorAll("[data-destination-card]").length !== count) {
        throw new Error("PosterCanvas unchanged-props re-render changed the destination-card count");
      }
      flushSync(() => unchangedRoot.unmount());
      unchangedContainer.remove();

      const selectionContainer = document.createElement("div");
      document.body.append(selectionContainer);
      const selectionRoot = createRoot(selectionContainer);
      renderPoster(selectionRoot, project);
      let selected = false;
      measure("posterCanvasSelectedTextRerender", count, () => {
        selected = !selected;
        renderPoster(selectionRoot, project, selected ? "text-title" : null);
      });
      if (selectionContainer.querySelectorAll("[data-destination-card]").length !== count) {
        throw new Error("PosterCanvas selection re-render changed the destination-card count");
      }
      flushSync(() => selectionRoot.unmount());
      selectionContainer.remove();

      const pannedProject = {
        ...project,
        map: {
          ...project.map,
          x: project.map.x + 16,
        },
      };
      const panContainer = document.createElement("div");
      document.body.append(panContainer);
      const panRoot = createRoot(panContainer);
      renderPoster(panRoot, project);
      let panned = false;
      measure("posterCanvasMapPanRerender", count, () => {
        panned = !panned;
        renderPoster(panRoot, panned ? pannedProject : project);
      });
      renderPoster(panRoot, pannedProject);
      const mapTransform = panContainer.querySelector("[data-map-layer]")?.getAttribute("transform");
      if (!mapTransform?.startsWith(`translate(${pannedProject.map.x} ${pannedProject.map.y})`)) {
        throw new Error("PosterCanvas map-pan re-render did not apply the expected map.x");
      }
      if (panContainer.querySelectorAll("[data-destination-card]").length !== count) {
        throw new Error("PosterCanvas map-pan re-render changed the destination-card count");
      }
      flushSync(() => panRoot.unmount());
      panContainer.remove();

      // Mirror the editor's steady state after it has persisted every automatic card
      // position before a map edit. Capture the actual solver output outside the samples
      // so this probe differs from the unfrozen pan only by the stored positions.
      let frozenPositions: Record<string, { x: number; y: number }> = {};
      const freezeContainer = document.createElement("div");
      document.body.append(freezeContainer);
      const freezeRoot = createRoot(freezeContainer);
      renderPoster(freezeRoot, project, null, (positions) => {
        frozenPositions = positions;
      });
      flushSync(() => freezeRoot.unmount());
      freezeContainer.remove();
      if (Object.keys(frozenPositions).length !== count) {
        throw new Error(
          `PosterCanvas freeze captured ${Object.keys(frozenPositions).length} positions; expected ${count}`,
        );
      }
      const frozenProject = {
        ...project,
        cards: {
          ...project.cards,
          positions: frozenPositions,
        },
      };
      const frozenPannedProject = {
        ...pannedProject,
        cards: frozenProject.cards,
      };
      const frozenPanContainer = document.createElement("div");
      document.body.append(frozenPanContainer);
      const frozenPanRoot = createRoot(frozenPanContainer);
      renderPoster(frozenPanRoot, frozenProject);
      const frozenCardTransforms = Array.from(
        frozenPanContainer.querySelectorAll("[data-destination-card]"),
        (card) => card.getAttribute("transform"),
      );
      let frozenPanned = false;
      measure("posterCanvasFrozenMapPanRerender", count, () => {
        frozenPanned = !frozenPanned;
        renderPoster(frozenPanRoot, frozenPanned ? frozenPannedProject : frozenProject);
      });
      renderPoster(frozenPanRoot, frozenPannedProject);
      const frozenMapTransform = frozenPanContainer
        .querySelector("[data-map-layer]")
        ?.getAttribute("transform");
      if (!frozenMapTransform?.startsWith(
        `translate(${frozenPannedProject.map.x} ${frozenPannedProject.map.y})`,
      )) {
        throw new Error("PosterCanvas frozen map-pan re-render did not apply the expected map.x");
      }
      const pannedFrozenCardTransforms = Array.from(
        frozenPanContainer.querySelectorAll("[data-destination-card]"),
        (card) => card.getAttribute("transform"),
      );
      if (JSON.stringify(pannedFrozenCardTransforms) !== JSON.stringify(frozenCardTransforms)) {
        throw new Error("PosterCanvas frozen map-pan re-render moved a stored card position");
      }
      flushSync(() => frozenPanRoot.unmount());
      frozenPanContainer.remove();

      const recoloredProvince = fixture.movedCardKey;
      const recolor = "#d05a45";
      if (!recoloredProvince) {
        throw new Error("PosterCanvas recolor fixture has no province");
      }
      const recoloredFeature = features.find((feature) => feature.name === recoloredProvince);
      if (!recoloredFeature) {
        throw new Error(`PosterCanvas recolor fixture cannot find ${recoloredProvince}`);
      }
      const recoloredProject = {
        ...project,
        map: {
          ...project.map,
          provinceStyles: {
            ...project.map.provinceStyles,
            [recoloredProvince]: {
              ...project.map.provinceStyles?.[recoloredProvince],
              appearance: { kind: "manual-color" as const, color: recolor },
            },
          },
        },
      };
      const recolorContainer = document.createElement("div");
      document.body.append(recolorContainer);
      const recolorRoot = createRoot(recolorContainer);
      renderPoster(recolorRoot, project);
      let recolored = false;
      measure("posterCanvasProvinceRecolorRerender", count, () => {
        recolored = !recolored;
        renderPoster(recolorRoot, recolored ? recoloredProject : project);
      });
      renderPoster(recolorRoot, recoloredProject);
      const recoloredPath = recolorContainer.querySelector(
        `[data-province-id="${recoloredFeature.id}"]`,
      );
      if (recoloredPath?.getAttribute("fill") !== recolor) {
        throw new Error("PosterCanvas province recolor re-render did not apply the expected fill");
      }
      if (recolorContainer.querySelectorAll("[data-destination-card]").length !== count) {
        throw new Error("PosterCanvas province recolor re-render changed the destination-card count");
      }
      flushSync(() => recolorRoot.unmount());
      recolorContainer.remove();

      const positionContainer = document.createElement("div");
      document.body.append(positionContainer);
      const positionRoot = createRoot(positionContainer);
      renderPoster(positionRoot, project);
      let moved = false;
      measure("posterCanvasCardPositionRerender", count, () => {
        moved = !moved;
        renderPoster(positionRoot, moved ? movedProject : project);
      });
      renderPoster(positionRoot, movedProject);
      const movedCard = fixture.movedCardKey
        ? positionContainer.querySelector(`[data-destination-card="${fixture.movedCardKey}"]`)
        : null;
      if (movedCard?.getAttribute("transform") !== "translate(40 60)") {
        throw new Error("PosterCanvas position re-render did not move the expected card");
      }
      flushSync(() => positionRoot.unmount());
      positionContainer.remove();
    }

    const guestCount = 24;
    const guestFixture = buildPosterCanvasBenchFixture(8);
    const guestBaseProject = createProjectDocument({
      students: guestFixture.students,
      templateId: "original",
      dataView: "province",
    });
    const guestPeople = buildGuestBenchFixture(guestCount);
    for (const displayMode of ["list", "cards"] as const) {
      const guestProject = {
        ...guestBaseProject,
        guests: {
          ...guestBaseProject.guests,
          width: 420,
          displayMode,
          people: guestPeople,
        },
      };
      const guestContainer = document.createElement("div");
      document.body.append(guestContainer);
      const guestRoot = createRoot(guestContainer);
      renderPoster(guestRoot, guestProject);
      let selected = false;
      const metricMode = displayMode === "list" ? "List" : "Cards";
      measure(`posterCanvasGuest${metricMode}SelectionRerender`, guestCount, () => {
        selected = !selected;
        renderPoster(guestRoot, guestProject, selected ? "text-title" : null);
      });
      const renderedGuests = guestContainer.querySelectorAll(
        displayMode === "list" ? "[data-guest-row]" : "[data-guest-card]",
      ).length;
      if (renderedGuests !== guestCount) {
        throw new Error(`PosterCanvas ${displayMode} rendered ${renderedGuests} guests; expected ${guestCount}`);
      }
      flushSync(() => guestRoot.unmount());
      guestContainer.remove();
    }
    // React can leave one scheduler callback queued after the final root unmount.
    // Keep jsdom globals alive until that callback drains; this is outside all samples.
    await new Promise<void>((resolve) => setImmediate(resolve));
  } finally {
    restoreDomGlobals();
  }
} finally {
  await vite.close();
}

void readSink();
