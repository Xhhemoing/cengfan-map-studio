import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { DestinationCard, type DestinationCardStyle, type PreparedCardRow } from "./DestinationCard";
import type { DisplayFrameFlowBlock, DisplayFrameItemStyle } from "../../lib/display-frame";
import type { LayoutGroup } from "../../lib/layout";

const group: LayoutGroup = {
  key: "北京市",
  title: "北京市",
  count: 2,
  students: [],
};

const rows: PreparedCardRow[] = [
  {
    key: "city-北京市",
    parts: [{ field: "city", value: "北京市" }],
    cityHeading: "北京市",
    city: "北京市",
    remainingPeople: 0,
    lines: [[{ text: "北京市", field: "city" }]],
  },
  {
    key: "student-1",
    parts: [{ field: "name", value: "林舟" }],
    city: "北京市",
    university: "北京大学",
    names: "林舟",
    remainingPeople: 0,
    lines: [[{ text: "林舟", field: "name" }, { text: " · " }, { text: "北京大学", field: "university" }]],
  },
];

const titleLines = [[{ text: "北京市", field: "title" as const }]];

function createStyle(overrides: Partial<DestinationCardStyle> = {}): DestinationCardStyle {
  return {
    preset: "standard",
    background: "#ffffff",
    opacity: 0.9,
    textColor: "#1c3154",
    fontSize: 12,
    showCount: true,
    horizontalPadding: 12,
    lineHeightMultiplier: 1,
    rowHeight: 20,
    edgeColor: "#1c3154",
    activeColor: "#e95646",
    frameMode: "fixed",
    frameStyle: {
      fontSize: 12,
      color: "#1c3154",
      background: "#ffffff",
      opacity: 0.9,
      padding: 12,
      margin: 0,
      align: "left",
      borderColor: "#1c3154",
      borderWidth: 1,
      borderRadius: 6,
    },
    frameBodyItem: { id: "name", kind: "field", field: "name", x: 12, y: 42, width: 196, height: 18, zIndex: 1 },
    frameTitleItem: { id: "title", kind: "field", field: "title", x: 12, y: 12, width: 180, height: 24, zIndex: 0 },
    customFrameItems: [],
    flowTitleFontSize: 12,
    flowNameFontSize: 12,
    flowContentStart: 0,
    userFonts: [],
    ...overrides,
  };
}

function centeredFrameStyle(): DestinationCardStyle["frameStyle"] {
  return {
    fontSize: 12,
    color: "#1c3154",
    background: "#ffffff",
    opacity: 0.9,
    padding: 12,
    margin: 0,
    align: "center",
    borderColor: "#1c3154",
    borderWidth: 1,
    borderRadius: 6,
  };
}

function flowBlocks(styles: Partial<Record<"title" | "name" | "city", DisplayFrameItemStyle>> = {}) {
  const block = (id: "title" | "name" | "city", order: number): DisplayFrameFlowBlock => ({
    id,
    kind: "field",
    field: id,
    order,
    spacing: order === 0 ? 0 : 6,
    lineHeight: 1.2,
    ...(styles[id] ? { style: styles[id] } : {}),
  });
  return {
    flowTitleBlock: block("title", 0),
    flowNameBlock: block("name", 1),
    flowCityBlock: block("city", 2),
  };
}

function renderCard(style: DestinationCardStyle) {
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = () => flushSync(() => root.render(
    <svg>
      <DestinationCard
        style={style}
        group={group}
        province="北京市"
        rows={rows}
        titleLines={titleLines}
        headerExtra={0}
        width={220}
        height={110}
        provinceTexture={null}
      />
    </svg>,
  ));
  render();
  return {
    container,
    render,
    dispose: () => {
      flushSync(() => root.unmount());
      container.remove();
    },
  };
}

describe("DestinationCard", () => {
  it("draws the standard frame surface, title, count and rows", () => {
    const { container, dispose } = renderCard(createStyle());

    const surface = container.querySelector("[data-display-frame-surface]")!;
    expect(surface.getAttribute("width")).toBe("220");
    expect(surface.getAttribute("height")).toBe("110");
    expect(surface.getAttribute("data-display-frame-mode")).toBe("fixed");
    expect(surface.getAttribute("stroke")).toBe("#1c3154");

    expect(container.querySelector("[data-card-title-line]")?.textContent).toBe("北京市");
    expect(container.querySelector("[data-city-section='北京市']")).not.toBeNull();

    const rowLines = Array.from(container.querySelectorAll("[data-card-row-line]"));
    expect(rowLines.map((line) => line.getAttribute("y"))).toEqual(["42", "62"]);
    expect(rowLines[1]?.textContent).toBe("林舟 · 北京大学");

    expect(container.textContent).toContain("2 人");

    dispose();
  });

  it("renders custom frame items and drops the divider for the borderless preset", () => {
    const { container, dispose } = renderCard(createStyle({
      preset: "borderless",
      customFrameItems: [
        { id: "text-1", kind: "text", content: "毕业快乐", x: 10, y: 80, width: 120, height: 20, zIndex: 5 },
        { id: "decoration-1", kind: "decoration", decoration: "line", x: 10, y: 70, width: 120, height: 1, zIndex: 4 },
      ],
    }));

    expect(container.querySelector("[data-display-frame-text='text-1']")?.textContent).toBe("毕业快乐");
    expect(container.querySelector("[data-display-frame-decoration='decoration-1']")).not.toBeNull();
    expect(container.querySelector("[data-display-frame-surface]")?.getAttribute("stroke")).toBe("none");

    dispose();
  });

  it("resolves surface paint through the display-frame layer, falling back to the card colours", () => {
    const { container, dispose } = renderCard(createStyle({
      background: "#fef7e8",
      edgeColor: "#8b5a2b",
      frameStyle: {
        fontSize: 12,
        color: "#1c3154",
        background: "",
        opacity: 0.5,
        padding: 12,
        margin: 0,
        align: "left",
      },
    }));

    const surface = container.querySelector("[data-display-frame-surface]")!;
    expect(surface.getAttribute("fill")).toBe("#fef7e8");
    expect(surface.getAttribute("fill-opacity")).toBe("0.5");
    expect(surface.getAttribute("stroke")).toBe("#8b5a2b");
    expect(surface.getAttribute("stroke-width")).toBe("1");
    expect(surface.getAttribute("rx")).toBe("6");

    dispose();
  });

  it("lets custom frame items inherit the frame alignment, font size and opacity", () => {
    const { container, dispose } = renderCard(createStyle({
      frameStyle: {
        fontSize: 14,
        color: "#334455",
        background: "#ffffff",
        opacity: 1,
        padding: 12,
        margin: 0,
        align: "center",
        borderColor: "#334455",
        borderWidth: 1,
        borderRadius: 6,
      },
      customFrameItems: [
        { id: "text-1", kind: "text", content: "毕业快乐", x: 10, y: 80, width: 100, height: 20, zIndex: 5 },
        { id: "text-2", kind: "text", content: "一路顺风", x: 10, y: 110, width: 100, height: 20, zIndex: 6, style: { align: "right", fontSize: 9, opacity: 0.4, color: "#aa0000" } },
      ],
    }));

    const inherited = container.querySelector("[data-display-frame-text='text-1']")!;
    expect(inherited.getAttribute("text-anchor")).toBe("middle");
    expect(inherited.getAttribute("x")).toBe("60");
    expect(inherited.getAttribute("font-size")).toBe("14");
    expect(inherited.getAttribute("fill")).toBe("#334455");
    expect(inherited.getAttribute("y")).toBe("94");

    const overridden = container.querySelector("[data-display-frame-text='text-2']")!;
    expect(overridden.getAttribute("text-anchor")).toBe("end");
    expect(overridden.getAttribute("x")).toBe("110");
    expect(overridden.getAttribute("opacity")).toBe("0.4");
    expect(overridden.getAttribute("fill")).toBe("#aa0000");

    dispose();
  });

  it("anchors the title and body rows on the frame alignment in fixed mode", () => {
    const { container, dispose } = renderCard(createStyle({
      frameStyle: centeredFrameStyle(),
    }));

    // Alignment anchors inside each item box and never moves it: the title item spans
    // x 12..192 and the body item x 12..208, so their centers are 102 and 110.
    const title = container.querySelector("[data-card-title-line]")!;
    expect(title.getAttribute("text-anchor")).toBe("middle");
    expect(title.getAttribute("x")).toBe("102");

    const rows = Array.from(container.querySelectorAll("[data-card-row-line]"));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.getAttribute("text-anchor")).toBe("middle");
      expect(row.getAttribute("x")).toBe("110");
    }

    dispose();
  });

  it("lets a fixed item override the centered frame alignment", () => {
    const { container, dispose } = renderCard(createStyle({
      frameStyle: centeredFrameStyle(),
      frameTitleItem: { id: "title", kind: "field", field: "title", x: 12, y: 12, width: 180, height: 24, zIndex: 0, style: { align: "right" } },
      frameBodyItem: { id: "name", kind: "field", field: "name", x: 12, y: 42, width: 196, height: 18, zIndex: 1, style: { align: "left", opacity: 0.6 } },
    }));

    const title = container.querySelector("[data-card-title-line]")!;
    expect(title.getAttribute("text-anchor")).toBe("end");
    expect(title.getAttribute("x")).toBe("192");

    const row = container.querySelector("[data-card-row-line]")!;
    expect(row.getAttribute("text-anchor")).toBe("start");
    expect(row.getAttribute("x")).toBe("12");
    expect(row.getAttribute("opacity")).toBe("0.6");

    dispose();
  });

  it("keeps per-field typography on rows while the frame owns their alignment", () => {
    const { container, dispose } = renderCard(createStyle({
      frameStyle: centeredFrameStyle(),
      fieldTypography: { city: { fontSize: 13, color: "#778899" }, name: { fontSize: 15, color: "#445566" } },
    }));

    const [cityRow, nameRow] = Array.from(container.querySelectorAll("[data-card-row-line]"));
    expect(cityRow?.getAttribute("fill")).toBe("#778899");
    expect(cityRow?.getAttribute("font-size")).toBe("13");
    expect(cityRow?.getAttribute("font-weight")).toBe("700");
    expect(nameRow?.getAttribute("fill")).toBe("#445566");
    expect(nameRow?.getAttribute("font-size")).toBe("15");
    expect(nameRow?.getAttribute("font-weight")).toBe("400");
    expect(cityRow?.getAttribute("text-anchor")).toBe("middle");

    dispose();
  });

  it("stacks flow rows at the padding until the frame or a block aligns them", () => {
    const left = renderCard(createStyle({ frameMode: "flow", ...flowBlocks() }));
    const leftTitle = left.container.querySelector("[data-card-title-line]")!;
    expect(leftTitle.getAttribute("text-anchor")).toBe("start");
    expect(leftTitle.getAttribute("x")).toBe("12");
    expect(left.container.querySelector("[data-card-row-line]")?.getAttribute("x")).toBe("12");
    left.dispose();

    const { container, dispose } = renderCard(createStyle({
      frameMode: "flow",
      frameStyle: centeredFrameStyle(),
      ...flowBlocks({ name: { opacity: 0.5 }, city: { align: "right" } }),
    }));

    // Flow blocks have no item box, so they anchor inside the card's padding box.
    const title = container.querySelector("[data-card-title-line]")!;
    expect(title.getAttribute("text-anchor")).toBe("middle");
    expect(title.getAttribute("x")).toBe("110");

    const [cityRow, nameRow] = Array.from(container.querySelectorAll("[data-card-row-line]"));
    expect(cityRow?.getAttribute("text-anchor")).toBe("end");
    expect(cityRow?.getAttribute("x")).toBe("208");
    expect(nameRow?.getAttribute("text-anchor")).toBe("middle");
    expect(nameRow?.getAttribute("x")).toBe("110");
    expect(nameRow?.getAttribute("opacity")).toBe("0.5");

    dispose();
  });

  it("keeps bold titles by default but honours an explicit normal weight", () => {
    const bold = renderCard(createStyle());
    expect(bold.container.querySelector("[data-card-title-line]")?.getAttribute("font-weight")).toBe("700");
    bold.dispose();

    const normal = renderCard(createStyle({
      frameTitleItem: { id: "title", kind: "field", field: "title", x: 12, y: 12, width: 180, height: 24, zIndex: 0, style: { fontWeight: "normal" } },
    }));
    expect(normal.container.querySelector("[data-card-title-line]")?.getAttribute("font-weight")).toBe("400");
    normal.dispose();

    const flowNormal = renderCard(createStyle({
      frameMode: "flow",
      flowTitleBlock: { id: "title", kind: "field", field: "title", order: 0, spacing: 0, lineHeight: 1.2, style: { fontWeight: "normal" } },
    }));
    expect(flowNormal.container.querySelector("[data-card-title-line]")?.getAttribute("font-weight")).toBe("400");
    flowNormal.dispose();

    const flowMedium = renderCard(createStyle({
      frameMode: "flow",
      flowTitleBlock: { id: "title", kind: "field", field: "title", order: 0, spacing: 0, lineHeight: 1.2, style: { fontWeight: "medium" } },
    }));
    expect(flowMedium.container.querySelector("[data-card-title-line]")?.getAttribute("font-weight")).toBe("500");
    flowMedium.dispose();
  });

  it("shrinks the city heading one step and never below the display-frame minimum", () => {
    const { container, dispose } = renderCard(createStyle());
    const cityHeading = container.querySelector("[data-city-section='北京市']")!;
    expect(cityHeading.getAttribute("font-size")).toBe("11");
    expect(cityHeading.getAttribute("font-weight")).toBe("700");
    dispose();

    const tiny = renderCard(createStyle({ fontSize: 8 }));
    expect(tiny.container.querySelector("[data-city-section='北京市']")?.getAttribute("font-size")).toBe("9");
    tiny.dispose();
  });

  it("skips re-rendering while its props keep the same identity", () => {
    const style = createStyle();
    const { container, render, dispose } = renderCard(style);
    expect(container.querySelector("[data-card-title-line]")?.getAttribute("fill")).toBe("#1c3154");

    style.textColor = "#ff0000";
    render();

    expect(container.querySelector("[data-card-title-line]")?.getAttribute("fill")).toBe("#1c3154");

    dispose();
  });
});
