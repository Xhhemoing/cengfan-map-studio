import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { createProjectDocument } from "../../lib/project-document";
import { cardLayoutCache } from "../../lib/card-layout-cache";
import { applyCardTemplate } from "../../lib/card-templates";
import { serializePosterSvg } from "../../lib/export-poster";
import { PosterCanvas } from "./PosterCanvas";
import type { ReferenceCardPresentation } from "./ReferenceCardVisual";

const mounted: Root[] = [];
afterEach(() => {
  flushSync(() => mounted.splice(0).forEach((root) => root.unmount()));
  cardLayoutCache.clear();
});
const presentations: ReferenceCardPresentation[] = ["color-pill", "emblem-list", "city-label", "glass-stat"];

function render(presentation: ReferenceCardPresentation, showCount: boolean) {
  const project = createProjectDocument({
    students: [{ id: "probe", name: "欧阳星河", university: "北京大学", city: "北京市", visibility: true }],
    templateId: "original", dataView: "province",
  });
  project.cards = { ...project.cards, ...applyCardTemplate(presentation, project.cards),
    maxWidth: 180, horizontalPadding: 12, fontSize: 12, showCount,
    visibleFields: ["name", "university"], citySubgroups: false,
    fieldTypography: { title: { fontSize: 30, color: "#345678" }, name: { fontSize: 26, color: "#123456" } },
    fieldFonts: { title: "font-system-serif", name: "font-system-mono" },
    expressionTemplates: { title: "毕业快乐一起奔赴新生活的{group}", city: "{city}", row: "{university} · {names}" },
  };
  const container = document.createElement("div");
  const root = createRoot(container);
  mounted.push(root);
  flushSync(() => root.render(<PosterCanvas project={project} exportMode />));
  return { container, project };
}

describe("reference style end-to-end SVG contract", () => {
  it.each(presentations)("paints %s titles, fields and measured bounds consistently in canvas and exported SVG", (presentation) => {
    const { container } = render(presentation, true);
    const card = container.querySelector("[data-destination-card]")!;
    const title = Array.from(card.querySelectorAll("[data-card-title-line]"));
    expect(title.length).toBeGreaterThan(1);
    expect(title.map((node) => node.textContent).join("")).toContain("毕业快乐一起奔赴新生活的北京市");
    expect(title.every((node) => node.getAttribute("font-size") === "30" && node.getAttribute("fill") === "#345678")).toBe(true);
    const names = Array.from(card.querySelectorAll('[data-card-field="name"]'));
    expect(names.map((node) => node.textContent).join("")).toBe("欧阳星河");
    expect(names.every((node) => node.getAttribute("font-size") === "26" && node.getAttribute("fill") === "#123456")).toBe(true);
    const surface = card.querySelector("[data-reference-card-surface]")!;
    const bottom = Number(surface.getAttribute("y")) + Number(surface.getAttribute("height"));
    const rows = Array.from(card.querySelectorAll("[data-card-row-line]"));
    expect(Math.max(...rows.map((row) => Number(row.getAttribute("y")))) + 6).toBeLessThan(bottom);
    expect(card.querySelector("[data-card-count]")?.textContent).toBe("1 人");
    const exported = serializePosterSvg(container.querySelector("svg")!);
    expect(exported).toContain('data-card-field="name"');
    expect(exported).toContain('font-size="26"');
    expect(exported).toContain('fill="#123456"');
    expect(exported).toContain('data-card-title-line');
  });

  it.each(presentations)("omits the %s count when disabled without dropping student content", (presentation) => {
    const { container } = render(presentation, false);
    const card = container.querySelector("[data-destination-card]")!;
    expect(card.querySelector("[data-card-count]")).toBeNull();
    expect(card.textContent).toContain("欧阳星河");
    expect(card.textContent).toContain("北京大学");
  });
});
