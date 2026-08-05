import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataUploadWorkspace } from "./DataUploadWorkspace";
import { createProjectDocument } from "../../lib/project-document";
import type { Student } from "../../lib/project-data";

const students: Student[] = [{
  id: "student-1",
  name: "林舟",
  university: "北京大学",
  city: "北京市",
  visibility: true,
}];
const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

describe("DataUploadWorkspace", () => {
  it("is the upload data workbench and excludes templates and map expression controls", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push({ root, container });
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    flushSync(() => root.render(
      <DataUploadWorkspace
        project={project}
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
          hideDataExpression: false,
          hideTemplateDownload: false,
        }}
        onSelectStudent={vi.fn()}
        onClose={vi.fn()}
      />,
    ));

    expect(container.querySelector('main[aria-label="上传数据工作台"]')).not.toBeNull();
    expect(container.textContent).not.toContain("模板");
    expect(container.textContent).not.toContain("地图呈现");
    expect(container.querySelector('button[aria-label="下载学生数据 XLSX 模板"]')).toBeNull();
    expect(container.querySelector(".student-table")).not.toBeNull();
    expect(container.querySelector('[aria-label="数据质量"]')).not.toBeNull();
  });

  it("forwards row selection and close actions to the surrounding editor", () => {
    const innerSelect = vi.fn();
    const outerSelect = vi.fn();
    const onClose = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push({ root, container });
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    flushSync(() => root.render(
      <DataUploadWorkspace
        project={project}
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
          onSelectStudent: innerSelect,
        }}
        onSelectStudent={outerSelect}
        onClose={onClose}
      />,
    ));

    flushSync(() => container.querySelector('[data-student-row="student-1"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')?.click());

    expect(innerSelect).toHaveBeenCalledWith("student-1");
    expect(outerSelect).toHaveBeenCalledWith("student-1");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("delegates six-stage navigation to the app topbar instead of a nested stepper", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push({ root, container });
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    flushSync(() => root.render(
      <DataUploadWorkspace
        project={project}
        summary={{ total: 1, visible: 1, hidden: 0, international: 0, unresolved: 0, missingRequired: 0, duplicate: 0 }}
        issues={[]}
        dataWorkspaceProps={{ students, onReplaceStudents: vi.fn(), onAppendStudents: vi.fn(), onUpdateStudent: vi.fn(), onToggleVisibility: vi.fn(), onDeleteStudent: vi.fn(), onSetStudentsVisibility: vi.fn() }}
        onSelectStudent={vi.fn()}
        onClose={vi.fn()}
      />,
    ));

    // 顶部栏统一承载六阶段导航，工作台自身不再渲染重复的步骤条
    expect(container.querySelector(".workflow-stage-stepper")).toBeNull();
  });

  it("restores the province mapping panel with inline province overrides", () => {
    const onUpdateStudent = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push({ root, container });
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    flushSync(() => root.render(
      <DataUploadWorkspace
        project={project}
        summary={{ total: 1, visible: 1, hidden: 0, international: 0, unresolved: 1, missingRequired: 0, duplicate: 0 }}
        issues={[
          { studentId: "student-1", studentName: "林舟", kind: "unresolved-location", detail: "无法定位城市：火星市", severity: "warning" },
          { studentId: "student-1", studentName: "林舟", kind: "manual-province", detail: "使用省份覆盖：火星省", severity: "info" },
        ]}
        dataWorkspaceProps={{ students, onReplaceStudents: vi.fn(), onAppendStudents: vi.fn(), onUpdateStudent, onToggleVisibility: vi.fn(), onDeleteStudent: vi.fn(), onSetStudentsVisibility: vi.fn() }}
        onSelectStudent={vi.fn()}
        onClose={vi.fn()}
      />,
    ));

    expect(container.querySelector('section[aria-label="地图映射"]')).not.toBeNull();
    expect(container.textContent).toContain("无法定位城市：火星市");
    expect(container.textContent).toContain("使用省份覆盖：火星省");
    const input = container.querySelector('input[aria-label="为 林舟 指定省份"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, "火星省");
    flushSync(() => input.dispatchEvent(new Event("input", { bubbles: true })));
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="为 林舟 应用省份覆盖"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onUpdateStudent).toHaveBeenCalledWith("student-1", { province: "火星省" });

    root.unmount();
  });

  it("shows an empty state when all locations and provinces are resolved", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push({ root, container });
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    flushSync(() => root.render(
      <DataUploadWorkspace
        project={project}
        summary={{ total: 1, visible: 1, hidden: 0, international: 0, unresolved: 0, missingRequired: 0, duplicate: 0 }}
        issues={[]}
        dataWorkspaceProps={{ students, onReplaceStudents: vi.fn(), onAppendStudents: vi.fn(), onUpdateStudent: vi.fn(), onToggleVisibility: vi.fn(), onDeleteStudent: vi.fn(), onSetStudentsVisibility: vi.fn() }}
        onSelectStudent={vi.fn()}
        onClose={vi.fn()}
      />,
    ));

    const mapping = container.querySelector('section[aria-label="地图映射"]');
    expect(mapping).not.toBeNull();
    expect(mapping?.textContent).toContain("城市与省份已全部定位");
    expect(mapping?.querySelector('[aria-label="省份分布"]')?.textContent).toContain("北京市");

    root.unmount();
  });
});
