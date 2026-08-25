import { describe, expect, it } from "vitest";
import { flushSync } from "react-dom";
import { PosterCanvas } from "./PosterCanvas";
import { createProjectDocument } from "../../lib/project-document";
import { installPosterCanvasTestHarness, students, trackedRoot } from "./poster-canvas-test-harness";

installPosterCanvasTestHarness();

describe("PosterCanvas card content", () => {
  it("masks student names on cards with the configured name format", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, nameFormat: "{surname}xx" };
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(container.textContent).toContain("可xx");
    expect(container.textContent).not.toContain("可见");
    expect(container.textContent).not.toContain("隐xx");
  });

  it("applies the name format to the {names} placeholder of custom row expressions", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.cards = {
      ...project.cards,
      nameFormat: "{surname}*{last}",
      expressionTemplates: { title: "{group}", city: "{city}", row: "{names}｜{university}" },
    };
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(container.textContent).toContain("可*见");
    expect(container.textContent).not.toContain("可见");
    expect(container.textContent).toContain("｜北京大学");
  });

  it("renders the matching province texture inside data cards when enabled", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, showProvinceTexture: true };
    project.map = {
      ...project.map,
      provinceStyles: {
        ...project.map.provinceStyles,
        北京市: {
          fill: "#d05a45",
          appearance: {
            kind: "texture",
            assetId: "beijing-texture",
            src: "data:image/png;base64,beijing",
            fit: "contain",
          },
        },
      },
    };
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const texture = container.querySelector('[data-card-province-texture="北京市"]');
    expect(texture?.getAttribute("href")).toBe("data:image/png;base64,beijing");
  });

  it("renders every person even when a card has more than five rows", () => {
    const project = createProjectDocument({
      students: Array.from({ length: 8 }, (_, index) => ({
        id: `student-${index}`,
        name: `同学${index + 1}`,
        university: "同一院校",
        city: "北京市",
        visibility: true,
      })),
      templateId: "original",
      dataView: "university",
    });
    project.cards = { ...project.cards, grouping: "university", compactLayout: true };
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    for (let index = 1; index <= 8; index += 1) expect(container.textContent).toContain(`同学${index}`);
    expect(container.textContent).not.toContain("另有");
  });

  it("wraps overflowing card rows and grows the card to contain every line", () => {
    const project = createProjectDocument({
      students: [{
        id: "long-row",
        name: "这是一个长度明显超过卡片内容区域的同学姓名",
        university: "一所名称同样非常长并且需要自动换行展示的大学",
        city: "北京市",
        visibility: true,
      }],
      templateId: "original",
      dataView: "university",
    });
    project.cards = { ...project.cards, maxWidth: 180, horizontalPadding: 12 };
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const card = container.querySelector("[data-destination-card]")!;
    const wrappedLines = card.querySelectorAll("[data-card-row-line]");
    expect(wrappedLines.length).toBeGreaterThan(1);
    expect(Number(card.querySelector("rect")?.getAttribute("height"))).toBeGreaterThan(80);
    expect(card.textContent).toContain("自动换行展示");
  });

  it("switches cards to the selected university data expression", () => {
    const project = createProjectDocument({
      students: [
        { id: "beida", name: "林舟", university: "北京大学", city: "北京市", visibility: true },
        { id: "tsinghua", name: "陈宁", university: "清华大学", city: "北京市", visibility: true },
      ],
      templateId: "original",
      dataView: "university",
    });
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(container.querySelectorAll("[data-destination-card]")).toHaveLength(2);
    expect(container.textContent).toContain("北京大学 · 北京市");
    expect(container.textContent).toContain("清华大学 · 北京市");
  });

  it("renders city subsections inside a province card and includes them in card height", () => {
    const project = createProjectDocument({
      students: [
        { id: "hz", name: "苏禾", university: "浙江大学", city: "杭州市", province: "浙江省", visibility: true },
        { id: "nb", name: "江潮", university: "宁波大学", city: "宁波市", province: "浙江省", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const card = container.querySelector('[data-destination-card="浙江省"]')!;
    expect(card.querySelector('[data-city-section="杭州市"]')?.textContent).toContain("杭州市");
    expect(card.querySelector('[data-city-section="宁波市"]')?.textContent).toContain("宁波市");
    expect(Number(card.querySelector("rect")?.getAttribute("height"))).toBeGreaterThan(100);
  });

  it("keeps every compact city subsection together with its people", () => {
    const project = createProjectDocument({
      students: [
        { id: "hz", name: "苏禾", university: "浙江大学", city: "杭州市", province: "浙江省", visibility: true },
        { id: "nb", name: "江潮", university: "宁波大学", city: "宁波市", province: "浙江省", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });
    project.cards = { ...project.cards, preset: "compact" };
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const card = container.querySelector('[data-destination-card="浙江省"]')!;
    const cityHeadings = Array.from(card.querySelectorAll("[data-city-section]"));
    expect(cityHeadings).toHaveLength(2);
    expect(card.textContent).toContain("苏禾");
    expect(card.textContent).toContain("宁波市");
    expect(card.textContent).toContain("江潮");
    expect(card.textContent).not.toContain("另有");
  });

  it("renders custom card expressions with group, city, university, and names", () => {
    const project = createProjectDocument({
      students: [
        { id: "hz", name: "苏禾", university: "浙江大学", city: "杭州市", province: "浙江省", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });
    project.cards = {
      ...project.cards,
      expressionTemplates: {
        title: "去向：{group}",
        city: "城市 / {city}",
        row: "{names} → {university}（{city}）",
      },
    };
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const card = container.querySelector('[data-destination-card="浙江省"]')!;
    expect(card.textContent).toContain("去向：浙江省");
    expect(card.textContent).toContain("城市 / 杭州市");
    expect(card.textContent).toContain("苏禾 → 浙江大学（杭州市）");
  });

  it("renders a distinct card treatment for each configured preset", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, preset: "ticket" };
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const ticket = container.querySelector<SVGGElement>("[data-destination-card]")!;
    expect(ticket.getAttribute("data-card-preset")).toBe("ticket");
    expect(ticket.querySelector("[data-card-accent]")).not.toBeNull();

    project.cards = { ...project.cards, preset: "photo" };
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));
    const photo = container.querySelector<SVGGElement>("[data-destination-card]")!;
    expect(photo.getAttribute("data-card-preset")).toBe("photo");
    expect(photo.querySelector("[data-card-avatar]")).not.toBeNull();

    project.cards = { ...project.cards, preset: "borderless" };
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));
    const borderless = container.querySelector<SVGGElement>("[data-destination-card]")!;
    expect(borderless.getAttribute("data-card-preset")).toBe("borderless");
    const background = borderless.querySelector("rect")!;
    expect(background.getAttribute("stroke")).toBe("none");
    expect(background.getAttribute("rx")).toBe("0");
    expect(borderless.querySelector("line")).toBeNull();
  });

  it("hides the per-card person count when showCount is off", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const shown = container.querySelector("[data-destination-card]")!.textContent ?? "";
    expect(shown).toMatch(/\d+ 人/);

    project.cards = { ...project.cards, showCount: false };
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));
    const hidden = container.querySelector("[data-destination-card]")!.textContent ?? "";
    expect(hidden).not.toMatch(/\d+ 人/);
    expect(hidden).not.toContain("人");
  });

  it("respects hidden visible fields in card rows and city headings", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, visibleFields: ["name", "city"] };
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const card = container.querySelector("[data-destination-card]");
    expect(card?.textContent).toContain("可见");
    expect(card?.textContent).not.toContain("北京大学");
    expect(card?.querySelector("[data-city-section]")).not.toBeNull();

    // Hiding the city field must also hide the city heading.
    project.cards = { ...project.cards, visibleFields: ["name"] };
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));
    const hiddenCity = container.querySelector("[data-destination-card]")!;
    expect(hiddenCity.querySelector("[data-city-section]")).toBeNull();
    // Only the city heading is gone — the province name in the card title stays.
    expect(hiddenCity.textContent).toContain("可见");
  });

  it("uses the configured card background opacity and unified font size", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, opacity: 0.42, fontSize: 16 };
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(container.querySelector('[data-destination-card] rect')?.getAttribute("fill-opacity")).toBe("0.42");
    expect(container.querySelector('[data-destination-card] text')?.getAttribute("font-size")).toBe("16");
  });

  it("applies different fonts to card title and field parts", () => {
    const project = createProjectDocument({
      students: [{ id: "1", name: "林舟", university: "北京大学", city: "北京市", visibility: true }],
      templateId: "original",
      dataView: "university",
    });
    project.cards = {
      ...project.cards,
      fieldFonts: {
        title: "font-system-kaiti",
        name: "font-system-serif",
        university: "font-system-mono",
        city: "font-system-rounded",
      },
    };
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const card = container.querySelector("[data-destination-card]")!;
    const title = card.querySelector("text")!;
    expect(title.getAttribute("font-family")).toContain("KaiTi");
    const rowTspans = Array.from(card.querySelectorAll("text tspan"));
    expect(rowTspans.length).toBeGreaterThanOrEqual(2);
    expect(rowTspans.some((node) => (node.getAttribute("font-family") || "").includes("Consolas"))).toBe(true);
    expect(rowTspans.some((node) => (node.getAttribute("font-family") || "").includes("Songti SC"))).toBe(true);
  });
});
