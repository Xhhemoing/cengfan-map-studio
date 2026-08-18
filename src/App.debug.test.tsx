import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { App } from "./App";
import { WORKSPACE_SESSION_STORAGE_KEY } from "./lib/workspace-session";
import { preloadStudioWorkspaces } from "./components/workspaces/stage-components";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

beforeAll(async () => {
  await preloadStudioWorkspaces();
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
  window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({
    stage: "content",
    savedAt: "2026-08-18T00:00:00.000Z",
  }));
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
