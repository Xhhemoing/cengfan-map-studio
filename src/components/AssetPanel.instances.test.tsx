import { describe, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { installAssetPanelTestHarness, renderPanel } from "./asset-panel-test-harness";

installAssetPanelTestHarness();

describe("AssetPanel applied instances", () => {
  it("shows existing instances by source and reselects them", () => {
    const onSelectInstance = vi.fn();
    const { container } = renderPanel({ instances: [{ id: "instance-1", assetId: "legacy-decoration", label: "历史装饰" }], onSelectInstance });
    const instance = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("已应用："))!;
    flushSync(() => instance.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSelectInstance).toHaveBeenCalledWith("instance-1");
  });

  it("hides province-texture instances from the applied elements list", () => {
    const { container } = renderPanel({
      instances: [
        { id: "texture-1", assetId: "a1", label: "旧贴图", kind: "province-texture" },
        { id: "landmark-1", assetId: "a2", label: "西湖剪影", kind: "landmark" },
      ],
    });
    expect(container.textContent).toContain("已应用：西湖剪影");
    expect(container.textContent).not.toContain("已应用：旧贴图");
  });
});
