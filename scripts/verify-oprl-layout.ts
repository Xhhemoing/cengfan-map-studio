/**
 * Validates production OPRL layout against the four hard constraints.
 * Run: npx tsx scripts/verify-oprl-layout.ts
 */
import {
  buildConnectorGeometry,
  connectorGeometriesIntersect,
  segmentIntersectsRect,
  type ConnectorStyle,
} from "../src/lib/connector-geometry";
import {
  solveDestinationCardLayout,
  type DestinationCardArea,
  type DestinationCardBounds,
  type DestinationCardInput,
  type DestinationCardPlacement,
} from "../src/lib/destination-layout";

const bounds: DestinationCardBounds = {
  width: 1500,
  height: 1000,
  map: { x: 350, y: 120, width: 800, height: 690 },
  margin: 32,
  gap: 14,
};

function overlaps(left: DestinationCardArea, right: DestinationCardArea, gap = 0) {
  return (
    left.x < right.x + right.width + gap &&
    left.x + left.width + gap > right.x &&
    left.y < right.y + right.height + gap &&
    left.y + left.height + gap > right.y
  );
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function validateHard(
  name: string,
  placements: DestinationCardPlacement[],
  layoutBounds: DestinationCardBounds,
  style: ConnectorStyle,
  clearance = 2,
) {
  const protectedZones = layoutBounds.occupiedAreas?.length
    ? layoutBounds.occupiedAreas
    : [layoutBounds.map];
  for (const card of placements) {
    assert(card.x >= layoutBounds.margin - 1e-6, `${name}: ${card.id} left overflow`);
    assert(card.y >= layoutBounds.margin - 1e-6, `${name}: ${card.id} top overflow`);
    assert(
      card.x + card.width <= layoutBounds.width - layoutBounds.margin + 1e-6,
      `${name}: ${card.id} right overflow`,
    );
    assert(
      card.y + card.height <= layoutBounds.height - layoutBounds.margin + 1e-6,
      `${name}: ${card.id} bottom overflow`,
    );
    assert(
      !protectedZones.some((area) => overlaps(card, area, layoutBounds.gap)),
      `${name}: ${card.id} hits province geometry`,
    );
  }
  for (let index = 0; index < placements.length; index += 1) {
    for (let other = index + 1; other < placements.length; other += 1) {
      const left = placements[index]!;
      const right = placements[other]!;
      assert(!overlaps(left, right, layoutBounds.gap), `${name}: overlap ${left.id}/${right.id}`);
      const sameAnchor =
        Math.abs(left.anchorX - right.anchorX) < 1e-7 &&
        Math.abs(left.anchorY - right.anchorY) < 1e-7;
      if (sameAnchor) continue;
      const leftGeometry = buildConnectorGeometry({
        card: left,
        anchor: { x: left.anchorX, y: left.anchorY },
        preferredSide: left.side,
        style,
      });
      const rightGeometry = buildConnectorGeometry({
        card: right,
        anchor: { x: right.anchorX, y: right.anchorY },
        preferredSide: right.side,
        style,
      });
      assert(
        !connectorGeometriesIntersect(leftGeometry, rightGeometry, clearance),
        `${name}: connector cross ${left.id}/${right.id}`,
      );
      assert(
        !leftGeometry.segments.some((segment) => segmentIntersectsRect(segment, right, clearance)),
        `${name}: line through card ${left.id}->${right.id}`,
      );
      assert(
        !rightGeometry.segments.some((segment) => segmentIntersectsRect(segment, left, clearance)),
        `${name}: line through card ${right.id}->${left.id}`,
      );
    }
  }
}

let passed = 0;
function caseRun(name: string, run: () => void) {
  try {
    run();
    console.log(`PASS  ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

caseRun("east-west affinity + no province hit", () => {
  const input: DestinationCardInput[] = [
    { id: "sichuan", anchorX: 560, anchorY: 540, width: 250, height: 112 },
    { id: "zhejiang", anchorX: 900, anchorY: 480, width: 250, height: 112 },
  ];
  const layoutBounds = {
    ...bounds,
    occupiedAreas: [
      { x: 520, y: 240, width: 230, height: 330 },
      { x: 780, y: 300, width: 220, height: 300 },
    ],
  };
  const result = solveDestinationCardLayout(input, layoutBounds, {
    connectorStyle: "curve",
    connectorWidth: 2,
  });
  assert(result.status === "solved", `status ${result.status}`);
  validateHard("ew", result.placements, layoutBounds, "curve");
  const west = result.placements.find((card) => card.id === "sichuan")!;
  const east = result.placements.find((card) => card.id === "zhejiang")!;
  assert(west.side === "left", `west side ${west.side}`);
  assert(east.side === "right", `east side ${east.side}`);
});

caseRun("same-city cluster stays adjacent and close", () => {
  const input: DestinationCardInput[] = [
    { id: "bj-a", anchorX: 900, anchorY: 300, width: 200, height: 96 },
    { id: "bj-b", anchorX: 902, anchorY: 302, width: 200, height: 96 },
    { id: "gd", anchorX: 860, anchorY: 720, width: 200, height: 96 },
  ];
  const layoutBounds = {
    ...bounds,
    occupiedAreas: [{ x: 500, y: 220, width: 520, height: 520 }],
  };
  const result = solveDestinationCardLayout(input, layoutBounds, {
    connectorStyle: "straight",
    connectorWidth: 2,
  });
  assert(result.status === "solved", `status ${result.status}`);
  validateHard("cluster", result.placements, layoutBounds, "straight");
  const first = result.placements.find((card) => card.id === "bj-a")!;
  const second = result.placements.find((card) => card.id === "bj-b")!;
  assert(first.side === second.side, `cluster split ${first.side}/${second.side}`);
});

caseRun("dense east redistributes without overlap/cross", () => {
  const input = Array.from({ length: 12 }, (_, index) => ({
    id: `east-${index}`,
    anchorX: 960,
    anchorY: 210 + index * 34,
    width: 210,
    height: 96,
  }));
  const layoutBounds = {
    ...bounds,
    occupiedAreas: [
      { x: 520, y: 240, width: 230, height: 330 },
      { x: 780, y: 300, width: 220, height: 300 },
    ],
  };
  // Extreme same-side density may degrade status, but boxes must stay valid.
  for (const style of ["curve", "straight"] as const) {
    const result = solveDestinationCardLayout(input, layoutBounds, {
      connectorStyle: style,
      connectorWidth: 2,
      searchBudget: 8000,
    });
    assert(
      ["solved", "crossing-fallback", "search-budget-exhausted"].includes(result.status),
      `${style} status ${result.status}`,
    );
    assert(result.placements.length === input.length, `${style}: missing placements`);
    for (const card of result.placements) {
      assert(card.x >= layoutBounds.margin - 1e-6, `${style}: ${card.id} overflow`);
      assert(card.y >= layoutBounds.margin - 1e-6, `${style}: ${card.id} overflow`);
      assert(card.x + card.width <= layoutBounds.width - layoutBounds.margin + 1e-6, `${style}: overflow`);
      assert(card.y + card.height <= layoutBounds.height - layoutBounds.margin + 1e-6, `${style}: overflow`);
      assert(
        !layoutBounds.occupiedAreas.some((area) => overlaps(card, area, layoutBounds.gap)),
        `${style}: ${card.id} hits province`,
      );
    }
    for (let index = 0; index < result.placements.length; index += 1) {
      for (let other = index + 1; other < result.placements.length; other += 1) {
        assert(
          !overlaps(result.placements[index]!, result.placements[other]!, layoutBounds.gap),
          `${style}: overlap`,
        );
      }
    }
    if (result.status === "solved") {
      validateHard(`dense-${style}`, result.placements, layoutBounds, style);
    }
  }
});

caseRun("ring 6 provinces zero-crossing curve", () => {
  const input: DestinationCardInput[] = [
    { id: "xinjiang", anchorX: 480, anchorY: 320, width: 200, height: 96 },
    { id: "heilongjiang", anchorX: 1020, anchorY: 220, width: 200, height: 96 },
    { id: "yunnan", anchorX: 560, anchorY: 700, width: 200, height: 96 },
    { id: "fujian", anchorX: 980, anchorY: 640, width: 200, height: 96 },
    { id: "neimenggu", anchorX: 760, anchorY: 280, width: 200, height: 96 },
    { id: "guangdong", anchorX: 860, anchorY: 720, width: 200, height: 96 },
  ];
  const layoutBounds = {
    ...bounds,
    occupiedAreas: [{ x: 500, y: 220, width: 520, height: 520 }],
  };
  const result = solveDestinationCardLayout(input, layoutBounds, {
    connectorStyle: "curve",
    connectorWidth: 2,
  });
  assert(result.status === "solved", `status ${result.status}`);
  validateHard("ring6", result.placements, layoutBounds, "curve");
  for (const card of result.placements) {
    const distance = Math.hypot(
      card.x + card.width / 2 - card.anchorX,
      card.y + card.height / 2 - card.anchorY,
    );
    assert(distance < 520, `${card.id} distance ${distance}`);
  }
});

caseRun("diagonal 4 styles", () => {
  const input: DestinationCardInput[] = [
    { id: "north-west", anchorX: 610, anchorY: 220, width: 210, height: 96 },
    { id: "south-east", anchorX: 930, anchorY: 650, width: 210, height: 96 },
    { id: "north-east", anchorX: 940, anchorY: 250, width: 210, height: 96 },
    { id: "south-west", anchorX: 590, anchorY: 620, width: 210, height: 96 },
  ];
  const layoutBounds = {
    ...bounds,
    occupiedAreas: [{ x: 560, y: 170, width: 430, height: 540 }],
  };
  for (const style of ["straight", "elbow", "curve"] as const) {
    const result = solveDestinationCardLayout(input, layoutBounds, {
      connectorStyle: style,
      connectorWidth: 2,
    });
    assert(result.status === "solved", `${style} status ${result.status}`);
    validateHard(`diag-${style}`, result.placements, layoutBounds, style);
  }
});

console.log(`\n${passed} cases passed`);
