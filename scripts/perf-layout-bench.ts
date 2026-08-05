/**
 * Micro-benchmark for the card auto-layout solver (P2-4).
 * Run with: npm run perf:layout
 */
import { solveCardLayout, type CardLayoutInput, type CardLayoutBounds } from "../src/lib/card-layout";

function makeCards(count: number, seed = 7): CardLayoutInput[] {
  const cards: CardLayoutInput[] = [];
  let state = seed;
  const rand = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
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
