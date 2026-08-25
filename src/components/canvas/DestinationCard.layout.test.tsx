import { describe, expect, it } from "vitest";
import { centeredFrameStyle, createStyle, flowBlocks, renderCard } from "./destination-card-test-harness";

describe("DestinationCard flow layout and presets", () => {
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

  it("steps wrapped title lines at the document line height, not at the flow block's own", () => {
    const wrapped = [
      [{ text: "毕业去向相聚在", field: "title" as const }],
      [{ text: "北京市的同学们", field: "title" as const }],
    ];
    // `buildPreparedCardContents` charges the second line to `headerExtra` at the document
    // multiplier, so a title stepping at the block's 1.2 would leave that reserved band.
    const single = renderCard(createStyle({ frameMode: "flow", ...flowBlocks() }), { titleLines: wrapped });
    expect(Array.from(single.container.querySelectorAll("[data-card-title-line]"), (line) => line.getAttribute("y")))
      .toEqual(["28", "44"]);
    single.dispose();

    const loose = renderCard(createStyle({ frameMode: "flow", lineHeightMultiplier: 1.5, ...flowBlocks() }), {
      titleLines: wrapped,
    });
    expect(Array.from(loose.container.querySelectorAll("[data-card-title-line]"), (line) => line.getAttribute("y")))
      .toEqual(["36", "60"]);
    loose.dispose();
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

  it("rounds the ticket surface and draws its stub and punch hole", () => {
    const { container, dispose } = renderCard(createStyle({ preset: "ticket" }));

    expect(container.querySelector("[data-display-frame-surface]")?.getAttribute("rx")).toBe("12");

    const accent = container.querySelector("[data-card-accent]")!;
    expect(accent.getAttribute("width")).toBe("8");
    expect(accent.getAttribute("height")).toBe("110");
    expect(accent.getAttribute("rx")).toBe("4");

    const punch = container.querySelector("circle:not([data-card-avatar])")!;
    expect(punch.getAttribute("cx")).toBe("202");
    expect(punch.getAttribute("cy")).toBe("18");
    expect(punch.getAttribute("r")).toBe("7");

    dispose();
  });

  it("reserves header room for the photo avatar and the province thumbnail", () => {
    const photo = renderCard(createStyle({ preset: "photo" }));
    const avatar = photo.container.querySelector("[data-card-avatar]")!;
    expect(avatar.getAttribute("cx")).toBe("25");
    expect(avatar.getAttribute("cy")).toBe("21");
    expect(avatar.getAttribute("r")).toBe("13");
    // The avatar sits where the title would start, so the title clears it.
    expect(photo.container.querySelector("[data-card-title-line]")?.getAttribute("x")).toBe("44");
    // Body rows stay on the padding box: the avatar ends above them and their wrap width was
    // solved without the offset, so indenting them would overflow the right padding.
    expect(Array.from(photo.container.querySelectorAll("[data-card-row-line]")).map((row) => row.getAttribute("x")))
      .toEqual(["12", "12"]);
    photo.dispose();

    const textured = renderCard(createStyle({ preset: "photo" }), {
      provinceTexture: { kind: "texture", assetId: "asset-1", src: "data:image/png;base64,AA", fit: "contain", opacity: 0.8 },
    });
    const texture = textured.container.querySelector("[data-card-province-texture='北京市']")!;
    expect(texture.getAttribute("x")).toBe("44");
    expect(texture.getAttribute("y")).toBe("3");
    expect(texture.getAttribute("width")).toBe("30");
    expect(textured.container.querySelector("[data-card-title-line]")?.getAttribute("x")).toBe("80");
    textured.dispose();
  });

  it("pushes the divider and the body rows down by the extra title lines", () => {
    const { container, dispose } = renderCard(createStyle(), { headerExtra: 16 });

    const divider = container.querySelector("line")!;
    expect(divider.getAttribute("y1")).toBe("46");
    expect(divider.getAttribute("y2")).toBe("46");
    expect(divider.getAttribute("x1")).toBe("12");
    expect(divider.getAttribute("x2")).toBe("208");

    const rowLines = Array.from(container.querySelectorAll("[data-card-row-line]"));
    expect(rowLines.map((line) => line.getAttribute("y"))).toEqual(["58", "78"]);

    dispose();
  });
});
