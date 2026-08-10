import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "../../lib/project-document";
import { sampleStudents } from "../../lib/project-data";
import { createSystemTemplate } from "../../lib/template-document";
import { TemplateCatalogRail, TemplateWorkspace, type TemplateSelection } from "./TemplateWorkspace";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

function renderWorkspace() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const onApplyTemplate = vi.fn();
  const onApplyCustomTemplate = vi.fn();
  const project = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
  const templates = (["original", "cartoon"] as const).map((id) => ({ id, name: createSystemTemplate(id).name }));
  function Stage() {
    const [selection, setSelection] = useState<TemplateSelection | null>(null);
    return (
      <>
        <TemplateCatalogRail
          templates={templates}
          customTemplates={[]}
          currentTemplateId={project.templateId}
          selection={selection}
          onSelect={setSelection}
        />
        <TemplateWorkspace
          project={project}
          templates={templates}
          customTemplates={[]}
          onApplyTemplate={onApplyTemplate}
          onApplyCustomTemplate={onApplyCustomTemplate}
          selection={selection}
          onSelect={setSelection}
        />
      </>
    );
  }
  flushSync(() => root.render(<Stage />));
  return { container, onApplyTemplate, onApplyCustomTemplate, project };
}

function click(button: HTMLButtonElement): void {
  flushSync(() => button.click());
}

describe("TemplateWorkspace", () => {
  it("keeps a template choice temporary until the user applies it", () => {
    const { container, onApplyTemplate, project } = renderWorkspace();

    click(container.querySelector<HTMLButtonElement>('button[aria-label="选择卡通画风"]')!);

    expect(container.textContent).toContain("将应用：卡通画风");
    expect(container.textContent).toContain("名单不会删除");
    expect(container.querySelector(".template-workspace__back")).toBeNull();
    expect(onApplyTemplate).not.toHaveBeenCalled();
    expect(project.templateId).toBe("original");
  });

  it("applies only after confirming the impact summary and can choose again", () => {
    const { container, onApplyTemplate } = renderWorkspace();

    click(container.querySelector<HTMLButtonElement>('button[aria-label="选择卡通画风"]')!);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="重新选择模板"]')!);
    expect(container.textContent).not.toContain("将应用：卡通画风");

    click(container.querySelector<HTMLButtonElement>('button[aria-label="选择卡通画风"]')!);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="应用模板"]')!);

    expect(onApplyTemplate).toHaveBeenCalledWith("cartoon");
  });

  it("renders the catalog rail with listbox semantics and the current template badge", () => {
    const { container } = renderWorkspace();

    expect(container.querySelector('aside[aria-label="模板列表"]')).not.toBeNull();
    expect(container.querySelector('.template-workspace__list[role="listbox"][aria-label="模板列表"]')).not.toBeNull();
    expect(container.querySelectorAll('button[aria-label^="选择"]')).toHaveLength(2);
    expect(container.querySelector('button[aria-label="选择原始地图"]')?.querySelector('[aria-label="当前模板"]')).not.toBeNull();
  });
});
