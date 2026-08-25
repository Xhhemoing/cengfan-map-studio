// 按域保留：名单记录的就地编辑——姓名/院校/城市/省份联动、去向类型与省份改写。
// 共享挂载/交互装置见 src/components/data-workspace-test-harness.tsx。
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { DataWorkspace } from "./DataWorkspace";
import type { Student } from "../lib/project-data";
import {
  installDataWorkspaceTestHarness,
  render,
  click,
  changeInput,
  getInput,
  students,
} from "./data-workspace-test-harness";

installDataWorkspaceTestHarness();

describe("DataWorkspace record editing", () => {
  it("renders table editor suggestions in a portal layer", () => {
    const container = render(
      <DataWorkspace
        students={students}
        onAppendStudents={vi.fn()}
        onReplaceStudents={vi.fn()}
        onUpdateStudent={vi.fn()}
        onToggleVisibility={vi.fn()}
        onDeleteStudent={vi.fn()}
        onSetStudentsVisibility={vi.fn()}
      />,
    );

    click(container.querySelector<HTMLButtonElement>('button[aria-label="编辑 林舟"]')!);
    changeInput(container.querySelector<HTMLInputElement>('input[aria-label="编辑城市"]')!, "杭州");

    const list = document.body.querySelector<HTMLElement>(".search-combobox__list--portal");
    expect(list).not.toBeNull();
    expect(container.querySelector("td .search-combobox__list--portal")).toBeNull();
  });

  it("edits a record with its stable id and allows manual province override", () => {
    const onUpdateStudent = vi.fn();
    const container = render(
      <DataWorkspace
        students={students}
        onAppendStudents={vi.fn()}
        onReplaceStudents={vi.fn()}
        onUpdateStudent={onUpdateStudent}
        onToggleVisibility={vi.fn()}
        onDeleteStudent={vi.fn()}
        onSetStudentsVisibility={vi.fn()}
        confirmDelete={() => true}
      />,
    );

    click(container.querySelector<HTMLButtonElement>('button[aria-label="编辑 林舟"]')!);
    changeInput(container.querySelector<HTMLInputElement>('input[aria-label="编辑学生名称"]')!, "林舟舟");
    changeInput(getInput(container, "编辑省份"), "浙江省");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="保存 林舟"]')!);

    expect(onUpdateStudent).toHaveBeenCalledWith("student-1", {
      name: "林舟舟",
      university: "北京大学",
      city: "北京市",
      province: "浙江省",
    });
  });

  it("appends a custom province when adding a China destination", () => {
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

    changeInput(container.querySelector<HTMLInputElement>('input[placeholder="林舟"]')!, "林舟舟");
    changeInput(getInput(container, "就读院校"), "浙江大学");
    changeInput(getInput(container, "城市"), "杭州市");
    changeInput(getInput(container, "新增省份"), "浙江省");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("新增学生"))!);

    expect(onAppendStudents).toHaveBeenCalledWith([
      expect.objectContaining({ name: "林舟舟", university: "浙江大学", city: "杭州市", province: "浙江省" }),
    ]);
  });

  it("auto-fills city and province from the university catalog when adding a student", () => {
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

    changeInput(container.querySelector<HTMLInputElement>('input[placeholder="林舟"]')!, "林舟舟");
    changeInput(getInput(container, "就读院校"), "浙江大学");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("新增学生"))!);

    expect(onAppendStudents).toHaveBeenCalledWith([
      expect.objectContaining({ name: "林舟舟", university: "浙江大学", city: "杭州市", province: "浙江省" }),
    ]);
  });

  it("auto-fills an empty city but keeps a manually typed city when adding a student", () => {
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

    changeInput(container.querySelector<HTMLInputElement>('input[placeholder="林舟"]')!, "林舟舟");
    changeInput(getInput(container, "就读院校"), "浙江大学");
    changeInput(getInput(container, "城市"), "宁波市");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("新增学生"))!);

    expect(onAppendStudents).toHaveBeenCalledWith([
      expect.objectContaining({ name: "林舟舟", university: "浙江大学", city: "宁波市", province: "浙江省" }),
    ]);
  });

  it("keeps an existing city but auto-fills an empty province when editing a university", () => {
    const onUpdateStudent = vi.fn();
    const container = render(
      <DataWorkspace
        students={students}
        onAppendStudents={vi.fn()}
        onReplaceStudents={vi.fn()}
        onUpdateStudent={onUpdateStudent}
        onToggleVisibility={vi.fn()}
        onDeleteStudent={vi.fn()}
        onSetStudentsVisibility={vi.fn()}
      />,
    );

    click(container.querySelector<HTMLButtonElement>('button[aria-label="编辑 林舟"]')!);
    changeInput(container.querySelector<HTMLInputElement>('input[aria-label="编辑就读院校"]')!, "浙江大学");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="保存 林舟"]')!);

    // 林舟已有城市"北京市"不被覆盖；省份为空则自动填充为浙江大学所在省份
    expect(onUpdateStudent).toHaveBeenCalledWith("student-1", expect.objectContaining({
      university: "浙江大学",
      city: "北京市",
      province: "浙江省",
    }));
  });

  it("clears an international location scope when an edited record is set to China", () => {
    const onUpdateStudent = vi.fn();
    const container = render(
      <DataWorkspace
        students={[{ ...students[0]!, locationScope: "international" }]}
        onAppendStudents={vi.fn()}
        onReplaceStudents={vi.fn()}
        onUpdateStudent={onUpdateStudent}
        onToggleVisibility={vi.fn()}
        onDeleteStudent={vi.fn()}
        onSetStudentsVisibility={vi.fn()}
      />,
    );

    click(container.querySelector<HTMLButtonElement>('button[aria-label="编辑 林舟"]')!);
    const locationScope = container.querySelector<HTMLSelectElement>('select[aria-label="编辑学生去向类型"]')!;
    flushSync(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      setter?.call(locationScope, "china");
      locationScope.dispatchEvent(new Event("change", { bubbles: true }));
    });
    click(container.querySelector<HTMLButtonElement>('button[aria-label="保存 林舟"]')!);

    expect(onUpdateStudent).toHaveBeenCalledWith("student-1", expect.objectContaining({ locationScope: undefined }));
  });

  it("edits a province inline from the roster with a custom province name", () => {
    const onUpdateStudent = vi.fn();
    const container = render(
      <DataWorkspace
        students={students}
        onAppendStudents={vi.fn()}
        onReplaceStudents={vi.fn()}
        onUpdateStudent={onUpdateStudent}
        onToggleVisibility={vi.fn()}
        onDeleteStudent={vi.fn()}
        onSetStudentsVisibility={vi.fn()}
      />,
    );

    // 默认显示解析出的省份
    expect(container.textContent).toContain("北京市");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="修改 林舟 省份"]')!);
    const input = container.querySelector<HTMLInputElement>('input[aria-label="编辑 林舟 的省份"]');
    expect(input).not.toBeNull();
    changeInput(input!, "火星省");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="保存 林舟 省份"]')!);

    expect(onUpdateStudent).toHaveBeenCalledWith("student-1", { province: "火星省" });
    expect(container.querySelector('input[aria-label="编辑 林舟 的省份"]')).toBeNull();
  });

  it("clears a province override by saving an empty inline draft", () => {
    const onUpdateStudent = vi.fn();
    const overrideStudents: Student[] = [{ ...students[0]!, province: "火星省" }];
    const container = render(
      <DataWorkspace
        students={overrideStudents}
        onAppendStudents={vi.fn()}
        onReplaceStudents={vi.fn()}
        onUpdateStudent={onUpdateStudent}
        onToggleVisibility={vi.fn()}
        onDeleteStudent={vi.fn()}
        onSetStudentsVisibility={vi.fn()}
      />,
    );

    click(container.querySelector<HTMLButtonElement>('button[aria-label="修改 林舟 省份"]')!);
    const input = container.querySelector<HTMLInputElement>('input[aria-label="编辑 林舟 的省份"]');
    expect(input?.value).toBe("火星省");
    changeInput(input!, "");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="保存 林舟 省份"]')!);

    expect(onUpdateStudent).toHaveBeenCalledWith("student-1", { province: undefined });
  });
});
