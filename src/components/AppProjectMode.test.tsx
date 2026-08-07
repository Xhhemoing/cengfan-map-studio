import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { App } from "../App";
import { editorProjectStore } from "../lib/editor-project-store";
import { createSampleProject, type StoredProject } from "../lib/project-store";
import { LEGACY_EDITOR_STORAGE_KEY } from "../lib/workspace-session";

// jsdom 没有 IndexedDB;App 在 projectId 模式下会调用 editorProjectStore.get/put,
// 必须注入内存 store,否则真实 store 的 get() 恒返回 null 导致项目缺失界面。
vi.mock("../lib/editor-project-store", async () => {
  const { createMemoryProjectStore } = await import("../lib/project-store");
  return { editorProjectStore: createMemoryProjectStore() };
});

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];
let sample: StoredProject;

function mountApp(projectId?: string): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(<App projectId={projectId} />));
  return container;
}

function click(element: Element): void {
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function openRailAdvancedTab(container: HTMLElement): void {
  click(container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="studio-advanced-panel"]')!);
}

function openPeopleData(container: HTMLElement): void {
  openRailAdvancedTab(container);
  click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);
  click(container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-cards"]')!);
}

function changeInput(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  flushSync(() => {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(async () => {
  window.localStorage.clear();
  window.location.hash = "";
  window.localStorage.setItem(LEGACY_EDITOR_STORAGE_KEY, "1");
  sample = createSampleProject();
  await editorProjectStore.put(sample);
});

afterEach(async () => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  window.localStorage.clear();
  window.location.hash = "";
  vi.restoreAllMocks();
  await editorProjectStore.remove(sample.id);
});

describe("App in project mode", () => {
  it("loads a project by id and shows the back-to-workbench button", async () => {
    const container = mountApp(sample.id);

    await vi.waitFor(() => expect(container.textContent).toContain("已打开项目"));
    expect(container.textContent).toContain("示例：2026届毕业去向");
    expect(container.textContent).toContain("林舟");
    expect(container.querySelector('button[aria-label="返回项目列表"]')).not.toBeNull();
  });

  it("shows a missing-project screen when the id is unknown", async () => {
    const container = mountApp("no-such-project");

    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')).not.toBeNull());
    expect(container.textContent).toContain("项目不存在或已删除");
    expect(container.querySelector('button[aria-label="返回项目列表"]')).not.toBeNull();
  });

  it("navigates back to the workbench list when the back button is clicked", async () => {
    const container = mountApp(sample.id);
    await vi.waitFor(() => expect(container.querySelector('button[aria-label="返回项目列表"]')).not.toBeNull());

    click(container.querySelector('button[aria-label="返回项目列表"]')!);

    expect(window.location.hash).toBe("#/");
  });

  it("autosaves edits back to the project record", async () => {
    const container = mountApp(sample.id);
    await vi.waitFor(() => expect(container.textContent).toContain("已打开项目"));

    openPeopleData(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="编辑 林舟"]')!);
    changeInput(container.querySelector<HTMLInputElement>('input[aria-label="编辑学生名称"]')!, "林舟舟");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="保存 林舟"]')!);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')!);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="强制保存到浏览器本地"]')!);

    await vi.waitFor(async () => {
      const record = await editorProjectStore.get(sample.id);
      expect(record?.pack.project.students.some((student) => student.name === "林舟舟")).toBe(true);
    });
  });

  it("keeps the default behavior without a projectId", () => {
    const container = mountApp();

    expect(container.textContent).toContain("蹭饭地图工作室");
    expect(container.querySelector('button[aria-label="返回项目列表"]')).toBeNull();
  });
});
