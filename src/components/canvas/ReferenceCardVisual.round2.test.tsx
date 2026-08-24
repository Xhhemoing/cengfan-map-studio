import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./MapLayer", () => ({ MapLayer: () => <g data-map-layer /> }));
vi.mock("./RegionalAssetLayer", () => ({ RegionalAssetLayer: () => null }));
vi.mock("./DecorationLayer", () => ({ DecorationLayer: () => null }));
vi.mock("./TextLayer", () => ({ TextLayer: () => null }));

import { wrapCardText } from "../../lib/card-text-layout";
import { cardLayoutCache } from "../../lib/card-layout-cache";
import { createProjectDocument } from "../../lib/project-document";
import { PosterCanvas } from "./PosterCanvas";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  mounted.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  cardLayoutCache.clear();
});

describe("reference card multiline rows", () => {
  it("renders every wrapped color-pill row line as a separate SVG text node", () => {
    const university = "中国科学院大学未来技术学院";
    const names = ["欧阳星河远", "诸葛云帆长", "司马青川遥"];
    const fontSize = 13;
    const maxWidth = 120;
    const horizontalPadding = 10;
    const expectedLines = wrapCardText([
      { text: university, field: "university" as const },
      { text: " · " },
      { text: names.join("、"), field: "name" as const },
    ], maxWidth - horizontalPadding * 2, fontSize)
      .map((line) => line.map((fragment) => fragment.text).join(""));
    expect(expectedLines.length).toBeGreaterThanOrEqual(2);

    const project = createProjectDocument({
      students: names.map((name, index) => ({
        id: `long-row-${index}`,
        name,
        university,
        city: "北京市",
        province: "北京市",
        visibility: true,
      })),
      templateId: "original",
      dataView: "province",
    });
    project.cards = {
      ...project.cards,
      presentation: "color-pill",
      preset: "borderless",
      grouping: "province",
      visibleFields: ["university", "name"],
      citySubgroups: false,
      displayFrame: undefined,
      fontSize,
      maxWidth,
      horizontalPadding,
      padding: horizontalPadding,
      noWrapFields: [],
    };

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mounted.push({ root, container });
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const visual = container.querySelector('[data-card-visual="color-pill"]');
    expect(visual).not.toBeNull();
    const directTextNodes = Array.from(visual?.children ?? [])
      .filter((node): node is SVGTextElement => node.tagName.toLowerCase() === "text");
    const bodyTextNodes = directTextNodes.slice(1);

    expect(bodyTextNodes).toHaveLength(expectedLines.length);
    expect(bodyTextNodes.map((node) => node.textContent)).toEqual(expectedLines);
  });
});
