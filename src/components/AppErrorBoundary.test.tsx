import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { AppErrorBoundary, type AppErrorBoundaryProps } from "./AppErrorBoundary";
import type { SyncWorkspaceStore } from "../lib/browser-workspace-store";
import { createProjectDocument } from "../lib/project-document";
import { createProjectPackage, parseProjectPackage, type ProjectPackage } from "../lib/project-package";

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
