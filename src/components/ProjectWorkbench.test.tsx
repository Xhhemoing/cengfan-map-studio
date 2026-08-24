import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { ProjectWorkbench } from "./ProjectWorkbench";
import {
  createIndexedDbProjectStore,
  createMemoryProjectStore,
  createSampleProject,
  ProjectStoreError,
  type ProjectStore,
  type ProjectStoreHealth,
} from "../lib/project-store";
import { serializeProjectPackage } from "../lib/project-package";

let roots: Array<{ root: Root; container: HTMLElement }> = [];
function renderWorkbench(store: ProjectStore, navigate = vi.fn(), health?: ProjectStoreHealth) {
  const container = document.createElement("div");
  const root = createRoot(container);
  roots.push({ root, container });
  const render = (nextHealth = health) => {
    flushSync(() => root.render(<ProjectWorkbench store={store} navigate={navigate} health={nextHealth} />));
  };
  render();
  return { container, navigate, rerender: render };
}

/** 每次 open 都异步失败的 factory：模拟隐私模式 / 数据库损坏,store 因此降级到内存。 */
function failingFactory(): IDBFactory {
  return {
    cmp: () => 0,
    databases: async () => [],
    deleteDatabase: () => { throw new Error("不支持删除"); },
    open: () => {
      const request = {
        result: undefined,
        error: new DOMException("模拟打开失败", "UnknownError"),
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        onupgradeneeded: null,
        onblocked: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      };
      queueMicrotask(() => request.onerror?.(new Event("error")));
      return request as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;
}

function storageNotice(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-store-health="memory"]');
}

afterEach(() => {
  roots.forEach(({ root }) => root.unmount());
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

  it("rejects an oversized package by File.size without reading its text", async () => {
    const store = createMemoryProjectStore();
    await store.put(createSampleProject());
    const file = new File(["{}"], "huge.json", { type: "application/json" });
    Object.defineProperty(file, "size", { value: 256 * 1024 * 1024, configurable: true });
    const readSpy = vi.spyOn(file, "text");
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('input[type="file"]')).not.toBeNull());
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    Object.defineProperty(input!, "files", { value: [file] as unknown as FileList, configurable: true });
    input!.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(container.querySelector(".workbench-error")?.textContent).toContain("工程包过大"));
    expect(container.querySelector(".workbench-error")?.textContent).toContain("128.0 MB");
    expect(readSpy).not.toHaveBeenCalled();
    expect(await store.list()).toHaveLength(1);
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

const QUOTA_MESSAGE = "本机存储空间不足，请清理浏览器数据或删除不再需要的项目后重试。";

let restoreDownloads: (() => void) | null = null;

/** jsdom 没有 object URL，补一层记录用的实现;下载用的 <a> 也要拦掉,真正点击会触发未实现的导航。 */
function stubDownloads() {
  const target = URL as unknown as Record<string, unknown>;
  const original = { create: target.createObjectURL, revoke: target.revokeObjectURL };
  const files: string[] = [];
  target.createObjectURL = () => "blob:mock";
  target.revokeObjectURL = () => undefined;
  const link = document.createElementNS("http://www.w3.org/1999/xhtml", "a") as HTMLAnchorElement;
  link.click = () => { files.push(link.download); };
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(
    (tag: string) => (tag === "a" ? link : createElement(tag)) as HTMLElement,
  );
  restoreDownloads = () => {
    target.createObjectURL = original.create;
    target.revokeObjectURL = original.revoke;
  };
  return files;
}

afterEach(() => {
  restoreDownloads?.();
  restoreDownloads = null;
});

describe("ProjectWorkbench degraded storage", () => {
  it("keeps listing and creating projects while warning that nothing is persisted", async () => {
    const store = createIndexedDbProjectStore(failingFactory(), { openRetries: 0, retryDelayMs: 0 });
    const navigate = vi.fn();
    const { container } = renderWorkbench(store, navigate);

    await vi.waitFor(() => expect(container.textContent).toContain("示例：2026届毕业去向"));
    await vi.waitFor(() => expect(storageNotice(container)).not.toBeNull());
    expect(storageNotice(container)?.textContent).toContain("本次编辑不会保存到本机，请及时导出工程备份");
    expect(store.health).toBe("memory");

    container.querySelector<HTMLButtonElement>('[aria-label="新建项目"]')?.click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(await store.list()).toHaveLength(2);
  });

  it("warns from the mount-time store health even without a health prop", async () => {
    const store = createMemoryProjectStore();
    await store.put(createSampleProject());
    const { container } = renderWorkbench(store);

    await vi.waitFor(() => expect(storageNotice(container)).not.toBeNull());
    // 提示不可关闭:内存模式期间没有任何关闭控件。
    expect(storageNotice(container)?.querySelector('[aria-label^="关闭"]')).toBeNull();
  });

  it("hides the notice when health flips back to persistent without remounting the store", async () => {
    const store = createMemoryProjectStore();
    await store.put(createSampleProject());
    const { container, rerender } = renderWorkbench(store, vi.fn(), "memory");
    await vi.waitFor(() => expect(storageNotice(container)).not.toBeNull());

    rerender("persistent");

    expect(storageNotice(container)).toBeNull();
    expect(container.textContent).not.toContain("本次编辑不会保存到本机");
  });

  it("re-reads the project list once storage recovers from memory mode", async () => {
    const store = createMemoryProjectStore();
    await store.put(createSampleProject());
    const { container, rerender } = renderWorkbench(store, vi.fn(), "memory");
    await vi.waitFor(() => expect(storageNotice(container)).not.toBeNull());
    // 内存期之后落到持久层的内容:界面此时还看不到它。
    const recovered = createSampleProject();
    await store.put({ ...recovered, name: "恢复后的项目", updatedAt: "2026-08-24T09:00:00.000Z" });
    const listSpy = vi.spyOn(store, "list");

    rerender("persistent");

    await vi.waitFor(() => expect(listSpy).toHaveBeenCalled());
    // 不能等到用户下一次增删改才纠正:恢复本身就要重新读一次列表。
    await vi.waitFor(() => expect(container.textContent).toContain("恢复后的项目"));
  });

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

    await vi.waitFor(() => expect(files).toEqual(["备份项目-2026-08-24.json"]));
    // 一次手势只落一个文件。
    await Promise.resolve();
    expect(files).toEqual(["备份项目-2026-08-24.json"]);

    notice.querySelector<HTMLButtonElement>('button[aria-label="导出「第二个项目」"]')?.click();
    await vi.waitFor(() => expect(files).toEqual(["备份项目-2026-08-24.json", "第二个项目-2026-08-23.json"]));
  });

  it("keeps the notice inert: no clickable-card classes on a status banner", async () => {
    const store = createMemoryProjectStore();
    await store.put(createSampleProject());
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(storageNotice(container)).not.toBeNull());

    const notice = storageNotice(container)!;
    expect(notice.classList.contains("workbench-storage-notice")).toBe(true);
    // .workbench-resume 带 hover 高亮与 :active { transform: scale(.985) },警告横幅不该有按钮动效。
    expect(notice.classList.contains("workbench-resume")).toBe(false);
    expect(notice.querySelector(".workbench-resume-icon")).toBeNull();
    expect(notice.querySelector(".workbench-resume-body")).toBeNull();
    expect(notice.querySelector(".workbench-resume-cta")).toBeNull();
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

  it("shows the typed store message when importing a package fails", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    const file = new File([serializeProjectPackage(sample.pack)], "导入.cengfan", { type: "application/json" });
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('input[type="file"]')).not.toBeNull());
    vi.spyOn(store, "put").mockRejectedValue(new ProjectStoreError("quota-exceeded", QUOTA_MESSAGE));
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    Object.defineProperty(input!, "files", { value: [file] as unknown as FileList, configurable: true });

    input!.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toBe(QUOTA_MESSAGE));
  });
});
