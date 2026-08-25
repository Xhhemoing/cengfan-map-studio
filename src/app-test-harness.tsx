// 仅供 App 测试使用的共享装置：从 src/App.test.tsx 原样搬出的挂载/交互助手与协作
// 脚本装置，供按域拆分后的 src/App.*.test.tsx 共用。
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeAll, expect, vi } from "vitest";
import { App } from "./App";
import { createProjectDocument } from "./lib/project-document";
import { createProjectPackage } from "./lib/project-package";
import { LEGACY_EDITOR_STORAGE_KEY } from "./lib/workspace-session";

export const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

/**
 * Registers the two file-level hooks every App suite depends on:
 *
 * - App.tsx lazy-loads the data workspace and full-screen settings panels.
 *   Tests drive them through synchronous clicks, so preload those modules once
 *   up front; the resolved lazy components then render synchronously.
 * - The `afterEach` drain unmounts every root the file mounted, so an assertion
 *   that throws mid-test still tears the root down (the `setupFiles` leaked-root
 *   guard reports a missing net, it does not stand in for one).
 */
export function installAppTestHarness(): void {
  beforeAll(async () => {
    await import("./components/GlobalSettingsScreen");
    await import("./components/workspaces/DataUploadWorkspace");
  });

  afterEach(() => {
    roots.splice(0).forEach(({ root, container }) => {
      flushSync(() => root.unmount());
      container.remove();
    });
    window.localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
}

export function mountApp(): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(<App />));
  return container;
}

export function renderApp(clearStorage = true): HTMLDivElement {
  return renderLegacyApp({ clearStorage });
}

export function renderPublicApp({ clearStorage = true } = {}): HTMLDivElement {
  if (clearStorage) window.localStorage.clear();
  return mountApp();
}

export function renderLegacyApp({ clearStorage = true } = {}): HTMLDivElement {
  try {
    if (clearStorage) window.localStorage.clear();
    window.localStorage.setItem(LEGACY_EDITOR_STORAGE_KEY, "1");
  } catch {
    // Storage-failure tests intentionally exercise the public fallback.
  }
  return mountApp();
}

export function saveWorkspaceMirror(project: ReturnType<typeof createProjectDocument>): void {
  window.localStorage.setItem("cengfan-map-studio:workspace-mirror", JSON.stringify(createProjectPackage({
    project,
    assets: [],
    fonts: [],
    customTemplates: [],
    renderSettings: { mode: "normal", fixedFps: 20 },
  })));
}

export function click(element: Element): void {
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

export function openRailAdvancedTab(container: HTMLElement): void {
  const el = container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="studio-advanced-panel"]');
  click(el!);
}

export function openGlobalSettingsSection(container: HTMLElement, controls: string): void {
  openRailAdvancedTab(container);
  const settingsButton = container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]');
  click(settingsButton!);
  click(container.querySelector<HTMLButtonElement>(`[role="tab"][aria-controls="global-settings-${controls}"]`)!);
  if (controls === "cards") click(container.querySelector<HTMLButtonElement>('button[aria-label="数据展示设置"]')!);
}

export function openPeopleData(container: HTMLElement): void {
  openRailAdvancedTab(container);
  click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);
  click(container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-cards"]')!);
}

export function workflowStage(container: HTMLElement, label: string): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(`.workflow-stage-stepper button[aria-label="${label}"]`)!;
}

export function openGlobalData(container: HTMLElement): void {
  click(workflowStage(container, "名单"));
}

export function leaveFocusedWorkspace(container: HTMLElement, stage = "内容"): void {
  click(workflowStage(container, stage));
}

export function closeGlobalSettings(container: HTMLElement): void {
  click(container.querySelector<HTMLButtonElement>("button.global-settings-done")!);
}

export function changeInput(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  flushSync(() => {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export function changeSelect(select: HTMLSelectElement, value: string): void {
  flushSync(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

export interface UploadedOperation {
  type: string;
  path: string[];
  value?: unknown;
  item?: { id: string };
  itemId?: string;
}

export interface UploadedTransaction {
  txId: string;
  clientId: string;
  baseVersion: number;
  operations: UploadedOperation[];
  snapshot?: unknown;
}

export class ScriptedEventSource {
  static instances: ScriptedEventSource[] = [];
  listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();
  onerror: (() => void) | null = null;
  closed = false;

  constructor(public readonly url: string) {
    ScriptedEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: (event: MessageEvent<string>) => void): void {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data: unknown): void {
    flushSync(() => {
      for (const handler of this.listeners.get(type) ?? []) handler({ data: JSON.stringify(data) } as MessageEvent<string>);
    });
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export function ownedRoom(roomId: string): Response {
  return json({
    room: { id: roomId, version: 0, ready: true, members: [{ clientId: "c-owner", role: "owner", joinedAt: "t0", lastSeenAt: "t0" }] },
    access: { accessToken: "owner-token", role: "owner", participantId: "p1", id: "p1", displayName: "创建者" },
  });
}

export function collaborationStatus(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>("small[data-collaboration-status]");
}

export async function createRoomFromMenu(container: HTMLElement): Promise<void> {
  click(container.querySelector('[aria-label="增量在线协作"]')!);
  click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === "创建房间")!);
  await vi.waitFor(() => expect(container.textContent).toContain("房间已创建"));
  await vi.waitFor(() => expect(ScriptedEventSource.instances).toHaveLength(1));
}

/** 走真实编辑路径产生一次增量:保存后回到编辑器,协作面板重新可见。 */
export function renameStudent(container: HTMLElement, from: string, to: string): void {
  openPeopleData(container);
  click(container.querySelector<HTMLButtonElement>(`button[aria-label="编辑 ${from}"]`)!);
  changeInput(container.querySelector<HTMLInputElement>('input[aria-label="编辑学生名称"]')!, to);
  click(container.querySelector<HTMLButtonElement>(`button[aria-label="保存 ${from}"]`)!);
  leaveFocusedWorkspace(container);
  openRailAdvancedTab(container);
}

export function pathsOf(transaction: UploadedTransaction): string[] {
  return transaction.operations.map((operation) => operation.path.join("."));
}

export function stubStream(): () => void {
  const originalEventSource = globalThis.EventSource;
  ScriptedEventSource.instances = [];
  vi.stubGlobal("EventSource", ScriptedEventSource);
  return () => {
    vi.unstubAllGlobals();
    globalThis.EventSource = originalEventSource;
  };
}
