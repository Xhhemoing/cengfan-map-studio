import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

vi.mock("./MapLayer", () => ({ MapLayer: () => null }));
vi.mock("./RegionalAssetLayer", () => ({ RegionalAssetLayer: () => null }));
vi.mock("./DecorationLayer", () => ({ DecorationLayer: () => null }));
vi.mock("./TextLayer", () => ({ TextLayer: () => null }));

import { PosterCanvas } from "./PosterCanvas";
import { createProjectDocument } from "../../lib/project-document";
import { buildRenderFacts, effectiveCardPlacement } from "../../lib/render-facts";

function renderedCards(project: ReturnType<typeof createProjectDocument>) {
  const container = document.createElement("div");
  const root = createRoot(container);
  flushSync(() => root.render(<PosterCanvas project={project} exportMode />));
  const cards = Array.from(container.querySelectorAll("[data-destination-card]")).map((card) => {
    const id = card.getAttribute("data-destination-card")!;
    const rect = card.querySelector("rect")!;
    const [x, y] = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(card.getAttribute("transform") ?? "")!.slice(1).map(Number);
    const anchor = container.querySelector(`[data-destination-anchor="${id}"]`);
    return {
      id,
      x: x!,
      y: y!,
      width: Number(rect.getAttribute("width")),
      height: Number(rect.getAttribute("height")),
      anchorX: anchor ? Number(anchor.getAttribute("cx")) : null,
      anchorY: anchor ? Number(anchor.getAttribute("cy")) : null,
    };
  });
  flushSync(() => root.unmount());
  return cards;
}

describe("PosterCanvas / render-facts parity", () => {
  it("renders the same anchors, card sizes and placements the shadow agent computes", () => {
    const project = createProjectDocument({
      students: [
        { id: "s1", name: "张三", university: "北京大学", city: "北京市", visibility: true },
        { id: "s2", name: "李四", university: "清华大学", city: "北京市", visibility: true },
        { id: "s3", name: "王五", university: "复旦大学", city: "上海市", visibility: true },
        { id: "s4", name: "赵六", university: "中山大学", city: "广州市", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });
    project.map = { ...project.map, scale: 1.2, x: project.map.x - 40 };

    const facts = buildRenderFacts(project);
    const placements = new Map(facts.placements.map((placement) => [placement.id, effectiveCardPlacement(project, placement)]));
    const rendered = new Map(renderedCards(project).map((card) => [card.id, card]));

    expect(rendered.size).toBe(facts.cards.length);
    for (const fact of facts.cards) {
      const card = rendered.get(fact.group.key);
      const placement = placements.get(fact.group.key)!;
      expect(card).toBeDefined();
      expect(card!.width).toBe(fact.width);
      expect(card!.height).toBe(fact.height);
      expect(card!.anchorX).toBeCloseTo(fact.anchorX, 6);
      expect(card!.anchorY).toBeCloseTo(fact.anchorY, 6);
      expect(card!.x).toBeCloseTo(placement.x, 6);
      expect(card!.y).toBeCloseTo(placement.y, 6);
    }
  });

  it("keeps parity after a manual card position moves one card", () => {
    const base = createProjectDocument({
      students: [
        { id: "s1", name: "张三", university: "北京大学", city: "北京市", visibility: true },
        { id: "s2", name: "李四", university: "复旦大学", city: "上海市", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });
    const project = { ...base, cards: { ...base.cards, positions: { "北京市": { x: 120, y: 260 } } } };
    const facts = buildRenderFacts(project);
    const rendered = new Map(renderedCards(project).map((card) => [card.id, card]));

    expect(rendered.get("北京市")).toMatchObject({ x: 120, y: 260 });
    for (const placement of facts.placements) {
      const effective = effectiveCardPlacement(project, placement);
      expect(rendered.get(placement.id)!.x).toBeCloseTo(effective.x, 6);
      expect(rendered.get(placement.id)!.y).toBeCloseTo(effective.y, 6);
    }
  });
});
