// 从 src/App.test.tsx 原样搬出：启动与导出兜底：五阶段入口、导出失败回退、编辑提交边界。
// 共享挂载/交互装置见 src/app-test-harness.tsx。
import { describe, expect, it, vi } from "vitest";
import { resolveDeliveryIssueLocation } from "./lib/delivery-target";
import { createProjectDocument, serializeProjectDocument } from "./lib/project-document";
import { sampleStudents } from "./lib/project-data";
import { LEGACY_EDITOR_STORAGE_KEY, WORKSPACE_SESSION_STORAGE_KEY } from "./lib/workspace-session";
import { installAppTestHarness, renderApp, renderPublicApp, renderLegacyApp, click, openRailAdvancedTab, openPeopleData, leaveFocusedWorkspace, changeInput, changeSelect } from "./app-test-harness";

installAppTestHarness();

describe("delivery issue target locations", () => {
  it.each([
    ["map-labels", { stage: "map", selectionKind: "map" }],
    ["map-label:广东", { stage: "map", selectionKind: "province", province: "广东" }],
    ["guests:title", { stage: "content", selectionKind: "guests" }],
    ["guests:people", { stage: "content", selectionKind: "guests" }],
    ["guest:student-1", { stage: "content", selectionKind: "guests" }],
    ["display-frame:style", { stage: "frame", selectionKind: "cards" }],
    ["cards:layout", { stage: "content", selectionKind: "cards" }],
    ["text:title", { stage: "content", selectionKind: "text", id: "title" }],
    ["asset:logo", { stage: "content", selectionKind: "asset", id: "logo" }],
  ] as const)("resolves %s", (target, expected) => {
    expect(resolveDeliveryIssueLocation(target)).toEqual(expected);
  });
});

describe("App student editing", () => {
  it.each([
    ["absent", undefined],
    ["zero", "0"],
    ["true", "true"],
  ] as const)("keeps the public five-stage editor isolated when legacy flag is %s", (_label, flag) => {
    window.localStorage.clear();
    if (flag !== undefined) window.localStorage.setItem(LEGACY_EDITOR_STORAGE_KEY, flag);
    const container = renderPublicApp({ clearStorage: false });

    expect(container.querySelector('main[aria-label="数据与素材工作台"]')).not.toBeNull();
    expect(container.querySelector(".workspace")).toBeNull();
    expect(container.querySelector(".workflow-guide")).toBeNull();
    expect(container.querySelector('button[aria-label="打开AI助手与高级功能"]')).not.toBeNull();
    expect(container.querySelector('.workflow-stage-stepper')).not.toBeNull();
    expect(container.querySelector(".workflow-stepper")).toBeNull();
  });

  it("opens the data workspace by default without the legacy compatibility flag", () => {
    const container = renderPublicApp();

    expect(container.querySelector('main[aria-label="数据与素材工作台"]')).not.toBeNull();
    expect(container.querySelector(".workspace")).toBeNull();
  });

  it("enables the legacy workspace only for flag 1", () => {
    const container = renderLegacyApp();
    expect(container.querySelector(".workspace")).not.toBeNull();
  });

  it("opens the content and layout workspace when the saved stage is content", () => {
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({
      stage: "content",
      savedAt: "2026-08-04T00:00:00.000Z",
    }));

    const container = renderLegacyApp({ clearStorage: false });

    expect(container.querySelector(".workspace")).not.toBeNull();
  });

  it("opens the full-screen final export workspace from the workflow stage", () => {
    const container = renderPublicApp();

    click(container.querySelector<HTMLButtonElement>('.workflow-stage-stepper button[aria-label="最终导出"]')!);

    expect(container.querySelector('main[aria-label="最终导出"]')).not.toBeNull();
    expect(container.querySelector('select[aria-label="PNG 导出倍率"]')).not.toBeNull();
  });

  it("keeps the export stage and current configuration when SVG export fails", () => {
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      throw new Error("下载不可用");
    });
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('.workflow-stage-stepper button[aria-label="最终导出"]')!);
    const scale = container.querySelector<HTMLSelectElement>('select[aria-label="PNG 导出倍率"]')!;
    changeSelect(scale, "3");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="导出 SVG"]')!);

    expect(container.querySelector('main[aria-label="最终导出"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("下载不可用");
    expect(scale.value).toBe("3");
    expect(container.querySelector('button[aria-label="重试导出"]')).not.toBeNull();
  });

  it("keeps the export stage and current configuration when PNG export fails", async () => {
    const originalCreateElement = document.createElement.bind(document);
    class ReadyImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("Image", ReadyImage);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName !== "canvas") return originalCreateElement(tagName);
      return {
        width: 0,
        height: 0,
        getContext: () => ({ fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() }),
        toDataURL: () => { throw new Error("PNG 下载不可用"); },
      } as unknown as HTMLCanvasElement;
    });
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('.workflow-stage-stepper button[aria-label="最终导出"]')!);
    const scale = container.querySelector<HTMLSelectElement>('select[aria-label="PNG 导出倍率"]')!;
    changeSelect(scale, "3");
    click(Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "PNG")!);

    await vi.waitFor(() => {
      expect(container.querySelector('[role="alert"]')?.textContent).toContain("PNG 下载不可用");
    });
    expect(container.querySelector('main[aria-label="最终导出"]')).not.toBeNull();
    expect(scale.value).toBe("3");
    expect(container.querySelector('button[aria-label="重试导出"]')).not.toBeNull();
  });

  it("keeps the export stage and current configuration when project package export fails", () => {
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      throw new Error("工程包下载不可用");
    });
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('.workflow-stage-stepper button[aria-label="最终导出"]')!);
    const scale = container.querySelector<HTMLSelectElement>('select[aria-label="PNG 导出倍率"]')!;
    changeSelect(scale, "3");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="导出工程包"]')!);

    expect(container.querySelector('main[aria-label="最终导出"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("工程包下载不可用");
    expect(scale.value).toBe("3");
    expect(container.querySelector('button[aria-label="重试导出"]')).not.toBeNull();
  });

  it("mounts with defaults when localStorage access is blocked", () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => { throw new DOMException("Storage blocked", "SecurityError"); },
    });
    try {
      const container = renderApp(false);
      expect(container.textContent).toContain("林舟");
    } finally {
      if (originalDescriptor) Object.defineProperty(window, "localStorage", originalDescriptor);
    }
  });

  it("opens the rebuilt student data center from fullscreen data settings and exposes map expressions", async () => {
    const container = renderApp();
    const { act } = await import("react");
    openRailAdvancedTab(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);
    // GlobalSettingsScreen is lazy: flush the module-resolution microtask before
    // clicking a tab inside it.
    await act(async () => {});
    click(container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-cards"]')!);

    expect(container.textContent).toContain("学生数据中心");
    expect(container.querySelector(".student-table")).not.toBeNull();
    expect(container.textContent).toContain("地图呈现方式");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="切换为地图图钉"]')!);
    leaveFocusedWorkspace(container);
    expect(container.querySelectorAll("[data-student-pin]")).toHaveLength(12);
  });

  it("removes an international scope from the project when editing a student back to China", () => {
    const internationalProject = createProjectDocument({
      students: [{ ...sampleStudents[0], locationScope: "international" }],
      templateId: "original",
      dataView: "province",
    });
    window.localStorage.setItem("cengfan-map-studio:draft", serializeProjectDocument(internationalProject));
    const container = renderApp(false);
    openPeopleData(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="编辑 林舟"]')!);
    changeSelect(container.querySelector<HTMLSelectElement>('select[aria-label="编辑学生去向类型"]')!, "china");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="保存 林舟"]')!);

    expect(container.querySelector('[data-student-row="student-1"]')?.textContent).not.toContain("海外");
    leaveFocusedWorkspace(container);
    expect(container.querySelector("[data-destination-card]")?.textContent).not.toContain("海外");
  });

  it("applies an edited record to the project and active poster", () => {
    const container = renderApp();
    openPeopleData(container);
    const edit = container.querySelector<HTMLButtonElement>('button[aria-label="编辑 林舟"]');
    expect(edit).not.toBeNull();
    click(edit!);
    changeInput(container.querySelector<HTMLInputElement>('input[aria-label="编辑学生名称"]')!, "林舟舟");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="保存 林舟"]')!);

    expect(container.textContent).toContain("林舟舟");
    leaveFocusedWorkspace(container);
    expect(container.querySelector('[data-destination-card]')?.textContent).toContain("林舟舟");
  });

  it("saves an edited record when the browser has no crypto.randomUUID", () => {
    vi.stubGlobal("crypto", undefined);
    const container = renderApp();
    openPeopleData(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="编辑 林舟"]')!);
    changeInput(container.querySelector<HTMLInputElement>('input[aria-label="编辑学生名称"]')!, "兼容林舟");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="保存 林舟"]')!);

    expect(container.textContent).toContain("兼容林舟");
    leaveFocusedWorkspace(container);
    expect(container.querySelector('[data-destination-card]')?.textContent).toContain("兼容林舟");
    vi.unstubAllGlobals();
  });

  it("does not write a large project snapshot at the edit commit boundary", () => {
    const container = renderApp();
    window.localStorage.removeItem("cengfan-map-studio:draft");
    openPeopleData(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="编辑 林舟"]')!);
    expect(container.querySelector('[data-student-row="student-1"]')?.getAttribute("data-editing")).toBe("true");
    changeInput(container.querySelector<HTMLInputElement>('input[aria-label="编辑学生名称"]')!, "内存林舟");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="保存 林舟"]')!);

    expect(window.localStorage.getItem("cengfan-map-studio:draft")).toBeNull();
    leaveFocusedWorkspace(container);
    expect(container.textContent).toContain("有未保存修改");
  });

  it("does not register background persistence timers", () => {
    const intervals = vi.spyOn(window, "setInterval");
    const container = renderApp();

    expect(container.textContent).toContain("仅点击强制保存时覆盖本地数据");
    expect(intervals).not.toHaveBeenCalled();
  });

  it("exposes opt-in incremental collaboration without connecting on startup", () => {
    const request = vi.spyOn(globalThis, "fetch");
    const container = renderApp();

    expect(container.querySelector('[aria-label="增量在线协作"]')).not.toBeNull();
    click(container.querySelector('[aria-label="增量在线协作"]')!);
    expect(container.textContent).toContain("未连接时不会上传或覆盖工程");
    expect(container.textContent).toContain("增量同步");
    expect(request).not.toHaveBeenCalledWith(expect.stringContaining("/api/rooms"), expect.anything());
  });
});
