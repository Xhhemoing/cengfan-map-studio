import { type ReactElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataWorkspace } from "./DataWorkspace";
import type { Student } from "../lib/project-data";
import type { ParseDataResult } from "../lib/ai-client";
import { AI_PARSE_CONSENT_STORAGE_KEY } from "../lib/use-studio-preferences";

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

beforeEach(() => {
  // 默认扮演"已经同意过发送原文"的老用户，这样多数用例断言的仍是识别与导入本身；
  // 首次上送前的告知由 describe("智能识别上送告知") 里的用例单独覆盖。
  window.localStorage.setItem(AI_PARSE_CONSENT_STORAGE_KEY, "granted");
});

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  window.localStorage.clear();
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

  it("keeps the template download outside the collapsed import area of the compact roster", () => {
    const container = render(
      <DataWorkspace
        students={students}
        onAppendStudents={vi.fn()}
        onReplaceStudents={vi.fn()}
        onUpdateStudent={vi.fn()}
        onToggleVisibility={vi.fn()}
        onDeleteStudent={vi.fn()}
        onSetStudentsVisibility={vi.fn()}
        compactRosterControls
      />,
    );

    expect(container.querySelector('button[aria-label="展开导入名单"]')?.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.querySelector('button[aria-label="下载学生数据 XLSX 模板"]')).not.toBeNull();
  });

  it("expands the compact import area when the roster has no records yet", () => {
    const container = render(
      <DataWorkspace
        students={[]}
        onAppendStudents={vi.fn()}
        onReplaceStudents={vi.fn()}
        onUpdateStudent={vi.fn()}
        onToggleVisibility={vi.fn()}
        onDeleteStudent={vi.fn()}
        onSetStudentsVisibility={vi.fn()}
        compactRosterControls
      />,
    );

    expect(container.querySelector('button[aria-label="收起导入名单"]')?.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("textarea")).not.toBeNull();
    expect(container.querySelector('button[aria-label="下载学生数据 XLSX 模板"]')).not.toBeNull();
  });

  it("hides the template download when the host workspace already offers one", () => {
    const container = render(
      <DataWorkspace
        students={students}
        onAppendStudents={vi.fn()}
        onReplaceStudents={vi.fn()}
        onUpdateStudent={vi.fn()}
        onToggleVisibility={vi.fn()}
        onDeleteStudent={vi.fn()}
        onSetStudentsVisibility={vi.fn()}
        hideTemplateDownload
      />,
    );

    expect(container.querySelector('button[aria-label="下载学生数据 XLSX 模板"]')).toBeNull();
    expect(container.querySelector('button[aria-label="导出学生名单 XLSX"]')).not.toBeNull();
  });

  it("exports the roster as an XLSX built from the import template header", async () => {
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

    const exportButton = container.querySelector<HTMLButtonElement>('button[aria-label="导出学生名单 XLSX"]');
    expect(exportButton).not.toBeNull();
    click(exportButton!);
    await vi.waitFor(() => {
      flushSync(() => {});
      expect(container.textContent).toContain("已导出 1 条学生名单");
    });
  });

  it("refuses to export an empty roster", async () => {
    const container = render(
      <DataWorkspace
        students={[]}
        onAppendStudents={vi.fn()}
        onReplaceStudents={vi.fn()}
        onUpdateStudent={vi.fn()}
        onToggleVisibility={vi.fn()}
        onDeleteStudent={vi.fn()}
        onSetStudentsVisibility={vi.fn()}
      />,
    );

    click(container.querySelector<HTMLButtonElement>('button[aria-label="导出学生名单 XLSX"]')!);
    await vi.waitFor(() => {
      flushSync(() => {});
      expect(container.textContent).toContain("当前名单为空，没有可导出的学生数据");
    });
  });

  it("reports success and skip counts with per-row detail after applying a review", async () => {
    const onAppendStudents = vi.fn();
    const requestAiParse = vi.fn(async (): Promise<ParseDataResult> => ({
      provider: "local-fallback",
      candidates: [
        { name: "温言", university: "南京大学", city: "南京市", sourceLine: 1, rawLine: "温言 南京大学 南京市" },
        { name: "陆见川", university: "四川大学", city: "成都市", sourceLine: 2, rawLine: "陆见川 四川大学 成都市" },
        { name: "缺校同学", university: "", city: "西安市", sourceLine: 3, rawLine: "缺校同学 西安市" },
      ],
      unparsed: [{ sourceLine: 4, rawLine: "还没定", reason: "无法识别学生名称、录取院校和城市" }],
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

    changeInput(container.querySelector("textarea")!, "四行名单");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="智能识别名单"]')!);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    flushSync(() => {});

    const checkboxes = container.querySelectorAll<HTMLInputElement>(".review-row input[type=checkbox]");
    click(checkboxes[1]!);
    expect(checkboxes[1]!.checked).toBe(false);
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("追加导入"))!);

    expect(onAppendStudents).toHaveBeenCalledWith([expect.objectContaining({ name: "温言" })]);
    expect(container.textContent).toContain("成功 1 · 跳过 3");
    const outcome = container.querySelector<HTMLElement>(".import-outcome")!;
    expect(outcome.textContent).toContain("第 2 行");
    expect(outcome.textContent).toContain("陆见川 四川大学 成都市");
    expect(outcome.textContent).toContain("未勾选，未导入");
    expect(outcome.textContent).toContain("第 3 行");
    expect(outcome.textContent).toContain("录取院校不能为空");
    expect(outcome.textContent).toContain("第 4 行");
    expect(outcome.textContent).toContain("还没定");
    expect(outcome.textContent).toContain("无法识别学生名称、录取院校和城市");
  });

  it("keeps rejecting invalid candidates instead of importing them", async () => {
    const onAppendStudents = vi.fn();
    const requestAiParse = vi.fn(async (): Promise<ParseDataResult> => ({
      provider: "local-fallback",
      candidates: [{ name: "", university: "", city: "", sourceLine: 1, rawLine: "空行" }],
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

    changeInput(container.querySelector("textarea")!, "空行");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="智能识别名单"]')!);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    flushSync(() => {});
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("追加导入"))!);

    expect(onAppendStudents).not.toHaveBeenCalled();
    expect(container.textContent).toContain("成功 0 · 跳过 1");
    expect(container.querySelector(".import-outcome")?.textContent).toContain("学生名称不能为空");
  });

  it("reports skipped lines of a one-click import that falls back to local parsing", async () => {
    const onAppendStudents = vi.fn();
    const requestAiParse = vi.fn(async (): Promise<ParseDataResult> => {
      throw new Error("上游不可用");
    });
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

    changeInput(container.querySelector("textarea")!, "温言 南京大学 南京市\n陆见川 四川大学 成都市\n还没定");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("一键识别并导入"))!);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    flushSync(() => {});

    expect(onAppendStudents).toHaveBeenCalledWith([
      expect.objectContaining({ name: "温言" }),
      expect.objectContaining({ name: "陆见川" }),
    ]);
    expect(container.textContent).toContain("成功 2 · 跳过 1");
    const outcome = container.querySelector<HTMLElement>(".import-outcome")!;
    expect(outcome.textContent).toContain("第 3 行");
    expect(outcome.textContent).toContain("还没定");
    expect(outcome.textContent).toContain("无法识别学生名称、录取院校和城市");
  });

  it("lists unresolved-city warnings next to a successful import", async () => {
    const requestAiParse = vi.fn(async (): Promise<ParseDataResult> => ({
      provider: "local-fallback",
      candidates: [{ name: "沈砚", university: "火星学院", city: "自定义火星城", sourceLine: 1, rawLine: "沈砚 火星学院 自定义火星城" }],
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

    changeInput(container.querySelector("textarea")!, "沈砚 火星学院 自定义火星城");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="智能识别名单"]')!);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    flushSync(() => {});
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("追加导入"))!);

    const outcome = container.querySelector<HTMLElement>(".import-outcome")!;
    expect(outcome.textContent).toContain("成功 1 · 跳过 0");
    expect(outcome.textContent).toContain("没有被跳过的行");
    expect(outcome.textContent).toContain("无法定位城市：自定义火星城");
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

  it("shows the parsed province and destination scope on candidate rows without inventing missing ones", () => {
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

    changeInput(
      container.querySelector("textarea")!,
      "姓名,院校,城市,去向类型,省份\n苏禾,浙江大学,杭州,,江苏省\n周晴,哈佛大学,美国·波士顿,海外去向,\n林舟,北京大学,北京,,",
    );
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("识别文本"))!);

    const rows = container.querySelectorAll<HTMLElement>(".review-row");
    expect(rows).toHaveLength(3);
    // 省份错列(杭州被标成江苏省)要在导入前就看得见。
    expect(rows[0]!.textContent).toContain("浙江大学 · 杭州");
    expect(rows[0]!.querySelector(".review-row__scope")?.textContent).toBe("省份 江苏省");
    expect(rows[1]!.querySelector(".review-row__scope")?.textContent).toBe("海外去向");
    // 两列都没填的候选不补默认词,整行说明不渲染。
    expect(rows[2]!.querySelector(".review-row__scope")).toBeNull();
  });

  it("names every candidate checkbox so a screen reader can tell the rows apart", async () => {
    const onAppendStudents = vi.fn();
    const requestAiParse = vi.fn(async (): Promise<ParseDataResult> => ({
      provider: "local-fallback",
      candidates: [
        { name: "苏禾", university: "浙江大学", city: "杭州", sourceLine: 1, rawLine: "苏禾 浙江大学 杭州" },
        { name: "苏禾", university: "南京大学", city: "南京", sourceLine: 2, rawLine: "苏禾 南京大学 南京" },
        { name: "", university: "", city: "", sourceLine: 3, rawLine: "空行" },
      ],
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

    changeInput(container.querySelector("textarea")!, "候选名单");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="智能识别名单"]')!);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    flushSync(() => {});

    // 逐行的名字之外，整组也要有名字和条数，读屏才知道自己进的是哪张待确认表。
    const group = container.querySelector<HTMLElement>(".review-list")!;
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-label")).toBe("待确认导入 3 条");

    const checkboxes = Array.from(container.querySelectorAll<HTMLInputElement>(".review-row input[type=checkbox]"));
    // 同名候选靠源行号区分；姓名缺失的候选也要念得出来，不能只剩分隔符。
    expect(checkboxes.map((box) => box.getAttribute("aria-label"))).toEqual([
      "导入第 1 行 苏禾（浙江大学 · 杭州）",
      "导入第 2 行 苏禾（南京大学 · 南京）",
      "导入第 3 行 未识别姓名",
    ]);
    expect(checkboxes.every((box) => box.tabIndex === 0 && !box.disabled)).toBe(true);

    const second = container.querySelector<HTMLInputElement>('input[aria-label="导入第 2 行 苏禾（南京大学 · 南京）"]')!;
    click(second);
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("追加导入"))!);

    // 按名字点到的是第 2 行，同名的第 1 行不受影响。
    expect(onAppendStudents).toHaveBeenCalledWith([expect.objectContaining({ name: "苏禾", university: "浙江大学" })]);
  });

  it("uses AI parsing for one-click import of text the local rules cannot read", async () => {
    const onAppendStudents = vi.fn();
    const requestAiParse = vi.fn(async (): Promise<ParseDataResult> => ({
      provider: "local-fallback",
      candidates: [{ name: "智能同学", university: "北京大学", city: "北京", sourceLine: 1, rawLine: "智能同学去了北京大学" }],
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

    changeInput(container.querySelector("textarea")!, "智能同学去了北京大学");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("一键识别并导入"))!);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    flushSync(() => {});

    expect(requestAiParse).toHaveBeenCalledWith({ text: "智能同学去了北京大学", source: "paste" });
    expect(onAppendStudents).toHaveBeenCalledWith([expect.objectContaining({ name: "智能同学", city: "北京市" })]);
    expect(container.textContent).not.toContain("确认候选");
  });

  it("imports locally parseable text without calling AI parsing", async () => {
    const onAppendStudents = vi.fn();
    const requestAiParse = vi.fn(async (): Promise<ParseDataResult> => ({ provider: "local-fallback", candidates: [], unparsed: [] }));
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

    expect(requestAiParse).not.toHaveBeenCalled();
    expect(onAppendStudents).toHaveBeenCalledWith([expect.objectContaining({ name: "智能同学", city: "北京市" })]);
    expect(container.textContent).toContain("已从本地文本识别导入 1 条学生记录");
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

  it("upgrades OCR text parsing to AI with the ocr source when local rules leave unparsed lines", async () => {
    const requestAiParse = vi.fn(async (): Promise<ParseDataResult> => ({
      provider: "local-fallback",
      candidates: [
        { name: "温言", university: "南京大学", city: "南京市", sourceLine: 1, rawLine: "温言｜南京大学｜南京市" },
        { name: "还没定", university: "北京大学", city: "北京", sourceLine: 2, rawLine: "还没定" },
      ],
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

    changeInput(container.querySelector("textarea")!, "温言｜南京大学｜南京市\n还没定");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("识别 OCR 文本"))!);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    flushSync(() => {});

    expect(requestAiParse).toHaveBeenCalledWith({ text: "温言｜南京大学｜南京市\n还没定", source: "ocr" });
    expect(container.textContent).toContain("从OCR 智能识别（local-fallback）识别到 2 条候选");
  });

  it("keeps OCR text parsing local when the local rules read every line", async () => {
    const requestAiParse = vi.fn(async (): Promise<ParseDataResult> => ({ provider: "local-fallback", candidates: [], unparsed: [] }));
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

    changeInput(container.querySelector("textarea")!, "温言｜南京大学｜南京市");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("识别 OCR 文本"))!);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    flushSync(() => {});

    expect(requestAiParse).not.toHaveBeenCalled();
    expect(container.textContent).toContain("从OCR 文本识别到 1 条候选");
  });

  it("falls back to local OCR candidates when AI parsing is unavailable", async () => {
    const requestAiParse = vi.fn(async (): Promise<ParseDataResult> => {
      throw new Error("上游不可用");
    });
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

    changeInput(container.querySelector("textarea")!, "温言｜南京大学｜南京市\n还没定");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("识别 OCR 文本"))!);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    flushSync(() => {});

    expect(requestAiParse).toHaveBeenCalledWith({ text: "温言｜南京大学｜南京市\n还没定", source: "ocr" });
    expect(container.textContent).toContain("从OCR 文本识别到 1 条候选，另有 1 行未识别");
    expect(container.querySelector<HTMLButtonElement>('button[disabled]')).toBeNull();
  });

  it("drops the stale replacement summary once a later import lands", async () => {
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
        confirmReplace={() => false}
      />,
    );

    changeInput(container.querySelector("textarea")!, "候选名单");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="智能识别名单"]')!);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    flushSync(() => {});
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("替换全部"))!);
    expect(container.textContent).toContain("替换摘要：");

    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("追加导入"))!);

    expect(onAppendStudents).toHaveBeenCalledWith([expect.objectContaining({ name: "苏禾" })]);
    expect(container.textContent).not.toContain("替换摘要：");
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

describe("智能识别上送告知", () => {
  const partiallyParsable = "温言 南京大学 南京市\n还没定";

  function aiCandidates(): ParseDataResult {
    return {
      provider: "local-fallback",
      candidates: [
        { name: "温言", university: "南京大学", city: "南京市", sourceLine: 1, rawLine: "温言 南京大学 南京市" },
        { name: "还没定同学", university: "北京大学", city: "北京市", sourceLine: 2, rawLine: "还没定" },
      ],
      unparsed: [],
    };
  }

  function renderWorkspace(requestAiParse: (input: { text: string; source: "paste" | "ocr" }) => Promise<ParseDataResult>) {
    return render(
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
  }

  function findButton(container: HTMLDivElement, text: string): HTMLButtonElement {
    return Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes(text))!;
  }

  async function settle(): Promise<void> {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    flushSync(() => {});
  }

  it("explains the upload before the first automatic upgrade instead of sending silently", () => {
    window.localStorage.removeItem(AI_PARSE_CONSENT_STORAGE_KEY);
    const requestAiParse = vi.fn(async () => aiCandidates());
    const container = renderWorkspace(requestAiParse);

    changeInput(container.querySelector("textarea")!, partiallyParsable);
    click(findButton(container, "一键识别并导入"));

    const dialog = container.querySelector<HTMLElement>(".ai-consent")!;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(container.querySelector("#ai-parse-consent-title")?.textContent).toBe("发送到智能识别前请确认");
    expect(dialog.textContent).toContain("含学生姓名");
    expect(dialog.textContent).toContain("第三方 AI 服务");
    expect(dialog.textContent).toContain("仅用于解析成候选名单");
    // 告知还挂在屏幕上时，一个字都不该已经出境。
    expect(requestAiParse).not.toHaveBeenCalled();
  });

  it("keeps local candidates and lists unread lines when the upload is declined", async () => {
    window.localStorage.removeItem(AI_PARSE_CONSENT_STORAGE_KEY);
    const onAppendStudents = vi.fn();
    const requestAiParse = vi.fn(async () => aiCandidates());
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

    changeInput(container.querySelector("textarea")!, partiallyParsable);
    click(findButton(container, "一键识别并导入"));
    click(container.querySelector<HTMLButtonElement>('button[aria-label="仅用本地识别"]')!);
    await settle();

    expect(requestAiParse).not.toHaveBeenCalled();
    expect(container.querySelector(".ai-consent")).toBeNull();
    expect(onAppendStudents).toHaveBeenCalledWith([expect.objectContaining({ name: "温言" })]);
    expect(container.textContent).toContain("原文未发送");
    const outcome = container.querySelector<HTMLElement>(".import-outcome")!;
    expect(outcome.textContent).toContain("第 2 行");
    expect(outcome.textContent).toContain("还没定");
    expect(outcome.textContent).toContain("无法识别学生名称、录取院校和城市");
  });

  it("upgrades to AI parsing once the upload is accepted", async () => {
    window.localStorage.removeItem(AI_PARSE_CONSENT_STORAGE_KEY);
    const onAppendStudents = vi.fn();
    const requestAiParse = vi.fn(async () => aiCandidates());
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

    changeInput(container.querySelector("textarea")!, partiallyParsable);
    click(findButton(container, "一键识别并导入"));
    click(container.querySelector<HTMLButtonElement>('button[aria-label="同意并发送"]')!);
    await settle();

    expect(requestAiParse).toHaveBeenCalledWith({ text: partiallyParsable, source: "paste" });
    expect(onAppendStudents).toHaveBeenCalledWith([
      expect.objectContaining({ name: "温言" }),
      expect.objectContaining({ name: "还没定同学" }),
    ]);
    // 没勾"记住"就不该落盘，下次仍要再问一遍。
    expect(window.localStorage.getItem(AI_PARSE_CONSENT_STORAGE_KEY)).toBeNull();
  });

  it("stops asking on later imports once the choice is remembered", async () => {
    window.localStorage.removeItem(AI_PARSE_CONSENT_STORAGE_KEY);
    const requestAiParse = vi.fn(async () => aiCandidates());
    const first = renderWorkspace(requestAiParse);

    changeInput(first.querySelector("textarea")!, partiallyParsable);
    click(findButton(first, "一键识别并导入"));
    click(first.querySelector<HTMLInputElement>('input[aria-label="记住我的选择"]')!);
    click(first.querySelector<HTMLButtonElement>('button[aria-label="同意并发送"]')!);
    await settle();

    expect(window.localStorage.getItem(AI_PARSE_CONSENT_STORAGE_KEY)).toBe("granted");

    const later = renderWorkspace(requestAiParse);
    changeInput(later.querySelector("textarea")!, partiallyParsable);
    click(findButton(later, "一键识别并导入"));
    await settle();

    expect(later.querySelector(".ai-consent")).toBeNull();
    expect(requestAiParse).toHaveBeenCalledTimes(2);
  });

  it("honours a remembered refusal and still offers a way back to asking", async () => {
    window.localStorage.setItem(AI_PARSE_CONSENT_STORAGE_KEY, "denied");
    const requestAiParse = vi.fn(async () => aiCandidates());
    const container = renderWorkspace(requestAiParse);

    changeInput(container.querySelector("textarea")!, partiallyParsable);
    click(findButton(container, "一键识别并导入"));
    await settle();

    expect(container.querySelector(".ai-consent")).toBeNull();
    expect(requestAiParse).not.toHaveBeenCalled();
    expect(container.textContent).toContain("已记住「不发送原文」");

    click(container.querySelector<HTMLButtonElement>('button[aria-label="重新询问是否发送原文"]')!);
    expect(window.localStorage.getItem(AI_PARSE_CONSENT_STORAGE_KEY)).toBeNull();

    changeInput(container.querySelector("textarea")!, partiallyParsable);
    click(findButton(container, "一键识别并导入"));

    expect(container.querySelector(".ai-consent")).not.toBeNull();
  });

  it("gates the explicit AI parse button and falls back to local rules when declined", async () => {
    window.localStorage.removeItem(AI_PARSE_CONSENT_STORAGE_KEY);
    const requestAiParse = vi.fn(async () => aiCandidates());
    const container = renderWorkspace(requestAiParse);

    changeInput(container.querySelector("textarea")!, partiallyParsable);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="智能识别名单"]')!);
    expect(container.querySelector(".ai-consent")).not.toBeNull();

    click(container.querySelector<HTMLButtonElement>('button[aria-label="仅用本地识别"]')!);
    await settle();

    expect(requestAiParse).not.toHaveBeenCalled();
    expect(container.textContent).toContain("从本地文本识别（原文未发送）识别到 1 条候选，另有 1 行未识别");
    expect(container.querySelectorAll(".review-row")).toHaveLength(1);
  });

  it("gates the OCR upgrade with the same notice and keeps local OCR candidates when declined", async () => {
    window.localStorage.removeItem(AI_PARSE_CONSENT_STORAGE_KEY);
    const requestAiParse = vi.fn(async () => aiCandidates());
    const container = renderWorkspace(requestAiParse);

    changeInput(container.querySelector("textarea")!, "温言｜南京大学｜南京市\n还没定");
    click(findButton(container, "识别 OCR 文本"));
    expect(container.querySelector(".ai-consent")?.textContent).toContain("本地 OCR 规则");

    click(container.querySelector<HTMLButtonElement>('button[aria-label="仅用本地识别"]')!);
    await settle();

    expect(requestAiParse).not.toHaveBeenCalled();
    expect(container.textContent).toContain("从OCR 文本（原文未发送）识别到 1 条候选，另有 1 行未识别");
  });
});
