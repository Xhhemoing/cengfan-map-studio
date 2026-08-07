import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { App } from "../App";
import { editorProjectStore } from "../lib/editor-project-store";
import { createSampleProject, type StoredProject } from "../lib/project-store";
import { createCustomTemplateFromProject } from "../lib/template-store";
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

function rerenderApp(entry: { root: Root; container: HTMLDivElement }, projectId?: string): void {
  flushSync(() => entry.root.render(<App projectId={projectId} />));
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

    // 返回前会先自动保存,保存是异步的,因此 hash 变更需要等待。
    await vi.waitFor(() => expect(window.location.hash).toBe("#/"));
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

  it("autosaves to the project record when navigating back without a manual save", async () => {
    const container = mountApp(sample.id);
    await vi.waitFor(() => expect(container.textContent).toContain("已打开项目"));

    openPeopleData(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="编辑 林舟"]')!);
    changeInput(container.querySelector<HTMLInputElement>('input[aria-label="编辑学生名称"]')!, "林舟舟");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="保存 林舟"]')!);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')!);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="返回项目列表"]')!);

    await vi.waitFor(() => expect(window.location.hash).toBe("#/"));
    await vi.waitFor(async () => {
      const record = await editorProjectStore.get(sample.id);
      expect(record?.pack.project.students.some((student) => student.name === "林舟舟")).toBe(true);
    });
  });

  it("recovers when a missing project id is replaced by a valid one", async () => {
    const container = mountApp("no-such-project");
    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')).not.toBeNull());

    rerenderApp(roots[roots.length - 1], sample.id);

    await vi.waitFor(() => expect(container.textContent).toContain("已打开项目"));
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("shows the missing-project screen when the store get rejects", async () => {
    vi.spyOn(editorProjectStore, "get").mockRejectedValueOnce(new Error("boom"));
    const container = mountApp(sample.id);

    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')).not.toBeNull());
    expect(container.textContent).toContain("项目不存在或已删除");
  });

  it("restores custom templates, fonts, and render settings from the record", async () => {
    sample = {
      ...sample,
      pack: {
        ...sample.pack,
        customTemplates: [
          createCustomTemplateFromProject({
            name: "毕业海报",
            baseTemplateId: "original",
            scope: "layout",
            overrides: {},
            students: [],
          }),
        ],
        fonts: [{
          id: "font-user-test",
          label: "测试字体",
          family: "TestFont",
          src: "data:font/woff2;base64,AAAA",
          format: "woff2",
          source: "user",
        }],
        renderSettings: { mode: "low", fixedFps: 10 },
      },
    };
    await editorProjectStore.put(sample);

    const container = mountApp(sample.id);
    await vi.waitFor(() => expect(container.textContent).toContain("已打开项目"));

    click(container.querySelector<HTMLButtonElement>('.topbar .workflow-stage-stepper button[aria-label="选择模板"]')!);
    await vi.waitFor(() => expect(container.textContent).toContain("毕业海报"));

    click(container.querySelector<HTMLButtonElement>('button[aria-label="强制保存到浏览器本地"]')!);
    await vi.waitFor(async () => {
      const record = await editorProjectStore.get(sample.id);
      expect(record?.pack.customTemplates[0]?.name).toBe("毕业海报");
      expect(record?.pack.fonts).toHaveLength(1);
      expect(record?.pack.renderSettings.mode).toBe("low");
    });
  });

  it("surfaces an IndexedDB put failure with a clear message and keeps the record", async () => {
    vi.spyOn(editorProjectStore, "put").mockRejectedValueOnce(new Error("quota"));
    const container = mountApp(sample.id);
    await vi.waitFor(() => expect(container.textContent).toContain("已打开项目"));

    click(container.querySelector<HTMLButtonElement>('button[aria-label="强制保存到浏览器本地"]')!);

    await vi.waitFor(() => expect(container.textContent).toContain("项目记录写入失败"));
    expect(container.textContent).toContain("请导出工程包备份");
    const record = await editorProjectStore.get(sample.id);
    expect(record?.pack.project.students.some((student) => student.name === "林舟舟")).toBe(false);
  });
});
