import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { resolveDeliveryIssueLocation } from "./lib/delivery-target";
import { createProjectDocument, serializeProjectDocument } from "./lib/project-document";
import { EDITOR_PANEL_LAYOUT_STORAGE_KEY } from "./lib/editor-layout";
import { sampleStudents } from "./lib/project-data";
import { createProjectPackage } from "./lib/project-package";
import { createCustomTemplateFromProject, saveCustomTemplates } from "./lib/template-store";
import { LEGACY_EDITOR_STORAGE_KEY, WORKSPACE_SESSION_STORAGE_KEY } from "./lib/workspace-session";
import { SKIN_STORAGE_KEY } from "./lib/theme";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

// App.tsx lazy-loads the data workspace and full-screen settings panels. Tests
// drive them through synchronous clicks, so preload those modules once up
// front; the resolved lazy components then render synchronously.
beforeAll(async () => {
  await import("./components/GlobalSettingsScreen");
  await import("./components/workspaces/DataUploadWorkspace");
});

function mountApp(): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(<App />));
  return container;
}

function renderApp(clearStorage = true): HTMLDivElement {
  return renderLegacyApp({ clearStorage });
}

function renderPublicApp({ clearStorage = true } = {}): HTMLDivElement {
  if (clearStorage) window.localStorage.clear();
  return mountApp();
}

function renderLegacyApp({ clearStorage = true } = {}): HTMLDivElement {
  try {
    if (clearStorage) window.localStorage.clear();
    window.localStorage.setItem(LEGACY_EDITOR_STORAGE_KEY, "1");
  } catch {
    // Storage-failure tests intentionally exercise the public fallback.
  }
  return mountApp();
}

function click(element: Element): void {
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function openDesignTool(container: HTMLElement, label: string): void {
  if (label !== "模板") throw new Error(`Unsupported design tool: ${label}`);
  click(workflowStage(container, "选择模板"));
}

function openRailAdvancedTab(container: HTMLElement): void {
  const el = container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="studio-advanced-panel"]');
  click(el!);
}

function openGlobalSettingsSection(container: HTMLElement, controls: string): void {
  openRailAdvancedTab(container);
  const settingsButton = container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]');
  click(settingsButton!);
  click(container.querySelector<HTMLButtonElement>(`[role="tab"][aria-controls="global-settings-${controls}"]`)!);
  if (controls === "cards") click(container.querySelector<HTMLButtonElement>('button[aria-label="数据展示设置"]')!);
}

function openPeopleData(container: HTMLElement): void {
  openRailAdvancedTab(container);
  click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);
  click(container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-cards"]')!);
}

function workflowStage(container: HTMLElement, label: string): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(`.workflow-stage-stepper button[aria-label="${label}"]`)!;
}

function openGlobalData(container: HTMLElement): void {
  click(workflowStage(container, "数据与素材"));
}

function leaveFocusedWorkspace(container: HTMLElement, stage = "内容与排版"): void {
  click(workflowStage(container, stage));
}

function closeGlobalSettings(container: HTMLElement): void {
  click(container.querySelector<HTMLButtonElement>("button.global-settings-done")!);
}

function changeInput(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  flushSync(() => {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function changeSelect(select: HTMLSelectElement, value: string): void {
  flushSync(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  window.localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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
  ] as const)("isolates public template mode when legacy flag is %s", (_label, flag) => {
    window.localStorage.clear();
    if (flag !== undefined) window.localStorage.setItem(LEGACY_EDITOR_STORAGE_KEY, flag);
    const container = renderPublicApp({ clearStorage: false });

    expect(container.querySelector('main[aria-label="模板选择工作台"]')).not.toBeNull();
    expect(container.querySelector(".workspace")).toBeNull();
    expect(container.querySelector(".workflow-guide")).toBeNull();
    expect(container.querySelector('button[aria-label="打开AI助手与高级功能"]')).not.toBeNull();
    expect(container.querySelector('.workflow-stage-stepper')).not.toBeNull();
    expect(container.querySelector(".workflow-stepper")).toBeNull();
  });

  it("opens the template workspace by default without the legacy compatibility flag", () => {
    const container = renderPublicApp();

    expect(container.querySelector('main[aria-label="模板选择工作台"]')).not.toBeNull();
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

  it("keeps edit actions disabled by viewer role through the shared commit boundary", async () => {
    const container = renderApp();
    const roomToken = "viewer-room-token";
    const roomId = "VIEW01";
    const remoteProject = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
    const originalFetch = globalThis.fetch;
    const request = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(`/api/rooms/${roomId}/join`)) {
        return new Response(JSON.stringify({ room: { id: roomId }, access: { accessToken: roomToken, role: "viewer", participantId: "viewer", id: "viewer", displayName: "查看者" } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith(`/api/rooms/${roomId}`)) {
        return new Response(JSON.stringify({ id: roomId, version: 0, ready: true, snapshot: createProjectPackage({ project: remoteProject, assets: [], fonts: [], customTemplates: [], renderSettings: { mode: "normal", fixedFps: 20 } }), role: "viewer", participants: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/events-ticket")) return new Response(JSON.stringify({ ticket: "ticket" }), { status: 201, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    globalThis.fetch = request as typeof fetch;
    try {
      click(container.querySelector('[aria-label="增量在线协作"]')!);
      changeInput(container.querySelector<HTMLInputElement>('[aria-label="协作房间码"]')!, roomId);
      changeInput(container.querySelector<HTMLInputElement>('[aria-label="协作邀请凭证"]')!, "viewer-invite");
      click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "加入")!);
      await vi.waitFor(() => expect(request).toHaveBeenCalledWith(`/api/rooms/${roomId}/join`, expect.anything()));
      await vi.waitFor(() => {
        expect(container.textContent).toContain("已加入房间");
        expect(window.localStorage.getItem(`cengfan-map-studio:room-access:${roomId}`)).toBe(roomToken);
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("shows room members with the owner marked and lets the owner toggle readonly", async () => {
    const container = renderApp();
    const roomId = "ROOM1";
    const originalEventSource = globalThis.EventSource;
    class QuietEventSource {
      addEventListener() {}
      onerror = null;
      close() {}
      constructor(public readonly url: string) {}
    }
    vi.stubGlobal("EventSource", QuietEventSource);
    const originalFetch = globalThis.fetch;
    const request = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/rooms")) {
        return new Response(JSON.stringify({
          room: { id: roomId, version: 0, ready: true, members: [{ clientId: "c-owner", role: "owner", joinedAt: "t0", lastSeenAt: "t0" }] },
          access: { accessToken: "owner-token", role: "owner", participantId: "p1", id: "p1", displayName: "创建者" },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith(`/api/rooms/${roomId}/transactions`)) {
        return new Response(JSON.stringify({ id: roomId, version: 1 }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith(`/api/rooms/${roomId}/access`)) {
        return new Response(JSON.stringify({ id: roomId, version: 2, readonly: true, closed: false }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/events-ticket")) return new Response(JSON.stringify({ ticket: "ticket" }), { status: 201, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    globalThis.fetch = request as typeof fetch;
    try {
      click(container.querySelector('[aria-label="增量在线协作"]')!);
      click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === "创建房间")!);
      await vi.waitFor(() => expect(request).toHaveBeenCalledWith("/api/rooms", expect.anything()));
      await vi.waitFor(() => expect(container.textContent).toContain("房间已创建"));
      expect(container.querySelector('[aria-label="房间成员"]')).not.toBeNull();
      expect(container.textContent).toContain("创建者");
      expect(container.textContent).toContain("模式：可编辑");
      const readonlyButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "设为只读");
      expect(readonlyButton).toBeDefined();
      expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent === "关闭房间")).toBe(true);
      click(readonlyButton!);
      await vi.waitFor(() => expect(container.textContent).toContain("模式：只读"));
      const accessCall = request.mock.calls.find(([input]) => String(input).endsWith(`/api/rooms/${roomId}/access`));
      expect(accessCall?.[1]).toMatchObject({ method: "POST" });
      expect(JSON.parse((accessCall?.[1] as RequestInit).body as string)).toMatchObject({ action: "set-readonly" });
      expect(typeof JSON.parse((accessCall?.[1] as RequestInit).body as string).clientId).toBe("string");
    } finally {
      globalThis.fetch = originalFetch;
      vi.unstubAllGlobals();
      globalThis.EventSource = originalEventSource;
    }
  });

  it("shows readonly mode to editors without exposing owner-only controls", async () => {
    const container = renderApp();
    const roomId = "VIEW02";
    const originalEventSource = globalThis.EventSource;
    class QuietEventSource {
      addEventListener() {}
      onerror = null;
      close() {}
      constructor(public readonly url: string) {}
    }
    vi.stubGlobal("EventSource", QuietEventSource);
    const remoteProject = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
    const originalFetch = globalThis.fetch;
    const request = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(`/api/rooms/${roomId}/join`)) {
        return new Response(JSON.stringify({ room: { id: roomId }, access: { accessToken: "editor-token", role: "editor", participantId: "editor", id: "editor", displayName: "编辑者" } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith(`/api/rooms/${roomId}`)) {
        return new Response(JSON.stringify({
          id: roomId,
          version: 1,
          ready: true,
          snapshot: createProjectPackage({ project: remoteProject, assets: [], fonts: [], customTemplates: [], renderSettings: { mode: "normal", fixedFps: 20 } }),
          role: "editor",
          readonly: true,
          closed: false,
          members: [
            { clientId: "c-owner", role: "owner", joinedAt: "t0", lastSeenAt: "t1" },
            { clientId: "c-editor", role: "editor", joinedAt: "t1", lastSeenAt: "t1" },
          ],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/events-ticket")) return new Response(JSON.stringify({ ticket: "ticket" }), { status: 201, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    globalThis.fetch = request as typeof fetch;
    try {
      click(container.querySelector('[aria-label="增量在线协作"]')!);
      changeInput(container.querySelector<HTMLInputElement>('[aria-label="协作房间码"]')!, roomId);
      changeInput(container.querySelector<HTMLInputElement>('[aria-label="协作邀请凭证"]')!, "editor-invite");
      click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "加入")!);
      await vi.waitFor(() => expect(container.textContent).toContain("已加入房间"));
      expect(container.textContent).toContain("模式：只读");
      expect(container.textContent).toContain("房间为只读模式");
      expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent === "设为只读")).toBe(false);
      expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent === "关闭房间")).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      vi.unstubAllGlobals();
      globalThis.EventSource = originalEventSource;
    }
  });

  it("shows a closed room as closed and hides every room control", async () => {
    const container = renderApp();
    const roomId = "VIEW03";
    const originalEventSource = globalThis.EventSource;
    class QuietEventSource {
      addEventListener() {}
      onerror = null;
      close() {}
      constructor(public readonly url: string) {}
    }
    vi.stubGlobal("EventSource", QuietEventSource);
    const remoteProject = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
    const originalFetch = globalThis.fetch;
    const request = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(`/api/rooms/${roomId}/join`)) {
        return new Response(JSON.stringify({ room: { id: roomId }, access: { accessToken: "editor-token", role: "editor", participantId: "editor", id: "editor", displayName: "编辑者" } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith(`/api/rooms/${roomId}`)) {
        return new Response(JSON.stringify({
          id: roomId,
          version: 1,
          ready: true,
          snapshot: createProjectPackage({ project: remoteProject, assets: [], fonts: [], customTemplates: [], renderSettings: { mode: "normal", fixedFps: 20 } }),
          role: "editor",
          readonly: true,
          closed: true,
          members: [{ clientId: "c-owner", role: "owner", joinedAt: "t0", lastSeenAt: "t0" }],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/events-ticket")) return new Response(JSON.stringify({ ticket: "ticket" }), { status: 201, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    globalThis.fetch = request as typeof fetch;
    try {
      click(container.querySelector('[aria-label="增量在线协作"]')!);
      changeInput(container.querySelector<HTMLInputElement>('[aria-label="协作房间码"]')!, roomId);
      changeInput(container.querySelector<HTMLInputElement>('[aria-label="协作邀请凭证"]')!, "editor-invite");
      click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "加入")!);
      await vi.waitFor(() => expect(container.textContent).toContain("模式：已关闭"));
      expect(container.textContent).toContain("房间已关闭");
      expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent === "设为只读")).toBe(false);
      expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent === "关闭房间")).toBe(false);
      expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent === "邀请编辑者")).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      vi.unstubAllGlobals();
      globalThis.EventSource = originalEventSource;
    }
  });

  it("keeps a browser draft authoritative when a server workspace also exists", async () => {
    const localProject = createProjectDocument({
      students: [{ ...sampleStudents[0], name: "浏览器草稿" }],
      templateId: "original",
      dataView: "province",
    });
    window.localStorage.setItem("cengfan-map-studio:draft", serializeProjectDocument(localProject));
    const request = vi.spyOn(globalThis, "fetch");

    const container = renderApp(false);
    await Promise.resolve();

    expect(container.textContent).toContain("浏览器草稿");
    expect(request).not.toHaveBeenCalledWith("/api/workspace", expect.anything());
    request.mockRestore();
  });

  it("never lets a server workspace overwrite the local browser workspace on startup", async () => {
    const legacyProject = createProjectDocument({
      students: [{ ...sampleStudents[0], name: "旧版原始草稿" }],
      templateId: "original",
      dataView: "province",
    });
    const serverProject = createProjectDocument({
      students: [{ ...sampleStudents[0], name: "服务器持久数据" }],
      templateId: "original",
      dataView: "province",
    });
    const serverPackage = createProjectPackage({
      project: serverProject,
      assets: [],
      fonts: [],
      customTemplates: [],
      renderSettings: { mode: "normal", fixedFps: 20 },
      now: new Date("2026-07-27T15:00:00.000Z"),
    });
    window.localStorage.setItem("cengfan-map-studio:draft", serializeProjectDocument(legacyProject));
    window.localStorage.setItem("cengfan-map-studio:workspace-mirror", JSON.stringify(createProjectPackage({
      project: legacyProject,
      assets: [],
      fonts: [],
      customTemplates: [],
      renderSettings: { mode: "normal", fixedFps: 20 },
      now: new Date("2026-07-27T16:00:00.000Z"),
    })));
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      kind: "cengfan-workspace",
      version: 1,
      projectPackage: serverPackage,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const container = renderApp(false);
    await Promise.resolve();

    expect(container.textContent).toContain("旧版原始草稿");
    expect(container.textContent).not.toContain("服务器持久数据");
    expect(request).not.toHaveBeenCalledWith("/api/workspace", expect.anything());
    request.mockRestore();
  });

  it("immediately overwrites the compatibility draft and complete local mirror", () => {
    const container = renderApp();
    window.localStorage.setItem("cengfan-map-studio:draft", "stale-local-data");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="强制保存到浏览器本地"]')!);

    const saved = window.localStorage.getItem("cengfan-map-studio:draft");
    expect(saved).toContain("林舟");
    expect(saved).not.toContain("stale-local-data");
    const mirror = window.localStorage.getItem("cengfan-map-studio:workspace-mirror");
    expect(mirror).toContain("林舟");
    expect(mirror).toContain("renderSettings");
  });

  it("asks whether to include the resource pack before exporting a project", () => {
    const container = renderApp();

    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("导出工程"))!);

    const dialog = container.querySelector<HTMLElement>('[role="dialog"][aria-label="导出工程确认"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("包含资源包");
    expect(dialog?.textContent).toContain("地图背景、地图贴图、素材和字体");
    expect(dialog?.querySelector<HTMLInputElement>('input[aria-label="导出时包含资源包"]')?.checked).toBe(true);
    expect(dialog?.querySelector<HTMLButtonElement>('button[aria-label="确认导出工程"]')).not.toBeNull();
  });

  it("immediately applies imported backgrounds, province textures and resource catalog", () => {
    const importedProject = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
    importedProject.canvas = {
      ...importedProject.canvas,
      backgroundImageSrc: "data:image/png;base64,QkFDS0dST1VORA==",
    };
    importedProject.map = {
      ...importedProject.map,
      provinceStyles: {
        ...importedProject.map.provinceStyles,
        北京市: {
          appearance: {
            kind: "texture",
            assetId: "imported-texture",
            src: "data:image/png;base64,VEVYVFVSRS==",
            fit: "contain",
          },
        },
      },
    };
    const pack = createProjectPackage({
      project: importedProject,
      assets: [{
        id: "imported-texture",
        label: "导入的北京贴图",
        kind: "province-texture",
        src: "data:image/png;base64,VEVYVFVSRS==",
        provinceIds: ["北京市"],
        source: "user",
      }],
      fonts: [],
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    class ImmediateFileReader {
      result: string | ArrayBuffer | null = null;
      onload: null | (() => void) = null;
      readAsText() {
        this.result = JSON.stringify(pack);
        this.onload?.();
      }
    }
    vi.stubGlobal("FileReader", ImmediateFileReader);
    const container = renderApp();
    const input = container.querySelector<HTMLInputElement>('input[aria-label="导入完整工程包"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["package"], "project.json", { type: "application/json" })] });

    flushSync(() => input.dispatchEvent(new Event("change", { bubbles: true })));

    expect(container.querySelector('[data-background-image]')?.getAttribute("href")).toBe("data:image/png;base64,QkFDS0dST1VORA==");
    expect(container.querySelector('[data-province-texture]')?.getAttribute("href")).toBe("data:image/png;base64,VEVYVFVSRS==");
    click(container.querySelector<HTMLButtonElement>('.topbar .workflow-stepper button[aria-label="素材"]')!);
    expect(container.textContent).toContain("导入的北京贴图");
  }, 30_000);

  it("allows changing a legacy imported card font after its family reference is repaired", () => {
    const importedProject = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
    importedProject.cards.fieldFonts = { name: "LegacyImportHand" };
    const pack = createProjectPackage({
      project: importedProject,
      assets: [],
      fonts: [{
        id: "font-user-imported",
        label: "旧工程手写体",
        family: "LegacyImportHand",
        src: "data:font/ttf;base64,TEVHQUNZ",
        format: "truetype",
        source: "user",
      }],
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    class ImmediateFileReader {
      result: string | ArrayBuffer | null = null;
      onload: null | (() => void) = null;
      readAsText() {
        this.result = JSON.stringify(pack);
        this.onload?.();
      }
    }
    vi.stubGlobal("FileReader", ImmediateFileReader);
    const container = renderApp();
    const input = container.querySelector<HTMLInputElement>('input[aria-label="导入完整工程包"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["package"], "legacy-project.json", { type: "application/json" })] });

    flushSync(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    click(container.querySelector<SVGGElement>("[data-cards-layer]")!);
    changeSelect(container.querySelector<HTMLSelectElement>("#cards-font-name")!, "font-system-kaiti");

    const card = container.querySelector("[data-destination-card]")!;
    expect(Array.from(card.querySelectorAll("[data-card-row-line] tspan"))
      .some((fragment) => fragment.textContent?.trim() && (fragment.getAttribute("font-family") ?? "").includes("KaiTi")))
      .toBe(true);
  }, 30_000);

  it("does not overwrite browser storage when the page is hidden", () => {
    const container = renderApp();
    openPeopleData(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="编辑 林舟"]')!);
    changeInput(container.querySelector<HTMLInputElement>('input[aria-label="编辑学生名称"]')!, "刷新前林舟");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="保存 林舟"]')!);

    window.dispatchEvent(new Event("pagehide"));

    expect(window.localStorage.getItem("cengfan-map-studio:draft")).toBeNull();
  });


  it("applies an edited city to the map destination card", () => {
    const container = renderApp();
    openPeopleData(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="编辑 林舟"]')!);
    changeInput(container.querySelector<HTMLInputElement>('input[aria-label="编辑城市"]')!, "杭州市");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="保存 林舟"]')!);
    leaveFocusedWorkspace(container);

    const cards = Array.from(container.querySelectorAll('[data-destination-card]'));
    const card = cards.find((candidate) => candidate.textContent?.includes("林舟"));
    expect(card).not.toBeUndefined();
    expect(card?.getAttribute("data-destination-card")).toBe("浙江省");
  });

  it("links a selected spreadsheet row to its live map marker", () => {
    const container = renderApp();
    openPeopleData(container);

    click(container.querySelector('[data-student-row="student-1"]')!);
    leaveFocusedWorkspace(container);

    expect(container.querySelector('[data-student-pin="student-1"]')).not.toBeNull();
    expect(container.querySelector('[data-student-pin="student-1"]')?.getAttribute("data-selected")).toBe("true");
  });

  it("applies pasted text import to the project and poster", () => {
    const container = renderApp();
    openPeopleData(container);
    changeInput(container.querySelector("textarea")!, "苏禾 浙江大学 杭州\n顾言 复旦大学 上海");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("识别文本"))!);
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("追加导入"))!);

    expect(container.textContent).toContain("苏禾");
    expect(container.textContent).toContain("顾言");
    leaveFocusedWorkspace(container);
    const cards = Array.from(container.querySelectorAll('[data-destination-card]')).map((card) => card.textContent);
    expect(cards.some((text) => text?.includes("苏禾"))).toBe(true);
  });

  it("replaces the project dataset with confirmed import candidates", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const container = renderApp();
    openPeopleData(container);
    changeInput(container.querySelector("textarea")!, "新同学 北京大学 北京");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("识别文本"))!);
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("替换全部"))!);

    expect(container.querySelectorAll('[data-student-row]')).toHaveLength(1);
    expect(container.querySelector('[data-student-row]')?.textContent).toContain("新同学");
    leaveFocusedWorkspace(container);
    expect(container.querySelector('[data-destination-card]')?.textContent).toContain("新同学");
  });

  it("applies a saved canonical scene while keeping the current people", () => {
    const scene = createProjectDocument({ students: [], templateId: "scenery", dataView: "province" });
    scene.textElements = scene.textElements.map((element) =>
      element.id === "text-title" ? { ...element, content: "模板标题" } : element,
    );
    const template = createCustomTemplateFromProject({
      name: "可应用场景",
      baseTemplateId: "scenery",
      scope: "visual",
      overrides: {},
      scene,
      students: [],
    });
    saveCustomTemplates([template]);
    const container = renderApp(false);
    openDesignTool(container, "模板");
    const templateButton = container.querySelector<HTMLButtonElement>('button[aria-label="选择可应用场景"]');
    expect(templateButton).not.toBeNull();
    click(templateButton!);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="应用模板"]')!);

    expect(container.textContent).toContain("模板标题");
    expect(container.textContent).toContain("林舟");
  });

  it("applies valid material panel actions without offering built-in landmarks or decorations", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('.topbar .workflow-stepper button[aria-label="素材"]')!);

    const background = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("设为背景"))!;
    click(background);
    expect(container.querySelector("[data-background-image]")).not.toBeNull();

    expect(container.textContent).not.toContain("添加地标");
    expect(container.textContent).not.toContain("添加装饰");
  }, 30_000);

  it("imports an SVG as a selected, resizable canvas element", () => {
    const originalFileReader = globalThis.FileReader;
    class ImmediateFileReader {
      result = "data:image/svg+xml;base64,PHN2Zy8+";
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() { this.onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>); }
    }
    vi.stubGlobal("FileReader", ImmediateFileReader);
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('.topbar .workflow-stepper button[aria-label="素材"]')!);

    const input = container.querySelector<HTMLInputElement>("#asset-svg-canvas-upload")!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["<svg />"], "校徽.svg", { type: "image/svg+xml" })],
    });
    flushSync(() => input.dispatchEvent(new Event("change", { bubbles: true })));

    const image = Array.from(container.querySelectorAll<SVGImageElement>("[data-asset-id]"))
      .find((element) => element.getAttribute("href") === "data:image/svg+xml;base64,PHN2Zy8+");
    expect(image).not.toBeUndefined();
    expect(container.querySelector("[data-resize-handles]")).not.toBeNull();
    expect(container.textContent).toContain("已导入画布：校徽");
    vi.stubGlobal("FileReader", originalFileReader);
  });

  it("keeps the province texture library available after removing landmark presets", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('.topbar .workflow-stepper button[aria-label="素材"]')!);
    expect(container.textContent).toContain("省份外观");
    expect(container.querySelector("#asset-province")).not.toBeNull();
    expect(container.textContent).not.toContain("地标和装饰");
  });

  it("writes manual visual controls to the canonical scene", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "cards");
    const compact = container.querySelector<HTMLInputElement>("#cards-compact-layout");
    expect(compact).not.toBeUndefined();

    click(compact!);

    expect(compact?.checked).toBe(true);
  });

  it("exposes the map-overlap switch in the primary block-style workflow", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "cards");

    const toggle = container.querySelector<HTMLInputElement>("#cards-allow-map-overlap");
    expect(toggle).not.toBeNull();
    expect(toggle?.checked).toBe(false);
    click(toggle!);
    expect(toggle?.checked).toBe(true);
  });

  it("reads visual controls from canonical scene state", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, preset: "standard", compactLayout: true };
    project.map = { ...project.map, scale: 1.2 };
    project.canvas = { ...project.canvas, backgroundColor: "#123456" };
    project.style = {
      ...project.style,
      cardPreset: "standard",
      mapScale: 1,
      backgroundColor: "#f7f4ea",
    };
    window.localStorage.setItem("cengfan-map-studio:draft", serializeProjectDocument(project));
    const container = renderApp(false);
    openGlobalSettingsSection(container, "cards");

    expect(container.querySelector<HTMLSelectElement>("#cards-template")?.value).toBe("standard");
    expect(container.querySelector<HTMLInputElement>("#cards-compact-layout")?.checked).toBe(true);
    expect(container.querySelector<HTMLInputElement>("#cards-background")?.value).toBe(project.cards.background);
  });

  it("applies connector formatting from the block style panel to the live poster", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "cards");

    changeSelect(container.querySelector<HTMLSelectElement>("#cards-connector-style")!, "straight");
    changeSelect(container.querySelector<HTMLSelectElement>("#cards-connector-dash")!, "solid");
    closeGlobalSettings(container);
    const connector = container.querySelector<SVGPathElement>("[data-destination-connector]")!;
    expect(connector.getAttribute("data-connector-style")).toBe("straight");
    expect(connector.getAttribute("stroke-dasharray")).toBeNull();
  });

  it("preserves every block style patch dispatched in the same interaction batch", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "cards");
    const style = container.querySelector<HTMLSelectElement>("#cards-connector-style")!;
    const dash = container.querySelector<HTMLSelectElement>("#cards-connector-dash")!;

    flushSync(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(style, "straight");
      style.dispatchEvent(new Event("change", { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(dash, "solid");
      dash.dispatchEvent(new Event("change", { bubbles: true }));
    });

    closeGlobalSettings(container);
    const connector = container.querySelector<SVGPathElement>("[data-destination-connector]")!;
    expect(connector.getAttribute("data-connector-style")).toBe("straight");
    expect(connector.getAttribute("stroke-dasharray")).toBeNull();
  });

  it("uses block grouping as the canonical grouping rendered on the poster", () => {
    const project = createProjectDocument({
      students: [
        { id: "same-city-a", name: "甲", university: "北京大学", city: "北京市", visibility: true },
        { id: "same-city-b", name: "乙", university: "清华大学", city: "北京市", visibility: true },
        { id: "hangzhou", name: "丙", university: "浙江大学", city: "杭州市", visibility: true },
      ],
      templateId: "original",
      dataView: "city",
    });
    project.cards = { ...project.cards, grouping: "province" };
    window.localStorage.setItem("cengfan-map-studio:draft", serializeProjectDocument(project));
    const container = renderApp(false);
    openGlobalSettingsSection(container, "cards");

    changeSelect(container.querySelector<HTMLSelectElement>("#cards-grouping")!, "city");
    closeGlobalSettings(container);

    expect(container.querySelectorAll("[data-destination-card]")).toHaveLength(2);
  });

  it("keeps display-frame card positions stable after a map update until explicitly refreshed", () => {
    const project = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, positions: { 北京市: { x: 1110, y: 700 } } };
    window.localStorage.setItem("cengfan-map-studio:draft", serializeProjectDocument(project));
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({ stage: "map", savedAt: "2026-08-04T00:00:00.000Z" }));
    const container = renderPublicApp({ clearStorage: false });
    const initialTransform = container.querySelector('[data-destination-card="北京市"]')?.getAttribute("transform");

    changeInput(container.querySelector<HTMLInputElement>("#map-x")!, "900");
    container.querySelector<HTMLInputElement>("#map-x")?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));

    expect(container.querySelector('[data-destination-card="北京市"]')?.getAttribute("transform")).toBe(initialTransform);
    click(workflowStage(container, "展示框样式"));
    expect(container.querySelector('button[aria-label="刷新展示框位置"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="一键智能排版"]')).toBeNull();
  });

  it("freezes automatic display-frame positions during a map edit and keeps them when refresh is cancelled", () => {
    const project = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
    window.localStorage.setItem("cengfan-map-studio:draft", serializeProjectDocument(project));
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({ stage: "map", savedAt: "2026-08-04T00:00:00.000Z" }));
    const container = renderPublicApp({ clearStorage: false });
    const initialTransform = container.querySelector('[data-destination-card="北京市"]')?.getAttribute("transform");

    changeInput(container.querySelector<HTMLInputElement>("#map-x")!, "900");
    container.querySelector<HTMLInputElement>("#map-x")?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(container.querySelector('[data-destination-card="北京市"]')?.getAttribute("transform")).toBe(initialTransform);

    click(workflowStage(container, "展示框样式"));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="刷新展示框位置"]')!);

    expect(confirm).toHaveBeenCalledTimes(1);
    click(workflowStage(container, "内容与排版"));
    expect(container.querySelector('[data-destination-card="北京市"]')?.getAttribute("transform")).toBe(initialTransform);
  });

  it("locates a text layout issue without leaving the content stage", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.textElements = project.textElements.map((element) => element.id === "text-title"
      ? { ...element, color: "#ffffff" }
      : element);
    window.localStorage.setItem("cengfan-map-studio:draft", serializeProjectDocument(project));
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({ stage: "content", savedAt: "2026-08-04T00:00:00.000Z" }));
    const container = renderPublicApp({ clearStorage: false });

    // The assistant rail lives in the topbar drawer for the public content shell.
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开AI助手与高级功能"]')!);
    const drawer = document.querySelector(".studio-assistant-drawer")!;
    click(drawer.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="studio-advanced-panel"]')!);
    click(drawer.querySelector<HTMLButtonElement>('button[aria-label="打开元素查看"]')!);
    const issue = Array.from(drawer.querySelectorAll<HTMLButtonElement>('section[aria-label="排版问题提示"] button'))
      .find((button) => button.textContent?.includes("text-title"));
    expect(issue).not.toBeUndefined();
    click(issue!);

    expect(container.querySelector('main[aria-label="内容与排版"]')).not.toBeNull();
    expect(container.querySelector('[data-text-id="text-title"]')?.classList.contains("is-selected")).toBe(true);
  });

  it("opens the upload workbench for the data stage without template or map presentation controls", async () => {
    const container = renderApp();
    const { act } = await import("react");
    click(workflowStage(container, "数据与素材"));
    // DataUploadWorkspace is lazy: flush the module-resolution microtask.
    await act(async () => {});

    expect(container.querySelector('main[aria-label="数据与素材工作台"]')).not.toBeNull();
    expect(container.querySelector(".student-table")).not.toBeNull();
    expect(container.textContent).not.toContain("地图呈现方式");
    expect(container.textContent).not.toContain("模板应用");
    expect(container.textContent).not.toContain("模板列表");
  });

  it("restores the upload workbench when the saved stage is data", () => {
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({
      stage: "data",
      savedAt: "2026-08-05T10:00:00.000Z",
    }));
    const container = renderPublicApp({ clearStorage: false });

    expect(container.querySelector('main[aria-label="数据与素材工作台"]')).not.toBeNull();
    expect(container.querySelector(".student-table")).not.toBeNull();
    leaveFocusedWorkspace(container);

    expect(container.querySelector('main[aria-label="数据与素材工作台"]')).toBeNull();
    expect(container.querySelector('main[aria-label="内容与排版"]')).not.toBeNull();
  });

  it("leaves the upload stage through top-level workflow navigation", () => {
    const container = renderApp();
    openGlobalData(container);
    leaveFocusedWorkspace(container);

    expect(container.querySelector('main[aria-label="数据与素材工作台"]')).toBeNull();
    expect(container.querySelector(".workspace")).not.toBeNull();
    expect(container.querySelector('.workflow-stage-stepper button[aria-current="step"]')?.getAttribute("aria-label")).toBe("内容与排版");
  });

  it("connects upload row selection to the active poster marker", () => {
    const container = renderApp();
    openGlobalData(container);
    click(container.querySelector('[data-student-row="student-1"]')!);
    leaveFocusedWorkspace(container);

    expect(container.querySelector('[data-student-pin="student-1"]')?.getAttribute("data-selected")).toBe("true");
  });

  it("opens the upload workbench from the legacy global settings entry without exposing old navigation", () => {
    const container = renderLegacyApp();
    openRailAdvancedTab(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);
    click(container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-cards"]')!);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局数据"]')!);

    expect(container.querySelector('main[aria-label="数据与素材工作台"]')).not.toBeNull();
    expect(container.querySelector(".student-table")).not.toBeNull();
    expect(container.querySelector(".workflow-stepper")).toBeNull();
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开AI助手与高级功能"]')!);
    expect(document.querySelector('.MuiDrawer-root .studio-assistant-rail')).not.toBeNull();
    expect(document.querySelectorAll('.MuiDrawer-root [role="tab"]')).toHaveLength(3);
    expect(Array.from(document.querySelectorAll('.MuiDrawer-root [role="tab"]')).map((tab) => tab.textContent)).toEqual(["AI 助手", "本阶段", "高级功能"]);
  });

  it("restores the latest workspace stage from a valid browser session", () => {
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({
      stage: "content",
      selectedProvince: "北京市",
      selectedObject: "cards",
      savedAt: "2026-08-05T10:00:00.000Z",
    }));

    const container = renderApp(false);

    expect(container.querySelector('.workflow-stage-stepper button[aria-current="step"]')?.getAttribute("aria-label")).toBe("内容与排版");
    expect(container.querySelector(".workflow-panel--content")).not.toBeNull();
  });

  it("does not restore a stale province after the canvas selection is cleared", () => {
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({
      stage: "content",
      selectedProvince: "北京市",
      savedAt: "2026-08-05T10:00:00.000Z",
    }));

    const container = renderApp(false);
    click(container.querySelector<SVGSVGElement>("svg.poster")!);

    expect(JSON.parse(window.localStorage.getItem(WORKSPACE_SESSION_STORAGE_KEY) ?? "{}")).not.toHaveProperty("selectedProvince");
  });

  it("opens the full-screen template workbench as the first workflow stage", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('[aria-label="选择模板"]')!);

    expect(container.querySelector('main[aria-label="模板选择工作台"]')).not.toBeNull();
    expect(container.textContent).toContain("选择模板");
    expect(container.textContent).toContain("1500 × 1000 px");
    expect(container.querySelector("svg[data-template-preview]")).not.toBeNull();
  });

  it("keeps temporary template selection out of the project until apply", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('[aria-label="选择模板"]')!);
    const before = container.querySelector("svg[data-template-preview]")?.getAttribute("data-template-id");

    click(container.querySelector<HTMLButtonElement>('button[aria-label="选择卡通画风"]')!);

    expect(container.textContent).toContain("将应用：卡通画风");
    expect(container.querySelector("svg[data-template-preview]")?.getAttribute("data-template-id")).toBe("cartoon");
    expect(before).toBe("original");
    expect(container.querySelector(".template-workspace__history")?.textContent).toContain("尚未写入工程");
  });

  it("applies a selected template while retaining student data", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('[aria-label="选择模板"]')!);

    click(container.querySelector<HTMLButtonElement>('button[aria-label="选择卡通画风"]')!);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="应用模板"]')!);

    expect(container.querySelector('main[aria-label="模板选择工作台"]')).toBeNull();
    expect(container.textContent).toContain("林舟");
    click(container.querySelector<HTMLButtonElement>('[aria-label="选择模板"]')!);
    expect(container.querySelector(".template-workspace__history")?.textContent).toContain("已写入 1 步");
    expect(container.textContent).toContain("卡通画风");
  });

  it("opens the display frame stage as a dedicated workbench with topbar undo/redo", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('[aria-label="展示框样式"]')!);

    expect(container.querySelector('main[aria-label="展示框样式"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="固定自由排布"]')).not.toBeNull();
    expect(container.querySelector(".workspace")).toBeNull();
    expect(container.querySelector('main[aria-label="展示框样式"] .display-frame-workspace__header')).toBeNull();
    expect(container.querySelector('.topbar button[aria-label="刷新展示框位置"]')).not.toBeNull();
    expect(container.querySelector('aside[aria-label="展示框公共样式"]')).not.toBeNull();

    const topbar = container.querySelector(".topbar-actions")!;
    expect(topbar.querySelector('[aria-label="历史与缩放"]')).not.toBeNull();
    expect(topbar.querySelector('[aria-label="界面主题"]')).not.toBeNull();

    click(workflowStage(container, "内容与排版"));
    expect(container.querySelector('main[aria-label="展示框样式"]')).toBeNull();
    expect(container.querySelector(".workspace")).not.toBeNull();
  });

  it("keeps the unified topbar with six-stage navigation while editing data", () => {
    const container = renderApp();
    openGlobalData(container);

    expect(container.querySelector('main[aria-label="数据与素材工作台"]')).not.toBeNull();
    expect(container.querySelector('.workflow-stage-stepper')).not.toBeNull();
    expect(container.querySelector('.topbar .brand')).not.toBeNull();
    expect(container.querySelector('.workflow-stage-stepper button[aria-current="step"]')?.getAttribute("aria-label")).toBe("数据与素材");
    // 工作台内部不再重复渲染步骤条
    expect(container.querySelector('main[aria-label="数据与素材工作台"] .workflow-stage-stepper')).toBeNull();

    click(workflowStage(container, "地图样式"));
    expect(container.querySelector('main[aria-label="地图样式"]')).not.toBeNull();
    expect(container.querySelector('main[aria-label="数据与素材工作台"]')).toBeNull();
  });

  it("opens the map style stage as a dedicated workbench", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('[aria-label="地图样式"]')!);

    expect(container.querySelector('main[aria-label="地图样式"]')).not.toBeNull();
    expect(container.querySelectorAll('[role="group"][aria-label="地图表达"] button')).toHaveLength(5);
    expect(container.querySelector(".workflow-panel--map")).toBeNull();
    expect(container.querySelector("main[aria-label=\"全局设置\"]")).toBeNull();
  });

  it("keeps province selection and styling inside the map stage", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('[aria-label="地图样式"]')!);
    click(container.querySelector<SVGPathElement>("[data-province-hit]")!);

    expect(container.querySelector('.workflow-stage-stepper button[aria-current="step"]')?.getAttribute("aria-label")).toBe("地图样式");
    expect(container.querySelector('main[aria-label="地图样式"]')).not.toBeNull();
    expect(container.querySelector(".province-inspector")?.textContent).toContain("北京市");
    expect(container.querySelector('.topbar .workflow-stepper button[aria-label="素材"]')).toBeNull();
  });

  it("keeps map style patches undoable in the map stage", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('[aria-label="地图样式"]')!);
    const collapse = container.querySelector<HTMLInputElement>("#map-collapse-south-sea")!;
    click(collapse);

    expect(collapse.checked).toBe(true);
    const undo = container.querySelector<HTMLButtonElement>('button[aria-label^="撤销：更新地图"]')!;
    expect(undo).not.toBeNull();
    click(undo);

    expect(container.querySelector<HTMLInputElement>("#map-collapse-south-sea")?.checked).toBe(false);
  });

  it("organizes the actual editor into six user workflow workspaces", () => {
    const container = renderApp();
    const tabs = container.querySelector(".workflow-stage-stepper")!;
    expect(tabs.querySelectorAll("button")).toHaveLength(6);
    expect(Array.from(tabs.querySelectorAll("button")).map((button) => button.textContent?.trim())).toEqual([
      "1选择模板",
      "2数据与素材",
      "3地图样式",
      "4展示框样式",
      "5内容与排版",
      "6最终导出",
    ]);
    expect(container.querySelector(".workspace-nav")).toBeNull();

    click(tabs.querySelector<HTMLButtonElement>('[aria-label="数据与素材"]')!);
    expect(container.querySelector('main[aria-label="数据与素材工作台"]')).not.toBeNull();
    expect(container.textContent).not.toContain("地图呈现方式");
    leaveFocusedWorkspace(container);

    const editorTabs = container.querySelector(".workflow-stage-stepper")!;
    click(editorTabs.querySelector<HTMLButtonElement>('[aria-label="地图样式"]')!);
    expect(container.textContent).toContain("地图表达");

    click(container.querySelector<HTMLButtonElement>('.workflow-stage-stepper button[aria-label="最终导出"]')!);
    expect(container.textContent).toContain("交付检查");
  });

  it("opens global settings as a standalone fullscreen screen and returns to the editor", () => {
    const container = renderLegacyApp();

    expect(container.querySelector(".topbar")).not.toBeNull();
    expect(container.querySelector(".workspace")).not.toBeNull();

    openRailAdvancedTab(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);

    expect(container.querySelector('main[aria-label="全局设置"]')).not.toBeNull();
    expect(container.querySelector(".topbar")).not.toBeNull();
    expect(container.querySelectorAll(".workflow-stage-stepper button")).toHaveLength(6);
    expect(container.querySelector(".workspace")).toBeNull();
    expect(container.querySelector(".sidebar")).toBeNull();
    expect(container.querySelector(".inspector")).toBeNull();

    closeGlobalSettings(container);

    expect(container.querySelector('main[aria-label="全局设置"]')).toBeNull();
    expect(container.querySelector(".topbar")).not.toBeNull();
    expect(container.querySelector(".workspace")).not.toBeNull();
    expect(container.querySelector("#canvas-width")).toBeNull();
  });

  it("edits every global settings section through the current project history", () => {
    const container = renderApp();
    openRailAdvancedTab(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);

    const settings = container.querySelector<HTMLElement>('main[aria-label="全局设置"]')!;
    expect(Array.from(settings.querySelectorAll('[role="tab"] strong')).map((label) => label.textContent?.trim())).toEqual([
      "画布设置",
      "地图展示框",
      "数据板块",
      "辅助板块",
      "字体排版",
      "高级设置",
    ]);

    expect(settings.querySelector<HTMLInputElement>("#canvas-width")?.value).toBe("1500");
    click(settings.querySelector<HTMLInputElement>("#canvas-background-opacity")!);
    click(settings.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-map"]')!);
    click(settings.querySelector<HTMLInputElement>("#map-collapse-south-sea")!);
    const undo = container.querySelector<HTMLButtonElement>('.global-settings-history button:first-child')!;
    expect(undo.disabled).toBe(false);
    click(undo);
    expect(container.querySelector<HTMLInputElement>("#map-collapse-south-sea")?.checked).toBe(false);

    expect(settings.querySelector("#map-width")).toBeNull();

    click(settings.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-cards"]')!);
    expect(settings.textContent).toContain("学生数据中心");
    expect(settings.querySelector(".student-table")).not.toBeNull();
    expect(settings.querySelector("#cards-layout-mode")).toBeNull();
    click(settings.querySelector<HTMLButtonElement>('button[aria-label="数据展示设置"]')!);
    expect(settings.querySelector("#cards-layout-mode")).not.toBeNull();
    expect(settings.querySelector("#cards-x")).toBeNull();
    expect(settings.querySelector<HTMLButtonElement>('button[aria-label="一键智能排版"]')).toBeNull();
    expect(settings.querySelector<HTMLButtonElement>('button[aria-label="刷新展示框位置"]')).toBeNull();

    click(settings.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-guests"]')!);
    expect(settings.querySelector("#guests-width")).toBeNull();
    expect(settings.querySelector(".guest-people-editor")).toBeNull();

    click(settings.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-typography"]')!);
    expect(settings.querySelector("#typography-province-font")).not.toBeNull();
    expect(settings.querySelector("#typography-roster-font")).not.toBeNull();
  });

  it("groups global settings sections into global design and other settings", () => {
    const container = renderApp();
    openRailAdvancedTab(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);

    const settings = container.querySelector<HTMLElement>('main[aria-label="全局设置"]')!;
    const nav = settings.querySelector(".global-settings-nav")!;
    const groupHeadings = Array.from(nav.querySelectorAll(".global-settings-group-label"))
      .map((el) => el.textContent?.trim());
    expect(groupHeadings).toEqual(["全局设计", "其他设置"]);

    // 6 个 tab 仍是同一 tablist，顺序不变
    const tabs = Array.from(settings.querySelectorAll('[role="tab"]'));
    expect(tabs.map((tab) => tab.getAttribute("aria-controls"))).toEqual([
      "global-settings-canvas",
      "global-settings-map",
      "global-settings-cards",
      "global-settings-guests",
      "global-settings-typography",
      "global-settings-advanced",
    ]);

    // 流程核心分区归入全局设计组，辅助板块/字体排版归入其他设置组
    const groupOf = (controls: string) => tabs
      .find((tab) => tab.getAttribute("aria-controls") === controls)!
      .closest(".global-settings-group")
      ?.querySelector(".global-settings-group-label")?.textContent;
    expect(groupOf("global-settings-canvas")).toContain("全局设计");
    expect(groupOf("global-settings-cards")).toContain("全局设计");
    expect(groupOf("global-settings-guests")).toContain("其他设置");
    expect(groupOf("global-settings-typography")).toContain("其他设置");
    expect(groupOf("global-settings-advanced")).toContain("其他设置");
  });

  it("moves card expressions and name formats into global advanced settings", () => {
    const container = renderApp();
    openRailAdvancedTab(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);

    const settings = container.querySelector<HTMLElement>('main[aria-label="全局设置"]')!;
    const advancedTab = settings.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-advanced"]')!;
    expect(advancedTab).not.toBeNull();
    click(advancedTab);

    expect(settings.querySelector("#cards-expression-row")).not.toBeNull();
    expect(settings.querySelector("#cards-name-format-custom")).not.toBeNull();
    expect(settings.querySelector(".cards-name-format__presets button")?.textContent).toBe("完整姓名");
    expect(Array.from(settings.querySelectorAll(".cards-name-format__presets button")).map((button) => button.textContent)).toContain("Wxm（首字母）");

    closeGlobalSettings(container);
    expect(container.querySelector(".inspector .cards-expressions")).toBeNull();
    expect(container.querySelector(".inspector .cards-name-format")).toBeNull();
  });

  it("keeps full map, data-frame and guest controls in the right inspector", () => {
    const container = renderApp();

    click(container.querySelector<SVGGElement>("[data-map-selection-overlay]")!);
    expect(container.querySelector("#map-x")).not.toBeNull();
    expect(container.querySelector("#map-width")).not.toBeNull();
    expect(container.querySelector("#map-land-color")).not.toBeNull();

    click(container.querySelector<SVGGElement>("[data-cards-layer]")!);
    expect(container.querySelector("#cards-x")).not.toBeNull();
    expect(container.querySelector("#cards-maxWidth")).not.toBeNull();
    expect(container.querySelector("#cards-layout-mode")).not.toBeNull();
    expect(container.querySelector('button[aria-label="一键智能排版"]')).toBeNull();
    expect(container.querySelector('button[aria-label="刷新展示框位置"]')).toBeNull();

    click(container.querySelector<SVGGElement>('[aria-label="特邀嘉宾"]')!);
    expect(container.querySelector("#guests-x")).not.toBeNull();
    expect(container.querySelector("#guests-width")).not.toBeNull();
    expect(container.querySelector("#guests-background")).not.toBeNull();
    expect(container.querySelector(".guest-people-editor")).not.toBeNull();
  });

  it("keeps frequent actions visible and groups low-frequency project actions", () => {
    const container = renderApp();
    const topbar = container.querySelector(".topbar-actions")!;

    expect(topbar.querySelector('[aria-label="历史与缩放"]')).not.toBeNull();
    expect(topbar.querySelector('[aria-label="导出与工程"]')).not.toBeNull();
    expect(topbar.textContent).not.toContain("存模板");
    expect(topbar.querySelector('[aria-label="在线协作"]')).toBeNull();

    expect(topbar.querySelector(".primary-button")?.textContent).toContain("导出 PNG");
    const projectMenu = container.querySelector(".topbar .project-menu")!;
    expect(projectMenu).not.toBeNull();
    expect(projectMenu.textContent).toContain("导出 SVG");
    expect(projectMenu.textContent).toContain("导入工程");
    expect(projectMenu.textContent).toContain("在线协作");

    expect(container.querySelectorAll<HTMLButtonElement>(".workflow-stage-stepper button")).toHaveLength(6);
    expect(container.querySelector('[role="tab"][aria-controls="studio-advanced-panel"]')).not.toBeNull();
  });

  it("removes legacy toolbar action clusters while keeping the canvas rendered", () => {
    const container = renderApp();
    expect(container.querySelector(".editor-toolbar-actions")).toBeNull();
    expect(container.querySelectorAll(".control-cluster")).toHaveLength(0);
    expect(container.querySelector(".canvas-stage .poster")).not.toBeNull();
  });

  it("opens global typography settings and applies one province font to the live map", () => {
    const container = renderApp();
    openRailAdvancedTab(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);
    click(container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-typography"]')!);

    expect(container.textContent).toContain("字体工具");
    changeSelect(container.querySelector<HTMLSelectElement>("#typography-province")!, "陕西省");
    changeSelect(container.querySelector<HTMLSelectElement>("#typography-province-font")!, "font-system-kaiti");
    closeGlobalSettings(container);

    const shaanxi = Array.from(container.querySelectorAll("[data-province-label]"))
      .find((label) => label.textContent?.startsWith("陕西"));
    expect(shaanxi?.getAttribute("font-family")).toContain("KaiTi");
  });

  it("applies a data-card font selection from the inspector to the live card rows", () => {
    const container = renderApp();
    click(container.querySelector<SVGGElement>("[data-cards-layer]")!);

    changeSelect(container.querySelector<HTMLSelectElement>("#cards-font-name")!, "font-system-kaiti");

    const card = container.querySelector("[data-destination-card]")!;
    expect(Array.from(card.querySelectorAll("[data-card-row-line] tspan"))
      .some((fragment) => fragment.textContent?.trim() && (fragment.getAttribute("font-family") ?? "").includes("KaiTi")))
      .toBe(true);
  });

  it("applies an uploaded font selected in global typography settings to the live canvas", () => {
    const project = createProjectDocument({
      students: sampleStudents,
      templateId: "original",
      dataView: "province",
    });
    const font = {
      id: "font-user-canvas-hand",
      label: "画布手写体",
      family: "CanvasHand",
      src: "data:font/ttf;base64,AA==",
      format: "truetype" as const,
      source: "user" as const,
    };
    window.localStorage.setItem("cengfan-map-studio:workspace-mirror", JSON.stringify(createProjectPackage({
      project,
      assets: [],
      fonts: [font],
    })));

    const container = renderApp(false);
    openRailAdvancedTab(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);
    click(container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-typography"]')!);
    changeSelect(container.querySelector<HTMLSelectElement>("#typography-canvas-font")!, font.id);
    closeGlobalSettings(container);

    expect(container.querySelector('[data-text-id="text-eyebrow"] text')?.getAttribute("font-family")).toBe('"CanvasHand"');
  });

  it("supports undo redo canvas size grid and inspector editing", () => {
    const container = renderApp();
    const undo = container.querySelector<HTMLButtonElement>('button[aria-label="暂无可撤销操作"]')
      ?? container.querySelector<HTMLButtonElement>('.topbar-actions button[title^="撤销"]')!;
    const redo = container.querySelector<HTMLButtonElement>('button[aria-label="暂无可重做操作"]')
      ?? container.querySelector<HTMLButtonElement>('.topbar-actions button[title^="重做"]')!;
    expect(undo.disabled).toBe(true);
    expect(redo.disabled).toBe(true);

    openGlobalSettingsSection(container, "cards");
    click(container.querySelector<HTMLInputElement>("#cards-compact-layout")!);
    const settingsUndo = container.querySelector<HTMLButtonElement>(".global-settings-history button:first-child")!;
    const settingsRedo = container.querySelector<HTMLButtonElement>(".global-settings-history button:nth-child(2)")!;
    expect(settingsUndo.disabled).toBe(false);

    click(settingsUndo);
    expect(container.querySelector<HTMLInputElement>("#cards-compact-layout")?.checked).toBe(false);
    expect(settingsRedo.disabled).toBe(false);
    click(settingsRedo);
    expect(container.querySelector<HTMLInputElement>("#cards-compact-layout")?.checked).toBe(true);
    closeGlobalSettings(container);

    openRailAdvancedTab(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);
    changeSelect(container.querySelector<HTMLSelectElement>("#canvas-size-preset")!, "square-1080");
    closeGlobalSettings(container);
    const svg = container.querySelector("svg.poster")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 1080 1080");
  }, 40_000);

  it("applies persisted preview frame modes to canvas drag rendering", () => {
    window.localStorage.setItem("cengfan-map-studio:render-settings", JSON.stringify({ mode: "low", fixedFps: 24 }));
    const container = renderApp(false);
    const poster = container.querySelector<SVGSVGElement>("svg.poster")!;

    expect(poster.getAttribute("data-render-interval-ms")).toBe("100");

    expect(container.querySelector("#editor-render-mode")).toBeNull();
    expect(container.querySelector("#editor-grid-size")).toBeNull();
    expect(poster.getAttribute("data-render-interval-ms")).toBe("100");
  });
});

describe("App workflow guidance", () => {
  it("keeps the six-stage workflow in the visible topbar with the assistant rail in the sidebar", () => {
    const container = renderApp();

    expect(container.querySelectorAll(".workflow-stage-stepper button")).toHaveLength(6);
    expect(container.querySelector(".topbar-workflow")?.getAttribute("aria-hidden")).toBeNull();
    expect(container.querySelector(".topbar .project-menu")).not.toBeNull();
    expect(container.querySelector(".studio-sidebar .studio-assistant-rail")).not.toBeNull();
    expect(container.querySelectorAll('.studio-assistant-rail [role="tab"]')).toHaveLength(3);
  });

  it("keeps the assistant rail in the default full-screen public editor", () => {
    const container = renderPublicApp();

    expect(container.querySelector('.studio-editor-shell[data-has-left-rail="true"]')).not.toBeNull();
    expect(container.querySelector(".studio-sidebar .studio-assistant-rail")).not.toBeNull();
    expect(container.querySelectorAll(".topbar-workflow .workflow-stage-stepper button")).toHaveLength(6);
    expect(container.querySelector(".workflow-stage-stepper button")).not.toBeNull();
    expect(container.querySelector('button[aria-label="打开AI助手与高级功能"]')).not.toBeNull();
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开AI助手与高级功能"]')!);
    expect(document.querySelector('.MuiDrawer-root .studio-assistant-rail')).not.toBeNull();
    expect(container.querySelector(".topbar .project-menu")).not.toBeNull();
  });

  it("keeps the assistant rail available across focused Atelier workspaces", () => {
    const container = renderApp();

    click(workflowStage(container, "数据与素材"));
    expect(container.querySelectorAll(".topbar-workflow .workflow-stage-stepper button")).toHaveLength(6);
    expect(container.querySelector(".studio-sidebar .studio-assistant-rail")).not.toBeNull();

    click(workflowStage(container, "最终导出"));
    expect(container.querySelectorAll(".topbar-workflow .workflow-stage-stepper button")).toHaveLength(6);
    expect(container.querySelector(".studio-sidebar .studio-assistant-rail")).not.toBeNull();
  });

  it("keeps the left sidebar when Classic opens a focused workspace", () => {
    const container = renderLegacyApp();

    click(container.querySelector<HTMLButtonElement>('button[aria-label="切换到经典界面"]')!);
    click(workflowStage(container, "地图样式"));

    expect(container.querySelector<HTMLElement>(".app-shell")?.dataset.editorSkin).toBe("classic");
    expect(container.querySelector('.studio-editor-shell[data-has-left-rail="true"]')).not.toBeNull();
    expect(container.querySelectorAll(".topbar-workflow .workflow-stage-stepper button")).toHaveLength(6);
    expect(container.querySelector(".map-style-workspace")).not.toBeNull();
  });

  it("switches the editor theme without changing poster data or viewBox", () => {
    const container = renderApp();
    const shell = container.querySelector<HTMLElement>(".app-shell")!;
    const poster = container.querySelector<SVGSVGElement>("svg.poster")!;
    const toggle = container.querySelector<HTMLButtonElement>('[aria-label="切换到暗色模式"]')!;

    expect(shell.dataset.editorTheme).toBe("light");
    const viewBox = poster.getAttribute("viewBox");
    click(toggle);

    expect(shell.dataset.editorTheme).toBe("dark");
    expect(document.documentElement.dataset.editorTheme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(poster.getAttribute("viewBox")).toBe(viewBox);
    expect(window.localStorage.getItem("cengfan-map-studio:theme-mode")).toBe("dark");
  });

  it("syncs the html root skin attribute with the editor skin", () => {
    const container = renderApp();
    expect(document.documentElement.dataset.editorSkin).toBe("atelier");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="切换到经典界面"]')!);
    expect(document.documentElement.dataset.editorSkin).toBe("classic");
  });

  it("defaults the editor shell to Atelier and persists Classic without changing the poster", () => {
    const container = renderLegacyApp();
    const shell = container.querySelector<HTMLElement>(".app-shell")!;
    const poster = container.querySelector<SVGSVGElement>("svg.poster")!;
    const viewBox = poster.getAttribute("viewBox");

    expect(shell.dataset.editorSkin).toBe("atelier");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="切换到经典界面"]')!);

    expect(shell.dataset.editorSkin).toBe("classic");
    expect(window.localStorage.getItem("cengfan-map-studio:ui-skin")).toBe("classic");
    expect(poster.getAttribute("viewBox")).toBe(viewBox);
  });

  it("renders the active stage in the visible topbar workflow", () => {
    const container = renderLegacyApp();
    const steps = Array.from(container.querySelectorAll(".workflow-stage-stepper button"));

    expect(steps).toHaveLength(6);
    expect(steps[4]?.getAttribute("aria-current")).toBe("step");
    expect(steps[4]?.getAttribute("aria-label")).toBe("内容与排版");
    expect(container.querySelector(".workflow-guide")).toBeNull();
  });

  it("opens the dedicated map stage from the left workflow rail", () => {
    const container = renderApp();
    click(workflowStage(container, "地图样式"));

    expect(container.querySelector('main[aria-label="地图样式"]')).not.toBeNull();
    expect(workflowStage(container, "地图样式").getAttribute("aria-current")).toBe("step");
  });

  it("opens global canvas settings from the stable rail", () => {
    const container = renderApp();
    openRailAdvancedTab(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);

    expect(container.querySelector(".global-settings-screen")).not.toBeNull();
    expect(container.querySelector('[role="tab"][aria-controls="global-settings-canvas"]')?.getAttribute("aria-selected")).toBe("true");
  });

  it("keeps a province selection when entering the material workspace", () => {
    const container = renderApp();
    click(container.querySelector("[data-province-hit]")!);
    click(container.querySelector<HTMLButtonElement>('.topbar .workflow-stepper button[aria-label="素材"]')!);

    expect(container.querySelector(".inspector h2")?.textContent).toContain("北京市");
  });

  it("applies a template from the dedicated template stage", () => {
    const container = renderApp();
    click(workflowStage(container, "选择模板"));
    click(container.querySelector<HTMLButtonElement>('button[aria-label="选择卡通画风"]')!);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="应用模板"]')!);

    expect(container.querySelector('main[aria-label="模板选择工作台"]')).toBeNull();
    expect(container.querySelector(".project-summary")?.textContent).toContain("已记录 1 步");
  });

  it("shows the current workflow context without duplicating workflow controls", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "canvas");

    expect(container.querySelector(".global-settings-screen .workflow-guide")).toBeNull();
    expect(container.querySelector(".global-settings-guide__step")?.textContent).toContain("全局布局");
    expect(container.querySelector(".global-settings-guide__note")?.textContent).toContain("集中设置画布");
    click(container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-map"]')!);
    expect(container.querySelector('[role="tab"][aria-controls="global-settings-map"]')?.getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector('[role="tab"][aria-controls="global-settings-canvas"]')?.getAttribute("aria-selected")).toBe("false");
  });

  it("applies a template from the template picker inside global settings", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "canvas");

    // 数据板块分区（数据展示视图）包含整体模板区块
    click(container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-cards"]')!);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="数据展示设置"]')!);
    const picker = container.querySelector(".global-settings-screen .template-picker");
    expect(picker).not.toBeNull();
    expect(picker?.textContent).toContain("整体模板");
    expect(Array.from(picker!.querySelectorAll(".workflow-template-grid button")).map((b) => b.textContent?.trim()))
      .toContain("原始地图");
    expect(picker!.querySelector(".workflow-template-grid button.selected")?.textContent).toContain("原始地图");

    // 应用卡通画风 → 模板高亮切换
    click(Array.from(picker!.querySelectorAll(".workflow-template-grid button"))
      .find((button) => button.textContent?.trim() === "卡通画风")!);
    expect(picker!.querySelector(".workflow-template-grid button.selected")?.textContent).toContain("卡通画风");
    // 完成设置后项目历史已记录模板应用
    closeGlobalSettings(container);
    expect(container.querySelector(".project-summary")?.textContent).toContain("已记录 1 步");
  });

  it("shows the roster step badge on the data section nav entry", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "canvas");

    // 默认样例名单全部就绪 → 数据板块导航条目显示就绪徽标
    const cardsTab = container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-cards"]')!;
    const badge = cardsTab.querySelector(".global-settings-nav__badge");
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute("data-status")).toBe("ready");
    expect(badge?.textContent).toBe("✓");
  });
});

describe("Top workflow and left assistant rail", () => {
  it("keeps public six-stage workflow in the Atelier topbar and exposes one rail advanced tab", () => {
    window.localStorage.setItem(SKIN_STORAGE_KEY, "atelier");
    const container = renderPublicApp({ clearStorage: false });

    expect(container.querySelector('.workflow-stage-stepper[aria-label="制作步骤"]')).not.toBeNull();
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开AI助手与高级功能"]')!);
    expect(document.querySelectorAll('.MuiDrawer-root [role="tab"]')).toHaveLength(3);
    expect(Array.from(document.querySelectorAll('.MuiDrawer-root [role="tab"]')).map((tab) => tab.textContent)).toEqual(["AI 助手", "本阶段", "高级功能"]);
    // 左侧常驻 rail 与打开的抽屉共用同一会话上下文,各渲染一个 docked 实例。
    expect(document.querySelectorAll('[data-agent-presentation="docked"]')).toHaveLength(2);
  });

  it("opens advanced project settings from the rail without adding an AI-bottom advanced entry", () => {
    const container = renderLegacyApp();
    click(container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="studio-advanced-panel"]')!);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);

    expect(container.querySelector('.global-settings-screen[aria-label="全局设置"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-agent-presentation="docked"] [aria-label="打开全局设置"]')).toHaveLength(0);
  });

  it("opens real advanced feature detail states from the rail", () => {
    const container = renderLegacyApp();
    openRailAdvancedTab(container);

    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开数据诊断"]')!);
    expect(container.querySelector('[role="tab"][aria-controls="global-settings-cards"]')?.getAttribute("aria-selected")).toBe("true");

    closeGlobalSettings(container);
    openRailAdvancedTab(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开渲染设置"]')!);
    expect(container.querySelector('[role="tab"][aria-controls="global-settings-advanced"]')?.getAttribute("aria-selected")).toBe("true");

    closeGlobalSettings(container);
    openRailAdvancedTab(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="管理协作与邀请"]')!);
    expect(container.querySelector<HTMLDetailsElement>(".topbar .project-menu")?.open).toBe(true);
    expect(container.querySelector('[aria-label="增量协作设置"]')).not.toBeNull();
  });
});

describe("Docked AI assistant integration", () => {
  it("removes the legacy editor toolbar and old AI sidebar tab", () => {
    const container = renderLegacyApp();
    expect(container.querySelector(".editor-toolbar")).toBeNull();
    expect(container.querySelector('[aria-label="打开 AI 助手"]')).toBeNull();
    expect(container.querySelector('[data-agent-presentation="docked"]')).not.toBeNull();
    expect(container.textContent).not.toContain("画布图层AI 助手");
    expect(container.querySelector(".content-tool-tabs")).toBeNull();
  });

  it("reaches the docked assistant in the standard content workspace through the topbar drawer", () => {
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({ stage: "content", savedAt: "2026-08-06T00:00:00.000Z" }));
    const container = renderPublicApp({ clearStorage: false });
    expect(container.querySelector('button[aria-label="打开AI助手与高级功能"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="打开 AI 助手"]')).toBeNull();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开AI助手与高级功能"]')!);
    expect(document.querySelector('[data-agent-presentation="docked"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="描述 AI 修改需求"]')).not.toBeNull();
  });

  it("keeps the assistant reachable across shell stages through the topbar drawer", () => {
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({ stage: "content", savedAt: "2026-08-06T00:00:00.000Z" }));
    const container = renderLegacyApp({ clearStorage: false });
    expect(container.querySelector('[data-agent-presentation="docked"]')).not.toBeNull();

    click(container.querySelector<HTMLButtonElement>('.workflow-stage-stepper button[aria-label="地图样式"]')!);
    expect(container.querySelector('button[aria-label="打开AI助手与高级功能"]')).not.toBeNull();
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开AI助手与高级功能"]')!);
    expect(document.querySelector('[data-agent-presentation="docked"]')).not.toBeNull();
    click(document.querySelector<HTMLButtonElement>('button[aria-label="关闭AI 助手与高级功能"]')!);

    click(container.querySelector<HTMLButtonElement>('.workflow-stage-stepper button[aria-label="内容与排版"]')!);
    expect(container.querySelector('[data-agent-presentation="docked"]')).not.toBeNull();
  });
});

describe("Shell CSS contract", () => {
  it("keeps Atelier workflow visible and defines a narrow inspector access path", () => {
    const container = renderLegacyApp();

    // The topbar workflow the Atelier skin must keep visible: present and never aria-hidden.
    const topbarWorkflow = container.querySelector(".topbar .topbar-workflow");
    expect(topbarWorkflow).not.toBeNull();
    expect(topbarWorkflow?.getAttribute("aria-hidden")).toBeNull();
    expect(container.querySelector('.workflow-stage-stepper[aria-label="制作步骤"]')).not.toBeNull();

    // The assistant rail owns the AI/advanced tab pair the CSS styles.
    expect(container.querySelector(".studio-assistant-rail")).not.toBeNull();

    // The narrow-screen inspector access control remains discoverable in the topbar.
    expect(container.querySelector(".inspector-toggle-group")).not.toBeNull();
  });
});

describe("Responsive editor shell", () => {
  it("restores adjustable desktop panel widths and exposes two separators", () => {
    const previousInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
    window.localStorage.setItem(EDITOR_PANEL_LAYOUT_STORAGE_KEY, JSON.stringify({ sidebarWidth: 270, inspectorWidth: 330 }));
    try {
      const container = renderApp(false);
      const workspace = container.querySelector<HTMLElement>(".workspace");

      expect(workspace?.style.getPropertyValue("--sidebar-width")).toBe("270px");
      expect(workspace?.style.getPropertyValue("--inspector-width")).toBe("330px");
      expect(container.querySelectorAll('[role="separator"]')).toHaveLength(2);
      expect(container.querySelector<HTMLElement>('[role="separator"][aria-label="调整左侧栏宽度"]')?.getAttribute("aria-valuenow")).toBe("270");
      expect(container.querySelector<HTMLElement>('[role="separator"][aria-label="调整右侧栏宽度"]')?.getAttribute("aria-valuenow")).toBe("330");
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: previousInnerWidth });
    }
  });

  it("opens and closes the inspector through an explicit toolbar control", () => {
    const container = renderApp();
    const openButton = container.querySelector<HTMLButtonElement>('button[aria-label="打开属性面板"]');

    expect(openButton).not.toBeNull();
    expect(openButton?.getAttribute("aria-expanded")).toBe("false");
    click(openButton!);

    expect(container.querySelector(".inspector")?.className).toContain("is-open");
    expect(openButton?.getAttribute("aria-expanded")).toBe("true");

    click(container.querySelector<HTMLButtonElement>('button[aria-label="关闭属性面板"]')!);
    expect(container.querySelector(".inspector")?.className).not.toContain("is-open");
  });

  it("keeps the top stepper as the only workflow navigation entry", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "canvas");

    expect(container.querySelector(".global-settings-screen .workflow-guide")).toBeNull();
    expect(container.querySelector(".global-settings-guide__note")).not.toBeNull();
  });

  it("keeps global settings completion explicit without a return-editor control", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "canvas");

    expect(container.querySelector('button[aria-label="返回编辑器"]')).toBeNull();
    expect(container.querySelector<HTMLButtonElement>("button.global-settings-done")?.textContent).toContain("完成");
  });
});

describe("Stage slot contract (T0)", () => {
  // 单一事实源快照：T1 把 rightRailLabel 抽成 STAGE_METADATA 时，此表是回归锚点。
  const STAGE_SLOTS = [
    ["选择模板", "模板列表"],
    ["数据与素材", "数据质量与素材"],
    ["地图样式", "地图对象属性"],
    ["展示框样式", "展示框公共样式"],
    ["内容与排版", "内容对象属性"],
    ["最终导出", "导出与检查"],
  ] as const;

  it("maps every workflow stage to its right inspector slot and active step", () => {
    const container = renderPublicApp();
    for (const [stageLabel, rightRailLabel] of STAGE_SLOTS) {
      click(workflowStage(container, stageLabel));
      expect(
        container.querySelector('.workflow-stage-stepper button[aria-current="step"]')?.getAttribute("aria-label"),
      ).toBe(stageLabel);
      expect(container.querySelector(`aside.studio-editor-shell__right[aria-label="${rightRailLabel}"]`)).not.toBeNull();
    }
  });

  it("keeps the assistant overview rail mounted in every focused stage", () => {
    const container = renderPublicApp();
    for (const [stageLabel] of STAGE_SLOTS) {
      click(workflowStage(container, stageLabel));
      expect(container.querySelector(".studio-sidebar__rail")).not.toBeNull();
    }
  });

  it("exposes the six-stage stepper as the single ordered workflow navigation", () => {
    const container = renderPublicApp();
    const labels = Array.from(container.querySelectorAll(".workflow-stage-stepper button")).map(
      (button) => button.getAttribute("aria-label"),
    );
    expect(labels).toEqual(STAGE_SLOTS.map(([label]) => label));
  });

  it("opens the global settings screen over any focused stage in public mode", () => {
    const container = renderPublicApp();
    openGlobalSettingsSection(container, "canvas");
    expect(container.querySelector('.global-settings-screen[aria-label="全局设置"]')).not.toBeNull();
    expect(container.querySelector(".studio-editor-shell")).toBeNull();

    closeGlobalSettings(container);
    expect(container.querySelector('.global-settings-screen[aria-label="全局设置"]')).toBeNull();
    expect(container.querySelector(".studio-editor-shell")).not.toBeNull();
  });
});

describe("Stage overview (T2)", () => {
  it("shows the stage overview in the left rail with progress badge and cards", () => {
    const container = renderPublicApp();
    click(workflowStage(container, "数据与素材"));
    click(container.querySelector('[role="tab"][aria-controls="studio-stage-panel"]')!);

    const panel = container.querySelector("#studio-stage-panel");
    expect(panel).not.toBeNull();
    expect(panel!.textContent).toContain("数据与素材");
    expect(panel!.querySelector("[data-stage-status]")).not.toBeNull();
    expect(panel!.querySelectorAll(".studio-stage-overview__card").length).toBeGreaterThan(0);
  });

  it("keeps the overview in sync with the active stage", () => {
    const container = renderPublicApp();
    click(container.querySelector('[role="tab"][aria-controls="studio-stage-panel"]')!);

    const templatePanel = container.querySelector("#studio-stage-panel")!;
    expect(templatePanel.textContent).toMatch(/选择模板|已选择模板/);

    click(workflowStage(container, "最终导出"));
    const exportPanel = container.querySelector("#studio-stage-panel")!;
    expect(exportPanel.textContent).toMatch(/导出状态|导出检查|数据告警|排版问题|资源缺失/);
  });
});

describe("Topbar action layering (T4)", () => {
  it("keeps global undo/redo visible in the topbar across every focused stage", () => {
    const container = renderPublicApp();
    for (const stage of ["选择模板", "数据与素材", "地图样式", "展示框样式", "内容与排版", "最终导出"]) {
      click(workflowStage(container, stage));
      expect(container.querySelector('.topbar-actions [role="group"][aria-label="历史与缩放"]')).not.toBeNull();
    }
  });

  it("marks the low-frequency theme group for narrow-screen hiding", () => {
    const container = renderPublicApp();
    const themeGroup = container.querySelector('.topbar-actions [role="group"][aria-label="界面主题"]');
    expect(themeGroup?.className).toContain("topbar-action-group--theme");
  });
});
