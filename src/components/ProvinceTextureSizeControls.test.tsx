import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { AssetPanel } from "./AssetPanel";
import { ProvinceInspector } from "./inspector/ProvinceInspector";

function typeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("province texture size controls", () => {
  it("commits uniform number and slider edits on blur", () => {
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <AssetPanel
        onApplyBackground={vi.fn()}
        onCreateLandmark={vi.fn()}
        onCreateDecoration={vi.fn()}
        selectedProvince="北京市"
        selectedProvinceStyle={{ appearance: { kind: "texture", assetId: "a", src: "a.png", fit: "contain" } }}
        provinceTextureUniformSize={{ enabled: true, width: 100, height: 80 }}
        onPatchProvinceTextureUniformSize={onPatch}
      />,
    ));
    const number = container.querySelector("#asset-texture-uniform-width") as HTMLInputElement;
    const slider = container.querySelector("#asset-texture-uniform-width-range") as HTMLInputElement;
    expect(slider.type).toBe("range");
    flushSync(() => typeValue(number, "135"));
    expect(onPatch).not.toHaveBeenCalled();
    flushSync(() => number.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ enabled: true, width: 135, height: 80 });
    onPatch.mockClear();
    flushSync(() => typeValue(slider, "145"));
    expect(onPatch).not.toHaveBeenCalled();
    flushSync(() => slider.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ enabled: true, width: 145, height: 80 });
    root.unmount();
  });

  it("defers inspector scale input until blur", () => {
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <ProvinceInspector
        province="浙江省"
        style={{ appearance: { kind: "texture", assetId: "a", src: "a.png", fit: "contain", scale: 1 } }}
        onPatch={onPatch}
      />,
    ));
    const number = container.querySelector("#province-texture-scale") as HTMLInputElement;
    expect(container.querySelector("#province-texture-scale-range")?.getAttribute("type")).toBe("range");
    flushSync(() => typeValue(number, "135"));
    expect(onPatch).not.toHaveBeenCalled();
    flushSync(() => number.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ appearance: expect.objectContaining({ scale: 1.35 }) });
    root.unmount();
  });
});
