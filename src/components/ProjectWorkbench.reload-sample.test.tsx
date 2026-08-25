import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryProjectStore } from "../lib/project-store";
import { ProjectWorkbench } from "./ProjectWorkbench";

const roots: Array<{ root: Root; container: HTMLElement }> = [];

function renderWorkbench(store: ReturnType<typeof createMemoryProjectStore>) {
  const container = document.createElement("div");
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(<ProjectWorkbench store={store} navigate={vi.fn()} />));
  return container;
}

afterEach(() => {
  roots.forEach(({ root }) => root.unmount());
  roots.length = 0;
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ProjectWorkbench sample reload", () => {
  it("reloads the sample after the user deletes every project", async () => {
    const store = createMemoryProjectStore();
    const container = renderWorkbench(store);

    await vi.waitFor(() => expect(container.querySelector('[aria-label="项目菜单"]')).not.toBeNull());
    vi.stubGlobal("confirm", vi.fn(() => true));
    container.querySelector<HTMLButtonElement>('[aria-label="项目菜单"]')?.click();
    await vi.waitFor(() => expect(container.textContent).toContain("删除"));
    Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("删除"))?.click();

    await vi.waitFor(() => expect(container.querySelector('[aria-label="载入示例项目"]')).not.toBeNull());
    expect(await store.list()).toHaveLength(0);

    container.querySelector<HTMLButtonElement>('[aria-label="载入示例项目"]')?.click();

    await vi.waitFor(() => expect(container.textContent).toContain("示例：2026届毕业去向"));
    expect(await store.list()).toHaveLength(1);
  });
});
