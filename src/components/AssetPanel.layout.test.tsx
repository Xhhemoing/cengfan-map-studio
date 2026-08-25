import { describe, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { installAssetPanelTestHarness, renderPanel } from "./asset-panel-test-harness";

installAssetPanelTestHarness();

describe("AssetPanel panel layout", () => {
  it("puts province appearance before low-frequency package and upload utilities", () => {
    const { container } = renderPanel({ selectedProvince: "北京市" });
    const sections = Array.from(container.querySelectorAll<HTMLElement>(".asset-section"));

    expect(sections.map((section) => section.getAttribute("aria-label")).slice(0, 3)).toEqual([
      "省份素材",
      "上传素材",
      "导入 SVG 到画布",
    ]);
    expect(sections.at(-1)?.getAttribute("aria-label")).toBe("资源包");
  });

  it("uses one compact province picker without duplicate quick-select chips", () => {
    const onApplyProvinceAppearance = vi.fn();
    const onResetProvinceAppearance = vi.fn();
    const onSelectProvince = vi.fn();
    const { container } = renderPanel({
      selectedProvince: "北京市",
      onApplyProvinceAppearance,
      onResetProvinceAppearance,
      onSelectProvince,
    });
    expect(container.querySelector("#asset-province")).not.toBeNull();
    expect(container.querySelector("#asset-province-upload")).not.toBeNull();
    expect(container.querySelector("#asset-matting")).not.toBeNull();

    // scale controls appear when texture is active; still present in DOM after apply path via selected style
    expect(container.querySelector("#asset-pack-import")).not.toBeNull();
    expect(container.textContent).toContain("系统默认");
    expect(container.textContent).toContain("导出资源包");

    // layout controls available after texture applied via selectedProvinceStyle

    expect(container.querySelector(".asset-province-chips")).toBeNull();
    expect(container.querySelectorAll("#asset-province")).toHaveLength(1);
    expect(container.querySelector("[data-asset-province-workspace]")).not.toBeNull();

    const feature = Array.from(container.querySelectorAll("button.asset-thumb"))[0] as HTMLButtonElement | undefined;
    if (feature) {
      flushSync(() => feature.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      expect(onApplyProvinceAppearance).toHaveBeenCalledWith(
        "北京市",
        expect.objectContaining({ kind: "feature", assetId: expect.any(String), src: expect.any(String) }),
      );
    }

    const color = container.querySelector("#asset-province-color") as HTMLInputElement;
    const colorSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    color.focus();
    flushSync(() => {
      colorSetter?.call(color, "#112233");
      color.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onApplyProvinceAppearance).toHaveBeenCalledTimes(feature ? 1 : 0);
    // the picker closes with a change event — one commit, no blur required
    flushSync(() => color.dispatchEvent(new Event("change", { bubbles: true })));
    expect(onApplyProvinceAppearance).toHaveBeenCalledTimes(feature ? 2 : 1);
    expect(onApplyProvinceAppearance).toHaveBeenCalledWith("北京市", { kind: "manual-color", color: "#112233" });
    flushSync(() => color.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onApplyProvinceAppearance).toHaveBeenCalledTimes(feature ? 2 : 1);

    const reset = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("系统默认"))!;
    flushSync(() => reset.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onResetProvinceAppearance).toHaveBeenCalledWith("北京市");
    expect(container.textContent).not.toContain("同步所有贴图设置");
  });

  it("marks every province represented in the data list with an asterisk", () => {
    const { container } = renderPanel({ dataProvinces: ["浙江省"] });
    const options = Array.from((container.querySelector("#asset-province") as HTMLSelectElement).options);
    expect(options.find((option) => option.value === "浙江省")?.textContent).toBe("浙江省*");
    expect(options.find((option) => option.value === "北京市")?.textContent).toBe("北京市");
  });

  it("exports the local resource pack through the parent callback", () => {
    const onExportResourcePack = vi.fn();
    const { container } = renderPanel({ onExportResourcePack });
    const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes("导出资源包"))!;
    flushSync(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onExportResourcePack).toHaveBeenCalledTimes(1);
  });
});
