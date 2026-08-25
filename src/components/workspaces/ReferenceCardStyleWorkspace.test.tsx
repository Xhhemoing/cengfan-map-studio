import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "../../lib/project-document";
import { ReferenceCardStyleWorkspace } from "./ReferenceCardStyleWorkspace";

describe("ReferenceCardStyleWorkspace", () => {
  it("offers the four renderable reference styles and applies one canonical template", () => {
    const project = createProjectDocument({
      students: [{ id: "1", name: "林舟", university: "北京大学", city: "北京市", visibility: true }],
      templateId: "original",
      dataView: "province",
    });
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);

    flushSync(() => root.render(<ReferenceCardStyleWorkspace cards={project.cards} onPatch={onPatch} />));

    expect(container.querySelectorAll(".reference-card-style-option")).toHaveLength(4);
    const emblemButton = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("校徽开放名单"));
    expect(emblemButton).toBeDefined();
    flushSync(() => emblemButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({
      templateId: "emblem-list",
      presentation: "emblem-list",
      grouping: "province",
      displayFrame: undefined,
    }));

    flushSync(() => root.unmount());
  });

  it("exposes the style options as a labelled group with pressed state", () => {
    const project = createProjectDocument({
      students: [{ id: "1", name: "林舟", university: "北京大学", city: "北京市", visibility: true }],
      templateId: "original",
      dataView: "province",
    });
    project.cards = { ...project.cards, templateId: "emblem-list", presentation: "emblem-list" };
    const container = document.createElement("div");
    const root = createRoot(container);

    flushSync(() => root.render(<ReferenceCardStyleWorkspace cards={project.cards} onPatch={vi.fn()} />));

    const group = container.querySelector('[role="group"][aria-label="展示框样式选项"]');
    expect(group).not.toBeNull();
    const options = Array.from(group!.querySelectorAll<HTMLButtonElement>("button"));
    expect(options).toHaveLength(4);
    // Every option is named by its visible template title and reports selection state.
    for (const option of options) {
      expect(option.textContent?.trim()).toBeTruthy();
      expect(["true", "false"]).toContain(option.getAttribute("aria-pressed"));
    }
    expect(options.filter((option) => option.getAttribute("aria-pressed") === "true")).toHaveLength(1);

    flushSync(() => root.unmount());
  });
});
