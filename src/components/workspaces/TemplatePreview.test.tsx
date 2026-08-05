import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it } from "vitest";
import { createProjectDocument } from "../../lib/project-document";
import { sampleStudents } from "../../lib/project-data";
import { createSystemTemplate } from "../../lib/template-document";
import { TemplatePreview } from "./TemplatePreview";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

describe("TemplatePreview", () => {
  it("shows the template's real dimensions and a rendered visual preview", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push({ root, container });
    const project = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });

    flushSync(() => root.render(
      <TemplatePreview project={project} template={createSystemTemplate("cartoon")} />,
    ));

    expect(container.textContent).toContain("1500 × 1000 px");
    expect(container.textContent).toContain("横版");
    expect(container.querySelector("svg[data-template-preview]")) .not.toBeNull();
    expect(container.querySelector("[data-destination-card]")) .not.toBeNull();
    expect(container.querySelector("[data-destination-card")?.textContent).toContain("林舟");
  });
});
