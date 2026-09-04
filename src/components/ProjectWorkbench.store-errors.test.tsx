// 从 src/components/ProjectWorkbench.test.tsx 原样搬出：store 写入失败时的横幅——播种失败
// 与重挂载重试、新建失败，以及新建 / 复制失败时的类型化配额文案。
// 共享挂载装置见 src/components/project-workbench-test-harness.tsx。
import { describe, expect, it, vi } from "vitest";
import { createMemoryProjectStore, createSampleProject, ProjectStoreError } from "../lib/project-store";
import {
  installProjectWorkbenchTestHarness,
  QUOTA_MESSAGE,
  renderWorkbench,
} from "./project-workbench-test-harness";

installProjectWorkbenchTestHarness();

describe("ProjectWorkbench store write failures", () => {
  it("shows an error banner when the store write fails during creation", async () => {
    const store = createMemoryProjectStore();
    const failingStore = { ...store, put: () => Promise.reject(new Error("配额不足")) };
    const { container } = renderWorkbench(failingStore);
    // 种子 IIFE 写入失败 → 横幅出现;错误存在时空态文案不显示
    await vi.waitFor(() => expect(container.querySelector(".workbench-error")?.textContent).toContain("初始化项目失败"));
    expect(container.querySelector(".workbench-empty")).toBeNull();
    expect(container.textContent).not.toContain("还没有项目");
    // 新建项目写入失败 → 横幅切换为创建失败
    container.querySelector<HTMLButtonElement>('[aria-label="新建项目"]')?.click();
    await vi.waitFor(() => expect(container.querySelector(".workbench-error")?.textContent).toContain("创建项目失败"));
    expect(container.querySelector(".workbench-error")?.textContent).toContain("配额不足");
  });

  it("retries seeding after a failed seed", async () => {
    const store = createMemoryProjectStore();
    const putSpy = vi.spyOn(store, "put").mockRejectedValueOnce(new Error("quota"));
    const first = renderWorkbench(store);
    // 首次播种失败 → 错误横幅,store 仍为空
    await vi.waitFor(() => expect(first.container.querySelector(".workbench-error")?.textContent).toContain("初始化项目失败"));
    expect(await store.list()).toHaveLength(0);

    putSpy.mockRestore();
    // 重新进入工作台(重新挂载)自动重试播种
    const second = renderWorkbench(store);
    await vi.waitFor(() => expect(second.container.textContent).toContain("示例：2026届毕业去向"));
    expect(await store.list()).toHaveLength(1);
  });

  it("shows the typed quota message instead of a generic creation wrapper", async () => {
    const store = createMemoryProjectStore();
    await store.put(createSampleProject());
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('[aria-label="新建项目"]')).not.toBeNull());
    vi.spyOn(store, "put").mockRejectedValue(new ProjectStoreError("quota-exceeded", QUOTA_MESSAGE));

    container.querySelector<HTMLButtonElement>('[aria-label="新建项目"]')?.click();

    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toBe(QUOTA_MESSAGE));
    expect(container.querySelector('[role="alert"]')?.textContent).not.toContain("创建项目失败");
  });

  it("does not seed a sample project when listing the library fails", async () => {
    const store = createMemoryProjectStore();
    const putSpy = vi.spyOn(store, "put");
    vi.spyOn(store, "list").mockRejectedValue(new ProjectStoreError("read-aborted", "IndexedDB 读取中止"));
    const { container } = renderWorkbench(store);

    await vi.waitFor(() => expect(container.querySelector(".workbench-error")?.textContent).toContain("IndexedDB 读取中止"));
    expect(putSpy).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("还没有项目");
  });

  it("shows the typed quota message when duplicating a project fails", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('[aria-label="项目菜单"]')).not.toBeNull());
    container.querySelector<HTMLButtonElement>('[aria-label="项目菜单"]')?.click();
    await vi.waitFor(() => expect(container.textContent).toContain("复制"));
    vi.spyOn(store, "put").mockRejectedValue(new ProjectStoreError("quota-exceeded", QUOTA_MESSAGE));

    Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("复制"))?.click();

    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toBe(QUOTA_MESSAGE));
  });
});
