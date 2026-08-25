import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { DataUploadWorkspace } from "./DataUploadWorkspace";
import { createProjectDocument } from "../../lib/project-document";
import type { Student } from "../../lib/project-data";
import type { DataWorkspace } from "../DataWorkspace";

const students: Student[] = [{ id: "student-1", name: "林舟", university: "北京大学", city: "北京市", visibility: true }];
const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

function render(dataWorkspaceOverrides: Partial<ComponentProps<typeof DataWorkspace>> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(
    <DataUploadWorkspace
      project={createProjectDocument({ students, templateId: "original", dataView: "province" })}
      summary={{ total: 1, visible: 1, hidden: 0, international: 0, unresolved: 0, missingRequired: 0, duplicate: 0 }}
      issues={[]}
      dataWorkspaceProps={{
        students,
        onReplaceStudents: vi.fn(),
        onAppendStudents: vi.fn(),
        onUpdateStudent: vi.fn(),
        onToggleVisibility: vi.fn(),
        onDeleteStudent: vi.fn(),
        onSetStudentsVisibility: vi.fn(),
        ...dataWorkspaceOverrides,
      }}
      onSelectStudent={vi.fn()}
    />,
  ));
  return container;
}

function expandImport(container: HTMLElement) {
  flushSync(() => container
    .querySelector<HTMLButtonElement>('button[aria-label="展开导入名单"]')
    ?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

const TEMPLATE_BUTTON = 'button[aria-label="下载学生数据 XLSX 模板"]';

describe("DataUploadWorkspace template download", () => {
  it("shows the XLSX template download on the data stage import path", () => {
    const container = render();
    expandImport(container);

    const button = container.querySelector<HTMLButtonElement>(TEMPLATE_BUTTON);
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain("下载 XLSX 模板");
  });

  it("keeps the template download reachable before the import section is expanded", () => {
    // 不调用 expandImport：「先下载模板照着填」是最省事的一条路，不能藏在折叠面板里。
    const container = render();

    expect(container.querySelector<HTMLButtonElement>(TEMPLATE_BUTTON)).not.toBeNull();
    expect(container.querySelector('button[aria-label="展开导入名单"]')).not.toBeNull();
  });

  it("lets the caller decide instead of forcing the flag on", () => {
    const container = render({ hideTemplateDownload: true });
    expandImport(container);

    expect(container.querySelector(TEMPLATE_BUTTON)).toBeNull();
  });
});
