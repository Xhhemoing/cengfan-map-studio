// 从 src/components/DataWorkspace.test.tsx 原样搬出：导入保真——体积闸门、工作簿
// Worker 复用/超时、编码识别、乱序落地与失败上报。
// 共享挂载/交互装置见 src/components/data-workspace-test-harness.tsx。
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ParseDataResult } from "../lib/ai-client";
import {
  installDataWorkspaceTestHarness,
  click,
  changeInput,
  dropFile,
  encodeGbk,
  fileWithBytes,
  renderWorkspace,
  settle,
  workbookBytes,
  globalWithWorker,
  FakeWorkbookWorker,
  DeferredWorkbookWorker,
} from "./data-workspace-test-harness";

installDataWorkspaceTestHarness();

describe("DataWorkspace import fidelity", () => {
  it("rejects an oversized workbook before reading any bytes", async () => {
    const read = vi.fn(async () => new ArrayBuffer(0));
    const file = new File([], "oversized.xlsx");
    Object.defineProperty(file, "size", { value: 26 * 1024 * 1024 });
    Object.defineProperty(file, "arrayBuffer", { value: read });
    const container = renderWorkspace();

    dropFile(container, file);
    await settle();

    expect(container.textContent).toContain("最大支持 25 MB");
    expect(read).not.toHaveBeenCalled();
    expect(FakeWorkbookWorker.instances).toHaveLength(0);
  });

  it("reuses one worker for repeat imports and tears it down after the idle window", async () => {
    vi.useFakeTimers();
    const container = renderWorkspace();
    const firstBytes = new TextEncoder().encode("姓名,院校,城市\n第一位,北京大学,北京市\n").buffer;
    const secondBytes = new TextEncoder().encode("姓名,院校,城市\n第二位,浙江大学,杭州市\n").buffer;

    dropFile(container, fileWithBytes("first.csv", async () => firstBytes));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector(".import-review")?.textContent).toContain("第一位");

    dropFile(container, fileWithBytes("second.csv", async () => secondBytes));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(FakeWorkbookWorker.instances).toHaveLength(1);
    const worker = FakeWorkbookWorker.instances[0]!;
    expect(worker.messages).toHaveLength(2);
    expect(worker.transfers).toEqual([[firstBytes], [secondBytes]]);
    expect(container.querySelector(".import-review")?.textContent).toContain("第二位");

    await vi.advanceTimersByTimeAsync(29_999);
    expect(worker.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(worker.terminated).toBe(true);
  });

  it("times out a wedged worker and creates a fresh worker for the next import", async () => {
    vi.useFakeTimers();
    globalWithWorker.Worker = DeferredWorkbookWorker;
    const container = renderWorkspace();

    dropFile(
      container,
      fileWithBytes("wedged.csv", async () =>
        new TextEncoder().encode("姓名,院校,城市\n卡住同学,北京大学,北京市\n").buffer),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(DeferredWorkbookWorker.instances).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(DeferredWorkbookWorker.instances[0]?.terminated).toBe(true);
    expect(container.textContent).toContain("解析超时，文件可能已损坏");

    globalWithWorker.Worker = FakeWorkbookWorker;
    dropFile(
      container,
      fileWithBytes("recovered.csv", async () =>
        new TextEncoder().encode("姓名,院校,城市\n恢复同学,浙江大学,杭州市\n").buffer),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(FakeWorkbookWorker.instances).toHaveLength(1);
    expect(container.querySelector(".import-review")?.textContent).toContain("恢复同学");
  });

  it("keeps main-thread task chunks moving while a 10k-row workbook waits in the worker", async () => {
    const rows = [
      ["学生姓名", "录取院校", "城市"],
      ...Array.from({ length: 10_000 }, (_, index) => [`学生${index}`, "浙江大学", "杭州市"]),
    ];
    const bytes = await workbookBytes([{ name: "学生数据", rows }]) as ArrayBuffer;
    globalWithWorker.Worker = DeferredWorkbookWorker;
    const container = renderWorkspace();

    const startedAt = performance.now();
    dropFile(container, fileWithBytes("10k.xlsx", async () => bytes));
    const dispatchBlockingMs = performance.now() - startedAt;
    await Promise.resolve();
    await Promise.resolve();

    const worker = DeferredWorkbookWorker.instances[0]!;
    expect(worker.messages).toHaveLength(1);
    expect(worker.messages[0]?.buffer.byteLength).toBe(bytes.byteLength);
    expect(worker.transfers[0]).toEqual([bytes]);
    // Untouched baseline median was 107.36 ms; posting to the worker must clear the ≥5% gate.
    expect(dispatchBlockingMs).toBeLessThan(107.36 * 0.95);

    let taskChunks = 0;
    await new Promise<void>((resolve) => window.setTimeout(() => {
      taskChunks += 1;
      resolve();
    }, 0));
    expect(taskChunks).toBe(1);
    expect(container.querySelector(".import-review")).toBeNull();

    worker.emit({
      type: "result",
      requestId: worker.messages[0]!.requestId,
      encoding: null,
      parsed: {
        candidates: [{
          name: "完成同学",
          university: "浙江大学",
          city: "杭州市",
          sourceLine: 2,
          rawLine: "完成同学\t浙江大学\t杭州市",
        }],
        unparsed: [],
        headerRowIndex: 0,
        columnMappings: [],
        unmappedHeaders: [],
        missingRequiredFields: [],
        sheetName: "学生数据",
        skippedSheetNames: [],
      },
    });
    await settle();

    expect(container.querySelector(".import-review")?.textContent).toContain("完成同学");
  });

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
