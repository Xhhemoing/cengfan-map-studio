import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { PosterCanvas } from "./PosterCanvas";
import { applyCardTemplate } from "../../lib/card-templates";
import { cardLayoutCache } from "../../lib/card-layout-cache";
import { createProjectDocument } from "../../lib/project-document";
import type { CardPresentation } from "../../lib/scene-document";

const students = [
  { id: "beijing", name: "林舟", university: "北京大学", city: "北京市", visibility: true },
];

const presentations: CardPresentation[] = ["color-pill", "emblem-list", "city-label", "glass-stat"];

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

afterEach(() => {
  // An assertion throwing before the inline unmount would leave the root mounted for
  // the rest of the run, racing React's scheduler against jsdom teardown.
  flushSync(() => {
    for (const { root, container } of mounted.splice(0)) {
      root.unmount();
      container.remove();
    }
  });
});

/** Same glyph budget `wrapCardText` wraps against: one em per CJK glyph, less for Latin and spaces. */
function estimateTextWidth(text: string, fontSize: number): number {
  return Array.from(text).reduce((total, character) => {
    if (/\s/u.test(character)) return total + fontSize * 0.35;
    return total + ((character.codePointAt(0) ?? 0) <= 0xff ? fontSize * 0.58 : fontSize);
  }, 0);
}

function renderProject(project: ReturnType<typeof createProjectDocument>) {
  const container = document.createElement("div");
  const root = createRoot(container);
  const entry = { root, container };
  mounted.push(entry);
  flushSync(() => root.render(<PosterCanvas project={project} exportMode />));
  return {
    container,
    rerender: (next: ReturnType<typeof createProjectDocument>) => flushSync(() => root.render(<PosterCanvas project={next} exportMode />)),
    dispose: () => {
      const index = mounted.indexOf(entry);
      if (index >= 0) mounted.splice(index, 1);
      flushSync(() => root.unmount());
      container.remove();
    },
  };
}

describe("PosterCanvas reference poster styles", () => {
  afterEach(() => cardLayoutCache.clear());

  it.each(presentations)("renders %s through the real SVG canvas", (presentation) => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, presentation };
    const container = document.createElement("div");
    const root = createRoot(container);
    mounted.push({ root, container });

    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const card = container.querySelector('[data-destination-card="北京市"]');
    expect(card?.getAttribute("data-card-presentation")).toBe(presentation);
    expect(card?.querySelector(`[data-card-visual="${presentation}"]`)).not.toBeNull();
    expect(container.textContent).toContain("北京大学");
  });

  it.each(presentations)("keeps every wrapped line of %s on its own baseline inside the card width", (presentation) => {
    const project = createProjectDocument({
      students: [{
        id: "long-row",
        name: "这是一个长度明显超过卡片内容区域的同学姓名",
        university: "一所名称同样非常长并且需要自动换行展示的大学",
        city: "北京市",
        visibility: true,
      }],
      templateId: "original",
      dataView: "province",
    });
    project.cards = { ...project.cards, presentation, maxWidth: 180, horizontalPadding: 12, fontSize: 12 };
    const { container, dispose } = renderProject(project);

    const card = container.querySelector('[data-destination-card="北京市"]')!;
    const lines = Array.from(card.querySelectorAll('[data-card-row-line="long-row"]'));
    // The card height is sized from the wrapped line count, so the visual must draw them all.
    expect(lines.length).toBeGreaterThan(1);
    expect(new Set(lines.map((line) => line.getAttribute("y"))).size).toBe(lines.length);
    const contentWidth = 180 - 12 * 2;
    for (const line of lines) expect(estimateTextWidth(line.textContent ?? "", 12)).toBeLessThanOrEqual(contentWidth);
    expect(card.textContent).toContain("自动换行展示");

    dispose();
  });

  it("returns to the standard card when a standard template replaces a reference style", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, ...applyCardTemplate("color-pill", project.cards) };
    const { container, rerender, dispose } = renderProject(project);

    expect(container.querySelector('[data-destination-card="北京市"] [data-card-visual="color-pill"]')).not.toBeNull();

    const next = { ...project, cards: { ...project.cards, ...applyCardTemplate("standard", project.cards) } };
    rerender(next);

    const card = container.querySelector('[data-destination-card="北京市"]')!;
    expect(card.getAttribute("data-card-presentation")).toBe("standard");
    expect(card.querySelector("[data-card-visual]")).toBeNull();
    expect(card.querySelector("[data-display-frame-surface]")).not.toBeNull();

    dispose();
  });
});
