// 从 src/components/DataWorkspace.test.tsx 原样搬出：导入前的识别与候选评审——
// 模板下载、Excel 表头识别、AI/本地文本识别与追加/替换确认。
// 共享挂载/交互装置见 src/components/data-workspace-test-harness.tsx。
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { DataWorkspace } from "./DataWorkspace";
import type { ParseDataResult } from "../lib/ai-client";
import {
  installDataWorkspaceTestHarness,
  render,
  click,
  changeInput,
  grantAiUpload,
  students,
} from "./data-workspace-test-harness";

installDataWorkspaceTestHarness();

describe("DataWorkspace import recognition", () => {
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
    grantAiUpload(container);
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
    grantAiUpload(container);
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
    grantAiUpload(container);
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
    expect(requestAiParse).not.toHaveBeenCalled();
    grantAiUpload(container);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    flushSync(() => {});

    expect(requestAiParse).toHaveBeenCalledWith({ text: "智能同学 北京大学 北京", source: "paste" });
    expect(onAppendStudents).toHaveBeenCalledWith([expect.objectContaining({ name: "智能同学", city: "北京市" })]);
    expect(container.textContent).not.toContain("确认候选");
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
    grantAiUpload(container);
    await vi.waitFor(() => {
      expect(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("追加导入"))).toBeDefined();
    });
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("追加导入"))!);

    expect(onAppendStudents).toHaveBeenCalledWith([expect.objectContaining({ name: "追加同学" })]);
  });
});
