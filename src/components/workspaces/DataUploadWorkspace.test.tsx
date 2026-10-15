import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { DataUploadRail, DataUploadWorkspace } from "./DataUploadWorkspace";
import { createProjectDocument } from "../../lib/project-document";
import type { Student } from "../../lib/project-data";
import type { DataWorkspace } from "../DataWorkspace";
import { buildDataHealthSummary, listDataIssues } from "../../lib/data-health";

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

function defaultDataWorkspaceProps(): ComponentProps<typeof DataWorkspace> {
  return {
    students,
    onReplaceStudents: vi.fn(),
    onAppendStudents: vi.fn(),
    onUpdateStudent: vi.fn(),
    onToggleVisibility: vi.fn(),
    onDeleteStudent: vi.fn(),
    onSetStudentsVisibility: vi.fn(),
  };
}

function renderWorkspace(overrides: Partial<ComponentProps<typeof DataUploadWorkspace>> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const project = overrides.project ?? createProjectDocument({ students, templateId: "original", dataView: "province" });
  const summary = overrides.summary ?? { total: 1, visible: 1, hidden: 0, international: 0, unresolved: 0, missingRequired: 0, duplicate: 0 };
  const issues = overrides.issues ?? [];
  const dataWorkspaceProps = overrides.dataWorkspaceProps ?? defaultDataWorkspaceProps();
  const onSelectStudent = overrides.onSelectStudent ?? vi.fn();
  // The DATA stage is split: the center workbench (header + roster table) and
  // the unified right rail (数据质量) are separate components composed by the
  // app shell, so render both together like the shell does.
  flushSync(() => root.render(
    <div className="data-upload-test-suite">
      <DataUploadWorkspace
        project={project}
        summary={summary}
        issues={issues}
        dataWorkspaceProps={dataWorkspaceProps}
        onSelectStudent={onSelectStudent}
      />
      <DataUploadRail
        project={project}
        summary={summary}
        issues={issues}
        dataWorkspaceProps={dataWorkspaceProps}
        onSelectStudent={onSelectStudent}
      />
    </div>,
  ));
  return { container, root, project };
}

describe("DataUploadWorkspace", () => {
  it("keeps one full-roster summary with hidden, duplicate and unresolved counts during filtering", () => {
    const records: Student[] = [
      students[0]!,
      { ...students[0]!, id: "student-2", visibility: false },
      { ...students[0]!, id: "student-3", name: "星河", city: "火星市" },
    ];
    const project = createProjectDocument({ students: records, templateId: "original", dataView: "province" });
    const { container } = renderWorkspace({
      project,
      summary: buildDataHealthSummary(project),
      issues: listDataIssues(project),
      dataWorkspaceProps: { ...defaultDataWorkspaceProps(), students: records },
    });
    const statuses = container.querySelectorAll('[aria-label="名单状态"]');
    expect(statuses).toHaveLength(1);
    expect(container.querySelector(".data-summary")).toBeNull();
    const readCounts = () => Array.from(statuses[0]!.children, (child) => child.textContent?.replace(/\s/g, ""));
    expect(readCounts()).toEqual(["3总记录", "2可见", "1隐藏", "2重复", "1未匹配城市"]);

    const filter = container.querySelector<HTMLInputElement>('input[aria-label="筛选学生"]')!;
    flushSync(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(filter, "星河");
      filter.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(container.querySelectorAll("[data-student-row]")).toHaveLength(1);
    expect(container.textContent).toContain("找到 1 条匹配记录（名单共 3 条）");
    expect(readCounts()).toEqual(["3总记录", "2可见", "1隐藏", "2重复", "1未匹配城市"]);
  });

  it("renders one quality heading and distinguishes warnings from informational records", () => {
    const { container } = renderWorkspace({
      issues: [
        { studentId: "student-1", studentName: "林舟", kind: "duplicate", detail: "记录重复", severity: "warning" },
        { studentId: "student-2", studentName: "周晴", kind: "hidden", detail: "记录已隐藏", severity: "info" },
      ],
    });

    const headings = Array.from(container.querySelectorAll(".panel-heading__title > span"))
      .filter((heading) => heading.textContent === "数据质量");
    expect(headings).toHaveLength(1);
    expect(container.querySelectorAll('section[aria-label="数据质量"]')).toHaveLength(1);
    expect(headings[0]?.parentElement?.textContent).toContain("1 项提醒 · 1 项说明");
    expect(container.querySelector('[aria-label="名单质量项目"]')?.textContent).toContain("重复记录");
    expect(container.querySelector('[aria-label="名单质量项目"]')?.textContent).toContain("隐藏记录");
  });

  it("puts import and add controls before filtering and the table in keyboard order", () => {
    const { container } = renderWorkspace();
    const importControl = container.querySelector('button[aria-label="展开导入名单"]')!;
    const addControl = container.querySelector('button[aria-label="展开新增学生"]')!;
    const filter = container.querySelector('input[aria-label="筛选学生"]')!;
    const table = container.querySelector('table[aria-label="学生数据表"]')!;

    expect(importControl.compareDocumentPosition(addControl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(addControl.compareDocumentPosition(filter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(filter.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("is the roster workbench and excludes map expression controls", () => {
    const { container } = renderWorkspace();

    expect(container.querySelector('main[aria-label="名单工作台"]')).not.toBeNull();
    expect(container.querySelector('.data-upload-workspace--expanded')).not.toBeNull();
    expect(container.querySelector('.data-workspace--roster')).not.toBeNull();
    expect(container.querySelector('.data-table-wrap')).not.toBeNull();
    // 外壳已有「名单」标题，不再叠一层旧的「学生数据中心」头。
    expect(container.textContent).not.toContain("学生数据中心");
    const addStudent = container.querySelector<HTMLButtonElement>('button[aria-label="展开新增学生"]');
    const importRoster = container.querySelector<HTMLButtonElement>('button[aria-label="展开导入名单"]');
    expect(addStudent?.getAttribute("aria-expanded")).toBe("false");
    expect(importRoster?.getAttribute("aria-expanded")).toBe("false");
    flushSync(() => addStudent?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    flushSync(() => importRoster?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector('button[aria-label="收起新增学生"]')?.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector('button[aria-label="收起导入名单"]')?.getAttribute("aria-expanded")).toBe("true");
    // 数据阶段仍然不承载「整体模板」选择器；下载 XLSX 模板属于导入主路径，必须可见。
    expect(container.querySelector(".template-picker")).toBeNull();
    expect(container.textContent).not.toContain("整体模板");
    expect(container.textContent).not.toContain("地图呈现");
    expect(container.querySelector('button[aria-label="下载学生数据 XLSX 模板"]')).not.toBeNull();
    expect(container.querySelector(".student-table")).not.toBeNull();
    expect(container.querySelector('[aria-label="数据质量"]')).not.toBeNull();
  });

  it("hides the template download only when the shell asks for it", () => {
    const { container } = renderWorkspace({
      dataWorkspaceProps: { ...defaultDataWorkspaceProps(), hideTemplateDownload: true },
    });

    const importRoster = container.querySelector<HTMLButtonElement>('button[aria-label="展开导入名单"]');
    flushSync(() => importRoster?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector('button[aria-label="下载学生数据 XLSX 模板"]')).toBeNull();
  });

  it("forwards row selection without rendering a return-editor action", () => {
    const innerSelect = vi.fn();
    const outerSelect = vi.fn();
    const { container } = renderWorkspace({
      dataWorkspaceProps: { ...defaultDataWorkspaceProps(), onSelectStudent: innerSelect },
      onSelectStudent: outerSelect,
    });

    flushSync(() => container.querySelector('[data-student-row="student-1"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(innerSelect).toHaveBeenCalledWith("student-1");
    expect(outerSelect).toHaveBeenCalledWith("student-1");
    expect(container.querySelector('button[aria-label="返回编辑器"]')).toBeNull();
  });

  it("delegates six-stage navigation to the app topbar instead of a nested stepper", () => {
    const { container } = renderWorkspace();

    // 顶部栏统一承载六阶段导航，工作台自身不再渲染重复的步骤条
    expect(container.querySelector(".workflow-stage-stepper")).toBeNull();
  });

  it("keeps the asset library out of the roster stage rail", () => {
    const { container } = renderWorkspace();

    // 素材主入口在内容阶段，省份贴图从地图阶段直达；名单侧栏只做数据质量。
    expect(container.textContent).not.toContain("素材库");
    expect(container.querySelector(".asset-panel")).toBeNull();
    expect(container.querySelector('.data-upload-workspace__rail [role="tablist"]')).toBeNull();
    expect(container.querySelector('.data-upload-workspace__rail [aria-label="数据质量"]')).not.toBeNull();
    expect(container.querySelector('.data-upload-workspace__rail section[aria-label="地图映射"]')).not.toBeNull();
  });

  it("restores the province mapping panel with inline province overrides", () => {
    const onUpdateStudent = vi.fn();
    const { container } = renderWorkspace({
      summary: { total: 1, visible: 1, hidden: 0, international: 0, unresolved: 1, missingRequired: 0, duplicate: 0 },
      issues: [
        { studentId: "student-1", studentName: "林舟", kind: "unresolved-location", detail: "无法定位城市：火星市", severity: "warning" },
        { studentId: "student-1", studentName: "林舟", kind: "manual-province", detail: "使用省份覆盖：火星省", severity: "info" },
      ],
      dataWorkspaceProps: { ...defaultDataWorkspaceProps(), onUpdateStudent },
    });

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
  });

  it("shows an empty state when all locations and provinces are resolved", () => {
    const { container } = renderWorkspace();

    const mapping = container.querySelector('section[aria-label="地图映射"]');
    expect(mapping).not.toBeNull();
    expect(mapping?.textContent).toContain("城市与省份已全部定位");
    expect(mapping?.querySelector('[aria-label="省份分布"]')?.textContent).toContain("北京市");
  });
});
