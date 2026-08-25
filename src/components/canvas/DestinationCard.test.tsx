import { describe, expect, it } from "vitest";
import { centeredFrameStyle, createStyle, renderCard } from "./destination-card-test-harness";

describe("DestinationCard frame surface and fixed items", () => {
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
