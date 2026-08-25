import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { ProjectRoute, WorkbenchRoute } from "./StudioRoutes";
import type { ProjectStoreHealthChannel } from "../lib/editor-project-store";
import {
  createMemoryProjectStore,
  createSampleProject,
  ProjectStoreError,
  type ProjectStoreHealth,
} from "../lib/project-store";

const QUOTA_MESSAGE = "本机存储空间不足，请清理浏览器数据或删除不再需要的项目后重试。";

// 编辑器画布本身不在测试范围内,只关心降级提示是否包在它外面。
vi.mock("../App", () => ({
  App: ({ projectId }: { projectId: string }) => <main data-editor-canvas={projectId}>编辑器画布</main>,
}));

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

/** 在 store 单例构造之前换掉 globalThis.indexedDB,再重新加载模块图。 */
async function loadStoresWithBrokenIndexedDb() {
  vi.stubGlobal("indexedDB", failingFactory());
  vi.resetModules();
  const [{ editorProjectStore }, main] = await Promise.all([
    import("../lib/editor-project-store"),
    import("../main"),
  ]);
  return { editorProjectStore, workbenchStore: main.workbenchStore };
}

/** 可手动推进的健康度数据源:用来验证提示跟着 onHealthChange 走,而不是挂载时定格。 */
function controllableChannel(initial: ProjectStoreHealth) {
  const listeners = new Set<() => void>();
  let health = initial;
  let recoverError: ProjectStoreError | null = null;
  const channel: ProjectStoreHealthChannel = {
    subscribe(notify) {
      listeners.add(notify);
      return () => { listeners.delete(notify); };
    },
    getHealth: () => health,
    getRecoverError: () => recoverError,
  };
  return {
    channel,
    push(nextHealth: ProjectStoreHealth, nextError: ProjectStoreError | null = null) {
      health = nextHealth;
      recoverError = nextError;
      flushSync(() => { for (const notify of [...listeners]) notify(); });
    },
  };
}

/** 记录程序化下载的文件名:Chromium 每个手势只放行一份,所以要看清落了几个文件。 */
let restoreDownloads: (() => void) | null = null;
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

let roots: Array<{ root: Root; container: HTMLElement }> = [];
function render(view: React.ReactElement) {
  const container = document.createElement("div");
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(view));
  return container;
}

function storageNotice(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-store-health="memory"]');
}

afterEach(() => {
  roots.forEach(({ root }) => root.unmount());
  roots = [];
  restoreDownloads?.();
  restoreDownloads = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("shared project store", () => {
  it("keeps a project written by the workbench readable from the editor after degrading to memory", async () => {
    const { editorProjectStore, workbenchStore } = await loadStoresWithBrokenIndexedDb();
    const project = { ...createSampleProject(), id: "proj-degraded" };

    await workbenchStore.put(project);

    expect(workbenchStore.health).toBe("memory");
    // 三实例分裂时编辑器路由拿到的是另一份内存副本,刚创建的项目会渲染成"项目不存在"。
    expect((await editorProjectStore.get("proj-degraded"))?.name).toBe(project.name);
    expect(workbenchStore).toBe(editorProjectStore);
  });
});

describe("ProjectRoute", () => {
  it("wraps the editor with the memory-mode notice and clears it once storage recovers", () => {
    const { channel, push } = controllableChannel("memory");
    const container = render(<ProjectRoute projectId="proj-1" healthChannel={channel} />);

    const notice = storageNotice(container);
    expect(notice?.textContent).toContain("本次编辑不会保存到本机，请及时导出工程备份");
    // 提示在编辑器外面:不改 App.tsx 也能让编辑器路由说出降级实情。
    expect(notice?.nextElementSibling?.getAttribute("data-editor-canvas")).toBe("proj-1");

    push("persistent");

    expect(storageNotice(container)).toBeNull();
    expect(container.querySelector("[data-editor-canvas]")).not.toBeNull();
  });

  it("surfaces the latest write-back failure in the notice", () => {
    const { channel, push } = controllableChannel("memory");
    const container = render(<ProjectRoute projectId="proj-1" healthChannel={channel} />);
    expect(storageNotice(container)?.textContent).toContain("浏览器本机存储不可用");

    push("memory", new ProjectStoreError("quota-exceeded", "本机存储空间不足，请清理浏览器数据或删除不再需要的项目后重试。"));

    expect(storageNotice(container)?.textContent).toContain("本机存储空间不足");
  });

  it("keeps the editor notice inert: no clickable-card classes on a status banner", () => {
    const { channel } = controllableChannel("memory");
    const container = render(<ProjectRoute projectId="proj-1" healthChannel={channel} />);

    const notice = storageNotice(container)!;
    expect(notice.classList.contains("workbench-storage-notice")).toBe(true);
    // .workbench-resume 带 hover 高亮与 :active { transform: scale(.985) },警告横幅不该有按钮动效。
    expect(notice.classList.contains("workbench-resume")).toBe(false);
    expect(notice.querySelector(".workbench-resume-icon")).toBeNull();
    expect(notice.querySelector(".workbench-resume-body")).toBeNull();
    expect(notice.querySelector(".workbench-resume-cta")).toBeNull();
  });

  it("exports the current project from the editor notice, one file per gesture", async () => {
    const store = createMemoryProjectStore();
    await store.put({ ...createSampleProject(), id: "proj-1", name: "一班", updatedAt: "2026-08-24T02:00:00.000Z" });
    const { channel } = controllableChannel("memory");
    const container = render(<ProjectRoute projectId="proj-1" store={store} healthChannel={channel} />);
    const files = stubDownloads();

    // 催用户"及时导出"却不给出口,用户只能猜要先回工作台。
    const button = storageNotice(container)!.querySelector<HTMLButtonElement>('button[data-export-project-id="proj-1"]')!;
    expect(button.getAttribute("aria-label")).toBe("导出当前项目");
    button.click();

    await vi.waitFor(() => expect(files).toEqual(["一班-工程包-2026-08-24.json"]));
    await Promise.resolve();
    expect(files).toEqual(["一班-工程包-2026-08-24.json"]);
  });

  it("keeps a failed export visible instead of a dead button", async () => {
    const { channel } = controllableChannel("memory");
    const container = render(
      <ProjectRoute projectId="proj-missing" store={createMemoryProjectStore()} healthChannel={channel} />,
    );
    stubDownloads();

    storageNotice(container)!.querySelector<HTMLButtonElement>("button[data-export-project-id]")!.click();

    await vi.waitFor(() => expect(storageNotice(container)?.querySelector('[role="alert"]')?.textContent)
      .toContain("导出失败"));
  });

  it("renders no notice while storage is persistent", () => {
    const { channel } = controllableChannel("persistent");
    const container = render(<ProjectRoute projectId="proj-1" healthChannel={channel} />);
    expect(storageNotice(container)).toBeNull();
    expect(container.textContent).not.toContain("本次编辑不会保存到本机");
  });
});

describe("WorkbenchRoute", () => {
  it("passes the subscribed health down to the workbench", async () => {
    const { channel, push } = controllableChannel("persistent");
    const container = render(<WorkbenchRoute store={createMemoryProjectStore()} healthChannel={channel} />);
    await vi.waitFor(() => expect(container.querySelector(".workbench-shell")).not.toBeNull());
    expect(storageNotice(container)).toBeNull();

    push("memory");

    expect(storageNotice(container)?.textContent).toContain("本次编辑不会保存到本机，请及时导出工程备份");
  });

  it("shows the same write-back failure the editor route shows", async () => {
    const { channel, push } = controllableChannel("memory");
    const container = render(<WorkbenchRoute store={createMemoryProjectStore()} healthChannel={channel} />);
    await vi.waitFor(() => expect(storageNotice(container)).not.toBeNull());

    push("memory", new ProjectStoreError("quota-exceeded", QUOTA_MESSAGE));

    // 配额耗尽是用户能动手解决的那条信息,不该只有编辑器路由说得出来。
    expect(storageNotice(container)?.textContent).toContain("本机存储空间不足");
  });
});
