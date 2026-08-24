import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { AppErrorBoundary, type AppErrorBoundaryProps } from "./AppErrorBoundary";
import type { SyncWorkspaceStore } from "../lib/browser-workspace-store";
import { createProjectDocument } from "../lib/project-document";
import {
  createProjectPackage,
  parseProjectPackage,
  serializeProjectPackage,
  type ProjectPackage,
} from "../lib/project-package";
import type { ProjectStore, ProjectStoreHealth, StoredProject } from "../lib/project-store";

let roots: Array<{ root: Root; container: HTMLElement }> = [];
let restores: Array<() => void> = [];

afterEach(() => {
  roots.forEach(({ root }) => root.unmount());
  roots = [];
  restores.splice(0).forEach((restore) => restore());
  vi.restoreAllMocks();
});

const Boom = () => {
  throw new Error("boom");
};

function mountBoundary(children: ReactNode, props: Omit<AppErrorBoundaryProps, "children"> = {}): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(<AppErrorBoundary {...props}>{children}</AppErrorBoundary>));
  return container;
}

function packageAt(name: string, exportedAt: string): ProjectPackage {
  return createProjectPackage({
    project: createProjectDocument({
      students: [{ id: "student-1", name, university: "测试大学", city: "杭州市", visibility: true }],
      templateId: "original",
      dataView: "province",
    }),
    assets: [],
    fonts: [],
    customTemplates: [],
    now: new Date(exportedAt),
  });
}

function memorySyncStore(initial: string | null = null): SyncWorkspaceStore {
  let value = initial;
  return {
    get: vi.fn(() => value),
    set: vi.fn((next: string) => { value = next; }),
  };
}

function storedProject(id: string, name: string, exportedAt: string): StoredProject {
  return { id, name, createdAt: exportedAt, updatedAt: exportedAt, pack: packageAt(name, exportedAt) };
}

/** 只读的项目库替身：写入方法一旦被调用就让用例失败。 */
function fakeProjectStore(projects: StoredProject[], health: ProjectStoreHealth = "persistent") {
  const store = {
    health,
    list: vi.fn(async () => projects.map((project) => ({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      exportedAt: project.pack.exportedAt,
      studentCount: project.pack.project.students.length,
      assetCount: project.pack.assets.length,
      fontCount: project.pack.fonts.length,
      customTemplateCount: project.pack.customTemplates.length,
      pack: {
        exportedAt: project.pack.exportedAt,
        project: { students: { length: project.pack.project.students.length } },
      },
    }))),
    get: vi.fn(async (id: string) => projects.find((project) => project.id === id) ?? null),
    put: vi.fn(async () => { throw new Error("崩溃屏不允许写入项目库"); }),
    remove: vi.fn(async () => { throw new Error("崩溃屏不允许写入项目库"); }),
  };
  return store satisfies ProjectStore;
}

/** jsdom 没有 object URL，这里补一层记录用的实现，测试结束后还原。 */
function stubObjectUrls() {
  const created: Blob[] = [];
  const revoked: string[] = [];
  let counter = 0;
  const target = URL as unknown as Record<string, unknown>;
  const original = { create: target.createObjectURL, revoke: target.revokeObjectURL };
  target.createObjectURL = (blob: Blob) => {
    created.push(blob);
    counter += 1;
    return `blob:mock-${counter}`;
  };
  target.revokeObjectURL = (url: string) => { revoked.push(url); };
  restores.push(() => {
    target.createObjectURL = original.create;
    target.revokeObjectURL = original.revoke;
  });
  return { created, revoked };
}

/** 拦截下载用的 <a>：jsdom 里真正点击会触发未实现的导航。 */
function stubAnchor() {
  const link = document.createElementNS("http://www.w3.org/1999/xhtml", "a") as HTMLAnchorElement;
  const click = vi.fn();
  link.click = click;
  const original = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(
    (tag: string) => (tag === "a" ? link : original(tag)) as HTMLElement,
  );
  return { link, click };
}

function clickExport(container: HTMLElement): void {
  const button = container.querySelector<HTMLButtonElement>('button[aria-label="导出工程备份"]');
  expect(button).not.toBeNull();
  button?.click();
}

/** 状态提示由点击后的 setState 渲染，React 不在事件回调内同步刷新。 */
function backupNote(container: HTMLElement): Promise<string> {
  return vi.waitFor(() => {
    const note = container.querySelector('[role="status"]')?.textContent ?? "";
    expect(note).not.toBe("");
    return note;
  });
}

/** 回落到项目库是异步的，提示会在镜像结论之后再追加一段。 */
function waitForNote(container: HTMLElement, fragment: string): Promise<string> {
  return vi.waitFor(() => {
    const note = container.querySelector('[role="status"]')?.textContent ?? "";
    expect(note).toContain(fragment);
    return note;
  });
}

function projectButtons(container: HTMLElement): Promise<HTMLButtonElement[]> {
  return vi.waitFor(() => {
    const buttons = [...container.querySelectorAll<HTMLButtonElement>("button[data-project-id]")];
    expect(buttons.length).toBeGreaterThan(0);
    return buttons;
  });
}

/** 只取备份导出写出的结构化诊断对象，忽略 React 自己的报错行。 */
function structuredLogs(spy: { mock: { calls: unknown[][] } }): Array<Record<string, unknown>> {
  return spy.mock.calls
    .map((call) => call.find((arg): arg is Record<string, unknown> =>
      Boolean(arg) && typeof arg === "object" && !Array.isArray(arg)))
    .filter((detail): detail is Record<string, unknown> => detail?.action === "export-backup");
}

describe("AppErrorBoundary", () => {
  it("renders a recovery screen instead of a blank page when a child throws", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = mountBoundary(<Boom />);

    expect(container.textContent).toContain("界面加载出错");
    expect(container.querySelector('button[aria-label="重新加载界面"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="返回项目列表"]')).not.toBeNull();
    consoleSpy.mockRestore();
  });

  it("renders children normally when nothing throws", () => {
    const container = mountBoundary(<p>正常内容</p>);
    expect(container.textContent).toContain("正常内容");
    expect(container.querySelector(".workbench-error")).toBeNull();
  });
});

describe("AppErrorBoundary disaster-recovery export", () => {
  it("downloads a package that round-trips through parseProjectPackage", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const pack = packageAt("灾难恢复", "2026-08-20T08:00:00.000Z");
    const mirror = memorySyncStore(JSON.stringify(pack));
    const urls = stubObjectUrls();
    const anchor = stubAnchor();

    const container = mountBoundary(<Boom />, { mirror });
    clickExport(container);

    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(anchor.link.download).toContain("2026-08-20");
    expect(urls.created).toHaveLength(1);
    const restored = parseProjectPackage(await urls.created[0]!.text());
    expect(restored.project.students[0]?.name).toBe("灾难恢复");
    expect(restored.exportedAt).toBe(pack.exportedAt);
    expect(await backupNote(container)).toContain("已导出");
    expect(structuredLogs(infoSpy)[0]).toMatchObject({ outcome: "exported" });
  });

  it("keeps the existing recovery actions next to the export action", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const container = mountBoundary(<Boom />, { mirror: memorySyncStore() });

    expect(container.querySelector('button[aria-label="重新加载界面"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="返回项目列表"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="导出工程备份"]')).not.toBeNull();
  });

  it("reports an empty mirror instead of downloading an empty file", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const urls = stubObjectUrls();
    const container = mountBoundary(<Boom />, { mirror: memorySyncStore() });

    clickExport(container);

    expect(urls.created).toHaveLength(0);
    expect(await backupNote(container)).toContain("没有找到");
    expect(structuredLogs(errorSpy)[0]).toMatchObject({ outcome: "mirror-empty" });
  });

  it("reports a corrupt mirror with bug-report detail", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const urls = stubObjectUrls();
    const container = mountBoundary(<Boom />, { mirror: memorySyncStore("{损坏的镜像") });

    clickExport(container);

    expect(urls.created).toHaveLength(0);
    expect(await backupNote(container)).toContain("损坏");
    const detail = structuredLogs(errorSpy)[0];
    expect(detail).toMatchObject({ outcome: "mirror-corrupt", mirrorBytes: "{损坏的镜像".length });
    expect(detail?.crash).toMatchObject({ message: "boom" });
  });

  it("reports a mirror that cannot be read at all", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mirror: SyncWorkspaceStore = {
      get: () => { throw new DOMException("SecurityError", "SecurityError"); },
      set: () => undefined,
    };
    const container = mountBoundary(<Boom />, { mirror });

    clickExport(container);

    expect(await backupNote(container)).toContain("读取");
    expect(structuredLogs(errorSpy)[0]).toMatchObject({ outcome: "mirror-unreadable" });
  });

  it("reports a blocked download without losing the recovery screen", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mirror = memorySyncStore(JSON.stringify(packageAt("下载受阻", "2026-08-21T08:00:00.000Z")));
    const downloadPack = vi.fn(() => { throw new Error("下载被拦截"); });

    const container = mountBoundary(<Boom />, { mirror, downloadPack });
    clickExport(container);

    expect(downloadPack).toHaveBeenCalledTimes(1);
    expect(await backupNote(container)).toContain("下载被拦截");
    expect(container.textContent).toContain("界面加载出错");
    expect(structuredLogs(errorSpy)[0]).toMatchObject({ outcome: "download-failed" });
  });
});

describe("AppErrorBoundary project-store fallback", () => {
  it("exports every stored project when the workspace mirror is empty", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const projects = [
      storedProject("proj-1", "一班去向", "2026-08-18T08:00:00.000Z"),
      storedProject("proj-2", "二班去向", "2026-08-19T08:00:00.000Z"),
    ];
    const projectStore = fakeProjectStore(projects);
    const packs: ProjectPackage[] = [];
    const filenames: Array<string | undefined> = [];
    const downloadPack = vi.fn((pack: ProjectPackage, filename?: string) => {
      packs.push(pack);
      filenames.push(filename);
    });

    const container = mountBoundary(<Boom />, { mirror: memorySyncStore(), projectStore, downloadPack });
    clickExport(container);

    const buttons = await projectButtons(container);
    expect(buttons).toHaveLength(2);
    expect(buttons.map((button) => button.textContent)).toEqual([
      expect.stringContaining("一班去向"),
      expect.stringContaining("二班去向"),
    ]);
    expect(structuredLogs(errorSpy)[0]).toMatchObject({ outcome: "mirror-empty" });
    expect(structuredLogs(infoSpy)[0]).toMatchObject({ outcome: "store-listed", projects: 2 });

    buttons[0]?.click();
    await vi.waitFor(() => expect(downloadPack).toHaveBeenCalledTimes(1));
    buttons[1]?.click();
    await vi.waitFor(() => expect(downloadPack).toHaveBeenCalledTimes(2));

    const restored = packs.map((pack) => parseProjectPackage(serializeProjectPackage(pack)));
    expect(restored.map((pack) => pack.project.students[0]?.name)).toEqual(["一班去向", "二班去向"]);
    expect(filenames).toEqual([
      "cengfan-recovery-一班去向-2026-08-18.json",
      "cengfan-recovery-二班去向-2026-08-19.json",
    ]);
    expect(await waitForNote(container, "已导出")).toContain("二班去向");
    expect(projectStore.put).not.toHaveBeenCalled();
    expect(projectStore.remove).not.toHaveBeenCalled();
  });

  it("still offers stored projects when the mirror is corrupt", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    const projectStore = fakeProjectStore([storedProject("proj-1", "工作台工程", "2026-08-20T08:00:00.000Z")]);
    const downloadPack = vi.fn();

    const container = mountBoundary(<Boom />, {
      mirror: memorySyncStore("{损坏的镜像"),
      projectStore,
      downloadPack,
    });
    clickExport(container);

    const note = await waitForNote(container, "1 个工程");
    expect(note).toContain("损坏");
    expect(structuredLogs(errorSpy)[0]).toMatchObject({ outcome: "mirror-corrupt" });
    expect(await projectButtons(container)).toHaveLength(1);
  });

  it("says nothing durable can be exported when the store is degraded to memory", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const projectStore = fakeProjectStore([], "memory");

    const container = mountBoundary(<Boom />, { mirror: memorySyncStore(), projectStore });
    clickExport(container);

    expect(await waitForNote(container, "降级")).toContain("没有找到");
    expect(structuredLogs(errorSpy)[1]).toMatchObject({ outcome: "store-degraded", storeHealth: "memory" });
    expect(container.querySelector("button[data-project-id]")).toBeNull();
  });

  it("reports an empty project store separately from an empty mirror", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const projectStore = fakeProjectStore([]);

    const container = mountBoundary(<Boom />, { mirror: memorySyncStore(), projectStore });
    clickExport(container);

    expect(await waitForNote(container, "也没有已保存的工程")).toContain("没有找到");
    expect(structuredLogs(errorSpy)[1]).toMatchObject({ outcome: "store-empty", storeHealth: "persistent" });
  });

  it("reports a project store that cannot be listed", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const projectStore = fakeProjectStore([]);
    projectStore.list.mockRejectedValueOnce(new Error("无法打开本机项目数据库"));
    const mirror: SyncWorkspaceStore = {
      get: () => { throw new DOMException("SecurityError", "SecurityError"); },
      set: () => undefined,
    };

    const container = mountBoundary(<Boom />, { mirror, projectStore });
    clickExport(container);

    expect(await waitForNote(container, "无法打开本机项目数据库")).toContain("读取");
    expect(structuredLogs(errorSpy)[0]).toMatchObject({ outcome: "mirror-unreadable" });
    expect(structuredLogs(errorSpy)[1]).toMatchObject({ outcome: "store-unreadable" });
  });

  it("reports a project that vanished between listing and export", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    const projectStore = fakeProjectStore([storedProject("proj-1", "已删除工程", "2026-08-20T08:00:00.000Z")]);
    const downloadPack = vi.fn();

    const container = mountBoundary(<Boom />, { mirror: memorySyncStore(), projectStore, downloadPack });
    clickExport(container);

    const buttons = await projectButtons(container);
    projectStore.get.mockResolvedValueOnce(null);
    buttons[0]?.click();

    expect(await waitForNote(container, "已经不在本机项目库里")).toContain("已删除工程");
    expect(downloadPack).not.toHaveBeenCalled();
    expect(structuredLogs(errorSpy).at(-1)).toMatchObject({ outcome: "project-missing", projectId: "proj-1" });
  });

  it("leaves the project store untouched when the mirror still has data", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    const projectStore = fakeProjectStore([storedProject("proj-1", "不该被读到", "2026-08-20T08:00:00.000Z")]);
    const downloadPack = vi.fn();
    const mirror = memorySyncStore(JSON.stringify(packageAt("镜像优先", "2026-08-22T08:00:00.000Z")));

    const container = mountBoundary(<Boom />, { mirror, projectStore, downloadPack });
    clickExport(container);

    expect(await backupNote(container)).toContain("已导出");
    expect(downloadPack).toHaveBeenCalledTimes(1);
    expect(downloadPack.mock.calls[0]?.[0]).toMatchObject({ kind: "cengfan-project-package" });
    expect(projectStore.list).not.toHaveBeenCalled();
    expect(container.querySelector("button[data-project-id]")).toBeNull();
  });
});
