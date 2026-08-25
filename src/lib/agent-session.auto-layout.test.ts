import { describe, expect, it } from "vitest";
import { createProjectDocument, type ProjectDocument } from "./project-document";
import { healthInput, layoutElementAreas, runAutoLayout } from "./agent-session-layout";
import { collectElementObstacles } from "./card-layout-element-obstacles";
import { computeGuestPanelLayout } from "./guest-panel-layout";
import type { CardArea } from "./card-layout";
import type { AssetElement, CanvasText } from "./scene-document";
import type { Student } from "./project-data";

function student(id: string, province: string, city: string): Student {
  return {
    id,
    name: `学生${id}`,
    university: `${province}大学`,
    city,
    province,
    visibility: true,
  } as Student;
}

/** Enough provinces to fill both flanks of the canvas, so obstacles actually bind. */
const students: Student[] = [
  student("s1", "广东省", "广州"),
  student("s2", "江苏省", "南京"),
  student("s3", "浙江省", "杭州"),
  student("s4", "四川省", "成都"),
  student("s5", "湖北省", "武汉"),
  student("s6", "陕西省", "西安"),
  student("s7", "福建省", "福州"),
  student("s8", "山东省", "济南"),
];

function text(overrides: Partial<CanvasText> & Pick<CanvasText, "id" | "x" | "y">): CanvasText {
  return {
    role: "custom",
    content: "标题文字",
    fontSize: 48,
    color: "#1c3154",
    fontWeight: 600,
    textAlign: "left",
    maxWidth: 520,
    visibility: true,
    ...overrides,
  };
}

function decoration(overrides: Partial<AssetElement> & Pick<AssetElement, "id" | "x" | "y">): AssetElement {
  return {
    assetId: "asset-1",
    label: "装饰",
    src: "data:image/png;base64,",
    kind: "decoration",
    width: 260,
    height: 200,
    rotation: 0,
    opacity: 1,
    zIndex: 30,
    visibility: true,
    ...overrides,
  };
}

function decorated(): ProjectDocument {
  const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
  return {
    ...project,
    textElements: [
      text({ id: "t-title", x: 60, y: 140 }),
      text({ id: "t-hidden", x: 60, y: 320, visibility: false }),
      text({ id: "t-blank", x: 60, y: 420, content: "   " }),
    ],
    assetElements: [
      // Fills the west flank, the strip `proximity` would otherwise fill with cards.
      decoration({ id: "d-visible", x: 48, y: 200, width: 290, height: 560 }),
      decoration({ id: "d-hidden", x: 400, y: 520, visibility: false }),
      decoration({ id: "d-clear", x: 700, y: 520, opacity: 0 }),
      decoration({ id: "d-landmark", x: 900, y: 520, kind: "landmark" }),
    ],
  };
}

function overlaps(a: CardArea, b: CardArea): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

describe("AI auto_layout obstacles", () => {
  it("collects the same element obstacles the canvas hands the solver", () => {
    const project = decorated();
    const guests = project.guests;
    const expected = collectElementObstacles({
      texts: project.textElements,
      decorations: project.assetElements.filter((asset) => asset.kind === "decoration"),
      guests: {
        x: guests.x,
        y: guests.y,
        width: guests.width,
        height: computeGuestPanelLayout(guests, project.canvas.lineHeight ?? 1).height,
      },
    });

    expect(layoutElementAreas(project)).toEqual(expected);
  });

  it("measures the guest panel instead of assuming a 120px box", () => {
    const project = decorated();
    const measured = computeGuestPanelLayout(project.guests, project.canvas.lineHeight ?? 1).height;
    const guestArea = layoutElementAreas(project)
      .find((area) => area.x === project.guests.x && area.y === project.guests.y);

    expect(guestArea).toEqual({
      x: project.guests.x,
      y: project.guests.y,
      width: project.guests.width,
      height: measured,
    });
    // The old hard-coded height was a guess in the wrong direction, not a rounding difference.
    expect(measured).not.toBe(120);
    expect(healthInput(project).objects.find((object) => object.id === "guests")?.bounds.height).toBe(measured);
  });

  it("blocks only what actually paints: no hidden, blank, transparent or non-decoration elements", () => {
    const project = decorated();
    const guests = project.guests;

    expect(layoutElementAreas(project)).toEqual([
      { x: 60, y: 140 - 48, width: 520, height: 48 * 1.3 },
      {
        x: guests.x,
        y: guests.y,
        width: guests.width,
        height: computeGuestPanelLayout(guests, project.canvas.lineHeight ?? 1).height,
      },
      { x: 48, y: 200, width: 290, height: 560 },
    ]);
  });

  it("keeps auto-laid cards off the poster texts and decorations", () => {
    const project = decorated();
    const obstacles = layoutElementAreas(project);
    const { placements } = runAutoLayout(project, "quadrant");

    expect(placements.length).toBeGreaterThan(0);
    for (const placement of placements) {
      for (const obstacle of obstacles) {
        expect(overlaps(placement, obstacle), `${placement.id} vs ${JSON.stringify(obstacle)}`).toBe(false);
      }
    }
  });

  it("writes the solved positions back onto the shadow document", () => {
    const project = decorated();
    const { project: next, placements } = runAutoLayout(project, "columns");

    expect(Object.keys(next.cards.positions ?? {}).sort())
      .toEqual(placements.map((placement) => placement.id).sort());
    for (const placement of placements) {
      expect(next.cards.positions?.[placement.id]).toEqual({ x: placement.x, y: placement.y });
    }
    expect(project.cards.positions).not.toBe(next.cards.positions);
  });

  it("honours the two overlap switches independently, exactly as the document declares them", () => {
    const project = decorated();
    const obstacles = layoutElementAreas(project);
    const map = {
      x: project.map.x,
      y: project.map.y,
      width: project.map.width * project.map.scale,
      height: project.map.height * project.map.scale,
    };

    const strict = runAutoLayout(project, "proximity").placements;
    const relaxedElements = runAutoLayout(
      { ...project, cards: { ...project.cards, allowElementOverlap: true } },
      "proximity",
    ).placements;
    // Releasing elements must not release the map.
    for (const placement of relaxedElements) {
      expect(overlaps(placement, map), placement.id).toBe(false);
    }
    // Proving the switch reached the solver: with the elements released, proximity
    // parks at least one card somewhere the strict run refused to put it.
    expect(relaxedElements.map((placement) => [placement.x, placement.y]))
      .not.toEqual(strict.map((placement) => [placement.x, placement.y]));

    const relaxedMap = runAutoLayout(
      { ...project, cards: { ...project.cards, allowMapOverlap: true } },
      "proximity",
    ).placements;
    // ...and releasing the map must not release the elements.
    for (const placement of relaxedMap) {
      for (const obstacle of obstacles) {
        expect(overlaps(placement, obstacle), `${placement.id} vs ${JSON.stringify(obstacle)}`).toBe(false);
      }
    }
    expect(relaxedMap.some((placement) => overlaps(placement, map))).toBe(true);
  });
});
