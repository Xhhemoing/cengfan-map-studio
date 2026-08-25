// 从 src/components/DataWorkspace.test.tsx 原样搬出：名单表格的行为——新增学生、
// 可见性与批量隐藏、删除确认、筛选与未匹配城市提示。
// 共享挂载/交互装置见 src/components/data-workspace-test-harness.tsx。
import { useState } from "react";
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { DataWorkspace } from "./DataWorkspace";
import {
  installDataWorkspaceTestHarness,
  render,
  click,
  changeInput,
  getInput,
  students,
} from "./data-workspace-test-harness";

installDataWorkspaceTestHarness();

function VisibilityHarness() {
  const [records, setRecords] = useState(students);
  return (
    <DataWorkspace
      students={records}
      onAppendStudents={vi.fn()}
      onReplaceStudents={vi.fn()}
      onUpdateStudent={vi.fn()}
      onToggleVisibility={(id) =>
        setRecords((current) =>
          current.map((student) =>
            student.id === id ? { ...student, visibility: !student.visibility } : student,
          ),
        )
      }
      onDeleteStudent={vi.fn()}
      onSetStudentsVisibility={vi.fn()}
      confirmDelete={() => true}
    />
  );
}

describe("DataWorkspace roster actions", () => {
  it("creates international students without reporting an unresolved China city", () => {
    const onAppendStudents = vi.fn();
    const container = render(
      <DataWorkspace
        students={students}
        onAppendStudents={onAppendStudents}
        onReplaceStudents={vi.fn()}
        onUpdateStudent={vi.fn()}
        onToggleVisibility={vi.fn()}
        onDeleteStudent={vi.fn()}
        onSetStudentsVisibility={vi.fn()}
      />,
    );

    const scope = container.querySelector<HTMLSelectElement>('select[aria-label="新增学生去向类型"]')!;
    flushSync(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(scope, "international");
      scope.dispatchEvent(new Event("change", { bubbles: true }));
    });
    changeInput(container.querySelector<HTMLInputElement>('input[placeholder="林舟"]')!, "周晴");
    changeInput(getInput(container, "就读院校"), "哈佛大学");
    changeInput(container.querySelector<HTMLInputElement>('input[placeholder="美国·波士顿"]')!, "美国·波士顿");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("新增学生"))!);

    expect(onAppendStudents).toHaveBeenCalledWith([expect.objectContaining({
      name: "周晴",
      city: "美国·波士顿",
      locationScope: "international",
    })]);
    expect(container.textContent).not.toContain("未匹配城市");
  });

  it("reports visibility actions with an accessible action label", () => {
    const onToggleVisibility = vi.fn();
    const container = render(
      <DataWorkspace
        students={students}
        onAppendStudents={vi.fn()}
        onReplaceStudents={vi.fn()}
        onUpdateStudent={vi.fn()}
        onToggleVisibility={onToggleVisibility}
        onDeleteStudent={vi.fn()}
        onSetStudentsVisibility={vi.fn()}
        confirmDelete={() => true}
      />,
    );

    click(container.querySelector<HTMLButtonElement>('button[aria-label="隐藏 林舟"]')!);

    expect(onToggleVisibility).toHaveBeenCalledWith("student-1");
  });

  it("updates the visibility action label after a state change", () => {
    const container = render(<VisibilityHarness />);

    click(container.querySelector<HTMLButtonElement>('button[aria-label="隐藏 林舟"]')!);

    expect(container.querySelector('button[aria-label="显示 林舟"]')).not.toBeNull();
  });

  it("waits for delete confirmation before reporting removal", () => {
    const onDeleteStudent = vi.fn();
    const confirmDelete = vi.fn(() => false);
    const container = render(
      <DataWorkspace
        students={students}
        onAppendStudents={vi.fn()}
        onReplaceStudents={vi.fn()}
        onUpdateStudent={vi.fn()}
        onToggleVisibility={vi.fn()}
        onDeleteStudent={onDeleteStudent}
        onSetStudentsVisibility={vi.fn()}
        confirmDelete={confirmDelete}
      />,
    );

    click(container.querySelector<HTMLButtonElement>('button[aria-label="删除 林舟"]')!);

    expect(confirmDelete).toHaveBeenCalledWith(students[0]);
    expect(onDeleteStudent).not.toHaveBeenCalled();
  });

  it("reports removal after delete confirmation", () => {
    const onDeleteStudent = vi.fn();
    const container = render(
      <DataWorkspace
        students={students}
        onAppendStudents={vi.fn()}
        onReplaceStudents={vi.fn()}
        onUpdateStudent={vi.fn()}
        onToggleVisibility={vi.fn()}
        onDeleteStudent={onDeleteStudent}
        onSetStudentsVisibility={vi.fn()}
        confirmDelete={() => true}
      />,
    );

    click(container.querySelector<HTMLButtonElement>('button[aria-label="删除 林舟"]')!);

    expect(onDeleteStudent).toHaveBeenCalledWith("student-1");
  });

  it("adds custom unmatched university and city values", () => {
    const onAppendStudents = vi.fn();
    const container = render(
      <DataWorkspace
        students={students}
        onAppendStudents={onAppendStudents}
        onReplaceStudents={vi.fn()}
        onUpdateStudent={vi.fn()}
        onToggleVisibility={vi.fn()}
        onDeleteStudent={vi.fn()}
        onSetStudentsVisibility={vi.fn()}
        confirmDelete={() => true}
      />,
    );

    const inputs = container.querySelectorAll<HTMLInputElement>(".draft-form input");
    changeInput(inputs[0]!, "自定义同学");
    changeInput(getInput(container, "就读院校"), "火星学院");
    changeInput(getInput(container, "城市"), "自定义火星城");
    click(container.querySelector<HTMLButtonElement>(".draft-form .wide-button")!);

    expect(onAppendStudents).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "自定义同学",
        university: "火星学院",
        city: "自定义火星城",
        visibility: true,
      }),
    ]);
  });

  it("shows unresolved city warning in the row and summary", () => {
    const container = render(
      <DataWorkspace
        students={[
          { ...students[0]!, city: "自定义火星城" },
        ]}
        onAppendStudents={vi.fn()}
        onReplaceStudents={vi.fn()}
        onUpdateStudent={vi.fn()}
        onToggleVisibility={vi.fn()}
        onDeleteStudent={vi.fn()}
        onSetStudentsVisibility={vi.fn()}
        confirmDelete={() => true}
      />,
    );

    expect(container.textContent).toContain("未匹配城市");
    expect(container.textContent).toContain("自定义火星城");
  });

  it("keeps hidden records editable", () => {
    const container = render(
      <DataWorkspace
        students={[{ ...students[0]!, visibility: false }]}
        onAppendStudents={vi.fn()}
        onReplaceStudents={vi.fn()}
        onUpdateStudent={vi.fn()}
        onToggleVisibility={vi.fn()}
        onDeleteStudent={vi.fn()}
        onSetStudentsVisibility={vi.fn()}
        confirmDelete={() => true}
      />,
    );

    expect(container.querySelector('button[aria-label="显示 林舟"]')).not.toBeNull();
    click(container.querySelector<HTMLButtonElement>('button[aria-label="编辑 林舟"]')!);
    expect(container.querySelector('input[aria-label="编辑学生名称"]')).not.toBeNull();
  });

  it("filters records by student fields", () => {
    const container = render(
      <DataWorkspace
        students={[
          ...students,
          {
            id: "student-2",
            name: "苏禾",
            university: "浙江大学",
            city: "杭州市",
            visibility: true,
          },
        ]}
        onAppendStudents={vi.fn()}
        onReplaceStudents={vi.fn()}
        onUpdateStudent={vi.fn()}
        onToggleVisibility={vi.fn()}
        onDeleteStudent={vi.fn()}
        onSetStudentsVisibility={vi.fn()}
        confirmDelete={() => true}
      />,
    );

    changeInput(getInput(container, "筛选学生"), "浙江");

    expect(container.textContent).toContain("苏禾");
    expect(container.querySelector('button[aria-label="编辑 林舟"]')).toBeNull();
  });

  it("renders editable records in an Excel-style table with resolved province and selects a row", () => {
    const onSelectStudent = vi.fn();
    const container = render(
      <DataWorkspace
        students={students}
        onAppendStudents={vi.fn()}
        onReplaceStudents={vi.fn()}
        onUpdateStudent={vi.fn()}
        onToggleVisibility={vi.fn()}
        onDeleteStudent={vi.fn()}
        onSetStudentsVisibility={vi.fn()}
        onSelectStudent={onSelectStudent}
        confirmDelete={() => true}
      />,
    );

    expect(container.querySelector("table")?.textContent).toContain("学生");
    expect(container.querySelector("table")?.textContent).toContain("学校");
    expect(container.querySelector("table")?.textContent).toContain("城市");
    expect(container.querySelector("table")?.textContent).toContain("省份");
    expect(container.querySelector('[data-student-row="student-1"]')?.textContent).toContain("北京市");
    expect(container.querySelector('[data-student-row="student-1"]')?.textContent).toContain("北京市");
    click(container.querySelector('[data-student-row="student-1"]')!);
    expect(onSelectStudent).toHaveBeenCalledWith("student-1");
  });

  it("opens a spreadsheet row for editing on double click", () => {
    const container = render(
      <DataWorkspace students={students} onAppendStudents={vi.fn()} onReplaceStudents={vi.fn()} onUpdateStudent={vi.fn()} onToggleVisibility={vi.fn()} onDeleteStudent={vi.fn()} onSetStudentsVisibility={vi.fn()} />,
    );

    flushSync(() => container.querySelector('[data-student-row="student-1"]')!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));

    expect(container.querySelector('input[aria-label="编辑学生名称"]')).not.toBeNull();
  });

  it("uses one batch callback to change all visibility", () => {
    const onSetStudentsVisibility = vi.fn();
    const container = render(
      <DataWorkspace
        students={students}
        onAppendStudents={vi.fn()}
        onReplaceStudents={vi.fn()}
        onUpdateStudent={vi.fn()}
        onToggleVisibility={vi.fn()}
        onDeleteStudent={vi.fn()}
        onSetStudentsVisibility={onSetStudentsVisibility}
        confirmDelete={() => true}
      />,
    );

    click(container.querySelector<HTMLButtonElement>('button[aria-label="全部隐藏"]')!);

    expect(onSetStudentsVisibility).toHaveBeenCalledTimes(1);
    expect(onSetStudentsVisibility).toHaveBeenCalledWith(false);
  });
});
