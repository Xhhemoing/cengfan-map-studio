// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { solveCardLayout, type CardLayoutBounds } from "./card-layout";
import { checkLayoutHealth } from "./layout-health";
import { assertLayoutInvariants } from "./layout-perf";
import { buildLayoutGroups } from "./layout";
import { createProjectDocument } from "./project-document";
import {
  createProjectPackage,
  parseProjectPackage,
  serializeProjectPackage,
} from "./project-package";

describe("browserless studio journey", () => {
  it("imports students, lays out clustered cards, checks health, and restores the exported package", () => {
    const sourceProject = createProjectDocument({
      students: [
        { id: "student-bj-1", name: "林舟", university: "北京大学", city: "北京市", province: "北京市", visibility: true },
        { id: "student-bj-2", name: "陈宁", university: "清华大学", city: "北京市", province: "北京市", visibility: true },
        { id: "student-zj-1", name: "苏禾", university: "浙江大学", city: "杭州市", province: "浙江省", visibility: true },
      ],
      templateId: "original",
      dataView: "university",
    });
    const imported = parseProjectPackage(serializeProjectPackage(createProjectPackage({
      project: sourceProject,
      assets: [],
      fonts: [],
      now: new Date("2026-08-24T00:00:00.000Z"),
    })));
    const groups = buildLayoutGroups(imported.project.students, imported.project.cards.grouping);
    const bounds: CardLayoutBounds = {
      width: 960,
      height: 640,
      map: { x: 280, y: 100, width: 400, height: 430 },
      margin: 24,
      gap: 12,
    };
    const cards = groups.map((group) => {
      const isBeijing = group.students[0]?.city === "北京市";
      return {
        id: group.key,
        anchorX: isBeijing ? 560 : 420,
        anchorY: isBeijing ? 190 : 410,
        width: 176,
        height: 76,
      };
    });

    const layout = solveCardLayout(cards, bounds, {
      mode: "quadrant",
      connectorStyle: "curve",
      connectorWidth: 1.5,
    });

    expect(layout.placements).toHaveLength(groups.length);
    assertLayoutInvariants(layout.placements, bounds, {
      checkOverlaps: layout.status === "solved",
      checkSameAnchorClusters: true,
    });
    const healthIssues = checkLayoutHealth({
      canvas: { width: bounds.width, height: bounds.height, safeMargin: bounds.margin },
      objects: layout.placements.map((placement) => ({
        id: placement.id,
        kind: "card" as const,
        bounds: {
          x: placement.x,
          y: placement.y,
          width: placement.width,
          height: placement.height,
        },
      })),
    });
    expect(healthIssues.filter((issue) => issue.severity === "error")).toEqual([]);

    const positions = Object.fromEntries(layout.placements.map(({ id, x, y }) => [id, { x, y }]));
    const exported = serializeProjectPackage(createProjectPackage({
      ...imported,
      project: {
        ...imported.project,
        cards: { ...imported.project.cards, positions },
      },
      now: new Date("2026-08-24T00:05:00.000Z"),
    }));
    const restored = parseProjectPackage(exported);

    expect(restored.project.students.map(({ id }) => id)).toEqual(sourceProject.students.map(({ id }) => id));
    expect(restored.project.students.map(({ name }) => name)).toEqual(["林舟", "陈宁", "苏禾"]);
    const restoredPositions = restored.project.cards.positions ?? {};
    expect(Object.keys(restoredPositions)).toEqual(expect.arrayContaining(groups.map(({ key }) => key)));
    for (const position of Object.values(restoredPositions)) {
      expect(Number.isFinite(position.x)).toBe(true);
      expect(Number.isFinite(position.y)).toBe(true);
    }
  });
});
