// 仅供 AppErrorBoundary 测试使用的共享装置：从 src/components/AppErrorBoundary.test.tsx
// 原样搬出的挂载助手、镜像/项目库替身、对象 URL 与下载锚点桩，以及崩溃屏的取值助手，
// 供按域拆分后的 src/components/AppErrorBoundary.*.test.tsx 共用。
import { afterEach, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { AppErrorBoundary, type AppErrorBoundaryProps } from "./AppErrorBoundary";
import type { SyncWorkspaceStore } from "../lib/browser-workspace-store";
import { createProjectDocument } from "../lib/project-document";
import { createProjectPackage, type ProjectPackage } from "../lib/project-package";
import type { ProjectStore, ProjectStoreHealth, StoredProject } from "../lib/project-store";

let roots: Array<{ root: Root; container: HTMLElement }> = [];
let restores: Array<() => void> = [];

/** 崩溃屏用例装的桩几乎都在全局对象上，装之前先记下原值，拆分后每个文件各自还原。 */
const pristine = {
  consoleError: console.error,
  consoleInfo: console.info,
  onerror: window.onerror,
  onunhandledrejection: window.onunhandledrejection,
};

/**
 * 注册每个 AppErrorBoundary 测试文件都依赖的收尾钩子：
 *
 * - 卸载本文件挂过的全部 root，断言中途抛错也不会把 root 留在文档里
 *   （setupFiles 里的 leaked-root 守卫只负责报告，不代替这层网）；
 * - 依次执行 {@link stubObjectUrls}、{@link stubAnchor} 等登记的还原函数；
 * - 还原 console 与 window 上的错误处理器：错误边界用例逐个 spy 掉
 *   `console.error`/`console.info` 来吞掉 React 的报错行，漏还原会让后续
 *   文件里真正的报错悄无声息。
 */
export function installAppErrorBoundaryTestHarness(): void {
  afterEach(() => {
    roots.forEach(({ root }) => root.unmount());
    roots = [];
    restores.splice(0).forEach((restore) => restore());
    vi.restoreAllMocks();
    console.error = pristine.consoleError;
    console.info = pristine.consoleInfo;
    window.onerror = pristine.onerror;
    window.onunhandledrejection = pristine.onunhandledrejection;
    window.location.hash = "";
  });
}

export function mountBoundary(
  children: ReactNode,
  props: Omit<AppErrorBoundaryProps, "children"> = {},
): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(<AppErrorBoundary {...props}>{children}</AppErrorBoundary>));
  return container;
}

export function packageAt(name: string, exportedAt: string): ProjectPackage {
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

export function memorySyncStore(initial: string | null = null): SyncWorkspaceStore {
  let value = initial;
  return {
    get: vi.fn(() => value),
    set: vi.fn((next: string) => { value = next; }),
  };
}

export function storedProject(id: string, name: string, exportedAt: string): StoredProject {
  return { id, name, createdAt: exportedAt, updatedAt: exportedAt, pack: packageAt(name, exportedAt) };
}

/** 只读的项目库替身：写入方法一旦被调用就让用例失败。 */
export function fakeProjectStore(projects: StoredProject[], health: ProjectStoreHealth = "persistent") {
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
export function stubObjectUrls() {
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
export function stubAnchor() {
  const link = document.createElementNS("http://www.w3.org/1999/xhtml", "a") as HTMLAnchorElement;
  const click = vi.fn();
  link.click = click;
  const original = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(
    (tag: string) => (tag === "a" ? link : original(tag)) as HTMLElement,
  );
  return { link, click };
}

export function clickReturn(container: HTMLElement): void {
  const button = container.querySelector<HTMLButtonElement>('button[aria-label="返回项目列表"]');
  expect(button).not.toBeNull();
  button?.click();
}

export function clickExport(container: HTMLElement): void {
  const button = container.querySelector<HTMLButtonElement>('button[aria-label="导出工程备份"]');
  expect(button).not.toBeNull();
  button?.click();
}

/** 状态提示由点击后的 setState 渲染，React 不在事件回调内同步刷新。 */
export function backupNote(container: HTMLElement): Promise<string> {
  return vi.waitFor(() => {
    const note = container.querySelector('[role="status"]')?.textContent ?? "";
    expect(note).not.toBe("");
    return note;
  });
}

/** 回落到项目库是异步的，提示会在镜像结论之后再追加一段。 */
export function waitForNote(container: HTMLElement, fragment: string): Promise<string> {
  return vi.waitFor(() => {
    const note = container.querySelector('[role="status"]')?.textContent ?? "";
    expect(note).toContain(fragment);
    return note;
  });
}

export function projectButtons(container: HTMLElement): Promise<HTMLButtonElement[]> {
  return vi.waitFor(() => {
    const buttons = [...container.querySelectorAll<HTMLButtonElement>("button[data-project-id]")];
    expect(buttons.length).toBeGreaterThan(0);
    return buttons;
  });
}

/** 只取备份导出写出的结构化诊断对象，忽略 React 自己的报错行。 */
export function structuredLogs(spy: { mock: { calls: unknown[][] } }): Array<Record<string, unknown>> {
  return spy.mock.calls
    .map((call) => call.find((arg): arg is Record<string, unknown> =>
      Boolean(arg) && typeof arg === "object" && !Array.isArray(arg)))
    .filter((detail): detail is Record<string, unknown> => detail?.action === "export-backup");
}
