/**
 * Micro-benchmark for the card auto-layout solver (P2-4).
 * Run with: npm run perf:layout
 *
 * Two scenarios:
 *   - `plain`    : no occupied areas/polygons, so `solveCardLayout` takes the
 *                  side-packing path (the historical benchmark).
 *   - `obstacle` : province-ring polygons + protected areas, which is what
 *                  `PosterCanvas` always sends, so `solveCardLayout` takes the
 *                  `optimizedLayout` path (candidate scoring + connector geometry).
 */
import {
  solveCardLayout,
  type CardLayoutBounds,
  type CardLayoutInput,
  type CardPoint,
  type CardPolygon,
} from "../src/lib/card-layout";

function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function makeCards(count: number, seed = 7): CardLayoutInput[] {
  const cards: CardLayoutInput[] = [];
  const rand = makeRandom(seed);
  const provinceAnchors = Array.from({ length: 34 }, (_, i) => ({
    x: 400 + ((i * 137) % 700),
    y: 150 + ((i * 89) % 560),
  }));
  for (let i = 0; i < count; i += 1) {
    const anchor = provinceAnchors[i % provinceAnchors.length]!;
    cards.push({
      id: `card-${i}`,
      anchorX: anchor.x + (rand() - 0.5) * 60,
      anchorY: anchor.y + (rand() - 0.5) * 60,
      width: 170 + Math.round(rand() * 90),
      height: 70 + Math.round(rand() * 60),
    });
  }
  return cards;
}

function makeBounds(): CardLayoutBounds {
  return {
    width: 1500,
    height: 1000,
    map: { x: 350, y: 120, width: 800, height: 690 },
    margin: 32,
    gap: 14,
  };
}

// ----- Obstacle scenario (production `optimizedLayout` path) -----

const OBSTACLE_CANVAS = { width: 2400, height: 1700 };
const OBSTACLE_MAP = { x: 700, y: 300, width: 1000, height: 840 };
const OBSTACLE_POLYGON_COUNT = 30;
const OBSTACLE_RING_VERTICES = 48;

interface ObstacleScene {
  polygons: CardPolygon[];
  centers: CardPoint[];
}

/**
 * 30 jittered rings laid out over the map rect, each with ~48 vertices — the
 * same order of magnitude as the projected province geometry the canvas emits.
 * Rings carry a precomputed `bounds` because `PosterCanvas.projectedPolygon`
 * always does; a bench without it would mostly measure bound recomputation.
 */
function makeObstacleScene(seed = 20260824): ObstacleScene {
  const rand = makeRandom(seed);
  const columns = 6;
  const rows = 5;
  const cellWidth = OBSTACLE_MAP.width / columns;
  const cellHeight = OBSTACLE_MAP.height / rows;
  const polygons: CardPolygon[] = [];
  const centers: CardPoint[] = [];
  for (let index = 0; index < OBSTACLE_POLYGON_COUNT; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cx = OBSTACLE_MAP.x + (column + 0.5) * cellWidth + (rand() - 0.5) * cellWidth * 0.18;
    const cy = OBSTACLE_MAP.y + (row + 0.5) * cellHeight + (rand() - 0.5) * cellHeight * 0.18;
    const radiusX = cellWidth * 0.42;
    const radiusY = cellHeight * 0.42;
    const ring: CardPoint[] = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let step = 0; step < OBSTACLE_RING_VERTICES; step += 1) {
      const angle = (step / OBSTACLE_RING_VERTICES) * Math.PI * 2;
      const wobble = 0.78 + rand() * 0.34;
      const point = {
        x: cx + Math.cos(angle) * radiusX * wobble,
        y: cy + Math.sin(angle) * radiusY * wobble,
      };
      ring.push(point);
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    polygons.push({
      rings: [ring],
      bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    });
    centers.push({ x: cx, y: cy });
  }
  return { polygons, centers };
}

/** Title block and guest list — the protected areas the canvas adds. */
function makeObstacleAreas(): CardLayoutBounds["occupiedAreas"] {
  return [
    { x: OBSTACLE_MAP.x + 60, y: 90, width: 620, height: 120 },
    { x: OBSTACLE_CANVAS.width - 440, y: 340, width: 380, height: 640 },
  ];
}

function makeObstacleBounds(scene: ObstacleScene): CardLayoutBounds {
  return {
    width: OBSTACLE_CANVAS.width,
    height: OBSTACLE_CANVAS.height,
    map: { ...OBSTACLE_MAP },
    margin: 40,
    gap: 12,
    occupiedAreas: makeObstacleAreas(),
    occupiedPolygons: scene.polygons,
  };
}

function makeObstacleCards(count: number, scene: ObstacleScene, seed = 41): CardLayoutInput[] {
  const rand = makeRandom(seed);
  const cards: CardLayoutInput[] = [];
  for (let index = 0; index < count; index += 1) {
    const center = scene.centers[index % scene.centers.length]!;
    cards.push({
      id: `obstacle-card-${index}`,
      anchorX: center.x + (rand() - 0.5) * 40,
      anchorY: center.y + (rand() - 0.5) * 40,
      width: 150 + Math.round(rand() * 50),
      height: 60 + Math.round(rand() * 30),
    });
  }
  return cards;
}

function bench(name: string, fn: () => unknown): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

for (const count of [36, 60, 100, 200, 400]) {
  const cards = makeCards(count);
  const bounds = makeBounds();
  const time = bench(`solveCardLayout(${count})`, () => {
    solveCardLayout(cards, bounds, { mode: "quadrant", autoBalance: true, connectorStyle: "curve", connectorWidth: 1.5 });
  });
  console.log(`count=${count} time=${time.toFixed(1)}ms`);
}

const obstacleScene = makeObstacleScene();
for (const count of [36, 60, 80]) {
  const cards = makeObstacleCards(count, obstacleScene);
  const bounds = makeObstacleBounds(obstacleScene);
  let status = "";
  const time = bench(`solveCardLayout(obstacle,${count})`, () => {
    status = solveCardLayout(cards, bounds, {
      mode: "quadrant",
      autoBalance: true,
      connectorStyle: "curve",
      connectorWidth: 1.5,
    }).status;
  });
  console.log(`obstacle count=${count} time=${time.toFixed(1)}ms status=${status}`);
}
