import { describe, expect, it } from "vitest";
import { serializePosterSvg } from "./export-poster";
import { installPosterStubCleanup } from "./export-poster-test-fixtures";

installPosterStubCleanup();

describe("poster export", () => {
  it("serializes svg markup for download", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 50");
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.textContent = "毕业去向";
    svg.appendChild(text);
    const markup = serializePosterSvg(svg);
    expect(markup).toContain("<svg");
    expect(markup).toContain("毕业去向");
  });

  it("omits editor selection handles while keeping visible scene content", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 1800 1200");
    svg.setAttribute("width", "1800");
    svg.setAttribute("height", "1200");
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.textContent = "模板标题";
    svg.appendChild(text);
    const visibleAsset = document.createElementNS("http://www.w3.org/2000/svg", "image");
    visibleAsset.setAttribute("data-asset-id", "asset-visible");
    svg.appendChild(visibleAsset);
    const textSelection = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    textSelection.setAttribute("data-selection-overlay", "text");
    svg.appendChild(textSelection);
    const mapSelection = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    mapSelection.setAttribute("data-map-selection-overlay", "map");
    svg.appendChild(mapSelection);
    const assetSelection = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    assetSelection.setAttribute("data-asset-selection", "asset-visible");
    svg.appendChild(assetSelection);

    const markup = serializePosterSvg(svg);

    expect(markup).toContain("模板标题");
    expect(markup).toContain("asset-visible");
    expect(markup).toContain('width="1800"');
    expect(markup).toContain('height="1200"');
    expect(markup).not.toContain("data-selection-overlay");
    expect(markup).not.toContain("data-map-selection-overlay");
    expect(markup).not.toContain("data-asset-selection");
  });

  it("omits editor grid overlays from exported svg", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const grid = document.createElementNS("http://www.w3.org/2000/svg", "g");
    grid.setAttribute("data-editor-grid", "true");
    svg.appendChild(grid);
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.textContent = "保留内容";
    svg.appendChild(text);

    const markup = serializePosterSvg(svg);
    expect(markup).toContain("保留内容");
    expect(markup).not.toContain("data-editor-grid");
  });

  it("removes only the canvas background when transparent export is enabled", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    background.setAttribute("data-canvas-background", "true");
    svg.appendChild(background);
    const content = document.createElementNS("http://www.w3.org/2000/svg", "text");
    content.textContent = "名单内容";
    svg.appendChild(content);

    const markup = serializePosterSvg(svg, { transparentBackground: true });
    expect(markup).not.toContain("data-canvas-background");
    expect(markup).toContain("名单内容");
  });

  it("makes embedded uploaded fonts blocking for PNG export", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.setAttribute("data-font-faces", "");
    style.textContent = "@font-face{font-family:ExportHand;font-display:swap;}";
    defs.appendChild(style);
    svg.appendChild(defs);

    const markup = serializePosterSvg(svg, { blockFontDisplay: true });

    expect(markup).toContain("font-display:block");
    expect(markup).not.toContain("font-display:swap");
  });
});
