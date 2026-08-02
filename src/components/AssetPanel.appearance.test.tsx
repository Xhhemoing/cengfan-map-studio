import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { AssetPanel } from "./AssetPanel";

describe("AssetPanel material ownership", () => {
  it("keeps province-first materials in the left panel with previewable options", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
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
    root.unmount();
    container.remove();
  });
});
