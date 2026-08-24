import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZoomControls, type ZoomControlsProps } from "./ZoomControls";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderControls(overrides: Partial<ZoomControlsProps> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const props: ZoomControlsProps = {
    zoomPercent: 100,
    onZoomOut: vi.fn(),
    onZoomIn: vi.fn(),
    ...overrides,
  };
  flushSync(() => root.render(<ZoomControls {...props} />));
  return { container, props };
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  vi.restoreAllMocks();
});

describe("ZoomControls", () => {
  it("exposes a labelled group with a screen-reader readable zoom level", () => {
    const { container } = renderControls();

    const group = container.querySelector('[role="group"][aria-label="缩放控制"]');
    expect(group).not.toBeNull();
    const label = container.querySelector(".zoom-label")!;
    expect(label.textContent).toBe("当前缩放 100%");
    expect(label.querySelector(".sr-only")?.textContent).toBe("当前缩放 ");
    expect(label.hasAttribute("aria-label")).toBe(false);
  });

  it("keeps labelled zoom buttons and disables them at the bounds", () => {
    const { container } = renderControls({ zoomPercent: 300, onReset: vi.fn() });

    const zoomIn = container.querySelector<HTMLButtonElement>('button[aria-label="放大"]')!;
    const zoomOut = container.querySelector<HTMLButtonElement>('button[aria-label="缩小"]')!;
    expect(zoomIn.disabled).toBe(true);
    expect(zoomOut.disabled).toBe(false);
    expect(container.querySelector('button[aria-label="重置缩放"]')).not.toBeNull();
  });

  it("invokes the zoom callbacks only inside the bounds", () => {
    const { container, props } = renderControls({ zoomPercent: 30, min: 25, step: 10 });

    const zoomOut = container.querySelector<HTMLButtonElement>('button[aria-label="缩小"]')!;
    flushSync(() => zoomOut.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(props.onZoomOut).toHaveBeenCalledTimes(1);

    const zoomIn = container.querySelector<HTMLButtonElement>('button[aria-label="放大"]')!;
    flushSync(() => zoomIn.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(props.onZoomIn).toHaveBeenCalledTimes(1);
  });
});
