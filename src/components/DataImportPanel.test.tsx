import { type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataImportPanel } from "./DataImportPanel";
import type { Student } from "../lib/project-data";

const students: Student[] = [
  { id: "student-1", name: "林舟", university: "北京大学", city: "北京市", visibility: true },
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

function renderPanel(onMessage: (message: string) => void): HTMLDivElement {
  return render(
    <DataImportPanel
      students={students}
      onAppendStudents={vi.fn()}
      onReplaceStudents={vi.fn()}
      onMessage={onMessage}
    />,
  );
}

async function dropWorkbook(container: HTMLDivElement, sheets: Array<{ name: string; rows: string[][] }>): Promise<void> {
  const xlsx = await import("xlsx");
  const workbook = xlsx.utils.book_new();
  for (const sheet of sheets) {
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(sheet.rows), sheet.name);
  }
  const bytes = xlsx.write(workbook, { type: "array", bookType: "xlsx" });
  const file = new File([], "去向名单.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  Object.defineProperty(file, "arrayBuffer", { value: async () => bytes });
  const dropzone = container.querySelector<HTMLElement>("[data-file-dropzone]")!;
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { files: [file] } });
  flushSync(() => dropzone.dispatchEvent(event));
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  flushSync(() => {});
}

function lastMessage(onMessage: ReturnType<typeof vi.fn>): string {
  return String(onMessage.mock.calls.at(-1)?.[0] ?? "");
}

describe("DataImportPanel 工作表选择", () => {
  it("imports the roster on the second sheet and names the sheet it read", async () => {
    const onMessage = vi.fn();
    const container = renderPanel(onMessage);

    await dropWorkbook(container, [
      { name: "封面", rows: [["2026 届毕业生去向统计"], ["制表单位", "教务处"]] },
      {
        name: "去向名单",
        rows: [
          ["学生姓名", "录取院校", "城市"],
          ["苏禾", "浙江大学", "杭州市"],
          ["周晴", "哈佛大学", "波士顿"],
        ],
      },
    ]);

    const message = lastMessage(onMessage);
    expect(message).toContain("工作表「去向名单」");
    expect(message).toContain("识别到 2 条候选");
    expect(message).toContain("另有 1 张工作表未读取（封面）");
    expect(container.querySelector(".import-review")?.textContent).toContain("苏禾");
    expect(container.querySelector(".import-recognition")?.textContent).toContain("录取院校");
  });

  it("says nothing about skipped sheets for a single-sheet workbook", async () => {
    const onMessage = vi.fn();
    const container = renderPanel(onMessage);

    await dropWorkbook(container, [
      { name: "Sheet1", rows: [["学生姓名", "录取院校", "城市"], ["苏禾", "浙江大学", "杭州市"]] },
    ]);

    const message = lastMessage(onMessage);
    expect(message).toContain("工作表「Sheet1」");
    expect(message).not.toContain("未读取");
  });

  it("reads 学生数据 rather than 填写说明 on a template roundtrip", async () => {
    const onMessage = vi.fn();
    const container = renderPanel(onMessage);

    await dropWorkbook(container, [
      {
        name: "学生数据",
        rows: [
          ["学生姓名", "录取院校", "城市", "去向类型", "省份"],
          ["苏禾", "浙江大学", "杭州市", "中国去向", "浙江省"],
        ],
      },
      {
        name: "填写说明",
        rows: [["字段", "必填", "示例"], ["学生姓名", "是", "林舟"], ["城市", "是", "北京市"]],
      },
    ]);

    const message = lastMessage(onMessage);
    expect(message).toContain("工作表「学生数据」");
    expect(message).toContain("识别到 1 条候选");
    expect(message).toContain("另有 1 张工作表未读取（填写说明）");
    expect(container.querySelector(".import-review")?.textContent).toContain("苏禾");
  });

  it("still points at the unread sheets when the chosen sheet yields nothing", async () => {
    const onMessage = vi.fn();
    const container = renderPanel(onMessage);

    await dropWorkbook(container, [
      { name: "封面", rows: [["2026 届毕业生去向统计"]] },
      { name: "空名单", rows: [["学生姓名", "录取院校", "城市"]] },
    ]);

    const message = lastMessage(onMessage);
    expect(message).toContain("没有从Excel");
    expect(message).toContain("工作表「空名单」");
    expect(message).toContain("另有 1 张工作表未读取（封面）");
  });
});
