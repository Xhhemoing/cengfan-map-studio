// 从 src/components/ProjectWorkbench.test.tsx 原样搬出：卡片菜单上的重命名、删除、复制，
// 以及取消删除 / 取消重命名后项目保持原样。
// 共享挂载装置见 src/components/project-workbench-test-harness.tsx。
import { describe, expect, it, vi } from "vitest";
import { createMemoryProjectStore, createSampleProject } from "../lib/project-store";
import { PROJECT_PACKAGE_FILE_ACCEPT } from "../lib/project-package";
import { fileMatchesAccept } from "../lib/file-accept";
import {
  installProjectWorkbenchTestHarness,
  renderWorkbench,
  stubDownloads,
} from "./project-workbench-test-harness";

installProjectWorkbenchTestHarness();

describe("ProjectWorkbench card menu actions", () => {
  it("renames a project via the card menu", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    const getSpy = vi.spyOn(store, "get");
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('[aria-label="项目菜单"]')).not.toBeNull());
    container.querySelector<HTMLButtonElement>('[aria-label="项目菜单"]')?.click();
    await vi.waitFor(() => expect(container.textContent).toContain("重命名"));
    vi.stubGlobal("prompt", vi.fn(() => "高三3班"));
    Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("重命名"))?.click();
    await vi.waitFor(() => expect(container.textContent).toContain("高三3班"));
    expect(getSpy).toHaveBeenCalledWith(sample.id);
    expect((await store.get(sample.id))?.pack.project.students).toHaveLength(12);
  });

  it("deletes a project after confirmation", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('[aria-label="项目菜单"]')).not.toBeNull());
    container.querySelector<HTMLButtonElement>('[aria-label="项目菜单"]')?.click();
    await vi.waitFor(() => expect(container.textContent).toContain("删除"));
    vi.stubGlobal("confirm", vi.fn(() => true));
    Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("删除"))?.click();
    await vi.waitFor(async () => expect((await store.list())).toHaveLength(0));
  });

  it("duplicates a project", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    const getSpy = vi.spyOn(store, "get");
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('[aria-label="项目菜单"]')).not.toBeNull());
    container.querySelector<HTMLButtonElement>('[aria-label="项目菜单"]')?.click();
    await vi.waitFor(() => expect(container.textContent).toContain("复制"));
    Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("复制"))?.click();
    await vi.waitFor(async () => {
      const projects = await store.list();
      expect(projects.some((p) => p.name.includes("副本"))).toBe(true);
    });
    expect(getSpy).toHaveBeenCalledWith(sample.id);
  });

  it("keeps a project when deletion is cancelled", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('[aria-label="项目菜单"]')).not.toBeNull());
    container.querySelector<HTMLButtonElement>('[aria-label="项目菜单"]')?.click();
    await vi.waitFor(() => expect(container.textContent).toContain("删除"));
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("删除"))?.click();
    await vi.waitFor(() => expect(confirm).toHaveBeenCalled());
    const projects = await store.list();
    expect(projects).toHaveLength(1);
    expect(projects[0].id).toBe(sample.id);
  });

  it("keeps the name when rename is cancelled", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('[aria-label="项目菜单"]')).not.toBeNull());
    container.querySelector<HTMLButtonElement>('[aria-label="项目菜单"]')?.click();
    await vi.waitFor(() => expect(container.textContent).toContain("重命名"));
    const prompt = vi.fn(() => null);
    vi.stubGlobal("prompt", prompt);
    Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("重命名"))?.click();
    await vi.waitFor(() => expect(prompt).toHaveBeenCalled());
    const projects = await store.list();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe(sample.name);
  });

  it("exports a project package named after the project and its update day", async () => {
    const store = createMemoryProjectStore();
    // 斜杠是 Windows/macOS 都拒收的路径分隔符,文件名必须先洗掉再落盘。
    await store.put({ ...createSampleProject(), name: "高三3班/毕业", updatedAt: "2026-08-24T09:30:00.000Z" });
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('[aria-label="项目菜单"]')).not.toBeNull());
    container.querySelector<HTMLButtonElement>('[aria-label="项目菜单"]')?.click();
    await vi.waitFor(() => expect(container.textContent).toContain("导出工程包"));
    const files = stubDownloads();

    Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("导出工程包"))?.click();

    await vi.waitFor(() => expect(files).toEqual(["高三3班毕业-工程包-2026-08-24.json"]));
    expect(fileMatchesAccept(new File(["{}"], files[0]!), PROJECT_PACKAGE_FILE_ACCEPT)).toBe(true);
  });

  it("falls back to the default base name when the project name is blank", async () => {
    const store = createMemoryProjectStore();
    await store.put({ ...createSampleProject(), name: "   ", updatedAt: "2026-08-24T09:30:00.000Z" });
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('[aria-label="项目菜单"]')).not.toBeNull());
    container.querySelector<HTMLButtonElement>('[aria-label="项目菜单"]')?.click();
    await vi.waitFor(() => expect(container.textContent).toContain("导出工程包"));
    const files = stubDownloads();

    Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("导出工程包"))?.click();

    await vi.waitFor(() => expect(files).toEqual(["我的毕业去向图-工程包-2026-08-24.json"]));
    expect(fileMatchesAccept(new File(["{}"], files[0]!), PROJECT_PACKAGE_FILE_ACCEPT)).toBe(true);
  });
});
