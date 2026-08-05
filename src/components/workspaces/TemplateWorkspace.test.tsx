import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "../../lib/project-document";
import { sampleStudents } from "../../lib/project-data";
import { createSystemTemplate } from "../../lib/template-document";
import { TemplateWorkspace } from "./TemplateWorkspace";

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
  const onClose = vi.fn();
  const project = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
  const templates = (["original", "cartoon"] as const).map((id) => ({ id, name: createSystemTemplate(id).name }));
  flushSync(() => root.render(
    <TemplateWorkspace
      project={project}
      templates={templates}
      customTemplates={[]}
      onApplyTemplate={onApplyTemplate}
      onApplyCustomTemplate={onApplyCustomTemplate}
      onClose={onClose}
    />,
  ));
  return { container, onApplyTemplate, onApplyCustomTemplate, onClose, project };
}

function click(button: HTMLButtonElement): void {
  flushSync(() => button.click());
}

describe("TemplateWorkspace", () => {
  it("keeps a template choice temporary until the user applies it", () => {
    const { container, onApplyTemplate, onClose, project } = renderWorkspace();

    click(container.querySelector<HTMLButtonElement>('button[aria-label="选择卡通画风"]')!);

    expect(container.textContent).toContain("将应用：卡通画风");
    expect(container.textContent).toContain("名单不会删除");
    expect(onApplyTemplate).not.toHaveBeenCalled();
    expect(project.templateId).toBe("original");

    click(container.querySelector<HTMLButtonElement>('button[aria-label="取消模板选择"]')!);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApplyTemplate).not.toHaveBeenCalled();
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
});
