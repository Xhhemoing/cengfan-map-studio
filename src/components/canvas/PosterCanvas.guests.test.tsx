import { describe, expect, it } from "vitest";
import { flushSync } from "react-dom";
import { PosterCanvas } from "./PosterCanvas";
import { createProjectDocument } from "../../lib/project-document";
import { installPosterCanvasTestHarness, students, trackedRoot } from "./poster-canvas-test-harness";

installPosterCanvasTestHarness();

describe("PosterCanvas guest panel", () => {
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
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(container.querySelector("[data-card-title-line]")?.getAttribute("font-size")).toBe("20");
    expect(container.querySelector("[data-card-title-line]")?.getAttribute("fill")).toBe("#112233");
    expect(container.querySelector("[data-guest-title]")?.getAttribute("font-size")).toBe("19");
    expect(container.querySelector("[data-guest-person=\"guest-1\"]")?.getAttribute("fill")).toBe("#556677");
  });

  it("renders the guest panel in the lower-left area", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.guests = {
      ...project.guests,
      people: [{ id: "g1", name: "李老师", title: "特邀嘉宾", visibility: true }],
    };
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(container.querySelector("[data-guests-layer]")).not.toBeNull();
    expect(container.querySelector("[data-guest-person=\"g1\"]")?.textContent).toContain("李老师");
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
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(container.querySelector("[data-guest-title]")?.getAttribute("font-family")).toContain("Songti SC");
    expect(container.querySelector('[data-guest-person="guest-1"]')?.getAttribute("font-family")).toContain("KaiTi");
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
    const { container, root } = trackedRoot();
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
    const { container, root } = trackedRoot();
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
  });

  it("renders the panel free-form custom text above the people list", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.guests = {
      ...project.guests,
      customText: "感谢老师三年的陪伴\n愿大家前程似锦",
      people: [{ id: "g1", name: "李老师", visibility: true }],
    };
    const { container, root } = trackedRoot();
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
  });

  it("hides the empty-list hint when custom text fills the panel", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.guests = { ...project.guests, customText: "仅自定义文本", people: [] };
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(container.querySelectorAll("[data-guest-custom-text]").length).toBe(1);
    expect(container.textContent).not.toContain("在右侧添加老师");
  });
});
