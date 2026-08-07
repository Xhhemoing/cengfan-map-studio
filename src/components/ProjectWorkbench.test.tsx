import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { ProjectWorkbench } from "./ProjectWorkbench";
import { createMemoryProjectStore, createSampleProject } from "../lib/project-store";
import { serializeProjectPackage } from "../lib/project-package";

let roots: Array<{ root: Root; container: HTMLElement }> = [];
function renderWorkbench(store: ReturnType<typeof createMemoryProjectStore>, navigate = vi.fn()) {
  const container = document.createElement("div");
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(<ProjectWorkbench store={store} navigate={navigate} />));
  return { container, navigate };
}

afterEach(() => {
  roots.forEach(({ root }) => root.unmount());
  roots = [];
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ProjectWorkbench", () => {
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

  it("renames a project via the card menu", async () => {
    const store = createMemoryProjectStore();
    await store.put(createSampleProject());
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('[aria-label="项目菜单"]')).not.toBeNull());
    container.querySelector<HTMLButtonElement>('[aria-label="项目菜单"]')?.click();
    await vi.waitFor(() => expect(container.textContent).toContain("重命名"));
    vi.stubGlobal("prompt", vi.fn(() => "高三3班"));
    Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("重命名"))?.click();
    await vi.waitFor(() => expect(container.textContent).toContain("高三3班"));
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
    await store.put(createSampleProject());
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('[aria-label="项目菜单"]')).not.toBeNull());
    container.querySelector<HTMLButtonElement>('[aria-label="项目菜单"]')?.click();
    await vi.waitFor(() => expect(container.textContent).toContain("复制"));
    Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("复制"))?.click();
    await vi.waitFor(async () => {
      const projects = await store.list();
      expect(projects.some((p) => p.name.includes("副本"))).toBe(true);
    });
  });

  it("imports a project package file", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    const file = new File([serializeProjectPackage(sample.pack)], "project.json", { type: "application/json" });
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('input[type="file"]')).not.toBeNull());
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    Object.defineProperty(input!, "files", { value: [file] as unknown as FileList, configurable: true });
    input!.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(async () => {
      const projects = await store.list();
      expect(projects).toHaveLength(2);
      expect(projects.some((p) => p.name === "project")).toBe(true);
    });
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

  it("shows an error banner for an invalid project package", async () => {
    const store = createMemoryProjectStore();
    await store.put(createSampleProject());
    const file = new File(["not-json"], "broken.json", { type: "application/json" });
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('input[type="file"]')).not.toBeNull());
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    Object.defineProperty(input!, "files", { value: [file] as unknown as FileList, configurable: true });
    input!.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(container.textContent).toContain("导入失败"));
    expect(container.querySelector(".workbench-error")?.textContent).toContain("导入失败");
    expect(await store.list()).toHaveLength(1);
  });

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
});
