import { StrictMode, useState, type Dispatch, type SetStateAction } from "react";
import { flushSync } from "react-dom";
import { describe, expect, it } from "vitest";
import { DataWorkspace } from "./DataWorkspace";
import { createEditorStudentActions } from "../lib/editor-student-actions";
import { applyTransaction, createProjectDocument, undoTransaction, type ProjectDocument } from "../lib/project-document";
import { installDataWorkspaceTestHarness, render, click, changeInput, students } from "./data-workspace-test-harness";

installDataWorkspaceTestHarness();
const original = () => createProjectDocument({ students: [{ ...students[0]!, visibility: false }, { ...students[0]!, id: "other", name: "李四" }], templateId: "original", dataView: "province" });
function mount(canEdit = true) {
  let latest!: ProjectDocument;
  let update!: Dispatch<SetStateAction<ProjectDocument>>;
  function Harness() {
    const [project, setProject] = useState(original);
    latest = project; update = setProject;
    const actions = createEditorStudentActions({ students: project.students, canEdit, commit: (tx) => setProject((p) => applyTransaction(p, tx)) });
    return <DataWorkspace students={project.students} {...actions} />;
  }
  const container = render(<StrictMode><Harness /></StrictMode>);
  return { container, project: () => latest, set: (fn: (p: ProjectDocument) => ProjectDocument) => flushSync(() => update(fn)) };
}
function button(container: HTMLElement, text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent?.trim() === text);
  if (!found) throw new Error(`Missing button ${text}`);
  return found;
}
function compare(container: HTMLDivElement, text = "林舟 北京大学 北京") {
  changeInput(container.querySelector("textarea")!, text);
  click(button(container, "识别文本"));
  click(button(container, "比较并更新"));
}
function select(container: HTMLElement, value: string) {
  const input = container.querySelector<HTMLSelectElement>(".import-diff select")!;
  flushSync(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("DataWorkspace compare-and-update", () => {
  it("reimports an identical row without duplicates or empty history", () => {
    const h = mount();
    compare(h.container);
    click(button(h.container, "确认更新名单"));
    expect(h.project().students).toEqual(original().students);
    expect(h.project().history.past).toHaveLength(0);
    expect(h.container.querySelector(".import-diff")).toBeNull();
    expect(h.container.textContent).toContain("无数据改动");
  });
  it("requires explicit matching, retains missing and hidden records, and undoes once", () => {
    const h = mount();
    compare(h.container, "林舟 浙江大学 杭州");
    expect(button(h.container, "确认更新名单").disabled).toBe(true);
    select(h.container, "match:student-1");
    click(button(h.container, "确认更新名单"));
    expect(h.project().students[0]).toMatchObject({ id: "student-1", city: "杭州市", visibility: false });
    expect(h.project().students[1]).toEqual(original().students[1]);
    expect(h.project().history.past).toHaveLength(1);
    expect(h.container.textContent).toContain("更新 1");
    h.set(undoTransaction);
    expect(h.project().students).toEqual(original().students);
  });
  it("cancels without changing the project or the original import candidates", () => {
    const h = mount(); const before = h.project();
    compare(h.container);
    click(button(h.container, "取消比较"));
    expect(h.project()).toBe(before);
    expect(button(h.container, "比较并更新")).toBeDefined();
    expect(h.container.querySelectorAll(".review-row")).toHaveLength(1);
  });
  it("invalidates the preview when the roster changes during review", () => {
    const h = mount();
    compare(h.container);
    h.set((p) => ({ ...p, students: p.students.map((s) => ({ ...s, visibility: true })) }));
    expect(button(h.container, "确认更新名单").disabled).toBe(true);
    expect(h.container.querySelector(".import-diff")?.textContent).toContain("预览已失效");
    expect(h.project().history.past).toHaveLength(0);
  });
  it("does not claim success when the actual commit is read-only", () => {
    const h = mount(false);
    compare(h.container, "林舟 浙江大学 杭州");
    select(h.container, "match:student-1");
    click(button(h.container, "确认更新名单"));
    expect(h.container.querySelector(".import-diff")?.textContent).toContain("当前仅可查看");
    expect(h.project().students).toEqual(original().students);
    expect(h.project().history.past).toHaveLength(0);
  });
});
