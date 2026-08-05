import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { PosterCanvas } from "./PosterCanvas";
import { createProjectDocument } from "../../lib/project-document";
import { sampleStudents, type Student } from "../../lib/project-data";
import { cardLayoutCache } from "../../lib/card-layout-cache";
import { createDefaultDisplayFrame } from "../../lib/display-frame";

const students: Student[] = [
  { id: "visible", name: "可见", university: "北京大学", city: "北京市", visibility: true },
  { id: "hidden", name: "隐藏", university: "清华大学", city: "北京市", visibility: false },
];

class CanvasFakeWorker {
  static instances: CanvasFakeWorker[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;

  onerror: ((event: ErrorEvent) => void) | null = null;

  constructor() {
    CanvasFakeWorker.instances.push(this);
  }

  postMessage(): void {}

  terminate(): void {}
}

const globalWithWorker = globalThis as unknown as { Worker?: unknown };
const originalWorker = globalWithWorker.Worker;

describe("PosterCanvas", () => {
  afterEach(() => {
    globalWithWorker.Worker = originalWorker;
    cardLayoutCache.clear();
  });

  it("keeps cards present in the initial browser-worker export state", () => {
    globalWithWorker.Worker = CanvasFakeWorker;
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const container = document.createElement("div");
    const root = createRoot(container);

    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(container.querySelectorAll("[data-destination-card]")).toHaveLength(1);
    expect(container.textContent).toContain("可见");

    flushSync(() => root.unmount());
    container.remove();
  });

  it("renders the project canvas dimensions and visible student data", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 1500 1000");
    expect(container.textContent).toContain("可见");
    expect(container.textContent).not.toContain("隐藏");

    flushSync(() => root.unmount());
    container.remove();
  });

  it("orders the map and cards layers by zIndex (default: map below cards)", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const order = () => Array.from(
      container.querySelectorAll("svg > [data-map-layer], svg > [data-cards-layer]"),
    ).map((node) => (node.hasAttribute("data-map-layer") ? "map" : "cards"));

    // 默认层级：地图 0 < 数据框 10，先画地图。
    expect(order()).toEqual(["map", "cards"]);

    // 地图置顶（超过文本锚点 40）：地图后画，覆盖数据框。
    project.map = { ...project.map, zIndex: 50 };
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));
    expect(order()).toEqual(["cards", "map"]);

    // 数据框置底（低于地图锚点 0）：数据框先画。
    project.map = { ...project.map, zIndex: 10 };
    project.cards = { ...project.cards, zIndex: -50 };
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));
    expect(order()).toEqual(["cards", "map"]);

    flushSync(() => root.unmount());
    container.remove();
  });

  it("masks student names on cards with the configured name format", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, nameFormat: "{surname}xx" };
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(container.textContent).toContain("可xx");
    expect(container.textContent).not.toContain("可见");
    expect(container.textContent).not.toContain("隐xx");

    flushSync(() => root.unmount());
    container.remove();
  });

  it("applies the name format to the {names} placeholder of custom row expressions", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.cards = {
      ...project.cards,
      nameFormat: "{surname}*{last}",
      expressionTemplates: { title: "{group}", city: "{city}", row: "{names}｜{university}" },
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(container.textContent).toContain("可*见");
    expect(container.textContent).not.toContain("可见");
    expect(container.textContent).toContain("｜北京大学");

    flushSync(() => root.unmount());
    container.remove();
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
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const texture = container.querySelector('[data-card-province-texture="北京市"]');
    expect(texture?.getAttribute("href")).toBe("data:image/png;base64,beijing");

    flushSync(() => root.unmount());
    container.remove();
  });

  it("anchors destination cards to matching provinces without card collisions", () => {
    const project = createProjectDocument({
      students: [
        { id: "sichuan", name: "程川", university: "四川大学", city: "成都市", visibility: true },
        { id: "chongqing", name: "林深", university: "重庆大学", city: "重庆市", visibility: true },
        { id: "zhejiang", name: "苏禾", university: "浙江大学", city: "杭州市", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const cards = Array.from(container.querySelectorAll<SVGGElement>("[data-destination-card]"));
    expect(cards).toHaveLength(3);
    expect(container.querySelectorAll("[data-destination-connector]")).toHaveLength(3);
    const bounds = cards.map((card) => {
      const [, x, y] = card.getAttribute("transform")!.match(/translate\(([^ ]+) ([^)]+)\)/)!;
      const rect = card.querySelector("rect")!;
      return { x: Number(x), y: Number(y), width: Number(rect.getAttribute("width")), height: Number(rect.getAttribute("height")) };
    });
    for (let index = 0; index < bounds.length; index += 1) {
      for (let other = index + 1; other < bounds.length; other += 1) {
        const left = bounds[index]!;
        const right = bounds[other]!;
        expect(left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y).toBe(false);
      }
    }

    flushSync(() => root.unmount());
    container.remove();
  });

  it("renders international students in a destination card without a China map anchor or connector", () => {
    const project = createProjectDocument({
      students: [{
        id: "international",
        name: "周晴",
        university: "哈佛大学",
        city: "美国·波士顿",
        locationScope: "international",
        visibility: true,
      }],
      templateId: "original",
      dataView: "province",
    });
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(container.querySelector('[data-destination-card="海外"]')).not.toBeNull();
    expect(container.textContent).toContain("周晴");
    expect(container.querySelector('[data-destination-anchor="海外"]')).toBeNull();
    expect(container.querySelector('[data-destination-connector="海外"]')).toBeNull();
    expect(container.querySelectorAll("[data-map-province-active]")).toHaveLength(0);

    flushSync(() => root.unmount());
    container.remove();
  });

  it("keeps automatic cards clear of visible text and the guest panel", () => {
    const project = createProjectDocument({
      students: sampleStudents,
      templateId: "original",
      dataView: "province",
    });
    project.map = {
      ...project.map,
      x: 270,
      y: 150,
      scale: 1.12,
      collapseSouthChinaSea: true,
      renderSource: {
        kind: "image",
        assetId: "map-image-test",
        src: "data:image/png;base64,test",
        fit: "contain",
        opacity: 1,
        composition: "overlay",
        alignment: {
          sourceWidth: 640,
          sourceHeight: 360,
          sourceBounds: { x: 0, y: 0, width: 1, height: 1 },
          x: 210,
          y: 160,
          width: 390,
          height: 270,
          rotation: 27,
        },
      },
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const overlaps = (
      left: { x: number; y: number; width: number; height: number },
      right: { x: number; y: number; width: number; height: number },
    ) => left.x < right.x + right.width
      && left.x + left.width > right.x
      && left.y < right.y + right.height
      && left.y + left.height > right.y;
    const cards = Array.from(container.querySelectorAll<SVGGElement>("[data-destination-card]")).map((card) => {
      const [, x, y] = card.getAttribute("transform")!.match(/translate\(([^ ]+) ([^)]+)\)/)!;
      const rect = card.querySelector("rect")!;
      return {
        x: Number(x),
        y: Number(y),
        width: Number(rect.getAttribute("width")),
        height: Number(rect.getAttribute("height")),
      };
    });
    const textObstacles = project.textElements
      .filter((text) => text.visibility && text.content.trim())
      .map((text) => ({
        x: text.textAlign === "right" ? text.x - text.maxWidth : text.textAlign === "center" ? text.x - text.maxWidth / 2 : text.x,
        y: text.y - text.fontSize,
        width: text.maxWidth,
        height: text.fontSize * 1.3,
      }));
    const guestObstacle = {
      x: project.guests.x,
      y: project.guests.y,
      width: project.guests.width,
      height: project.guests.padding * 2 + 28 + Math.max(1, project.guests.people.length) * Math.max(16, project.guests.fontSize + 6),
    };

    expect(cards.some((card) => textObstacles.some((obstacle) => overlaps(card, obstacle)))).toBe(false);
    expect(cards.some((card) => overlaps(card, guestObstacle))).toBe(false);

    flushSync(() => root.unmount());
    container.remove();
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
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    for (let index = 1; index <= 8; index += 1) expect(container.textContent).toContain(`同学${index}`);
    expect(container.textContent).not.toContain("另有");

    flushSync(() => root.unmount());
    container.remove();
  });

  it("uses the configured card width instead of capping it to the space left of the map", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, maxWidth: 900 };
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const card = container.querySelector('[data-destination-card="北京市"]')!;
    expect(Number(card.querySelector("rect")?.getAttribute("width"))).toBe(900);

    flushSync(() => root.unmount());
    container.remove();
  });

  it("uses display-frame local coordinates without changing final card placement", () => {
    const base = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const frame = createDefaultDisplayFrame();
    frame.fixed.items = frame.fixed.items.map((item) => item.id === "name" ? { ...item, x: 88, y: 74 } : item);
    base.cards = { ...base.cards, positions: { 北京市: { x: 700, y: 260 } }, displayFrame: frame };
    const moved = { ...base, cards: { ...base.cards, displayFrame: { ...frame, fixed: { items: frame.fixed.items.map((item) => item.id === "name" ? { ...item, x: 132, y: 92 } : item) } } } };
    const container = document.createElement("div");
    const root = createRoot(container);

    flushSync(() => root.render(<PosterCanvas project={base} exportMode />));
    const firstCard = container.querySelector('[data-destination-card="北京市"]')!;
    const firstTransform = firstCard.getAttribute("transform");
    const firstNameY = firstCard.querySelector('[data-card-row-line]')?.getAttribute("y");

    flushSync(() => root.render(<PosterCanvas project={moved} exportMode />));
    const secondCard = container.querySelector('[data-destination-card="北京市"]')!;
    expect(secondCard.getAttribute("transform")).toBe(firstTransform);
    expect(secondCard.querySelector('[data-card-row-line]')?.getAttribute("y")).not.toBe(firstNameY);
    expect(secondCard.querySelector("rect")?.getAttribute("data-display-frame-mode")).toBe("fixed");

    flushSync(() => root.unmount());
    container.remove();
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
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const card = container.querySelector("[data-destination-card]")!;
    const wrappedLines = card.querySelectorAll("[data-card-row-line]");
    expect(wrappedLines.length).toBeGreaterThan(1);
    expect(Number(card.querySelector("rect")?.getAttribute("height"))).toBeGreaterThan(80);
    expect(card.textContent).toContain("自动换行展示");

    flushSync(() => root.unmount());
    container.remove();
  });

  it("anchors a province connector to its projected administrative center", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const anchor = container.querySelector<SVGCircleElement>('[data-destination-anchor="北京市"]')!;
    expect(Number(anchor.getAttribute("cx"))).toBeCloseTo(889.58, 1);
    expect(Number(anchor.getAttribute("cy"))).toBeCloseTo(351.56, 1);
    expect(Math.abs(Number(anchor.getAttribute("cy")) - 347.26)).toBeGreaterThan(4);

    flushSync(() => root.unmount());
    container.remove();
  });

  it("updates destination cards when the edited project records change", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const updated = {
      ...project,
      students: [{ id: "edited", name: "苏禾", university: "浙江大学", city: "杭州市", visibility: true }],
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));
    expect(container.textContent).toContain("可见");

    flushSync(() => root.render(<PosterCanvas project={updated} exportMode />));
    expect(container.textContent).toContain("苏禾");
    expect(container.textContent).not.toContain("可见");

    flushSync(() => root.unmount());
    container.remove();
  });

  it("reuses the layout result for cosmetic changes but invalidates geometry changes", () => {
    cardLayoutCache.clear();
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const container = document.createElement("div");
    const root = createRoot(container);

    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));
    expect(cardLayoutCache.size).toBe(1);

    const cosmetic = {
      ...project,
      canvas: { ...project.canvas, backgroundColor: "#f7f2e8" },
      cards: { ...project.cards, connectorColor: "#123456" },
    };
    flushSync(() => root.render(<PosterCanvas project={cosmetic} exportMode />));
    expect(cardLayoutCache.size).toBe(1);

    const geometry = {
      ...cosmetic,
      cards: { ...cosmetic.cards, maxWidth: cosmetic.cards.maxWidth + 20 },
    };
    flushSync(() => root.render(<PosterCanvas project={geometry} exportMode />));
    expect(cardLayoutCache.size).toBe(2);

    flushSync(() => root.unmount());
    container.remove();
    cardLayoutCache.clear();
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
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(container.querySelectorAll("[data-destination-card]")).toHaveLength(2);
    expect(container.textContent).toContain("北京大学 · 北京市");
    expect(container.textContent).toContain("清华大学 · 北京市");

    flushSync(() => root.unmount());
    container.remove();
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
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const card = container.querySelector('[data-destination-card="浙江省"]')!;
    expect(card.querySelector('[data-city-section="杭州市"]')?.textContent).toContain("杭州市");
    expect(card.querySelector('[data-city-section="宁波市"]')?.textContent).toContain("宁波市");
    expect(Number(card.querySelector("rect")?.getAttribute("height"))).toBeGreaterThan(100);

    flushSync(() => root.unmount());
    container.remove();
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
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const card = container.querySelector('[data-destination-card="浙江省"]')!;
    const cityHeadings = Array.from(card.querySelectorAll("[data-city-section]"));
    expect(cityHeadings).toHaveLength(2);
    expect(card.textContent).toContain("苏禾");
    expect(card.textContent).toContain("宁波市");
    expect(card.textContent).toContain("江潮");
    expect(card.textContent).not.toContain("另有");

    flushSync(() => root.unmount());
    container.remove();
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
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const card = container.querySelector('[data-destination-card="浙江省"]')!;
    expect(card.textContent).toContain("去向：浙江省");
    expect(card.textContent).toContain("城市 / 杭州市");
    expect(card.textContent).toContain("苏禾 → 浙江大学（杭州市）");

    flushSync(() => root.unmount());
    container.remove();
  });

  it("renders a distinct card treatment for each configured preset", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, preset: "ticket" };
    const container = document.createElement("div");
    const root = createRoot(container);
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

    flushSync(() => root.unmount());
    container.remove();
  });

  it("hides the per-card person count when showCount is off", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const shown = container.querySelector("[data-destination-card]")!.textContent ?? "";
    expect(shown).toMatch(/\d+ 人/);

    project.cards = { ...project.cards, showCount: false };
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));
    const hidden = container.querySelector("[data-destination-card]")!.textContent ?? "";
    expect(hidden).not.toMatch(/\d+ 人/);
    expect(hidden).not.toContain("人");

    flushSync(() => root.unmount());
    container.remove();
  });

  it("runs borderless connectors to the card center and hides them under transparent fills", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, preset: "borderless" };
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const connector = container.querySelector<SVGPathElement>("[data-destination-connector]")!;
    const key = connector.getAttribute("data-destination-connector")!;
    const card = container.querySelector<SVGGElement>(`[data-destination-card="${key}"]`)!;
    const [, x, y] = card.getAttribute("transform")!.match(/translate\(([^ ]+) ([^)]+)\)/)!;
    const rect = card.querySelector("rect")!;
    const centerX = Number(x) + Number(rect.getAttribute("width")) / 2;
    const centerY = Number(y) + Number(rect.getAttribute("height")) / 2;
    const match = connector.getAttribute("d")!.match(/^M([-\d.]+) ([-\d.]+) L/);
    expect(Number(match?.[1])).toBeCloseTo(centerX, 3);
    expect(Number(match?.[2])).toBeCloseTo(centerY, 3);

    // Transparent fill: the line would cross the card text, so it is hidden entirely.
    project.cards = { ...project.cards, opacity: 0.5 };
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));
    expect(container.querySelector("[data-destination-connector]")).toBeNull();

    // Non-borderless presets keep the boundary connector regardless of opacity.
    project.cards = { ...project.cards, preset: "standard", opacity: 0.5 };
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));
    expect(container.querySelector("[data-destination-connector]")).not.toBeNull();

    flushSync(() => root.unmount());
    container.remove();
  });

  it("respects hidden visible fields in card rows and city headings", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, visibleFields: ["name", "city"] };
    const container = document.createElement("div");
    const root = createRoot(container);
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

    flushSync(() => root.unmount());
    container.remove();
  });

  it("uses scene text properties and reports selection targets", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const onSelect = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} onSelect={onSelect} />));

    const title = container.querySelector('[data-text-id="text-title"]') as SVGGElement;
    expect(title.querySelector("text")?.getAttribute("font-size")).toBe("42");
    expect(title.querySelector("text")?.getAttribute("font-weight")).toBe("700");
    Object.assign(title, {
      setPointerCapture: vi.fn(),
    });
    const svg = container.querySelector("svg") as SVGSVGElement;
    Object.assign(svg, {
      createSVGPoint: vi.fn(() => ({
        x: 0,
        y: 0,
        matrixTransform: vi.fn(() => ({ x: 72, y: 126 })),
      })),
      getScreenCTM: vi.fn(() => ({ inverse: vi.fn(() => ({}) ) })),
    });
    flushSync(() => title.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: 72, clientY: 126 })));
    expect(onSelect).toHaveBeenCalledWith({ type: "text", id: "text-title" });

    flushSync(() => root.unmount());
    container.remove();
  });

  it("uses the configured card background opacity and unified font size", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, opacity: 0.42, fontSize: 16 };
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(container.querySelector('[data-destination-card] rect')?.getAttribute("fill-opacity")).toBe("0.42");
    expect(container.querySelector('[data-destination-card] text')?.getAttribute("font-size")).toBe("16");

    flushSync(() => root.unmount());
    container.remove();
  });

  it("renders independent typography styles for card fields and guest rows", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.cards = {
      ...project.cards,
      fieldTypography: {
        title: { fontSize: 20, color: "#112233" },
        name: { fontSize: 15, color: "#445566" },
        city: { fontSize: 13, color: "#778899" },
      },
    };
    project.guests = {
      ...project.guests,
      titleTypography: { fontSize: 19, color: "#223344" },
      peopleTypography: { fontSize: 14, color: "#556677" },
      people: [{ id: "guest-1", name: "张老师", visibility: true }],
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(container.querySelector("[data-card-title-line]")?.getAttribute("font-size")).toBe("20");
    expect(container.querySelector("[data-card-title-line]")?.getAttribute("fill")).toBe("#112233");
    expect(container.querySelector("[data-guest-title]")?.getAttribute("font-size")).toBe("19");
    expect(container.querySelector("[data-guest-person=\"guest-1\"]")?.getAttribute("fill")).toBe("#556677");

    flushSync(() => root.unmount());
    container.remove();
  });

  it("reports a dragged destination card position", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const onMoveCard = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} onMoveCard={onMoveCard} />));

    const card = container.querySelector<SVGGElement>("[data-destination-card]")!;
    Object.assign(card, { setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() });
    flushSync(() => card.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 120, clientY: 120, pointerId: 1 })));
    flushSync(() => card.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 160, clientY: 150, pointerId: 1 })));

    expect(onMoveCard).not.toHaveBeenCalled();
    flushSync(() => card.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 160, clientY: 150, pointerId: 1 })));
    expect(onMoveCard).toHaveBeenCalledTimes(1);
    flushSync(() => root.unmount());
    container.remove();
  });

  it("keeps an allowed manual card position inside the map", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.cards = {
      ...project.cards,
      allowMapOverlap: true,
      positions: { "北京市": { x: 600, y: 400 } },
    };
    project.textElements = [];
    project.guests = { ...project.guests, visibility: false };
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(container.querySelector('[data-destination-card="北京市"]')?.getAttribute("transform"))
      .toBe("translate(600 400)");

    flushSync(() => root.unmount());
    container.remove();
  });

  it("limits destination-card drag previews to the configured render interval", () => {
    vi.useFakeTimers();
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} renderIntervalMs={100} onMoveCard={vi.fn()} />));
    const card = container.querySelector<SVGGElement>("[data-destination-card]")!;
    Object.assign(card, { setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() });
    const initial = card.getAttribute("transform");

    flushSync(() => card.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 120, clientY: 120, pointerId: 1 })));
    flushSync(() => card.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 200, clientY: 180, pointerId: 1 })));
    expect(card.getAttribute("transform")).toBe(initial);
    flushSync(() => vi.advanceTimersByTime(100));
    expect(card.getAttribute("transform")).not.toBe(initial);

    flushSync(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("renders the selected connector path style", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, connectorStyle: "straight" };
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const connector = container.querySelector<SVGPathElement>("[data-destination-connector]")!;
    expect(connector.getAttribute("data-connector-style")).toBe("straight");
    expect(connector.getAttribute("d")).not.toContain("C");

    flushSync(() => root.unmount());
    container.remove();
  });

  it("renders connector color width and dash settings from the card scene", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, connectorColor: "#123456", connectorWidth: 3, connectorDash: "dotted" };
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const connector = container.querySelector<SVGPathElement>("[data-destination-connector]")!;
    expect(connector.getAttribute("stroke")).toBe("#123456");
    expect(connector.getAttribute("data-connector-dash")).toBe("dotted");
    expect(connector.getAttribute("stroke-dasharray")).toBeTruthy();

    flushSync(() => root.unmount());
    container.remove();
  });

  it("renders province-style textures on connectors", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, connectorDash: "rail", connectorWidth: 2 };
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const connector = container.querySelector<SVGPathElement>("[data-destination-connector]")!;
    expect(connector.getAttribute("data-connector-dash")).toBe("rail");
    expect(container.querySelector("[data-destination-connector-underlay]")).not.toBeNull();

    flushSync(() => root.unmount());
    container.remove();
  });

  it("renders the guest panel in the lower-left area", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.guests = {
      ...project.guests,
      people: [{ id: "g1", name: "李老师", title: "特邀嘉宾", visibility: true }],
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(container.querySelector("[data-guests-layer]")).not.toBeNull();
    expect(container.querySelector("[data-guest-person=\"g1\"]")?.textContent).toContain("李老师");

    flushSync(() => root.unmount());
    container.remove();
  });

  it("folds the south china sea inset when enabled", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.map = { ...project.map, collapseSouthChinaSea: true };
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(container.querySelector("[data-map-layer]")?.getAttribute("data-collapse-south-sea")).toBe("true");
    expect(container.querySelector("[data-south-sea-inset]")).not.toBeNull();
    expect(container.querySelector("[data-south-sea-label]")?.textContent).toContain("南海诸岛");
    expect(container.querySelector('[data-province-label="460000"]')?.textContent).toContain("海南");

    flushSync(() => root.unmount());
    container.remove();
  });

  it("reports canvas, map, and card selections without rendering editor overlays for export", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const onSelect = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} onSelect={onSelect} />));

    const svg = container.querySelector("svg")!;
    const map = container.querySelector("[data-map-frame]")!;
    const cards = container.querySelector("[data-cards-layer]")!;
    flushSync(() => svg.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    flushSync(() => map.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    flushSync(() => cards.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSelect).toHaveBeenCalledWith({ type: "canvas" });
    expect(onSelect).toHaveBeenCalledWith({ type: "map" });
    expect(onSelect).toHaveBeenCalledWith({ type: "cards" });

    flushSync(() => root.render(<PosterCanvas project={project} exportMode onSelect={onSelect} />));
    expect(container.querySelector("[data-map-selection-overlay]")).toBeNull();
    expect(container.querySelector("[data-selection-overlay]")).toBeNull();

    flushSync(() => root.unmount());
    container.remove();
  });

  it("renders an editor-only grid overlay that is omitted in export mode", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} showGrid gridSize={25} />));

    const grid = container.querySelector("[data-editor-grid]");
    expect(grid).not.toBeNull();
    expect(grid?.getAttribute("data-grid-size")).toBe("25");

    flushSync(() => root.render(<PosterCanvas project={project} showGrid gridSize={25} exportMode />));
    expect(container.querySelector("[data-editor-grid]")).toBeNull();

    flushSync(() => root.unmount());
    container.remove();
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
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const card = container.querySelector("[data-destination-card]")!;
    const title = card.querySelector("text")!;
    expect(title.getAttribute("font-family")).toContain("KaiTi");
    const rowTspans = Array.from(card.querySelectorAll("text tspan"));
    expect(rowTspans.length).toBeGreaterThanOrEqual(2);
    expect(rowTspans.some((node) => (node.getAttribute("font-family") || "").includes("Consolas"))).toBe(true);
    expect(rowTspans.some((node) => (node.getAttribute("font-family") || "").includes("Songti SC"))).toBe(true);

    flushSync(() => root.unmount());
    container.remove();
  });

  it("renders guest title and per-person font overrides", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.guests = {
      ...project.guests,
      titleFontId: "font-system-serif",
      peopleFontId: "font-system-rounded",
      people: [{
        id: "guest-1",
        name: "张老师",
        title: "特邀嘉宾",
        visibility: true,
        fontId: "font-system-kaiti",
      }],
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(container.querySelector("[data-guest-title]")?.getAttribute("font-family")).toContain("Songti SC");
    expect(container.querySelector('[data-guest-person="guest-1"]')?.getAttribute("font-family")).toContain("KaiTi");
    flushSync(() => root.unmount());
  });

  it("renders per-guest custom note text and avatar image in list mode", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.guests = {
      ...project.guests,
      people: [
        { id: "g1", name: "李老师", title: "班主任", note: "祝大家前程似锦", avatarSrc: "data:image/png;base64,AAA", visibility: true },
        { id: "g2", name: "王老师", visibility: true },
      ],
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(container.querySelector('[data-guest-person="g1"]')?.textContent).toContain("李老师 · 班主任");
    const note = container.querySelector('[data-guest-note="g1"]');
    expect(note?.textContent).toBe("祝大家前程似锦");
    expect(note?.getAttribute("font-size")).toBe("11");
    const avatar = container.querySelector('[data-guest-avatar="g1"]');
    expect(avatar?.querySelector("image")?.getAttribute("href")).toBe("data:image/png;base64,AAA");
    // second person without avatar keeps a placeholder circle so rows stay aligned
    expect(container.querySelector('[data-guest-avatar="g2"] circle')).not.toBeNull();
    expect(container.querySelector('[data-guest-note="g2"]')).toBeNull();

    flushSync(() => root.unmount());
    container.remove();
  });

  it("renders the guest panel in avatar-card mode as a grid", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.guests = {
      ...project.guests,
      displayMode: "cards",
      people: [
        { id: "g1", name: "李老师", title: "班主任", note: "桃李满天下", visibility: true },
        { id: "g2", name: "王老师", avatarSrc: "data:image/png;base64,BBB", visibility: true },
      ],
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const first = container.querySelector('[data-guest-card="g1"]');
    const second = container.querySelector('[data-guest-card="g2"]');
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    // two columns inside the default 280px-wide panel
    expect(Number(first?.getAttribute("transform")?.match(/translate\(([\d.]+)/)?.[1])).toBe(14);
    const secondX = Number(second?.getAttribute("transform")?.match(/translate\(([\d.]+)/)?.[1]);
    expect(secondX).toBeGreaterThan(14);
    // initial-letter fallback avatar for g1, image avatar for g2
    expect(container.querySelector('[data-guest-avatar-initial="g1"]')?.textContent).toBe("李");
    expect(container.querySelector('[data-guest-avatar="g2"] image')?.getAttribute("href")).toBe("data:image/png;base64,BBB");
    // name centered inside the card, note rendered on the card
    expect(container.querySelector('[data-guest-person="g1"]')?.textContent).toBe("李老师");
    expect(container.querySelector('[data-guest-note="g1"]')?.textContent).toBe("桃李满天下");

    flushSync(() => root.unmount());
    container.remove();
  });

  it("renders the panel free-form custom text above the people list", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.guests = {
      ...project.guests,
      customText: "感谢老师三年的陪伴\n愿大家前程似锦",
      people: [{ id: "g1", name: "李老师", visibility: true }],
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const lines = container.querySelectorAll("[data-guest-custom-text]");
    expect(lines.length).toBe(2);
    expect(lines[0]?.textContent).toBe("感谢老师三年的陪伴");
    expect(lines[1]?.textContent).toBe("愿大家前程似锦");
    // the people list is shifted below the custom text block
    const person = container.querySelector('[data-guest-person="g1"]')!;
    expect(Number(person.getAttribute("y"))).toBeGreaterThan(Number(lines[1]?.getAttribute("y")));
    // the custom text must not overlap the header: its visual top stays clear
    // of the divider (which sits 8px below the title baseline)
    const titleY = Number(container.querySelector("[data-guest-title]")?.getAttribute("y"));
    const firstLineY = Number(lines[0]?.getAttribute("y"));
    const fontSize = Number(lines[0]?.getAttribute("font-size"));
    expect(firstLineY - fontSize).toBeGreaterThanOrEqual(titleY + 8 + 10);

    flushSync(() => root.unmount());
    container.remove();
  });

  it("hides the empty-list hint when custom text fills the panel", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.guests = { ...project.guests, customText: "仅自定义文本", people: [] };
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(container.querySelectorAll("[data-guest-custom-text]").length).toBe(1);
    expect(container.textContent).not.toContain("在右侧添加老师");

    flushSync(() => root.unmount());
    container.remove();
  });
});
