import { describe, expect, it } from "vitest";
import { serializePosterSvg } from "./export-poster";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function svgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NAMESPACE, tag);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  return element;
}

describe("serializePosterSvg Round 3 contracts", () => {
  it("strips editor chrome while retaining destination, display-frame, and visible guest layers", () => {
    const svg = svgElement("svg");

    const editorChrome = [
      svgElement("g", { "data-editor-grid": "true" }),
      svgElement("g", { "data-selection-overlay": "card" }),
      svgElement("g", { "data-map-selection-overlay": "map" }),
      svgElement("g", { "data-asset-selection": "asset-1" }),
    ];
    editorChrome.forEach((node, index) => {
      const label = svgElement("text");
      label.textContent = `editor-only-${index}`;
      node.append(label);
      svg.append(node);
    });

    const card = svgElement("g", { "data-destination-card": "浙江省" });
    card.append(svgElement("rect", { "data-display-frame-surface": "" }));
    const cardTitle = svgElement("text");
    cardTitle.textContent = "浙江省";
    card.append(cardTitle);
    svg.append(card);

    const guests = svgElement("g", { "data-guests-layer": "" });
    const guestName = svgElement("text");
    guestName.textContent = "特邀嘉宾";
    guests.append(guestName);
    svg.append(guests);

    const markup = serializePosterSvg(svg);

    expect(markup).not.toContain("data-editor-grid");
    expect(markup).not.toContain("data-selection-overlay");
    expect(markup).not.toContain("data-map-selection-overlay");
    expect(markup).not.toContain("data-asset-selection");
    expect(markup).not.toContain("editor-only");

    expect(markup).toContain('data-destination-card="浙江省"');
    expect(markup).toContain("data-display-frame-surface");
    expect(markup).toContain("data-guests-layer");
    expect(markup).toContain("特邀嘉宾");
  });
});
