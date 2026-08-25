// 从 src/components/ProjectWorkbench.test.tsx 原样搬出：降级期的备份出口——横幅里逐个项目
// 导出、新建项目同步进入导出列表，以及导出失败落在横幅内 / 卡片菜单失败落在通用错误区。
// 共享挂载装置见 src/components/project-workbench-test-harness.tsx。
import { describe, expect, it, vi } from "vitest";
import { createMemoryProjectStore, createSampleProject } from "../lib/project-store";
import {
  installProjectWorkbenchTestHarness,
  renderWorkbench,
  storageNotice,
  stubDownloads,
} from "./project-workbench-test-harness";

installProjectWorkbenchTestHarness();

describe("ProjectWorkbench degraded storage backup export", () => {
  it("exports one project per click from the notice instead of a batch of downloads", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put({ ...sample, name: "备份项目", updatedAt: "2026-08-24T02:00:00.000Z" });
    await store.put({ ...createSampleProject(), name: "第二个项目", updatedAt: "2026-08-23T02:00:00.000Z" });
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.textContent).toContain("第二个项目"));
    const files = stubDownloads();
    const notice = storageNotice(container)!;

    const exportButtons = notice.querySelectorAll<HTMLButtonElement>("button[data-export-project-id]");
    expect(exportButtons).toHaveLength(2);
    // 批量下载会被 Chromium 拦掉第 2 份起的文件,提示里不应再有"一键导出全部"。
    expect(notice.querySelector('button[aria-label="导出工程备份"]')).toBeNull();
    expect(exportButtons[0].getAttribute("aria-label")).toBe("导出「备份项目」");
    exportButtons[0].click();

    await vi.waitFor(() => expect(files).toEqual(["备份项目-工程包-2026-08-24.json"]));
    // 一次手势只落一个文件。
    await Promise.resolve();
    expect(files).toEqual(["备份项目-工程包-2026-08-24.json"]);

    notice.querySelector<HTMLButtonElement>('button[aria-label="导出「第二个项目」"]')?.click();
    await vi.waitFor(() => expect(files).toEqual(["备份项目-工程包-2026-08-24.json", "第二个项目-工程包-2026-08-23.json"]));
  });

  it("lists a just-created project among the notice export actions while the workbench stays mounted", async () => {
    const store = createMemoryProjectStore();
    await store.put({ ...createSampleProject(), name: "已有项目", updatedAt: "2026-08-24T02:00:00.000Z" });
    // 注入 navigate 就不会真的跳走:R6-7 的崩溃返回不再整页重载,"工作台留在原地"是常态。
    const navigate = vi.fn();
    const { container } = renderWorkbench(store, navigate);
    await vi.waitFor(() => expect(
      storageNotice(container)?.querySelectorAll("button[data-export-project-id]"),
    ).toHaveLength(1));

    container.querySelector<HTMLButtonElement>('[aria-label="新建项目"]')?.click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());

    const stored = await store.list();
    expect(stored).toHaveLength(2);
    // 横幅是内存期唯一的备份出口:漏掉一个项目就等于这份数据没有导出入口。
    await vi.waitFor(() => {
      const exported = Array.from(storageNotice(container)!.querySelectorAll("button[data-export-project-id]"))
        .map((button) => button.getAttribute("data-export-project-id"));
      expect([...exported].sort()).toEqual(stored.map((project) => project.id).sort());
    });
  });

  it("keeps a failed notice export inside the notice the user just clicked", async () => {
    const store = createMemoryProjectStore();
    await store.put({ ...createSampleProject(), name: "备份项目", updatedAt: "2026-08-24T02:00:00.000Z" });
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(storageNotice(container)?.querySelector("button[data-export-project-id]")).not.toBeNull());
    stubDownloads({ message: "磁盘已满" });

    storageNotice(container)!.querySelector<HTMLButtonElement>("button[data-export-project-id]")!.click();

    // 降级期唯一的备份出口就是这条横幅,失败落在别处等于按钮点了没反应。
    await vi.waitFor(() => expect(storageNotice(container)?.querySelector('[role="alert"]')).not.toBeNull());
    const alert = storageNotice(container)!.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain("导出项目失败");
    expect(alert.textContent).toContain("磁盘已满");
    expect(container.querySelector(".workbench-error")).toBeNull();
  });

  it("clears the notice export failure once the next export succeeds", async () => {
    const store = createMemoryProjectStore();
    await store.put({ ...createSampleProject(), name: "备份项目", updatedAt: "2026-08-24T02:00:00.000Z" });
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(storageNotice(container)?.querySelector("button[data-export-project-id]")).not.toBeNull());
    const failure = { message: "磁盘已满" };
    const files = stubDownloads(failure);
    const exportButton = () => storageNotice(container)!.querySelector<HTMLButtonElement>("button[data-export-project-id]")!;

    exportButton().click();
    await vi.waitFor(() => expect(storageNotice(container)?.querySelector('[role="alert"]')).not.toBeNull());

    failure.message = "";
    exportButton().click();

    // 一次手势一份文件,重试成功后横幅不能继续挂着上一次的失败。
    await vi.waitFor(() => expect(files).toEqual(["备份项目-工程包-2026-08-24.json"]));
    expect(storageNotice(container)?.querySelector('[role="alert"]')).toBeNull();
  });

  it("keeps a failed card-menu export in the generic error section", async () => {
    const store = createMemoryProjectStore();
    await store.put({ ...createSampleProject(), name: "备份项目", updatedAt: "2026-08-24T02:00:00.000Z" });
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('[aria-label="项目菜单"]')).not.toBeNull());
    container.querySelector<HTMLButtonElement>('[aria-label="项目菜单"]')?.click();
    await vi.waitFor(() => expect(container.textContent).toContain("导出工程包"));
    stubDownloads({ message: "磁盘已满" });

    Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("导出工程包"))?.click();

    await vi.waitFor(() => expect(container.querySelector(".workbench-error")?.textContent).toContain("导出项目失败"));
    expect(storageNotice(container)?.querySelector('[role="alert"]')).toBeNull();
  });
});
