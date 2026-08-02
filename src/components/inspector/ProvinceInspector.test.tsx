import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { ProvinceInspector } from "./ProvinceInspector";

vi.mock("../../lib/background-removal", () => ({
  removeBackground: vi.fn(async (src: string) => src),
}));

vi.mock("../../lib/image-color", () => ({
  extractImageColor: vi.fn(async () => "#d05a45"),
}));

describe("ProvinceInspector", () => {
  it("saves uploaded textures into the shared material library", async () => {
    const onPatch = vi.fn();
    const onAddUserAsset = vi.fn();
    const originalFileReader = globalThis.FileReader;
    const originalImage = globalThis.Image;
    class ImmediateFileReader {
      result = "data:image/png;base64,abc";
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      readAsDataURL() {
        queueMicrotask(() => this.onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>));
      }
    }
    vi.stubGlobal("FileReader", ImmediateFileReader);
    class ImmediateImage {
      naturalWidth = 400;
      naturalHeight = 200;
      width = 400;
      height = 200;
      onload: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("Image", ImmediateImage);

    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <ProvinceInspector province="浙江省" onPatch={onPatch} onAddUserAsset={onAddUserAsset} />,
    ));

    const matting = container.querySelector("#province-matting") as HTMLInputElement;
    flushSync(() => {
      matting.checked = false;
      matting.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const input = container.querySelector("#province-texture-upload") as HTMLInputElement;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["x"], "西湖.png", { type: "image/png" })] });
    flushSync(() => input.dispatchEvent(new Event("change", { bubbles: true })));

    await vi.waitFor(() => {
      expect(onAddUserAsset).toHaveBeenCalledWith(expect.objectContaining({
        kind: "province-texture",
        provinceIds: ["浙江省"],
        src: "data:image/png;base64,abc",
      }));
      expect(onPatch).toHaveBeenCalledWith({
        fill: "#d05a45",
        appearance: expect.objectContaining({
          kind: "texture",
          src: "data:image/png;base64,abc",
          fit: "contain",
        }),
      });
    });

    root.unmount();
    vi.stubGlobal("FileReader", originalFileReader);
    vi.stubGlobal("Image", originalImage);
  });

  it("exposes numeric size, opacity, and overflow controls for active textures", () => {
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <ProvinceInspector
        province="浙江省"
        style={{
          appearance: {
            kind: "texture",
            assetId: "a1",
            src: "data:image/png;base64,abc",
            fit: "contain",
            scale: 1,
            overflow: false,
          },
        }}
        onPatch={onPatch}
      />,
    ));
    expect(container.querySelector("#province-texture-scale")).not.toBeNull();
    expect(container.querySelector("#province-texture-scale")?.getAttribute("type")).toBe("number");
    expect(container.querySelector("#province-texture-scale-range")?.getAttribute("type")).toBe("range");
    expect(container.querySelector("#province-texture-opacity")?.getAttribute("type")).toBe("number");
    expect(container.querySelectorAll("#province-texture-sizing option")).toHaveLength(2);
    expect(container.querySelector("#province-texture-overflow")).not.toBeNull();
    const overflow = container.querySelector("#province-texture-overflow") as HTMLInputElement;
    flushSync(() => {
      overflow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onPatch).toHaveBeenCalledWith({
      appearance: expect.objectContaining({ overflow: true, fit: "contain" }),
    });
    root.unmount();
  });

  it("defers manual texture scale input until blur", () => {
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <ProvinceInspector
        province="浙江省"
        style={{ appearance: {
          kind: "texture",
          assetId: "a1",
          src: "data:image/png;base64,zhejiang",
          fit: "contain",
          scale: 1,
          overflow: true,
        } }}
        onPatch={onPatch}
      />,
    ));

    const number = container.querySelector("#province-texture-scale") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    flushSync(() => {
      setter?.call(number, "135");
      number.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onPatch).not.toHaveBeenCalled();
    flushSync(() => number.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({
      appearance: expect.objectContaining({ scale: 1.35 }),
    });
    root.unmount();
  });

  it("resets manual placement without exposing cross-province synchronization", () => {
    const onPatch = vi.fn();
    const appearance = {
      kind: "texture" as const,
      assetId: "a1",
      src: "zhejiang.png",
      fit: "contain" as const,
      offsetX: 18,
      offsetY: -12,
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <ProvinceInspector
        province="浙江省"
        style={{ appearance }}
        onPatch={onPatch}
      />,
    ));

    expect(container.textContent).toContain("X 18");
    expect(container.textContent).toContain("Y -12");
    const reset = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("恢复居中"))!;
    flushSync(() => reset.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({
      appearance: expect.objectContaining({ offsetX: 0, offsetY: 0 }),
    });

    expect(container.textContent).not.toContain("同步所有贴图设置");
    root.unmount();
  });

  it("loads missing dimensions when a legacy texture switches to natural sizing", async () => {
    const onPatch = vi.fn();
    const originalImage = globalThis.Image;
    class SizedImage {
      naturalWidth = 960;
      naturalHeight = 540;
      width = 960;
      height = 540;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("Image", SizedImage);
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <ProvinceInspector
        province="浙江省"
        style={{ appearance: {
          kind: "texture",
          assetId: "legacy",
          src: "data:image/png;base64,legacy",
          fit: "contain",
          sizingMode: "province",
        } }}
        onPatch={onPatch}
      />,
    ));

    const sizing = container.querySelector("#province-texture-sizing") as HTMLSelectElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    flushSync(() => {
      valueSetter?.call(sizing, "natural");
      sizing.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(onPatch).toHaveBeenCalledWith({
        appearance: expect.objectContaining({
          sizingMode: "natural",
          naturalWidth: 960,
          naturalHeight: 540,
        }),
      });
    });
    root.unmount();
    vi.stubGlobal("Image", originalImage);
  });
});
