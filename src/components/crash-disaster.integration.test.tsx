import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import type { SyncWorkspaceStore } from "../lib/browser-workspace-store";

/**
 * 端到端灾难演练：开机时 IndexedDB 就打不开 → 用户在降级会话里建了两个工程 →
 * 界面崩溃 → 崩溃屏逐个导出 → 后台写回撞配额。
 *
 * R5-3(共享单例)、R5-4(一手势一文件)、R4-7(崩溃屏回落项目库)、R6-4(降级横幅)、
 * R6-7(内存工程不重载)各自都有单元测试，但没有一条用例把它们串在同一个 store 实例上走一遍：
 * 这里的每一步都跑在 `editorProjectStore` 这个真实共享实例上，任何一处各建各的 store
 * 或各持一份内存副本，用户的工程都会在下一步凭空消失。
 */

const QUOTA_MESSAGE = "本机存储空间不足，请清理浏览器数据或删除不再需要的项目后重试。";
const DEGRADED_PREFIX = "无法打开本机项目数据库，已降级为内存模式";
const MEMORY_ONLY_URGENCY = "仅存在于本次会话内存中";
const MEMORY_MODE_DETAIL = "浏览器本机存储不可用，内容只保留在当前标签页内存中。";
const SAMPLE_PROJECT_NAME = "示例：2026届毕业去向";
const NEW_PROJECT_NAME = "未命名项目";

// 编辑器画布不在本用例范围内，只关心编辑器路由能不能从共享内存副本里读到工程。
vi.mock("../App", () => ({
  App: ({ projectId }: { projectId: string }) => <main data-editor-canvas={projectId}>编辑器画布</main>,
}));

const Boom = () => {
  throw new Error("boom");
};

type StoragePhase = "broken" | "quota";

/** 请求替身：open 的成败由当前阶段决定，回调在下一个微任务里派发。 */
function openRequest(failing: boolean, database: unknown): IDBOpenDBRequest {
  const request = {
    result: failing ? undefined : database,
    error: failing ? new DOMException("模拟打开失败", "UnknownError") : null,
    onsuccess: null as ((event: Event) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    onupgradeneeded: null as ((event: Event) => void) | null,
    onblocked: null as ((event: Event) => void) | null,
    transaction: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  queueMicrotask(() => {
    if (failing) request.onerror?.(new Event("error"));
    else request.onsuccess?.(new Event("success"));
  });
  return request as unknown as IDBOpenDBRequest;
}

/**
 * 事务替身：先把本轮排队的请求回调派发掉，再决定事务是完成还是中止。
 * 真实 IndexedDB 也是请求回调先于事务终态，写回代码正是在 getAll 的 onsuccess 里发出 put 的。
 */
function fakeTransaction(abortWith: DOMException | null) {
  const pending: Array<() => void> = [];
  const request = (result: unknown) => {
    const created = {
      result,
      error: null,
      onsuccess: null as ((event: Event) => void) | null,
      onerror: null as ((event: Event) => void) | null,
    };
    pending.push(() => created.onsuccess?.(new Event("success")));
    return created;
  };
  const objectStore = {
    getAll: () => request([]),
    getAllKeys: () => request([]),
    get: () => request(undefined),
    put: () => request(undefined),
    delete: () => request(undefined),
    openCursor: () => request(null),
  };
  const tx = {
    error: null as DOMException | null,
    oncomplete: null as ((event: Event) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    onabort: null as ((event: Event) => void) | null,
    objectStore: () => objectStore,
    abort: () => undefined,
  };
  queueMicrotask(() => {
    while (pending.length > 0) pending.shift()?.();
    queueMicrotask(() => {
      if (abortWith) {
        tx.error = abortWith;
        tx.onabort?.(new Event("abort"));
      } else {
        tx.oncomplete?.(new Event("complete"));
      }
    });
  });
  return tx;
}

/** 恢复阶段的库：连接建立时的元数据校正照常完成，随后的写回事务按配额耗尽中止。 */
function fakeDatabase() {
  let transactions = 0;
  return {
    version: 2,
    objectStoreNames: { contains: () => true },
    close: () => undefined,
    transaction: () => {
      transactions += 1;
      return transactions === 1
        ? fakeTransaction(null)
        : fakeTransaction(new DOMException("模拟配额耗尽", "QuotaExceededError"));
    },
  };
}

/**
 * 可切换阶段的 IDBFactory：
 * `broken` 阶段每次 open 都失败(隐私模式 / 数据库损坏)，store 因此降级到内存；
 * `quota` 阶段连接恢复但写回撞配额，逼出真实的 `onRecoverError`。
 */
function phasedIndexedDb(phase: { current: StoragePhase }): IDBFactory {
  const database = fakeDatabase();
  return {
    cmp: () => 0,
    databases: async () => [],
    deleteDatabase: () => { throw new Error("不支持删除"); },
    open: () => openRequest(phase.current === "broken", database),
  } as unknown as IDBFactory;
}

/** 在 store 单例构造之前换掉 globalThis.indexedDB，整张模块图必须一起重载。 */
async function loadDegradedStudio(phase: { current: StoragePhase }) {
  vi.stubGlobal("indexedDB", phasedIndexedDb(phase));
  vi.resetModules();
  const [storeModule, routes, boundary, main] = await Promise.all([
    import("../lib/editor-project-store"),
    import("./StudioRoutes"),
    import("./AppErrorBoundary"),
    import("../main"),
  ]);
  return {
    editorProjectStore: storeModule.editorProjectStore,
    projectStoreHealthChannel: storeModule.projectStoreHealthChannel,
    // R7-5：走 editor-project-store 导出的仅测试句柄推进后台重开探针，
    // 不再劫持全局 setInterval，也不再复制 20s 这个实现常量。
    recoveryProbe: storeModule.projectStoreRecoveryProbe,
    ProjectRoute: routes.ProjectRoute,
    WorkbenchRoute: routes.WorkbenchRoute,
    AppErrorBoundary: boundary.AppErrorBoundary,
    workbenchStore: main.workbenchStore,
  };
}

/** 记录程序化下载的文件名：Chromium 每个手势只放行一份，必须看清落了几个文件。 */
let restoreDownloads: (() => void) | null = null;
function stubDownloads(): string[] {
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

function emptyMirror(): SyncWorkspaceStore {
  return { get: () => null, set: () => undefined };
}

let roots: Array<{ root: Root; container: HTMLElement }> = [];
function render(view: ReactElement): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(view));
  return container;
}

function storageNotice(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-store-health="memory"]');
}

/** 只取崩溃屏写出的结构化诊断对象，忽略 React 自己的报错行。 */
function structuredLogs(spy: { mock: { calls: unknown[][] } }): Array<Record<string, unknown>> {
  return spy.mock.calls
    .map((call) => call.find((arg): arg is Record<string, unknown> =>
      Boolean(arg) && typeof arg === "object" && !Array.isArray(arg)))
    .filter((detail): detail is Record<string, unknown> => detail?.action === "export-backup");
}

afterEach(() => {
  roots.forEach(({ root, container }) => {
    root.unmount();
    container.remove();
  });
  roots = [];
  restoreDownloads?.();
  restoreDownloads = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "";
});

describe("降级会话里的崩溃灾难演练", () => {
  it("从损坏的 IndexedDB 一路走到崩溃屏导出与配额告警，工程始终留在同一个共享内存副本里", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const phase = { current: "broken" as StoragePhase };
    const {
      editorProjectStore,
      projectStoreHealthChannel,
      recoveryProbe,
      ProjectRoute,
      WorkbenchRoute,
      AppErrorBoundary,
      workbenchStore,
    } = await loadDegradedStudio(phase);

    // R5-3：工作台路由与编辑器路由必须是同一个连接，否则下面每一步读到的都是别人的内存副本。
    expect(workbenchStore).toBe(editorProjectStore);

    // —— 1. 开机即降级：工作台在打不开的数据库上照常开张，并播下第一个工程。
    const workbench = render(<WorkbenchRoute />);
    await vi.waitFor(async () => expect(await editorProjectStore.list()).toHaveLength(1));
    expect(editorProjectStore.health).toBe("memory");
    await vi.waitFor(() => expect(storageNotice(workbench)?.textContent).toContain("请及时导出工程备份"));

    // —— 2. 用户在降级会话里又新建一个工程：同样只落在内存副本里。
    // R7: ProjectWorkbench.createProject 只 put + 切 hash，不 refresh()，所以降级横幅里的
    // "逐个导出"清单此刻仍只有 1 条，而内存里已经有 2 个随时会丢的工程。正常流程靠跳转到编辑器
    // 掩盖了它，但只要用户没离开工作台(编辑器挂载失败、或从崩溃屏无重载地返回列表前)，
    // 横幅就会漏报一个只存在于内存里的工程。断言放在 store 上，不锁死这个错误行为。
    workbench.querySelector<HTMLButtonElement>('button[aria-label="新建项目"]')?.click();
    await vi.waitFor(async () => expect(await editorProjectStore.list()).toHaveLength(2));

    const listed = await editorProjectStore.list();
    expect(listed.map((item) => item.name).sort()).toEqual([NEW_PROJECT_NAME, SAMPLE_PROJECT_NAME].sort());
    const sample = listed.find((item) => item.name === SAMPLE_PROJECT_NAME);
    expect(sample).toBeDefined();
    const sampleId = sample?.id ?? "";

    // —— 3. 编辑器路由读同一个工程：三实例分裂时这里会渲染成"项目不存在"。
    expect((await editorProjectStore.get(sampleId))?.name).toBe(SAMPLE_PROJECT_NAME);
    const editor = render(<ProjectRoute projectId={sampleId} />);
    expect(editor.querySelector("[data-editor-canvas]")?.getAttribute("data-editor-canvas")).toBe(sampleId);

    const files = stubDownloads();
    editor.querySelector<HTMLButtonElement>('button[aria-label="导出当前项目"]')?.click();
    await vi.waitFor(() => expect(files).toEqual([`${SAMPLE_PROJECT_NAME}-${sample?.updatedAt.slice(0, 10)}.json`]));
    expect(editor.querySelector(".workbench-storage-notice-error")).toBeNull();

    // —— 4. 界面崩溃：工作区镜像是空的，崩溃屏只能回落到共享项目库。
    const putSpy = vi.spyOn(editorProjectStore, "put");
    const removeSpy = vi.spyOn(editorProjectStore, "remove");
    const crash = render(
      <AppErrorBoundary mirror={emptyMirror()} projectStore={editorProjectStore}><Boom /></AppErrorBoundary>,
    );
    expect(crash.textContent).toContain("界面加载出错");
    crash.querySelector<HTMLButtonElement>('button[aria-label="导出工程备份"]')?.click();

    // —— 5. 两个内存工程都被列出来，并且用的是"只存在于内存"的紧迫文案。
    const recoverButtons = await vi.waitFor(() => {
      const buttons = [...crash.querySelectorAll<HTMLButtonElement>("button[data-project-id]")];
      expect(buttons).toHaveLength(2);
      return buttons;
    });
    const note = await vi.waitFor(() => {
      const text = crash.querySelector('[role="status"]')?.textContent ?? "";
      expect(text).toContain(MEMORY_ONLY_URGENCY);
      return text;
    });
    expect(note).toContain(DEGRADED_PREFIX);
    expect(note).not.toMatch(/磁盘上没有|磁盘上不存在|没有持久副本/);
    expect(recoverButtons.map((button) => button.getAttribute("aria-label")).sort())
      .toEqual([`导出「${NEW_PROJECT_NAME}」`, `导出「${SAMPLE_PROJECT_NAME}」`].sort());
    // listedHealth 走的是 list() 之后再读 health 的那条路径。
    expect(structuredLogs(infoSpy).at(-1)).toMatchObject({
      outcome: "store-listed",
      storeHealth: "memory",
      projects: 2,
    });

    // —— 6. R5-4：一次点击一份文件，两个工程要两次手势才都落盘。
    const beforeRecovery = files.length;
    recoverButtons[0]?.click();
    await vi.waitFor(() => expect(files).toHaveLength(beforeRecovery + 1));
    expect(files).toHaveLength(beforeRecovery + 1);
    recoverButtons[1]?.click();
    await vi.waitFor(() => expect(files).toHaveLength(beforeRecovery + 2));

    const recovered = files.slice(beforeRecovery);
    expect(recovered.every((name) => name.startsWith("cengfan-recovery-") && name.endsWith(".json"))).toBe(true);
    expect(recovered.join("|")).toContain(NEW_PROJECT_NAME);
    expect(recovered.join("|")).toContain(SAMPLE_PROJECT_NAME);

    // —— 7. 崩溃屏是只读通道：救援导出绝不能反过来改写用户仅存的内存副本。
    expect(putSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();

    // —— 8. 后台重开成功但写回撞配额：真实的 onRecoverError 经共享 channel 换掉横幅文案。
    expect(storageNotice(workbench)?.textContent).toContain(MEMORY_MODE_DETAIL);
    phase.current = "quota";
    expect(recoveryProbe.scheduled, "store 未注册后台重开探针").toBe(true);
    recoveryProbe.run();

    await vi.waitFor(() => expect(storageNotice(workbench)?.textContent).toContain(QUOTA_MESSAGE));
    expect(projectStoreHealthChannel.getRecoverError()?.code).toBe("quota-exceeded");
    // 配额耗尽不等于恢复：工程仍在内存里，横幅与 health 都不能提前收工。
    expect(editorProjectStore.health).toBe("memory");
    expect(await editorProjectStore.list()).toHaveLength(2);
    expect(putSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();
  });
});
