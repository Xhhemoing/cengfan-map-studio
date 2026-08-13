import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { AppErrorBoundary } from "./AppErrorBoundary";

let roots: Array<{ root: Root; container: HTMLElement }> = [];

afterEach(() => {
  roots.forEach(({ root }) => root.unmount());
  roots = [];
  vi.restoreAllMocks();
});

describe("AppErrorBoundary", () => {
  it("renders a recovery screen instead of a blank page when a child throws", () => {
    const Boom = () => {
      throw new Error("boom");
    };
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push({ root, container });
    flushSync(() => root.render(<AppErrorBoundary><Boom /></AppErrorBoundary>));

    expect(container.textContent).toContain("界面加载出错");
    expect(container.querySelector('button[aria-label="重新加载界面"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="返回项目列表"]')).not.toBeNull();
    consoleSpy.mockRestore();
  });

  it("renders children normally when nothing throws", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push({ root, container });
    flushSync(() => root.render(<AppErrorBoundary><p>正常内容</p></AppErrorBoundary>));
    expect(container.textContent).toContain("正常内容");
    expect(container.querySelector(".workbench-error")).toBeNull();
  });
});
