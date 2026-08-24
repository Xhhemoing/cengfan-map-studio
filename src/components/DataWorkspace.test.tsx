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
    await vi.waitFor(() => {
      expect(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("追加导入"))).toBeDefined();
    });
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

/** 校验过的 GBK 双字节：中文版 Excel/WPS 另存 CSV 就是这套编码。 */
const GBK_BYTES: Record<string, [number, number]> = {
  姓: [0xd0, 0xd5], 名: [0xc3, 0xfb], 院: [0xd4, 0xba], 校: [0xd0, 0xa3],
  城: [0xb3, 0xc7], 市: [0xca, 0xd0], 林: [0xc1, 0xd6], 舟: [0xd6, 0xdb],
  北: [0xb1, 0xb1], 京: [0xbe, 0xa9], 大: [0xb4, 0xf3], 学: [0xd1, 0xa7],
  苏: [0xcb, 0xd5], 禾: [0xba, 0xcc], 浙: [0xd5, 0xe3], 江: [0xbd, 0xad],
  杭: [0xba, 0xbc], 州: [0xd6, 0xdd],
};

function encodeGbk(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const character of text) {
    if (character.codePointAt(0)! < 0x80) {
      bytes.push(character.codePointAt(0)!);
      continue;
    }
    const pair = GBK_BYTES[character];
    if (!pair) throw new Error(`测试用 GBK 表缺少字符：${character}`);
    bytes.push(pair[0], pair[1]);
  }
  return new Uint8Array(bytes);
}

function fileWithBytes(name: string, bytes: () => Promise<ArrayBufferLike>): File {
  const file = new File([], name);
  Object.defineProperty(file, "arrayBuffer", { value: bytes });
  return file;
}

function dropFile(container: HTMLDivElement, file: File): void {
  const dropzone = container.querySelector<HTMLElement>("[data-file-dropzone]")!;
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { files: [file] } });
  flushSync(() => dropzone.dispatchEvent(event));
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  flushSync(() => {});
}

function renderWorkspace(overrides: Partial<Parameters<typeof DataWorkspace>[0]> = {}): HTMLDivElement {
  return render(
    <DataWorkspace
      students={students}
      onAppendStudents={vi.fn()}
      onReplaceStudents={vi.fn()}
      onUpdateStudent={vi.fn()}
      onToggleVisibility={vi.fn()}
      onDeleteStudent={vi.fn()}
      onSetStudentsVisibility={vi.fn()}
      {...overrides}
    />,
  );
}

async function workbookBytes(sheets: Array<{ name: string; rows: unknown[][] }>): Promise<ArrayBufferLike> {
  const xlsx = await import("xlsx");
  const workbook = xlsx.utils.book_new();
  for (const sheet of sheets) {
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(sheet.rows), sheet.name);
  }
  return xlsx.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBufferLike;
}

describe("DataWorkspace import fidelity", () => {
  it("reports every dropped row with its sheet line and reason instead of skipping silently", async () => {
    const container = renderWorkspace();
    dropFile(container, fileWithBytes("roster.xlsx", () => workbookBytes([{
      name: "学生数据",
      rows: [
        ["学生姓名", "录取院校", "城市"],
        ["林舟", "北京大学", "北京市"],
        ["苏禾", "浙江大学", "杭州市"],
        ["陈宁", "清华大学", "北京市"],
        ["周晴", "复旦大学", "上海市"],
        ["何越", "南京大学", "南京市"],
        ["缺城市", "武汉大学", ""],
        ["", "四川大学", "成都市"],
        ["缺院校", "", "广州市"],
      ],
    }])));
    await settle();

    expect(container.textContent).toContain("识别到 5 条候选");
    expect(container.textContent).toContain("另有 3 行未识别");
    const dropped = container.querySelector<HTMLElement>(".import-unparsed")!;
    expect(dropped.textContent).toContain("3 行被跳过");
    expect(dropped.textContent).toContain("第 7 行");
    expect(dropped.textContent).toContain("缺少必填字段：城市");
    expect(dropped.textContent).toContain("第 8 行");
    expect(dropped.textContent).toContain("缺少必填字段：学生姓名");
    expect(dropped.textContent).toContain("第 9 行");
    expect(dropped.textContent).toContain("缺少必填字段：录取院校");
  });

  it("keeps the skipped-row count visible in the import outcome", async () => {
    const onAppendStudents = vi.fn();
    const container = renderWorkspace({ onAppendStudents });
    dropFile(container, fileWithBytes("roster.xlsx", () => workbookBytes([{
      name: "学生数据",
      rows: [
        ["学生姓名", "录取院校", "城市"],
        ["林舟", "北京大学", "北京市"],
        ["缺城市", "武汉大学", ""],
      ],
    }])));
    await settle();

    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("追加导入"))!);

    expect(onAppendStudents).toHaveBeenCalledWith([expect.objectContaining({ name: "林舟" })]);
    expect(container.textContent).toContain("已追加 1 条学生数据，跳过 1 行");
    expect(container.querySelector(".import-unparsed")).toBeNull();
  });

  it("finds the roster on the second sheet when a cover sheet comes first", async () => {
    const container = renderWorkspace();
    dropFile(container, fileWithBytes("毕业去向.xlsx", () => workbookBytes([
      { name: "封面", rows: [["2026 届毕业生去向"], ["制表单位", "教务处"]] },
      {
        name: "名单",
        rows: [
          ["学生姓名", "录取院校", "城市"],
          ["苏禾", "浙江大学", "杭州市"],
          ["陈宁", "清华大学", "北京市"],
        ],
      },
    ])));
    await settle();

    expect(container.textContent).toContain("工作表「名单」");
    expect(container.textContent).toContain("识别到 2 条候选");
    expect(container.textContent).toContain("另有 1 张工作表未读取（封面）");
    expect(container.querySelector(".import-review")?.textContent).toContain("苏禾");
  });

  it("reads a GB18030 encoded CSV instead of importing mojibake", async () => {
    const container = renderWorkspace();
    const csv = "姓名,院校,城市\n林舟,北京大学,北京市\n苏禾,浙江大学,杭州市\n";
    dropFile(container, fileWithBytes("名单.csv", async () => encodeGbk(csv).buffer as ArrayBuffer));
    await settle();

    expect(container.textContent).toContain("按 GB18030 解码");
    expect(container.textContent).toContain("识别到 2 条候选");
    const review = container.querySelector(".import-review")!;
    expect(review.textContent).toContain("林舟");
    expect(review.textContent).toContain("北京大学");
    expect(review.textContent).toContain("杭州市");
    expect(container.textContent).not.toContain("\uFFFD");
  });

  it("keeps a UTF-8 CSV on the UTF-8 path", async () => {
    const container = renderWorkspace();
    const csv = "姓名,院校,城市\n林舟,北京大学,北京市\n";
    dropFile(container, fileWithBytes("roster.csv", async () => new TextEncoder().encode(csv).buffer as ArrayBuffer));
    await settle();

    expect(container.textContent).toContain("识别到 1 条候选");
    expect(container.textContent).not.toContain("按 GB18030 解码");
  });

  it("publishes only the latest file when a slower earlier pick resolves last", async () => {
    const container = renderWorkspace();
    let releaseSlow!: () => void;
    const slowBytes = await workbookBytes([{
      name: "学生数据",
      rows: [["学生姓名", "录取院校", "城市"], ["慢同学", "北京大学", "北京市"]],
    }]);
    const slowFile = fileWithBytes("slow.xlsx", () => new Promise<ArrayBufferLike>((resolve) => {
      releaseSlow = () => resolve(slowBytes);
    }));
    const fastFile = fileWithBytes("fast.xlsx", () => workbookBytes([{
      name: "学生数据",
      rows: [["学生姓名", "录取院校", "城市"], ["快同学", "浙江大学", "杭州市"]],
    }]));

    dropFile(container, slowFile);
    dropFile(container, fastFile);
    await settle();
    expect(container.textContent).toContain("快同学");

    releaseSlow();
    await settle();
    await settle();

    expect(container.textContent).toContain("快同学");
    expect(container.textContent).not.toContain("慢同学");
    expect(container.textContent).toContain("fast.xlsx");
  });

  it("keeps the newest failure message when an earlier pick fails after it", async () => {
    const container = renderWorkspace();
    let failSlow!: () => void;
    const slowFile = fileWithBytes("slow.xlsx", () => new Promise<ArrayBufferLike>((_resolve, reject) => {
      failSlow = () => reject(new Error("慢文件读取失败"));
    }));
    const fastFile = fileWithBytes("fast.xlsx", () => workbookBytes([{
      name: "学生数据",
      rows: [["学生姓名", "录取院校", "城市"], ["快同学", "浙江大学", "杭州市"]],
    }]));

    dropFile(container, slowFile);
    dropFile(container, fastFile);
    await settle();
    failSlow();
    await settle();
    await settle();

    expect(container.textContent).not.toContain("慢文件读取失败");
    expect(container.textContent).toContain("快同学");
  });

  it("does not let a slow AI parse overwrite a newer local text recognition", async () => {
    let releaseAi!: () => void;
    const requestAiParse = vi.fn(() => new Promise<ParseDataResult>((resolve) => {
      releaseAi = () => resolve({
        provider: "local-fallback",
        candidates: [{ name: "智能同学", university: "北京大学", city: "北京", sourceLine: 1, rawLine: "智能同学 北京大学 北京" }],
        unparsed: [],
      });
    }));
    const container = renderWorkspace({ requestAiParse });

    changeInput(container.querySelector("textarea")!, "智能同学 北京大学 北京");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="智能识别名单"]')!);
    changeInput(container.querySelector("textarea")!, "本地同学 浙江大学 杭州");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("识别文本"))!);
    expect(container.textContent).toContain("本地同学");

    releaseAi();
    await settle();

    expect(container.textContent).toContain("本地同学");
    expect(container.textContent).not.toContain("智能同学");
  });

  it("surfaces a CSV read failure without publishing candidates", async () => {
    const onAppendStudents = vi.fn();
    const container = renderWorkspace({ onAppendStudents });
    dropFile(container, fileWithBytes("broken.csv", async () => { throw new Error("读取失败"); }));
    await settle();

    expect(container.textContent).toContain("读取失败");
    expect(container.querySelector(".import-review")).toBeNull();
    expect(onAppendStudents).not.toHaveBeenCalled();
  });
});
