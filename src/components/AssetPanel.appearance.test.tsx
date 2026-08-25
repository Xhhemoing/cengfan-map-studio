import { afterEach, describe, expect, it } from "vitest";
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

describe("AssetPanel material ownership", () => {
  it("keeps province-first materials in the left panel with previewable options", () => {
    const container = document.createElement("div");
    const root = createTrackedRoot(container);
    flushSync(() => root.render(
      <AssetPanel
        provinces={["北京市"]}
        selectedProvince="北京市"
        userAssets={[]}
        onApplyBackground={() => undefined}
        onCreateLandmark={() => undefined}
        onCreateDecoration={() => undefined}
      />,
    ));

    expect(container.textContent).toContain("素材库");
    expect(container.textContent).toContain("省份外观");
    expect(container.textContent).toContain("本地资源包");
    expect(container.querySelector("#asset-province")).not.toBeNull();
    expect(container.querySelector("#asset-province-upload")).not.toBeNull();
    expect(container.querySelector("#asset-font-upload")).toBeNull();
  });
});
