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
});
