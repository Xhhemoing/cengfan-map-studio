import { describe, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { installAssetPanelTestHarness, renderPanel } from "./asset-panel-test-harness";

installAssetPanelTestHarness();

describe("AssetPanel material library", () => {
  it("offers backgrounds without invalid built-in landmarks or decorations", () => {
    const { container, props } = renderPanel();
    const background = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("设为背景"))!;
    flushSync(() => background.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(props.onApplyBackground).toHaveBeenCalledWith(expect.objectContaining({ kind: "background" }));
    expect(container.textContent).not.toContain("添加地标");
    expect(container.textContent).not.toContain("添加装饰");
  });

  it("adds uploaded image decorations to the canvas from the shared library", () => {
    const legacy = { id: "legacy-decoration", label: "历史装饰", kind: "decoration" as const, src: "data:image/png;base64,AA==", provinceIds: [], source: "user" as const };
    const { container, props } = renderPanel({ userAssets: [legacy] });

    expect(container.textContent).toContain("历史装饰");
    const legacyButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("历史装饰"));
    flushSync(() => legacyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(props.onCreateDecoration).toHaveBeenCalledWith(legacy);
  });

  it("imports uploaded raster images into the library and creates a canvas element immediately", () => {
    const onAddUserAsset = vi.fn();
    const originalFileReader = globalThis.FileReader;
    class ImmediateFileReader {
      result = "data:image/png;base64,abc";
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      readAsDataURL() { this.onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>); }
    }
    vi.stubGlobal("FileReader", ImmediateFileReader);
    const onCreateDecoration = vi.fn();
    const { container } = renderPanel({ onAddUserAsset, onCreateDecoration });

    const input = container.querySelector("#asset-global-upload") as HTMLInputElement;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["x"], "班级合影.png", { type: "image/png" })] });
    flushSync(() => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onAddUserAsset).toHaveBeenCalledWith(expect.objectContaining({
      label: "班级合影",
      kind: "decoration",
      src: "data:image/png;base64,abc",
    }));
    expect(onCreateDecoration).toHaveBeenCalledWith(expect.objectContaining({ label: "班级合影", kind: "decoration" }));
    expect(container.textContent).toContain("已导入画布：班级合影");
    vi.stubGlobal("FileReader", originalFileReader);
  });

  it("runs automatic matting once and replaces the source asset", async () => {
    const onReplaceUserAsset = vi.fn();
    const asset = { id: "school-badge", label: "校徽", kind: "decoration" as const, src: "data:image/png;base64,raw", provinceIds: [], source: "user" as const };
    const { container } = renderPanel({ userAssets: [asset], onReplaceUserAsset });

    const button = container.querySelector<HTMLButtonElement>('button[aria-label="自动抠图 校徽"]')!;
    flushSync(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await Promise.resolve();
    flushSync(() => {});

    expect(onReplaceUserAsset).toHaveBeenCalledWith("school-badge", expect.objectContaining({
      id: "school-badge",
      mattingApplied: true,
    }));
  });

  it("imports an SVG into the library and creates a canvas element immediately", () => {
    const onAddUserAsset = vi.fn();
    const onCreateDecoration = vi.fn();
    const originalFileReader = globalThis.FileReader;
    class ImmediateFileReader {
      result = "data:image/svg+xml;base64,PHN2Zy8+";
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() { this.onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>); }
    }
    vi.stubGlobal("FileReader", ImmediateFileReader);
    const { container } = renderPanel({ onAddUserAsset, onCreateDecoration });

    const input = container.querySelector("#asset-svg-canvas-upload") as HTMLInputElement;
    expect(input?.accept).toContain(".svg");
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["<svg />"], "校徽.svg", { type: "image/svg+xml" })],
    });
    flushSync(() => input.dispatchEvent(new Event("change", { bubbles: true })));

    expect(onAddUserAsset).toHaveBeenCalledWith(expect.objectContaining({
      label: "校徽",
      kind: "decoration",
      src: "data:image/svg+xml;base64,PHN2Zy8+",
    }));
    expect(onCreateDecoration).toHaveBeenCalledWith(expect.objectContaining({
      label: "校徽",
      kind: "decoration",
      src: "data:image/svg+xml;base64,PHN2Zy8+",
    }));
    expect(container.textContent).toContain("已导入画布：校徽");
    vi.stubGlobal("FileReader", originalFileReader);
  });

  it("deletes user textures from the library with usage badges", () => {
    const onDeleteUserAsset = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { container } = renderPanel({
      userAssets: [{
        id: "asset-user-1",
        label: "浙江·西湖",
        kind: "province-texture",
        src: "data:image/png;base64,abc",
        provinceIds: ["浙江省"],
        source: "user",
      }],
      assetUsageById: { "asset-user-1": "使用中 · 浙江" },
      onDeleteUserAsset,
    });

    expect(container.textContent).toContain("使用中 · 浙江");

    const deleteAsset = container.querySelector('button[aria-label="删除素材 浙江·西湖"]') as HTMLButtonElement;
    flushSync(() => {
      deleteAsset.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onDeleteUserAsset).toHaveBeenCalledWith("asset-user-1");
    expect(container.textContent).toContain("已从素材库删除：浙江·西湖");
    confirmSpy.mockRestore();
  });
});
