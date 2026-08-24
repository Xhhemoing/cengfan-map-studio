import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState, type ComponentProps } from "react";
import { DataUploadRail, DataUploadWorkspace } from "./DataUploadWorkspace";
import { createProjectDocument } from "../../lib/project-document";
import type { DataIssue } from "../../lib/data-health";
import type { Student } from "../../lib/project-data";
import type { DataWorkspace } from "../DataWorkspace";

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
  const assetPanelProps = overrides.assetPanelProps ?? { onApplyBackground: vi.fn() };
  const onCreateDecoration = overrides.onCreateDecoration ?? vi.fn();
  const onSelectStudent = overrides.onSelectStudent ?? vi.fn();
  // The DATA stage is split: the center workbench (header + roster table) and
  // the unified right rail (数据质量/素材库) are separate components composed
  // by the app shell, so render both together like the shell does.
  flushSync(() => root.render(
    <div className="data-upload-test-suite">
      <DataUploadWorkspace
        project={project}
        summary={summary}
        issues={issues}
        dataWorkspaceProps={dataWorkspaceProps}
        assetPanelProps={assetPanelProps}
        onCreateDecoration={onCreateDecoration}
        onSelectStudent={onSelectStudent}
      />
      <DataUploadRail
        project={project}
        summary={summary}
        issues={issues}
        dataWorkspaceProps={dataWorkspaceProps}
        assetPanelProps={assetPanelProps}
        onCreateDecoration={onCreateDecoration}
        onSelectStudent={onSelectStudent}
      />
    </div>,
  ));
  return { container, root, project };
}

const rosterWithTwo: Student[] = [
  students[0]!,
  { id: "student-2", name: "苏禾", university: "浙江大学", city: "杭州市", visibility: true },
];

const locateIssues: DataIssue[] = [{
  id: "unresolved-location:student-1",
  studentId: "student-1",
  studentName: "林舟",
  kind: "unresolved-location",
  detail: "无法定位城市：火星市",
  severity: "warning",
}];

/**
 * The DATA stage keeps the selected record in the app shell, so 定位 only
 * reaches the roster table through a state round-trip. This harness stands in
 * for that shell.
 */
function LocateHarness() {
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const project = createProjectDocument({ students: rosterWithTwo, templateId: "original", dataView: "province" });
  const summary = { total: 2, visible: 2, hidden: 0, international: 0, unresolved: 1, missingRequired: 0, duplicate: 0 };
  const dataWorkspaceProps: ComponentProps<typeof DataWorkspace> = {
    ...defaultDataWorkspaceProps(),
    students: rosterWithTwo,
    selectedStudentId,
  };
  const assetPanelProps = { onApplyBackground: vi.fn() };
  return (
    <div className="data-upload-test-suite">
      <DataUploadWorkspace
        project={project}
        summary={summary}
        issues={locateIssues}
        dataWorkspaceProps={dataWorkspaceProps}
        assetPanelProps={assetPanelProps}
        onCreateDecoration={vi.fn()}
        onSelectStudent={setSelectedStudentId}
      />
      <DataUploadRail
        project={project}
        summary={summary}
        issues={locateIssues}
        dataWorkspaceProps={dataWorkspaceProps}
        assetPanelProps={assetPanelProps}
        onCreateDecoration={vi.fn()}
        onSelectStudent={setSelectedStudentId}
      />
    </div>
  );
}

function renderLocateHarness() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(<LocateHarness />));
  return { container, root };
}

describe("DataUploadWorkspace", () => {
  it("is the upload data workbench and excludes templates and map expression controls", () => {
    const { container } = renderWorkspace();

    expect(container.querySelector('main[aria-label="数据与素材工作台"]')).not.toBeNull();
    expect(container.querySelector('.data-upload-workspace--expanded')).not.toBeNull();
    expect(container.querySelector('.data-workspace--roster')).not.toBeNull();
    expect(container.querySelector('.data-table-wrap')).not.toBeNull();
    const addStudent = container.querySelector<HTMLButtonElement>('button[aria-label="展开新增学生"]');
    const importRoster = container.querySelector<HTMLButtonElement>('button[aria-label="展开导入名单"]');
    expect(addStudent?.getAttribute("aria-expanded")).toBe("false");
    expect(importRoster?.getAttribute("aria-expanded")).toBe("false");
    flushSync(() => addStudent?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    flushSync(() => importRoster?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector('button[aria-label="收起新增学生"]')?.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector('button[aria-label="收起导入名单"]')?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).not.toContain("模板");
    expect(container.textContent).not.toContain("地图呈现");
    expect(container.querySelector('button[aria-label="下载学生数据 XLSX 模板"]')).toBeNull();
    expect(container.querySelector(".student-table")).not.toBeNull();
    expect(container.querySelector('[aria-label="数据质量"]')).not.toBeNull();
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

  it("tags every quality row with a stable issue id so the UI can locate it", () => {
    const { container } = renderWorkspace({
      issues: [
        { id: "unresolved-location:student-1", studentId: "student-1", studentName: "林舟", kind: "unresolved-location", detail: "无法定位城市：火星市", severity: "warning" },
        // An issue without an explicit id still gets the same derived identifier.
        { studentId: "student-1", studentName: "林舟", kind: "duplicate", detail: "与其他记录一致", severity: "warning" },
      ],
    });

    const ids = Array.from(container.querySelectorAll(".data-quality-panel [data-issue-id]")).map((row) => row.getAttribute("data-issue-id"));
    expect(ids).toEqual(["unresolved-location:student-1", "duplicate:student-1"]);
    // The map-mapping list repeats the same issue and must reuse its id.
    expect(container.querySelector('.data-upload-workspace__mapping-row[data-issue-id="unresolved-location:student-1"]')).not.toBeNull();
  });

  it("moves focus to the roster row when an issue is located by its stable id", () => {
    const innerSelect = vi.fn();
    const outerSelect = vi.fn();
    const { container } = renderWorkspace({
      issues: [
        { id: "unresolved-location:student-1", studentId: "student-1", studentName: "林舟", kind: "unresolved-location", detail: "无法定位城市：火星市", severity: "warning" },
      ],
      dataWorkspaceProps: { ...defaultDataWorkspaceProps(), onSelectStudent: innerSelect },
      onSelectStudent: outerSelect,
    });

    const issueRow = container.querySelector('.data-quality-panel [data-issue-id="unresolved-location:student-1"]')!;
    const locate = issueRow.querySelector<HTMLButtonElement>("[data-locate-issue]")!;
    expect(locate.getAttribute("data-locate-issue")).toBe("unresolved-location:student-1");

    flushSync(() => locate.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(innerSelect).toHaveBeenCalledWith("student-1");
    expect(outerSelect).toHaveBeenCalledWith("student-1");
    expect(document.activeElement).toBe(container.querySelector('[data-student-row="student-1"]'));
  });

  it("locates the roster row from the map-mapping list too", () => {
    const outerSelect = vi.fn();
    const { container } = renderWorkspace({
      issues: [
        { studentId: "student-1", studentName: "林舟", kind: "manual-province", detail: "使用省份覆盖：火星省", severity: "info" },
      ],
      onSelectStudent: outerSelect,
    });

    const mappingRow = container.querySelector('.data-upload-workspace__mapping-row[data-issue-id="manual-province:student-1"]')!;
    flushSync(() => mappingRow.querySelector<HTMLButtonElement>('button[aria-label="定位林舟"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(outerSelect).toHaveBeenCalledWith("student-1");
    expect(document.activeElement).toBe(container.querySelector('[data-student-row="student-1"]'));
  });

  it("still reports the selection when the located record is filtered out of the table", () => {
    const outerSelect = vi.fn();
    const { container } = renderWorkspace({
      issues: [
        { studentId: "student-404", studentName: "不在表内", kind: "duplicate", detail: "与其他记录一致", severity: "warning" },
      ],
      onSelectStudent: outerSelect,
    });
    const active = document.activeElement;

    flushSync(() => container.querySelector<HTMLButtonElement>('[data-locate-issue="duplicate:student-404"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(outerSelect).toHaveBeenCalledWith("student-404");
    expect(document.activeElement).toBe(active);
  });

  it("says the located row is hidden by the roster filter and brings it back", () => {
    const { container } = renderLocateHarness();
    const filterInput = container.querySelector<HTMLInputElement>('input[aria-label="筛选学生"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    flushSync(() => {
      setter?.call(filterInput, "浙江");
      filterInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelector('[data-student-row="student-1"]')).toBeNull();

    flushSync(() => container.querySelector<HTMLButtonElement>('[data-locate-issue="unresolved-location:student-1"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true })));

    // The row cannot be focused, so the roster panel says why instead.
    const notice = container.querySelector('[data-filtered-selection="student-1"]');
    expect(notice?.textContent).toContain("林舟");

    flushSync(() => container.querySelector<HTMLButtonElement>('[data-reveal-filtered-selection="student-1"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true })));
    flushSync(() => {});

    const row = container.querySelector('[data-student-row="student-1"]');
    expect(row).not.toBeNull();
    expect(document.activeElement).toBe(row);
    expect(container.querySelector("[data-filtered-selection]")).toBeNull();
  });

  it("shows an empty state when all locations and provinces are resolved", () => {
    const { container } = renderWorkspace();

    const mapping = container.querySelector('section[aria-label="地图映射"]');
    expect(mapping).not.toBeNull();
    expect(mapping?.textContent).toContain("城市与省份已全部定位");
    expect(mapping?.querySelector('[aria-label="省份分布"]')?.textContent).toContain("北京市");
  });

  it("defaults the side rail to the quality tab and switches to the asset library", () => {
    const { container } = renderWorkspace();

    const qualityTab = container.querySelector<HTMLButtonElement>("#data-rail-quality-tab");
    const assetsTab = container.querySelector<HTMLButtonElement>("#data-rail-assets-tab");
    expect(qualityTab).not.toBeNull();
    expect(assetsTab).not.toBeNull();
    expect(container.querySelector("#data-rail-quality")).not.toBeNull();
    expect(container.querySelector("#data-rail-assets")).toBeNull();
    expect(qualityTab?.getAttribute("aria-selected")).toBe("true");
    expect(assetsTab?.getAttribute("aria-selected")).toBe("false");

    flushSync(() => assetsTab?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(container.querySelector("#data-rail-quality")).toBeNull();
    expect(container.querySelector("#data-rail-assets")).not.toBeNull();
    expect(container.querySelector("#data-rail-assets .asset-panel")).not.toBeNull();
    expect(assetsTab?.getAttribute("aria-selected")).toBe("true");
    expect(qualityTab?.getAttribute("aria-selected")).toBe("false");

    // arrow keys switch and refocus the other tab
    flushSync(() => assetsTab?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
    expect(container.querySelector("#data-rail-quality")).not.toBeNull();
    expect(container.querySelector("#data-rail-assets")).toBeNull();
    expect(qualityTab?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(qualityTab);
  });

  it("wires the asset library province picker to the workspace override", () => {
    const onCreateDecoration = vi.fn();
    const { container } = renderWorkspace({
      assetPanelProps: { onApplyBackground: vi.fn(), provinces: ["北京市", "浙江省"] },
      onCreateDecoration,
    });

    flushSync(() => container.querySelector<HTMLButtonElement>("#data-rail-assets-tab")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    const select = container.querySelector("#asset-province") as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(container.querySelector("#asset-province-upload")).toBeNull();

    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    flushSync(() => {
      setter?.call(select, "北京市");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelector("#asset-province-upload")).not.toBeNull();
  });
});
