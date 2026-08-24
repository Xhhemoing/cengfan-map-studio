import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { DestinationCard, type DestinationCardStyle, type PreparedCardRow } from "./DestinationCard";
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
