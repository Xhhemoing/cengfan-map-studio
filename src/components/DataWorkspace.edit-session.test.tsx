import { useState } from "react";
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { DataWorkspace } from "./DataWorkspace";
import type { Student } from "../lib/project-data";
import {
  changeInput, click, getInput, installDataWorkspaceTestHarness, render,
  renderWorkspace, students,
} from "./data-workspace-test-harness";

installDataWorkspaceTestHarness();

function pressKey(target: Element, key: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
  flushSync(() => target.dispatchEvent(event));
  return event;
}

function editButton(container: HTMLDivElement) {
  return container.querySelector<HTMLButtonElement>("[data-roster-edit-trigger]")!;
}

function beginEditing(container: HTMLDivElement) {
  click(editButton(container));
  return getInput(container, "编辑学生名称");
}

describe("DataWorkspace import text accessibility", () => {
  it("keeps a visible label and format help after text has replaced the placeholder", () => {
    const container = renderWorkspace();
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea")!;
    changeInput(textarea, "林舟 北京大学 北京");

    expect(textarea.labels?.[0]?.textContent).toBe("导入文本");
    const help = document.getElementById(textarea.getAttribute("aria-describedby")!);
    expect(help?.textContent).toContain("每行一名学生");
    expect(help?.textContent).toContain("姓名、院校、城市");
    expect(help?.textContent).toContain("第 4 列填写“海外”");
  });

  it("binds each workspace's label and help to its own textarea", () => {
    const first = renderWorkspace().querySelector<HTMLTextAreaElement>("textarea")!;
    const second = renderWorkspace().querySelector<HTMLTextAreaElement>("textarea")!;

    expect(first.id).not.toBe(second.id);
    expect(first.labels?.[0]?.control).toBe(first);
    expect(second.labels?.[0]?.control).toBe(second);
    expect(first.getAttribute("aria-describedby")).not.toBe(second.getAttribute("aria-describedby"));
  });
});

describe("DataWorkspace roster edit keyboard session", () => {
  it("focuses the name field and restores the edit entry after saving", () => {
    const onUpdateStudent = vi.fn();
    const container = renderWorkspace({ onUpdateStudent });
    const name = beginEditing(container);
    expect(document.activeElement).toBe(name);
    changeInput(name, "林舟舟");

    click(container.querySelector<HTMLButtonElement>('button[aria-label="保存 林舟"]')!);

    expect(onUpdateStudent).toHaveBeenCalledOnce();
    expect(onUpdateStudent).toHaveBeenCalledWith("student-1", expect.objectContaining({ name: "林舟舟" }));
    expect(document.activeElement).toBe(editButton(container));
  });

  it("restores the edit entry when cancelling by button or Escape", () => {
    const onUpdateStudent = vi.fn();
    const container = renderWorkspace({ onUpdateStudent });
    beginEditing(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="取消编辑 林舟"]')!);
    expect(document.activeElement).toBe(editButton(container));

    const name = beginEditing(container);
    changeInput(name, "未保存姓名");
    expect(pressKey(name, "Escape").defaultPrevented).toBe(true);

    expect(onUpdateStudent).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(editButton(container));
    expect(beginEditing(container).value).toBe("林舟");
  });

  it("saves a text field with Enter and prevents duplicate actions in the same render", () => {
    const onUpdateStudent = vi.fn();
    const container = renderWorkspace({ onUpdateStudent });
    const name = beginEditing(container);
    changeInput(name, "林舟舟");
    const save = container.querySelector<HTMLButtonElement>('button[aria-label="保存 林舟"]')!;
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });

    flushSync(() => {
      name.dispatchEvent(enter);
      save.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(enter.defaultPrevented).toBe(true);
    expect(onUpdateStudent).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(editButton(container));
  });

  it("does not submit from the cancel button's Enter key", () => {
    const onUpdateStudent = vi.fn();
    const container = renderWorkspace({ onUpdateStudent });
    beginEditing(container);
    const cancel = container.querySelector<HTMLButtonElement>('button[aria-label="取消编辑 林舟"]')!;
    cancel.focus();

    expect(pressKey(cancel, "Enter").defaultPrevented).toBe(false);
    click(cancel);

    expect(onUpdateStudent).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(editButton(container));
  });

  it("keeps the editor and draft during Chinese composition and legacy IME keys", () => {
    const onUpdateStudent = vi.fn();
    const container = renderWorkspace({ onUpdateStudent });
    const name = beginEditing(container);
    changeInput(name, "林舟舟");

    pressKey(name, "Enter", { isComposing: true });
    pressKey(name, "Escape", { isComposing: true });
    pressKey(name, "Enter", { keyCode: 229 });
    pressKey(name, "Escape", { keyCode: 229 });

    expect(onUpdateStudent).not.toHaveBeenCalled();
    expect(getInput(container, "编辑学生名称")).toBe(name);
    expect(name.value).toBe("林舟舟");
    expect(document.activeElement).toBe(name);
  });

  it("keeps an invalid record editable for correction rather than closing it", () => {
    const onUpdateStudent = vi.fn();
    const container = renderWorkspace({ onUpdateStudent });
    const name = beginEditing(container);
    changeInput(name, " ");

    pressKey(name, "Enter");

    expect(onUpdateStudent).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(name);
    expect(container.textContent).toContain("学生姓名、就读院校和城市不能为空");
    changeInput(name, "林舟舟");
    pressKey(name, "Enter");
    expect(onUpdateStudent).toHaveBeenCalledOnce();
  });

  it("dismisses a combobox's suggestions before cancelling the row", () => {
    const onUpdateStudent = vi.fn();
    const container = renderWorkspace({ onUpdateStudent });
    beginEditing(container);
    const city = getInput(container, "编辑城市");
    flushSync(() => city.focus());
    changeInput(city, "杭州");
    expect(city.getAttribute("aria-expanded")).toBe("true");

    pressKey(city, "Escape");

    expect(city.getAttribute("aria-expanded")).toBe("false");
    expect(getInput(container, "编辑学生名称")).not.toBeNull();
    expect(document.activeElement).toBe(city);
    pressKey(city, "Escape");
    expect(onUpdateStudent).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(editButton(container));
  });

  it("confirms a combobox option before a second Enter saves the row", () => {
    const onUpdateStudent = vi.fn();
    const container = renderWorkspace({ onUpdateStudent });
    beginEditing(container);
    const city = getInput(container, "编辑城市");
    flushSync(() => city.focus());
    changeInput(city, "杭州");
    pressKey(city, "ArrowDown");

    pressKey(city, "Enter");

    expect(onUpdateStudent).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(city);
    expect(city.getAttribute("aria-expanded")).toBe("false");
    pressKey(city, "Enter");
    expect(onUpdateStudent).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(editButton(container));
  });

  it("focuses the first field on double click without resetting an active draft", () => {
    const container = renderWorkspace();
    const row = container.querySelector<HTMLTableRowElement>("[data-student-row]")!;
    flushSync(() => row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    const name = getInput(container, "编辑学生名称");
    expect(document.activeElement).toBe(name);
    changeInput(name, "未保存姓名");

    flushSync(() => name.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));

    expect(name.value).toBe("未保存姓名");
  });

  it("returns focus to the filter when a saved change removes the row from its results", () => {
    const onUpdateStudent = vi.fn();
    function UpdatingWorkspace() {
      const [records, setRecords] = useState<Student[]>(students);
      return <DataWorkspace
        students={records}
        onAppendStudents={vi.fn()} onReplaceStudents={vi.fn()} onToggleVisibility={vi.fn()}
        onDeleteStudent={vi.fn()} onSetStudentsVisibility={vi.fn()}
        onUpdateStudent={(id, patch) => {
          onUpdateStudent(id, patch);
          setRecords((current) => current.map((student) => student.id === id ? { ...student, ...patch } : student));
        }}
      />;
    }
    const container = render(<UpdatingWorkspace />);
    const filter = getInput(container, "筛选学生");
    changeInput(filter, "林舟");
    const name = beginEditing(container);
    changeInput(name, "新名字");

    pressKey(name, "Enter");

    expect(onUpdateStudent).toHaveBeenCalledOnce();
    expect(container.querySelector("[data-student-row]")).toBeNull();
    expect(document.activeElement).toBe(filter);
  });
});
