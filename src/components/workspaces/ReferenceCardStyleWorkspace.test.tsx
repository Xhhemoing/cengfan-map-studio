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
});
