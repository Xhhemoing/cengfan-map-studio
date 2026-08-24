import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { PosterCanvas } from "./PosterCanvas";
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
});
