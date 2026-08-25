// 从 src/components/ProjectWorkbench.test.tsx 原样搬出：工作台外壳皮肤、空库播种、
// 项目卡片列表与计数、打开与新建的导航。
// 共享挂载装置见 src/components/project-workbench-test-harness.tsx。
import { describe, expect, it, vi } from "vitest";
import { createMemoryProjectStore, createSampleProject } from "../lib/project-store";
import { installProjectWorkbenchTestHarness, renderWorkbench } from "./project-workbench-test-harness";

installProjectWorkbenchTestHarness();

describe("ProjectWorkbench listing", () => {
  it("applies the saved atelier skin tokens on the workbench shell", async () => {
    window.localStorage.setItem("cengfan-map-studio:ui-skin", "atelier");
    const store = createMemoryProjectStore();
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector(".workbench-shell")).not.toBeNull());
    const shell = container.querySelector(".workbench-shell")!;
    expect(shell.classList.contains("app-shell")).toBe(true);
    expect(shell.getAttribute("data-editor-skin")).toBe("atelier");
    expect(shell.getAttribute("data-editor-theme")).toMatch(/^(light|dark)$/);
  });

  it("seeds the sample project when the store is empty", async () => {
    const store = createMemoryProjectStore();
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.textContent).toContain("示例：2026届毕业去向"));
    expect(await store.list()).toHaveLength(1);
  });

  it("renders existing projects as cards", async () => {
    const store = createMemoryProjectStore();
    await store.put(createSampleProject());
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.textContent).toContain("示例：2026届毕业去向"));
  });

  it("renders card counts from the list metadata without fetching packs", async () => {
    const store = createMemoryProjectStore();
    await store.put(createSampleProject());
    const getSpy = vi.spyOn(store, "get");
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector(".workbench-card-count")).not.toBeNull());
    expect(container.querySelector(".workbench-card-count")?.textContent).toBe("12");
    expect(getSpy).not.toHaveBeenCalled();
  });

  it("navigates to the editor when a card is opened", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    const navigate = vi.fn();
    const { container } = renderWorkbench(store, navigate);
    await vi.waitFor(() => expect(container.querySelector('[aria-label^="打开项目"]')).not.toBeNull());
    container.querySelector<HTMLButtonElement>('[aria-label^="打开项目"]')?.click();
    expect(navigate).toHaveBeenCalledWith(`#/project/${sample.id}`);
  });

  it("creates a new empty project and navigates to it", async () => {
    const store = createMemoryProjectStore();
    const navigate = vi.fn();
    const { container } = renderWorkbench(store, navigate);
    await vi.waitFor(() => expect(container.querySelector('[aria-label="新建项目"]')).not.toBeNull());
    container.querySelector<HTMLButtonElement>('[aria-label="新建项目"]')?.click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());
    const projects = await store.list();
    expect(projects.some((p) => p.pack.project.students.length === 0)).toBe(true);
  });
});
