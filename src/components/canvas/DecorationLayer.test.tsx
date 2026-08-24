import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { DecorationLayer } from "./DecorationLayer";
import type { AssetElement } from "../../lib/scene-document";

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

const asset: AssetElement = {
  id: "asset-1",
  assetId: "source-1",
  label: "装饰",
  src: "data:image/svg+xml,<svg />",
  kind: "decoration",
  x: 10,
  y: 20,
  width: 100,
  height: 80,
  rotation: 12,
  opacity: 0.7,
  zIndex: 1,
  visibility: true,
};

function renderLayer(props: Partial<React.ComponentProps<typeof DecorationLayer>> = {}) {
  const container = document.createElement("div");
  const root = createRoot(container);
  mounted.push({ root, container });
  flushSync(() => root.render(<svg><DecorationLayer assets={[asset]} {...props} /></svg>));

  return { container, root };
}

afterEach(() => {
  // An assertion throwing before an inline unmount would leave the root mounted with
  // its pointer handlers and drag timer armed, racing React's scheduler against
  // jsdom teardown for the rest of the run.
  flushSync(() => {
    for (const { root, container } of mounted.splice(0)) {
      root.unmount();
      container.remove();
    }
  });
});

describe("DecorationLayer", () => {
  it("renders the decoration image and selects it on click", () => {
    const onSelectAsset = vi.fn();
    const { container } = renderLayer({ onSelectAsset });

    const image = container.querySelector('[data-asset-id="asset-1"]');
    expect(image).not.toBeNull();
    flushSync(() => image!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSelectAsset).toHaveBeenCalledWith("asset-1");
  });

  it("omits editor selection overlays during export without omitting assets", () => {
    const editor = renderLayer({ selectedAssetId: "asset-1" });
    expect(editor.container.querySelector('[data-asset-selection="asset-1"]')).not.toBeNull();

    const exported = renderLayer({ selectedAssetId: "asset-1", exportMode: true });
    expect(exported.container.querySelector('[data-asset-selection="asset-1"]')).toBeNull();
    expect(exported.container.querySelector('[data-asset-id="asset-1"]')).not.toBeNull();
  });

  it("limits drag preview paints while committing the final decoration position immediately", () => {
    vi.useFakeTimers();
    const onMoveAsset = vi.fn();
    const { container } = renderLayer({ onMoveAsset, renderIntervalMs: 100 });
    const group = container.querySelector<SVGGElement>('[data-asset-group="asset-1"]')!;
    const image = container.querySelector<SVGImageElement>('[data-asset-id="asset-1"]')!;

    flushSync(() => {
      group.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 20 }));
      group.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 40, clientY: 60 }));
    });
    expect(image.getAttribute("x")).toBe("10");

    flushSync(() => vi.advanceTimersByTime(100));
    expect(image.getAttribute("x")).toBe("40");
    expect(image.getAttribute("y")).toBe("60");

    flushSync(() => group.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 55, clientY: 70 })));
    expect(onMoveAsset).toHaveBeenCalledOnce();
    expect(onMoveAsset).toHaveBeenCalledWith("asset-1", 55, 70);
    expect(image.getAttribute("x")).toBe("10");
    vi.useRealTimers();
  });

  it("commits the new position once on pointer up after a real drag", () => {
    const onMoveAsset = vi.fn();
    const { container } = renderLayer({ onMoveAsset });
    const group = container.querySelector('[data-asset-group="asset-1"]')!;

    flushSync(() => {
      group.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 20 }));
      group.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 40, clientY: 60 }));
    });
    expect(onMoveAsset).not.toHaveBeenCalled();

    flushSync(() => group.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 40, clientY: 60 })));
    expect(onMoveAsset).toHaveBeenCalledTimes(1);
    expect(onMoveAsset).toHaveBeenCalledWith("asset-1", 40, 60);
  });

  it("does not commit a move for a plain click without movement", () => {
    const onMoveAsset = vi.fn();
    const { container } = renderLayer({ onMoveAsset });
    const group = container.querySelector('[data-asset-group="asset-1"]')!;

    flushSync(() => {
      group.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 20 }));
      group.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 10, clientY: 20 }));
    });
    expect(onMoveAsset).not.toHaveBeenCalled();
  });

  it("captures the pointer on drag start and releases the drag state on cancel", () => {
    const onMoveAsset = vi.fn();
    const { container } = renderLayer({ onMoveAsset });
    const group = container.querySelector('[data-asset-group="asset-1"]')!;
    const capture = vi.fn();
    (group as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = capture;

    flushSync(() => group.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 7, clientX: 10, clientY: 20 })));
    expect(capture).toHaveBeenCalledWith(7);

    // cancel (e.g. pointer capture lost) must not commit and must clear the drag state
    flushSync(() => group.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 7 })));
    expect(onMoveAsset).not.toHaveBeenCalled();
    flushSync(() => {
      group.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 7, clientX: 999, clientY: 999 }));
      group.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 7, clientX: 999, clientY: 999 }));
    });
    expect(onMoveAsset).not.toHaveBeenCalled();
  });
});
