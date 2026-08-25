// 仅供 ProjectWorkbench 测试使用的共享装置：从 src/components/ProjectWorkbench.test.tsx
// 原样搬出的挂载助手、IndexedDB 打开失败替身、降级横幅选择器与下载拦截，供按域拆分后的
// src/components/ProjectWorkbench.*.test.tsx 共用。
import { type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, vi } from "vitest";
import { ProjectWorkbench } from "./ProjectWorkbench";
import type { ProjectStore, ProjectStoreHealth } from "../lib/project-store";

export const QUOTA_MESSAGE = "本机存储空间不足，请清理浏览器数据或删除不再需要的项目后重试。";

let roots: Array<{ root: Root; container: HTMLElement }> = [];

/** 挂载任意元素并登记 root，交给 harness 的 afterEach 统一卸载。 */
export function mountElement(element: ReactElement): HTMLElement {
  const container = document.createElement("div");
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(element));
  return container;
}

export function renderWorkbench(
  store: ProjectStore,
  navigate = vi.fn(),
  health?: ProjectStoreHealth,
  options: { publicDemo?: boolean } = {},
) {
  const container = document.createElement("div");
  const root = createRoot(container);
  roots.push({ root, container });
  const render = (nextHealth = health) => {
    flushSync(() => root.render(
      <ProjectWorkbench store={store} navigate={navigate} health={nextHealth} publicDemo={options.publicDemo} />,
    ));
  };
  render();
  return { container, navigate, rerender: render };
}

/** 每次 open 都异步失败的 factory：模拟隐私模式 / 数据库损坏,store 因此降级到内存。 */
export function failingFactory(): IDBFactory {
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

export function storageNotice(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-store-health="memory"]');
}

let restoreDownloads: (() => void) | null = null;

/**
 * jsdom 没有 object URL，补一层记录用的实现;下载用的 <a> 也要拦掉,真正点击会触发未实现的导航。
 * 传入 `failure` 可模拟下载本身失败(磁盘满、被扩展拦截),把 `failure.message` 清空即恢复成功。
 */
export function stubDownloads(failure?: { message: string }) {
  const target = URL as unknown as Record<string, unknown>;
  const original = { create: target.createObjectURL, revoke: target.revokeObjectURL };
  const files: string[] = [];
  target.createObjectURL = () => {
    if (failure?.message) throw new Error(failure.message);
    return "blob:mock";
  };
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

/**
 * 注册每个 ProjectWorkbench 套件都依赖的文件级钩子：
 *
 * - 卸载本文件挂载过的每个 root，断言中途抛出也不会漏掉(setupFiles 的泄漏 root 守卫
 *   只负责报告，不能代替这层排空)，并清掉 localStorage 皮肤与全局桩;
 * - 还原 stubDownloads 改写的 object URL 实现。
 */
export function installProjectWorkbenchTestHarness(): void {
  afterEach(() => {
    roots.forEach(({ root }) => root.unmount());
    roots = [];
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    restoreDownloads?.();
    restoreDownloads = null;
  });
}
