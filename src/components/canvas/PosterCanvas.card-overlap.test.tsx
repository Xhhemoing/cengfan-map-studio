import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

vi.mock("./MapLayer", () => ({ MapLayer: () => null }));
vi.mock("./RegionalAssetLayer", () => ({ RegionalAssetLayer: () => null }));
vi.mock("./DecorationLayer", () => ({ DecorationLayer: () => null }));
vi.mock("./TextLayer", () => ({ TextLayer: () => null }));

import { PosterCanvas } from "./PosterCanvas";
import { estimateCardBounds } from "../../lib/card-metrics";
import { createProjectDocument } from "../../lib/project-document";
import { sampleStudents } from "../../lib/project-data";

function renderProject(project: ReturnType<typeof createProjectDocument>) {
  const container = document.createElement("div");
  const root = createRoot(container);
  flushSync(() => root.render(<PosterCanvas project={project} exportMode />));
  return { container, root };
}

interface Box { key: string; x: number; y: number; width: number; height: number }

function cardBoxes(container: HTMLElement): Box[] {
  return Array.from(container.querySelectorAll("[data-destination-card]")).map((card) => {
    const match = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(card.getAttribute("transform") ?? "");
    const rect = card.querySelector("rect");
    return {
      key: card.getAttribute("data-destination-card") ?? "?",
      x: Number(match?.[1]),
      y: Number(match?.[2]),
      width: Number(rect?.getAttribute("width")),
      height: Number(rect?.getAttribute("height")),
    };
  });
}

function overlappingPairs(boxes: Box[]): string[] {
  const pairs: string[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (ox > 0 && oy > 0) pairs.push(`${a.key}(${a.x},${a.y},${a.width}x${a.height}) ~ ${b.key}(${b.x},${b.y},${b.width}x${b.height}) overlap ${ox}x${oy}`);
    }
  }
  return pairs;
}

describe("PosterCanvas card overlap", () => {
  for (const view of ["city", "university", "province"] as const) {
    it(`${view} mode sample-12 auto layout keeps cards apart`, () => {
      const project = createProjectDocument({
        students: sampleStudents,
        templateId: "original",
        dataView: view,
      });
      const { container, root } = renderProject(project);
      const boxes = cardBoxes(container);
      expect(boxes.length).toBeGreaterThan(0);
      expect(overlappingPairs(boxes)).toEqual([]);
      flushSync(() => root.unmount());
    });
  }

  it("estimateCardBounds matches the rendered card rects (delivery check parity)", () => {
    const project = createProjectDocument({
      students: sampleStudents,
      templateId: "original",
      dataView: "province",
    });
    const { container, root } = renderProject(project);
    const bounds = estimateCardBounds({
      students: project.students,
      dataView: project.dataView,
      cards: project.cards,
      canvas: { width: project.canvas.width, safeMargin: project.canvas.safeMargin, lineHeight: project.canvas.lineHeight },
    });
    const boxes = cardBoxes(container);
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
      expect(bounds.get(box.key)).toMatchObject({ width: box.width, height: box.height });
    }
    flushSync(() => root.unmount());
  });

  it("auto-placed cards avoid manually positioned cards after a grouping switch", () => {
    // Map edits freeze every card position (keyed by the current grouping).
    // 北京市/上海市 exist as keys in both province and city grouping, so after
    // switching 省份 → 城市 those two keep the frozen spot while the rest are
    // re-solved. The solver must treat the frozen rects as obstacles.
    const project = createProjectDocument({
      students: sampleStudents,
      templateId: "original",
      dataView: "city",
    });
    // Frozen at the exact spot the solver previously assigned to 南京市.
    project.cards = { ...project.cards, positions: { 上海市: { x: 1133, y: 432 } } };
    const { container, root } = renderProject(project);
    const boxes = cardBoxes(container);
    const shanghai = boxes.find((box) => box.key === "上海市");
    expect(shanghai).toMatchObject({ x: 1133, y: 432 });
    expect(overlappingPairs(boxes)).toEqual([]);
    flushSync(() => root.unmount());
  });
});
