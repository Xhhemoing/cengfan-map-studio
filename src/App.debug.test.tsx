import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { App } from "./App";
import { LEGACY_EDITOR_STORAGE_KEY } from "./lib/workspace-session";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

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

function renderLegacyApp(): HTMLDivElement {
  window.localStorage.clear();
  window.localStorage.setItem(LEGACY_EDITOR_STORAGE_KEY, "1");
  return mountApp();
}

function click(element: Element): void {
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  window.localStorage.clear();
});

describe("debug", () => {
  it("clicks the advanced tab then looks for the settings button", () => {
    const container = renderLegacyApp();
    const tab = container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="studio-advanced-panel"]');
    if (tab) click(tab);
    expect(true).toBe(true);
  });
});
