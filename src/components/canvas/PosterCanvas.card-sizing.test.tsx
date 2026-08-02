import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

vi.mock("./MapLayer", () => ({ MapLayer: () => null }));
vi.mock("./RegionalAssetLayer", () => ({ RegionalAssetLayer: () => null }));
vi.mock("./DecorationLayer", () => ({ DecorationLayer: () => null }));
vi.mock("./TextLayer", () => ({ TextLayer: () => null }));

import { PosterCanvas } from "./PosterCanvas";
import { createProjectDocument } from "../../lib/project-document";

function renderProject(project: ReturnType<typeof createProjectDocument>) {
  const container = document.createElement("div");
  const root = createRoot(container);
  flushSync(() => root.render(<PosterCanvas project={project} exportMode />));
  return { container, root };
}

describe("PosterCanvas card sizing", () => {
  it("grows card row spacing and guest panel height with the global line-height multiplier", () => {
    const project = createProjectDocument({
      students: [
        { id: "s1", name: "张三", university: "北京大学", city: "北京市", visibility: true },
        { id: "s2", name: "李四", university: "清华大学", city: "北京市", visibility: true },
        { id: "s3", name: "王五", university: "复旦大学", city: "上海市", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });
    project.guests = {
      ...project.guests,
      people: [
        { id: "g1", name: "张老师", title: "班主任", visibility: true },
        { id: "g2", name: "李老师", visibility: true },
      ],
    };
    const base = renderProject(project);
    const baseCard = base.container.querySelector('[data-destination-card="北京市"]')!;
    const baseRows = Array.from(baseCard.querySelectorAll("[data-card-row-line]"));
    const baseCardRect = baseCard.querySelector("rect")!;
    const baseGuestRect = base.container.querySelector("[data-guests-layer] rect")!;
    const baseRowY = baseRows.map((row) => Number(row.getAttribute("y")));
    const baseCardHeight = Number(baseCardRect.getAttribute("height"));
    const baseGuestHeight = Number(baseGuestRect.getAttribute("height"));
    flushSync(() => base.root.unmount());

    project.canvas = { ...project.canvas, lineHeight: 1.6 };
    const spaced = renderProject(project);
    const spacedCard = spaced.container.querySelector('[data-destination-card="北京市"]')!;
    const spacedRows = Array.from(spacedCard.querySelectorAll("[data-card-row-line]"));
    const spacedRowY = spacedRows.map((row) => Number(row.getAttribute("y")));
    const spacedCardHeight = Number(spacedCard.querySelector("rect")?.getAttribute("height"));
    const spacedGuestHeight = Number(spaced.container.querySelector("[data-guests-layer] rect")?.getAttribute("height"));

    expect(spacedRowY.length).toBe(baseRowY.length);
    for (let index = 1; index < baseRowY.length; index += 1) {
      expect(spacedRowY[index]! - spacedRowY[index - 1]!).toBeGreaterThan(baseRowY[index]! - baseRowY[index - 1]!);
    }
    expect(spacedCardHeight).toBeGreaterThan(baseCardHeight);
    expect(spacedGuestHeight).toBeGreaterThan(baseGuestHeight);

    flushSync(() => spaced.root.unmount());
  });

  it.each([250, 350])("renders the exact configured card width: %i", (width) => {
    const project = createProjectDocument({
      students: [{ id: "wide", name: "张三", university: "北京大学", city: "北京市", visibility: true }],
      templateId: "original",
      dataView: "province",
    });
    project.cards = { ...project.cards, maxWidth: width };
    project.textElements = [];
    project.guests = { ...project.guests, visibility: false };
    const { container, root } = renderProject(project);

    const card = container.querySelector('[data-destination-card="北京市"]')!;
    expect(Number(card.querySelector("rect")?.getAttribute("width"))).toBe(width);

    flushSync(() => root.unmount());
  });

  it("keeps preserved fields on one line instead of splitting them across rows", () => {
    const project = createProjectDocument({
      students: [{
        id: "nowrap",
        name: "张三",
        university: "一所名称特别特别长的大学",
        city: "北京市",
        visibility: true,
      }],
      templateId: "original",
      dataView: "university",
    });
    project.cards = { ...project.cards, maxWidth: 180, horizontalPadding: 10 };
    project.textElements = [];
    project.guests = { ...project.guests, visibility: false };

    const split = renderProject(project);
    const splitCard = split.container.querySelector('[data-destination-card="一所名称特别特别长的大学"]')!;
    const splitRows = Array.from(splitCard.querySelectorAll("[data-card-row-line]"));
    expect(splitRows.some((line) => line.textContent?.includes("一所名称特别特别长的大学"))).toBe(false);
    flushSync(() => split.root.unmount());

    project.cards = { ...project.cards, noWrapFields: ["university"] };
    const preserved = renderProject(project);
    const preservedCard = preserved.container.querySelector('[data-destination-card="一所名称特别特别长的大学"]')!;
    const preservedUniversityRows = Array.from(preservedCard.querySelectorAll("[data-card-row-line]"))
      .filter((line) => line.textContent?.includes("一所名称特别特别长的大学"));
    expect(preservedUniversityRows).toHaveLength(1);
    expect(preservedUniversityRows[0]?.textContent).toContain("一所名称特别特别长的大学");

    flushSync(() => preserved.root.unmount());
  });

  it("wraps a long card title instead of letting it overflow the header", () => {
    const project = createProjectDocument({
      students: [{
        id: "long-title",
        name: "张三",
        university: "一所名称特别特别长并且必须在卡片标题区域自动换行展示的大学",
        city: "北京市",
        visibility: true,
      }],
      templateId: "original",
      dataView: "university",
    });
    project.cards = { ...project.cards, maxWidth: 250, horizontalPadding: 12 };
    project.textElements = [];
    project.guests = { ...project.guests, visibility: false };
    const { container, root } = renderProject(project);

    const card = container.querySelector("[data-destination-card]")!;
    expect(card.querySelectorAll("[data-card-title-line]").length).toBeGreaterThan(1);
    expect(card.textContent).toContain("自动换行展示");

    flushSync(() => root.unmount());
  });

  it("adds independently configurable empty space below the final row", () => {
    const project = createProjectDocument({
      students: [{ id: "bottom", name: "张三", university: "北京大学", city: "北京市", visibility: true }],
      templateId: "original",
      dataView: "province",
    });
    project.textElements = [];
    project.guests = { ...project.guests, visibility: false };
    project.cards = { ...project.cards, bottomPadding: 8 };
    const first = renderProject(project);
    const compactHeight = Number(first.container.querySelector("[data-destination-card] rect")?.getAttribute("height"));
    flushSync(() => first.root.unmount());

    project.cards = { ...project.cards, bottomPadding: 48 };
    const second = renderProject(project);
    const roomyHeight = Number(second.container.querySelector("[data-destination-card] rect")?.getAttribute("height"));
    expect(roomyHeight - compactHeight).toBe(40);
    flushSync(() => second.root.unmount());
  });

  it("wraps overflowing rows and grows the card to contain every line", () => {
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
    project.textElements = [];
    project.guests = { ...project.guests, visibility: false };
    const { container, root } = renderProject(project);

    const card = container.querySelector("[data-destination-card]")!;
    expect(card.querySelectorAll("[data-card-row-line]").length).toBeGreaterThan(1);
    expect(Number(card.querySelector("rect")?.getAttribute("height"))).toBeGreaterThan(80);
    expect(card.textContent).toContain("自动换行展示");
    expect(card.querySelector("[data-card-row-line]")?.getAttribute("x")).toBe("12");

    flushSync(() => root.unmount());
  });
});
