import { type ReactElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataWorkspace } from "./DataWorkspace";
import type { Student } from "../lib/project-data";
import type { ParseDataResult } from "../lib/ai-client";

const students: Student[] = [
  {
    id: "student-1",
    name: "林舟",
    university: "北京大学",
    city: "北京市",
    visibility: true,
  },
];

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

function render(element: ReactElement): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(element));
  return container;
}

function click(element: Element): void {
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function changeInput(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  flushSync(() => {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function getInput(container: HTMLDivElement, label: string): HTMLInputElement {
  return container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
}

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

describe("DataWorkspace", () => {
  it("offers a canonical XLSX template download action", async () => {
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

    const download = container.querySelector<HTMLButtonElement>('button[aria-label="下载学生数据 XLSX 模板"]');
    expect(download).not.toBeNull();
    click(download!);
    await vi.waitFor(() => {
      flushSync(() => {});
      expect(container.textContent).toContain("已下载学生数据导入模板");
    });

    expect(container.textContent).toContain("已下载学生数据导入模板");
  });

  it("shows Excel header mappings and representative values before review", async () => {
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
    const xlsx = await import("xlsx");
    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.aoa_to_sheet([
      ["说明"],
      ["所在城市", "录取学校", "学生姓名", "备注"],
      ["杭州市", "浙江大学", "苏禾", "保研"],
    ]);
    xlsx.utils.book_append_sheet(workbook, sheet, "学生数据");
    const workbookBytes = xlsx.write(workbook, { type: "array", bookType: "xlsx" });
    const file = new File([], "students.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    Object.defineProperty(file, "arrayBuffer", { value: async () => workbookBytes });
    const dropzone = container.querySelector<HTMLElement>("[data-file-dropzone]")!;
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: { files: [file] } });
    flushSync(() => dropzone.dispatchEvent(event));
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    flushSync(() => {});

    expect(container.querySelector(".import-recognition")?.textContent).toContain("学生姓名");
    expect(container.querySelector(".import-recognition")?.textContent).toContain("苏禾");
    expect(container.querySelector(".import-recognition")?.textContent).toContain("录取学校");
    expect(container.querySelector(".import-recognition")?.textContent).toContain("未使用");
  });

  it("clears stale Excel recognition after one-click text import", async () => {
    const requestAiParse = vi.fn(async (): Promise<ParseDataResult> => ({
      provider: "local-fallback",
      candidates: [{ name: "智能同学", university: "北京大学", city: "北京", sourceLine: 1, rawLine: "智能同学 北京大学 北京" }],
      unparsed: [],
    }));
    const container = render(
      <DataWorkspace
        students={students}
        onAppendStudents={vi.fn()}
        onReplaceStudents={vi.fn()}
        onUpdateStudent={vi.fn()}
        onToggleVisibility={vi.fn()}
        onDeleteStudent={vi.fn()}
        onSetStudentsVisibility={vi.fn()}
        requestAiParse={requestAiParse}
      />,
    );
    const xlsx = await import("xlsx");
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(
      workbook,
      xlsx.utils.aoa_to_sheet([
        ["学生姓名", "录取院校", "城市"],
        ["苏禾", "浙江大学", "杭州市"],
      ]),
      "学生数据",
    );
    const workbookBytes = xlsx.write(workbook, { type: "array", bookType: "xlsx" });
    const file = new File([], "students.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    Object.defineProperty(file, "arrayBuffer", { value: async () => workbookBytes });
    const dropzone = container.querySelector<HTMLElement>("[data-file-dropzone]")!;
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, "dataTransfer", { value: { files: [file] } });
    flushSync(() => dropzone.dispatchEvent(dropEvent));
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    flushSync(() => {});
    expect(container.querySelector(".import-recognition")).not.toBeNull();

    changeInput(container.querySelector("textarea")!, "智能同学 北京大学 北京");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("一键识别并导入"))!);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    flushSync(() => {});

    expect(container.querySelector(".import-recognition")).toBeNull();
  });

  it("clears stale Excel recognition when a later workbook fails to load", async () => {
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
    const xlsx = await import("xlsx");
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(
      workbook,
      xlsx.utils.aoa_to_sheet([
        ["学生姓名", "录取院校", "城市"],
        ["苏禾", "浙江大学", "杭州市"],
      ]),
      "学生数据",
    );
    const workbookBytes = xlsx.write(workbook, { type: "array", bookType: "xlsx" });
    const validFile = new File([], "students.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    Object.defineProperty(validFile, "arrayBuffer", { value: async () => workbookBytes });
    const dropzone = container.querySelector<HTMLElement>("[data-file-dropzone]")!;
    const validDropEvent = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(validDropEvent, "dataTransfer", { value: { files: [validFile] } });
    flushSync(() => dropzone.dispatchEvent(validDropEvent));
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    flushSync(() => {});
    expect(container.querySelector(".import-recognition")).not.toBeNull();

    const brokenFile = new File([], "broken.xlsx");
    Object.defineProperty(brokenFile, "arrayBuffer", { value: async () => { throw new Error("读取失败"); } });
    const brokenDropEvent = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(brokenDropEvent, "dataTransfer", { value: { files: [brokenFile] } });
    flushSync(() => dropzone.dispatchEvent(brokenDropEvent));
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    flushSync(() => {});

    expect(container.querySelector(".import-recognition")).toBeNull();
  });

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

  it("shows candidate counts and keeps replacement cancellable", async () => {
    const onReplaceStudents = vi.fn();
    const confirmReplace = vi.fn(() => false);
    const requestAiParse = vi.fn(async (): Promise<ParseDataResult> => ({
      provider: "local-fallback",
      candidates: [
        { name: "苏禾", university: "浙江大学", city: "杭州", sourceLine: 1, rawLine: "苏禾 浙江大学 杭州" },
        { name: " 苏禾 ", university: "浙江大学", city: " 杭州 ", sourceLine: 2, rawLine: "苏禾 浙江大学 杭州" },
      ],
      unparsed: [{ sourceLine: 3, rawLine: "无法识别", reason: "测试" }],
    }));
    const container = render(
      <DataWorkspace
        students={students}
        onAppendStudents={vi.fn()}
        onReplaceStudents={onReplaceStudents}
        onUpdateStudent={vi.fn()}
        onToggleVisibility={vi.fn()}
        onDeleteStudent={vi.fn()}
        onSetStudentsVisibility={vi.fn()}
        requestAiParse={requestAiParse}
        confirmReplace={confirmReplace}
      />,
    );

    changeInput(container.querySelector("textarea")!, "候选名单");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="智能识别名单"]')!);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    flushSync(() => {});

    expect(container.textContent).toContain("有效 2");
    expect(container.textContent).toContain("未识别 1");
    expect(container.textContent).toContain("重复 2");
    expect(container.textContent).toContain("缺失字段 0");

    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("替换全部"))!);

    expect(confirmReplace).toHaveBeenCalledWith({ currentCount: 1, nextCount: 2 });
    expect(container.textContent).toContain("当前 1 条");
    expect(container.textContent).toContain("新 2 条");
    expect(onReplaceStudents).not.toHaveBeenCalled();
  });

  it("does not call a project transaction when Excel parsing fails", async () => {
    const onAppendStudents = vi.fn();
    const onReplaceStudents = vi.fn();
    const container = render(
      <DataWorkspace
        students={students}
        onAppendStudents={onAppendStudents}
        onReplaceStudents={onReplaceStudents}
        onUpdateStudent={vi.fn()}
        onToggleVisibility={vi.fn()}
        onDeleteStudent={vi.fn()}
        onSetStudentsVisibility={vi.fn()}
      />,
    );
    const file = new File([], "broken.xlsx");
    Object.defineProperty(file, "arrayBuffer", { value: async () => { throw new Error("读取失败"); } });
    const dropzone = container.querySelector<HTMLElement>("[data-file-dropzone]")!;
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: { files: [file] } });
    flushSync(() => dropzone.dispatchEvent(event));
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    flushSync(() => {});

    expect(container.textContent).toContain("读取失败");
    expect(onAppendStudents).not.toHaveBeenCalled();
    expect(onReplaceStudents).not.toHaveBeenCalled();
  });

  it("turns AI-parsed records into the same review flow that can apply to the project", async () => {
    const onAppendStudents = vi.fn();
    const requestAiParse = vi.fn(async (): Promise<ParseDataResult> => ({
      provider: "local-fallback",
      candidates: [{ name: "苏禾", university: "浙江大学", city: "杭州", sourceLine: 1, rawLine: "苏禾 浙江大学 杭州" }],
      unparsed: [],
    }));
    const container = render(
      <DataWorkspace
        students={students}
        onAppendStudents={onAppendStudents}
        onReplaceStudents={vi.fn()}
        onUpdateStudent={vi.fn()}
        onToggleVisibility={vi.fn()}
        onDeleteStudent={vi.fn()}
        onSetStudentsVisibility={vi.fn()}
        requestAiParse={requestAiParse}
      />,
    );

    changeInput(container.querySelector("textarea")!, "苏禾 浙江大学 杭州");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="智能识别名单"]')!);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    flushSync(() => {});
    expect(container.textContent).toContain("确认候选");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("追加导入"))!);
    expect(onAppendStudents).toHaveBeenCalledWith([expect.objectContaining({ name: "苏禾", city: "杭州市" })]);
  });

  it("uses AI parsing for one-click import and does not leave a duplicate import action behind", async () => {
    const onAppendStudents = vi.fn();
    const requestAiParse = vi.fn(async (): Promise<ParseDataResult> => ({
      provider: "local-fallback",
      candidates: [{ name: "智能同学", university: "北京大学", city: "北京", sourceLine: 1, rawLine: "智能同学 北京大学 北京" }],
      unparsed: [],
    }));
    const container = render(
      <DataWorkspace
        students={students}
        onAppendStudents={onAppendStudents}
        onReplaceStudents={vi.fn()}
        onUpdateStudent={vi.fn()}
        onToggleVisibility={vi.fn()}
        onDeleteStudent={vi.fn()}
        onSetStudentsVisibility={vi.fn()}
        requestAiParse={requestAiParse}
      />,
    );

    changeInput(container.querySelector("textarea")!, "智能同学 北京大学 北京");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("一键识别并导入"))!);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    flushSync(() => {});

    expect(requestAiParse).toHaveBeenCalledWith({ text: "智能同学 北京大学 北京", source: "paste" });
    expect(onAppendStudents).toHaveBeenCalledWith([expect.objectContaining({ name: "智能同学", city: "北京市" })]);
    expect(container.textContent).not.toContain("确认候选");
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

  it("keeps pasted OCR text parsing available without advertising image OCR", () => {
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

    expect(container.textContent).toContain("识别 OCR 文本");
    expect(container.textContent).not.toContain("选择名单图片");
  });

  it("appends accepted candidates without replacing the existing records", async () => {
    const onAppendStudents = vi.fn();
    const requestAiParse = vi.fn(async (): Promise<ParseDataResult> => ({
      provider: "local-fallback",
      candidates: [{ name: "追加同学", university: "浙江大学", city: "杭州", sourceLine: 1, rawLine: "追加同学 浙江大学 杭州" }],
      unparsed: [],
    }));
    const container = render(
      <DataWorkspace
        students={students}
        onAppendStudents={onAppendStudents}
        onReplaceStudents={vi.fn()}
        onUpdateStudent={vi.fn()}
        onToggleVisibility={vi.fn()}
        onDeleteStudent={vi.fn()}
        onSetStudentsVisibility={vi.fn()}
        requestAiParse={requestAiParse}
      />,
    );
    changeInput(container.querySelector("textarea")!, "追加同学 浙江大学 杭州");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="智能识别名单"]')!);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    flushSync(() => {});
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("追加导入"))!);

    expect(onAppendStudents).toHaveBeenCalledWith([expect.objectContaining({ name: "追加同学" })]);
  });

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
