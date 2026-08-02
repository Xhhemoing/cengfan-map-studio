import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { AssetPanel } from "./AssetPanel";

describe("AssetPanel applied elements", () => {
  it("keeps applied canvas elements selectable from the global material panel", () => {
    const onSelectInstance = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
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
    root.unmount();
    container.remove();
  });
});
