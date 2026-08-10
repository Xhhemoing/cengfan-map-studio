import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlobalDataScreen } from "./GlobalDataScreen";
import type { DataHealthSummary, DataIssue } from "../lib/data-health";
import { createProjectDocument } from "../lib/project-document";
import type { Student } from "../lib/project-data";

const students: Student[] = [
  { id: "student-1", name: "林舟", university: "北京大学", city: "北京市", visibility: true },
];
const summary: DataHealthSummary = {
  total: 1,
  visible: 1,
  hidden: 0,
  international: 0,
  unresolved: 0,
  missingRequired: 0,
  duplicate: 0,
};
const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

function render(issues: DataIssue[] = []): { container: HTMLDivElement; onSelectStudent: ReturnType<typeof vi.fn> } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const onSelectStudent = vi.fn();
  const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
  flushSync(() => root.render(
    <GlobalDataScreen
      project={project}
      summary={summary}
      issues={issues}
      dataViewLabel="省份卡片"
      selectedStudentId={null}
      onSelectStudent={onSelectStudent}
      onChangeDataView={vi.fn()}
      templates={[]}
      currentTemplateId="original"
      customTemplates={[]}
      onApplyTemplate={vi.fn()}
      onApplyCustomTemplate={vi.fn()}
      onSaveTemplate={vi.fn()}
      onOpenGlobalSettings={vi.fn()}
      dataWorkspaceProps={{
        students,
        onReplaceStudents: vi.fn(),
        onAppendStudents: vi.fn(),
        onUpdateStudent: vi.fn(),
        onToggleVisibility: vi.fn(),
        onDeleteStudent: vi.fn(),
        onSetStudentsVisibility: vi.fn(),
      }}
    />,
  ));
  return { container, onSelectStudent };
}

describe("GlobalDataScreen", () => {
  it("renders five workbench tabs and reuses DataWorkspace for roster management", () => {
    const { container } = render();

    expect(container.querySelector('main[aria-label="全局数据工作台"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="返回编辑器"]')).toBeNull();
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(5);
    expect(container.textContent).toContain("数据总览");
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="名单管理"]')!.click());
    expect(container.textContent).toContain("学生数据中心");
    expect(container.querySelector(".student-table")).not.toBeNull();
  });

  it("routes a quality issue to roster management and preserves its student id", () => {
    const issue: DataIssue = {
      studentId: "student-1",
      studentName: "林舟",
      kind: "unresolved-location",
      detail: "无法定位城市：不存在",
      severity: "warning",
    };
    const { container, onSelectStudent } = render([issue]);
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="数据质量"]')!.click());
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="定位林舟"]')!.click());

    expect(onSelectStudent).toHaveBeenCalledWith("student-1");
    expect(container.textContent).toContain("学生数据中心");
  });
});
