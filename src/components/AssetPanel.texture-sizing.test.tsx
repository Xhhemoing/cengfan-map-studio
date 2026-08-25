import { describe, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { installAssetPanelTestHarness, renderPanel } from "./asset-panel-test-harness";

installAssetPanelTestHarness();

describe("AssetPanel province texture sizing", () => {
  it("exposes a map-level uniform texture size toggle and fields", () => {
    const onPatchProvinceTextureUniformSize = vi.fn();
    const { container } = renderPanel({
      selectedProvince: "北京市",
      selectedProvinceStyle: {
        appearance: {
          kind: "texture",
          assetId: "texture-beijing",
          src: "data:image/png;base64,beijing",
          fit: "contain",
          sizingMode: "natural",
        },
      },
      provinceTextureUniformSize: { enabled: false, width: 100, height: 80 },
      onPatchProvinceTextureUniformSize,
    });

    const toggle = container.querySelector("#asset-texture-uniform-enabled") as HTMLInputElement;
    expect(toggle).not.toBeNull();
    flushSync(() => toggle.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onPatchProvinceTextureUniformSize).toHaveBeenCalledWith({ enabled: true, width: 100, height: 80 });
  });

  it("commits uniform width from either control only on blur", () => {
    const onPatchProvinceTextureUniformSize = vi.fn();
    const { container } = renderPanel({
      selectedProvince: "北京市",
      selectedProvinceStyle: { appearance: {
        kind: "texture",
        assetId: "texture-beijing",
        src: "data:image/png;base64,beijing",
        fit: "contain",
        sizingMode: "natural",
      } },
      provinceTextureUniformSize: { enabled: true, width: 100, height: 80 },
      onPatchProvinceTextureUniformSize,
    });

    const number = container.querySelector("#asset-texture-uniform-width") as HTMLInputElement;
    const slider = container.querySelector("#asset-texture-uniform-width-range") as HTMLInputElement;
    expect(number?.type).toBe("number");
    expect(slider?.type).toBe("range");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    flushSync(() => {
      setter?.call(number, "135");
      number.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onPatchProvinceTextureUniformSize).not.toHaveBeenCalled();
    flushSync(() => number.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onPatchProvinceTextureUniformSize).toHaveBeenCalledWith({ enabled: true, width: 135, height: 80 });

    onPatchProvinceTextureUniformSize.mockClear();
    slider.focus();
    flushSync(() => {
      setter?.call(slider, "145");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onPatchProvinceTextureUniformSize).not.toHaveBeenCalled();
    flushSync(() => slider.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onPatchProvinceTextureUniformSize).toHaveBeenCalledWith({ enabled: true, width: 145, height: 80 });
  });

  it("uploads a province texture, saves it, and applies it immediately", async () => {
    const onApplyProvinceAppearance = vi.fn();
    const onAddUserAsset = vi.fn();
    const originalFileReader = globalThis.FileReader;
    class ImmediateFileReader {
      result = "data:image/png;base64,abc";
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      readAsDataURL() {
        queueMicrotask(() => this.onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>));
      }
    }
    vi.stubGlobal("FileReader", ImmediateFileReader);
    class ImmediateImage {
      naturalWidth = 1200;
      naturalHeight = 800;
      width = 1200;
      height = 800;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("Image", ImmediateImage);
    const { container } = renderPanel({
      selectedProvince: "浙江省",
      onApplyProvinceAppearance,
      onAddUserAsset,
    });
    const matting = container.querySelector("#asset-matting") as HTMLInputElement;
    flushSync(() => {
      matting.checked = false;
      matting.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const input = container.querySelector("#asset-province-upload") as HTMLInputElement;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["x"], "西湖.png", { type: "image/png" })] });
    flushSync(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    await vi.waitFor(() => {
      expect(onAddUserAsset).toHaveBeenCalledWith(expect.objectContaining({
        kind: "province-texture",
        provinceIds: ["浙江省"],
        src: "data:image/png;base64,abc",
      }));
      expect(onApplyProvinceAppearance).toHaveBeenCalledWith(
        "浙江省",
        expect.objectContaining({
          kind: "texture",
          src: "data:image/png;base64,abc",
          fit: "contain",
          sizingMode: "natural",
          naturalWidth: 1200,
          naturalHeight: 800,
        }),
        "#d05a45",
      );
    });
    vi.stubGlobal("FileReader", originalFileReader);
  });

  it("refreshes natural dimensions when applying an existing texture asset", async () => {
    const onApplyProvinceAppearance = vi.fn();
    const originalImage = globalThis.Image;
    class SizedImage {
      naturalWidth = 400;
      naturalHeight = 200;
      width = 400;
      height = 200;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("Image", SizedImage);
    const texture = {
      id: "user-texture-zhejiang-new",
      label: "浙江新图",
      kind: "province-texture" as const,
      src: "data:image/png;base64,new",
      provinceIds: ["浙江省"],
      source: "user" as const,
    };
    const { container } = renderPanel({
      selectedProvince: "浙江省",
      selectedProvinceStyle: {
        appearance: {
          kind: "texture",
          assetId: "old-texture",
          src: "data:image/png;base64,old",
          fit: "contain",
          sizingMode: "natural",
          naturalWidth: 1200,
          naturalHeight: 800,
        },
      },
      userAssets: [texture],
      onApplyProvinceAppearance,
    });

    const button = container.querySelector<HTMLButtonElement>('button.asset-thumb[title="浙江新图"]');
    expect(button).not.toBeNull();
    flushSync(() => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    await vi.waitFor(() => {
      expect(onApplyProvinceAppearance).toHaveBeenCalledWith(
        "浙江省",
        expect.objectContaining({
          assetId: texture.id,
          sizingMode: "natural",
          naturalWidth: 400,
          naturalHeight: 200,
        }),
      );
    });
    vi.stubGlobal("Image", originalImage);
  });

  it("loads missing natural dimensions when a legacy texture switches to natural sizing", async () => {
    const onApplyProvinceAppearance = vi.fn();
    const originalImage = globalThis.Image;
    class SizedImage {
      naturalWidth = 640;
      naturalHeight = 360;
      width = 640;
      height = 360;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("Image", SizedImage);
    const { container } = renderPanel({
      selectedProvince: "浙江省",
      selectedProvinceStyle: {
        appearance: {
          kind: "texture",
          assetId: "legacy-texture",
          src: "data:image/png;base64,legacy",
          fit: "contain",
          sizingMode: "province",
        },
      },
      onApplyProvinceAppearance,
    });

    const sizing = container.querySelector("#asset-texture-sizing") as HTMLSelectElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    flushSync(() => {
      valueSetter?.call(sizing, "natural");
      sizing.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(onApplyProvinceAppearance).toHaveBeenCalledWith(
        "浙江省",
        expect.objectContaining({
          sizingMode: "natural",
          naturalWidth: 640,
          naturalHeight: 360,
        }),
      );
    });
    vi.stubGlobal("Image", originalImage);
  });

  it("exposes manual texture scale controls when a province texture is active", () => {
    const onApplyProvinceAppearance = vi.fn();
    const { container } = renderPanel({
      selectedProvince: "浙江省",
      selectedProvinceStyle: {
        appearance: {
          kind: "texture",
          assetId: "a1",
          src: "data:image/png;base64,abc",
          fit: "contain",
          scale: 1,
          overflow: false,
        },
      },
      onApplyProvinceAppearance,
    });
    expect(container.querySelector("#asset-texture-scale")).not.toBeNull();
    const overflow = container.querySelector("#asset-texture-overflow") as HTMLInputElement;
    flushSync(() => {
      overflow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onApplyProvinceAppearance).toHaveBeenCalledWith(
      "浙江省",
      expect.objectContaining({ overflow: true, fit: "contain" }),
    );
  });
});
