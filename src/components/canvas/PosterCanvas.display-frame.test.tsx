import { describe, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { PosterCanvas } from "./PosterCanvas";
import { createProjectDocument } from "../../lib/project-document";
import { createDefaultDisplayFrame } from "../../lib/display-frame";
import { installPosterCanvasTestHarness, students, trackedRoot } from "./poster-canvas-test-harness";

installPosterCanvasTestHarness();

describe("PosterCanvas display frame", () => {
  it("keeps a saved display-frame position fixed when the map geometry changes", () => {
    const base = createProjectDocument({ students, templateId: "original", dataView: "province" });
    base.cards = { ...base.cards, positions: { 北京市: { x: 1110, y: 700 } } };
    const movedMap = {
      ...base,
      map: { ...base.map, x: 920, y: 520, scale: 1.35 },
    };
    const { container, root } = trackedRoot();

    flushSync(() => root.render(<PosterCanvas project={base} exportMode />));
    const before = container.querySelector('[data-destination-card="北京市"]')?.getAttribute("transform");
    flushSync(() => root.render(<PosterCanvas project={movedMap} exportMode />));

    expect(before).toBe("translate(1110 700)");
    expect(container.querySelector('[data-destination-card="北京市"]')?.getAttribute("transform")).toBe(before);
  });

  it("reports the current automatic display-frame positions for an explicit refresh", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const onCardPositionsResolved = vi.fn();
    const { root } = trackedRoot();

    flushSync(() => root.render(<PosterCanvas project={project} exportMode onCardPositionsResolved={onCardPositionsResolved} />));

    expect(onCardPositionsResolved).toHaveBeenCalledWith(expect.objectContaining({
      北京市: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    }));
  });

  it("uses display-frame local coordinates without changing final card placement", () => {
    const base = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const frame = createDefaultDisplayFrame();
    frame.fixed.items = frame.fixed.items.map((item) => item.id === "name" ? { ...item, x: 88, y: 74 } : item);
    base.cards = { ...base.cards, positions: { 北京市: { x: 700, y: 260 } }, displayFrame: frame };
    const moved = { ...base, cards: { ...base.cards, displayFrame: { ...frame, fixed: { items: frame.fixed.items.map((item) => item.id === "name" ? { ...item, x: 132, y: 92 } : item) } } } };
    const { container, root } = trackedRoot();

    flushSync(() => root.render(<PosterCanvas project={base} exportMode />));
    const firstCard = container.querySelector('[data-destination-card="北京市"]')!;
    const firstTransform = firstCard.getAttribute("transform");
    const firstNameY = firstCard.querySelector('[data-card-row-line]')?.getAttribute("y");

    flushSync(() => root.render(<PosterCanvas project={moved} exportMode />));
    const secondCard = container.querySelector('[data-destination-card="北京市"]')!;
    expect(secondCard.getAttribute("transform")).toBe(firstTransform);
    expect(secondCard.querySelector('[data-card-row-line]')?.getAttribute("y")).not.toBe(firstNameY);
    expect(secondCard.querySelector("rect")?.getAttribute("data-display-frame-mode")).toBe("fixed");
  });

  it("uses flow block order, spacing, and line height in destination-card text layout", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const frame = createDefaultDisplayFrame();
    frame.mode = "flow";
    frame.flow.blocks = frame.flow.blocks.map((block) => block.id === "title"
      ? { ...block, order: 2, spacing: 36, lineHeight: 1.5, style: { color: "#123456", fontSize: 18 } }
      : block.id === "name"
        ? { ...block, order: 0, spacing: 4, lineHeight: 2, style: { color: "#456789", fontSize: 15 } }
        : block);
    project.cards = { ...project.cards, displayFrame: frame };
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const card = container.querySelector('[data-destination-card="北京市"]')!;
    expect(card.querySelector("[data-card-title-line]")?.getAttribute("fill")).toBe("#123456");
    expect(card.querySelector("[data-card-title-line]")?.getAttribute("font-size")).toBe("18");
    const rowLines = Array.from(card.querySelectorAll("[data-card-row-line]"));
    expect(rowLines.some((line) => line.getAttribute("fill") === "#456789")).toBe(true);
    expect(rowLines.some((line) => line.getAttribute("font-size") === "15")).toBe(true);
    expect(Math.max(...rowLines.map((line) => Number(line.getAttribute("y"))))).toBeGreaterThan(60);
  });

  it("renders display frame surface and custom local layers without moving the destination card", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const frame = createDefaultDisplayFrame();
    frame.style = { ...frame.style, borderColor: "#123456", borderWidth: 3, borderRadius: 18 };
    frame.fixed.items = [
      ...frame.fixed.items,
      { id: "text-1", kind: "text", content: "毕业快乐", x: 28, y: 96, width: 120, height: 22, zIndex: 20, style: { color: "#123456", fontSize: 14, fontWeight: "bold" } },
      { id: "decoration-1", kind: "decoration", decoration: "line", x: 24, y: 86, width: 120, height: 1, zIndex: 19, style: { color: "#123456", strokeWidth: 2 } },
    ];
    project.cards = { ...project.cards, positions: { 北京市: { x: 700, y: 260 } }, displayFrame: frame };
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const card = container.querySelector('[data-destination-card="北京市"]')!;
    const transform = card.getAttribute("transform");
    expect(transform).toContain("260");
    expect(card.querySelector('[data-display-frame-surface]')?.getAttribute("stroke")).toBe("#123456");
    expect(card.querySelector('[data-display-frame-surface]')?.getAttribute("stroke-width")).toBe("3");
    expect(card.querySelector('[data-display-frame-text="text-1"]')?.textContent).toBe("毕业快乐");
    expect(card.querySelector('[data-display-frame-decoration="decoration-1"]')).not.toBeNull();
  });
});
