// Shared mount/interaction helpers for the App integration test suite.
// Extracted verbatim from src/App.test.tsx when the suite was split into
// focused src/App.*.test.tsx files; every file installs the same lifecycle
// via installAppTestHarness() so mount cleanup and storage reset stay uniform.
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeAll, vi } from "vitest";
import { App } from "../App";
import { createProjectDocument } from "../lib/project-document";
import { createProjectPackage } from "../lib/project-package";
import { LEGACY_EDITOR_STORAGE_KEY } from "../lib/workspace-session";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

export function installAppTestHarness(): void {
  // App.tsx lazy-loads the data workspace and full-screen settings panels. Tests
  // drive them through synchronous clicks, so preload those modules once up
  // front; the resolved lazy components then render synchronously.
  beforeAll(async () => {
    await import("../components/GlobalSettingsScreen");
    await import("../components/workspaces/DataUploadWorkspace");
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

function mountApp(): HTMLDivElement {
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
  click(workflowStage(container, "数据与素材"));
}

export function leaveFocusedWorkspace(container: HTMLElement, stage = "内容与排版"): void {
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
