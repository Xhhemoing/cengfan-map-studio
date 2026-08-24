import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { AssetLibraryPanel } from "./AssetLibraryPanel";

// AssetPanel 拖入了素材上传/纹理等重逻辑，与折叠头部的可访问性无关，桩掉。
vi.mock("./AssetPanel", () => ({ AssetPanel: () => <div data-asset-panel-stub /> }));

const STORAGE_KEY = "cengfan-map-studio:asset-library-collapsed";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderPanel(defaultCollapsed: boolean) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() =>
    root.render(<AssetLibraryPanel defaultCollapsed={defaultCollapsed} onApplyBackground={vi.fn()} />),
  );
  return { container };
}

beforeEach(() => {
  // 组件优先读取持久化的折叠状态；清掉以让 defaultCollapsed 生效。
  window.localStorage.removeItem(STORAGE_KEY);
});

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  vi.restoreAllMocks();
});

describe("AssetLibraryPanel", () => {
  it("hides the collapse chevron from AT while keeping the button's accessible name (expanded)", () => {
    const { container } = renderPanel(false);
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="折叠素材库"]');
    expect(button).not.toBeNull();
    expect(button?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("[data-asset-panel-stub]")).not.toBeNull();
  });

  it("hides the expand chevron from AT while keeping the button's accessible name (collapsed)", () => {
    const { container } = renderPanel(true);
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="展开素材库"]');
    expect(button).not.toBeNull();
    expect(button?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("[data-asset-panel-stub]")).toBeNull();
  });
});
