import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { AssetPanel } from "./AssetPanel";

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

function createTrackedRoot(container: HTMLElement): Root {
  const root = createRoot(container);
  mounted.push({ root, container });
  return root;
}

// An assertion throwing before an inline unmount leaves the root mounted for the rest of
// the run, so React's scheduler can wake up against a torn-down jsdom.
afterEach(() => {
  flushSync(() => {
    for (const { root, container } of mounted.splice(0)) {
      root.unmount();
      container.remove();
    }
  });
});

describe("AssetPanel applied elements", () => {
  it("keeps applied canvas elements selectable from the global material panel", () => {
    const onSelectInstance = vi.fn();
    const container = document.createElement("div");
    const root = createTrackedRoot(container);
    flushSync(() => root.render(
      <AssetPanel
        instances={[{ id: "asset-1", assetId: "asset-source", label: "校园插画" }]}
        onApplyBackground={vi.fn()}
        onCreateLandmark={vi.fn()}
        onCreateDecoration={vi.fn()}
        onSelectInstance={onSelectInstance}
      />,
    ));

    const instance = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("已应用：校园插画"))!;
    flushSync(() => instance.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSelectInstance).toHaveBeenCalledWith("asset-1");
  });
});
