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

async function dropFile(container: HTMLDivElement, file: File, bytes: ArrayBufferLike | ArrayBufferView): Promise<void> {
  Object.defineProperty(file, "arrayBuffer", { value: async () => bytes });
  const dropzone = container.querySelector<HTMLElement>("[data-file-dropzone]")!;
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { files: [file] } });
  flushSync(() => dropzone.dispatchEvent(event));
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  flushSync(() => {});
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
  await dropFile(container, file, bytes);
}

async function dropCsv(container: HTMLDivElement, bytes: Uint8Array, name = "去向名单.csv"): Promise<void> {
  await dropFile(container, new File([], name, { type: "text/csv" }), bytes);
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

/** 「学生姓名,录取院校,城市\n苏禾,浙江大学,杭州市\n周晴,哈佛大学,波士顿\n」的 GBK 字节。 */
const GBK_ROSTER_CSV = new Uint8Array([
  0xd1, 0xa7, 0xc9, 0xfa, 0xd0, 0xd5, 0xc3, 0xfb, 0x2c, 0xc2, 0xbc, 0xc8, 0xa1, 0xd4, 0xba, 0xd0,
  0xa3, 0x2c, 0xb3, 0xc7, 0xca, 0xd0, 0x0a, 0xcb, 0xd5, 0xba, 0xcc, 0x2c, 0xd5, 0xe3, 0xbd, 0xad,
  0xb4, 0xf3, 0xd1, 0xa7, 0x2c, 0xba, 0xbc, 0xd6, 0xdd, 0xca, 0xd0, 0x0a, 0xd6, 0xdc, 0xc7, 0xe7,
  0x2c, 0xb9, 0xfe, 0xb7, 0xf0, 0xb4, 0xf3, 0xd1, 0xa7, 0x2c, 0xb2, 0xa8, 0xca, 0xbf, 0xb6, 0xd9,
  0x0a,
]);

describe("DataImportPanel CSV 编码", () => {
  it("reads a GBK CSV without turning the headers into mojibake", async () => {
    const onMessage = vi.fn();
    const container = renderPanel(onMessage);

    await dropCsv(container, GBK_ROSTER_CSV);

    const message = lastMessage(onMessage);
    expect(message).toContain("识别到 2 条候选");
    expect(message).toContain("按 GB18030 解码");
    const review = container.querySelector(".import-review")?.textContent ?? "";
    expect(review).toContain("苏禾");
    expect(review).toContain("浙江大学");
    expect(container.querySelector(".import-recognition")?.textContent).toContain("录取院校");
  });

  it("keeps a UTF-8 CSV on the UTF-8 path", async () => {
    const onMessage = vi.fn();
    const container = renderPanel(onMessage);
    const utf8 = new TextEncoder().encode("学生姓名,录取院校,城市\n林舟,北京大学,北京市\n");

    await dropCsv(container, utf8);

    const message = lastMessage(onMessage);
    expect(message).toContain("识别到 1 条候选");
    expect(message).not.toContain("GB18030");
    expect(message).not.toContain("工作表");
    expect(container.querySelector(".import-review")?.textContent).toContain("林舟");
  });
});
