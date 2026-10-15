import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ReferenceCardVisual, type ReferenceCardPresentation, type ReferenceCardVisualProps } from "./ReferenceCardVisual";

const presentations: ReferenceCardPresentation[] = ["color-pill", "emblem-list", "city-label", "glass-stat"];
const mounted: Root[] = [];
afterEach(() => flushSync(() => mounted.splice(0).forEach((root) => root.unmount())));

function render(presentation: ReferenceCardPresentation, overrides: Partial<ReferenceCardVisualProps> = {}) {
  const container = document.createElement("div");
  const root = createRoot(container);
  mounted.push(root);
  flushSync(() => root.render(<svg><ReferenceCardVisual
    presentation={presentation}
    group={{ key: "beijing", title: "北京市", count: 3, students: [] }}
    rows={[{ key: "row", parts: [], remainingPeople: 0, lines: [[{ text: "林舟", field: "name" }, { text: " · " }, { text: "北京大学", field: "university" }]] }]}
    width={240} height={150} accent="#e95646" background="#efb8c6" opacity={0.8}
    textColor="#1c3154" fontSize={12} edgeColor="#1c3154" {...overrides}
  /></svg>));
  return container;
}

describe("reference card style contract", () => {
  it.each(presentations)("renders %s field typography and fonts without losing semantic fragments", (presentation) => {
    const container = render(presentation, {
      fieldTypography: { name: { fontSize: 26, color: "#123456" }, university: { fontSize: 18, color: "#654321" } },
      fieldFonts: { name: "test-font" },
      userFonts: [{ id: "test-font", label: "测试字体", source: "user", family: "ProbeFont", src: "data:font/woff2;base64,AA==", format: "woff2" }],
    });
    const row = container.querySelector('[data-card-row-line="row"]')!;
    const name = Array.from(row.querySelectorAll("tspan")).find((node) => node.textContent === "林舟");
    expect(name?.getAttribute("font-size")).toBe("26");
    expect(name?.getAttribute("fill")).toBe("#123456");
    expect(name?.getAttribute("font-family")).toBe('"ProbeFont"');
    expect(row.textContent).toBe("林舟 · 北京大学");
  });

  it.each(presentations)("honors the %s count switch in both directions", (presentation) => {
    expect(render(presentation, { showCount: false }).textContent).not.toContain("3 人");
    expect(render(presentation, { showCount: true }).textContent).toContain("3 人");
  });

  it.each(presentations)("uses prepared %s title lines and explicit title typography", (presentation) => {
    const container = render(presentation, {
      titleLines: [[{ text: "自定义标题", field: "title" }], [{ text: "第二行", field: "title" }]],
      fieldTypography: { title: { fontSize: 30, color: "#123456" } },
    });
    const lines = Array.from(container.querySelectorAll("[data-card-title-line]"));
    expect(lines.map((line) => line.textContent)).toEqual(["自定义标题", "第二行"]);
    expect(lines.every((line) => line.getAttribute("font-size") === "30" && line.getAttribute("fill") === "#123456")).toBe(true);
    expect(Number(lines[1]?.getAttribute("y"))).toBeGreaterThan(Number(lines[0]?.getAttribute("y")) + 30);
    expect(Number(container.querySelector('[data-card-row-line="row"]')?.getAttribute("y"))).toBeGreaterThan(Number(lines[1]?.getAttribute("y")) + 12);
  });

  it("applies the capsule background and text colors exactly", () => {
    const container = render("color-pill", { background: "#ffffff", textColor: "#654321" });
    expect(container.querySelector('[data-card-visual="color-pill"] rect')?.getAttribute("fill")).toBe("#ffffff");
    expect(container.querySelector('[data-card-row-line="row"]')?.getAttribute("fill")).toBe("#654321");
  });
});
