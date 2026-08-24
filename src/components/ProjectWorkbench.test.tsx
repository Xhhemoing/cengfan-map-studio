import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { ProjectWorkbench } from "./ProjectWorkbench";
import { createMemoryProjectStore, createSampleProject } from "../lib/project-store";
import { serializeProjectPackage } from "../lib/project-package";

let roots: Array<{ root: Root; container: HTMLElement }> = [];
function renderWorkbench(store: ReturnType<typeof createMemoryProjectStore>, navigate = vi.fn()) {
  const container = document.createElement("div");
  // 菜单的外点关闭与焦点管理依赖真实文档树，容器必须挂到 body 上。
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(<ProjectWorkbench store={store} navigate={navigate} />));
  return { container, navigate };
}

afterEach(() => {
  roots.forEach(({ root, container }) => {
    root.unmount();
    container.remove();
  });
  roots = [];
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ProjectWorkbench", () => {
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

  it("imports a cengfan sample package and keeps the display name", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    const file = new File([serializeProjectPackage(sample.pack)], "示例项目.cengfan", { type: "application/json" });
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('input[type="file"]')).not.toBeNull());
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input?.accept).toContain(".cengfan");
    Object.defineProperty(input!, "files", { value: [file] as unknown as FileList, configurable: true });
    input!.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(async () => {
      const projects = await store.list();
      expect(projects).toHaveLength(2);
      expect(projects.some((p) => p.name === "示例项目")).toBe(true);
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

  describe("卡片菜单的键盘与焦点行为", () => {
    async function openCardMenu() {
      const store = createMemoryProjectStore();
      await store.put(createSampleProject());
      const { container } = renderWorkbench(store);
      await vi.waitFor(() => expect(container.querySelector('[aria-label="项目菜单"]')).not.toBeNull());
      const trigger = container.querySelector<HTMLButtonElement>('[aria-label="项目菜单"]')!;
      trigger.click();
      await vi.waitFor(() => expect(container.querySelector('[role="menu"]')).not.toBeNull());
      const menu = container.querySelector<HTMLElement>('[role="menu"]')!;
      const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
      return { container, trigger, menu, items };
    }

    function pressKey(target: HTMLElement, key: string) {
      target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    }

    it("exposes menu semantics on the trigger button", async () => {
      const { trigger, menu } = await openCardMenu();
      expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      expect(trigger.getAttribute("aria-controls")).toBe(menu.id);
      expect(menu.id).not.toBe("");
      expect(menu.getAttribute("aria-labelledby")).toBe(trigger.id);
    });

    it("moves focus into the menu when it opens", async () => {
      const { items } = await openCardMenu();
      expect(items).toHaveLength(4);
      expect(document.activeElement).toBe(items[0]);
      expect(items[0].tabIndex).toBe(0);
      expect(items[1].tabIndex).toBe(-1);
    });

    it("cycles focus across menu items with the arrow keys", async () => {
      const { menu, items } = await openCardMenu();
      pressKey(document.activeElement as HTMLElement, "ArrowDown");
      expect(document.activeElement).toBe(items[1]);
      pressKey(document.activeElement as HTMLElement, "ArrowUp");
      expect(document.activeElement).toBe(items[0]);
      // 首项再往上应回环到末项
      pressKey(document.activeElement as HTMLElement, "ArrowUp");
      expect(document.activeElement).toBe(items[items.length - 1]);
      // 末项再往下应回环到首项
      pressKey(document.activeElement as HTMLElement, "ArrowDown");
      expect(document.activeElement).toBe(items[0]);
      pressKey(menu, "End");
      expect(document.activeElement).toBe(items[items.length - 1]);
      pressKey(menu, "Home");
      expect(document.activeElement).toBe(items[0]);
    });

    it("closes on Escape and returns focus to the trigger", async () => {
      const { container, trigger } = await openCardMenu();
      pressKey(document.activeElement as HTMLElement, "Escape");
      await vi.waitFor(() => expect(container.querySelector('[role="menu"]')).toBeNull());
      expect(document.activeElement).toBe(trigger);
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
    });

    it("closes when clicking outside the menu", async () => {
      const { container, trigger } = await openCardMenu();
      container.querySelector<HTMLElement>(".workbench-grid")!.click();
      await vi.waitFor(() => expect(container.querySelector('[role="menu"]')).toBeNull());
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
    });

    it("keeps the menu open while interacting inside it", async () => {
      const { container, menu } = await openCardMenu();
      menu.click();
      await Promise.resolve();
      expect(container.querySelector('[role="menu"]')).not.toBeNull();
    });
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
