import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { AssetPanel } from "./AssetPanel";


vi.mock("../lib/background-removal", () => ({
  removeBackground: vi.fn(async (src: string) => src),
}));

vi.mock("../lib/image-color", () => ({
  extractImageColor: vi.fn(async () => "#d05a45"),
  extractImageTheme: vi.fn(async (src: string) => ({
    primaryColor: "#c74433",
    identityColor: "#c74433",
    supportingColor: "#3470a8",
    backgroundColor: src.includes("beijing") ? "#f4dfdc" : "#dce8f4",
    outlineColor: "#765b58",
    haloColor: "#fff9ed",
    confidence: src.includes("beijing") ? 0.9 : 0.6,
    diagnostics: {},
  })),
  optimizeNeighborThemeColors: vi.fn((themes: unknown) => themes),
}));

/** Mimics a browser image decoder so the real downscale pipeline can run under jsdom. */
function stubDownscalePipeline({ width, height, encoded }: { width: number; height: number; encoded: string }) {
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width, height, close: vi.fn() })));
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray([12, 34, 56, 255]) }),
    }),
    toDataURL: (mime: string) => {
      if (mime !== "image/jpeg") throw new Error("unsupported type");
      return encoded;
    },
  };
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tagName: string) => (
    tagName === "canvas" ? canvas as unknown as HTMLCanvasElement : createElement(tagName)
  ));
  return canvas;
}

function renderPanel(overrides: Partial<React.ComponentProps<typeof AssetPanel>> = {}) {
  const container = document.createElement("div");
  const root = createRoot(container);
  const props = {
    onApplyBackground: vi.fn(),
    onCreateLandmark: vi.fn(),
    onCreateDecoration: vi.fn(),
    provinces: ["北京市", "浙江省"],
    userAssets: [],
    ...overrides,
  };
  flushSync(() => root.render(<AssetPanel {...props} />));
  return { container, root, props };
}

describe("AssetPanel", () => {
  it("puts province appearance before low-frequency package and upload utilities", () => {
    const { container, root } = renderPanel({ selectedProvince: "北京市" });
    const sections = Array.from(container.querySelectorAll<HTMLElement>(".asset-section"));

    expect(sections.map((section) => section.getAttribute("aria-label")).slice(0, 3)).toEqual([
      "省份素材",
      "上传素材",
      "导入 SVG 到画布",
    ]);
    expect(sections.at(-1)?.getAttribute("aria-label")).toBe("资源包");

    root.unmount();
  });

  it("uses one compact province picker without duplicate quick-select chips", () => {
    const onApplyProvinceAppearance = vi.fn();
    const onResetProvinceAppearance = vi.fn();
    const onSelectProvince = vi.fn();
    const { container, root } = renderPanel({
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
    root.unmount();
  });

  it("infers a background for the selected texture", async () => {
    const onApplyProvinceThemes = vi.fn();
    const beijingTexture = {
      appearance: {
        kind: "texture" as const,
        assetId: "texture-beijing",
        src: "data:image/png;base64,beijing",
        fit: "contain" as const,
      },
    };
    const { container, root } = renderPanel({
      selectedProvince: "北京市",
      selectedProvinceStyle: beijingTexture,
      provinceStyles: { 北京市: beijingTexture },
      onApplyProvinceThemes,
    });

    const button = container.querySelector<HTMLButtonElement>('button[aria-label="智能匹配北京市底色"]');
    expect(button).not.toBeNull();
    flushSync(() => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    await vi.waitFor(() => expect(onApplyProvinceThemes).toHaveBeenCalledWith({
      北京市: expect.objectContaining({ backgroundColor: "#f4dfdc", confidence: 0.9 }),
    }));
    expect(container.textContent).toContain("已智能匹配北京市底色");
    root.unmount();
  });

  it("matches every textured province in one action without replacing manual-color provinces", async () => {
    const onApplyProvinceThemes = vi.fn();
    const beijingTexture = {
      appearance: { kind: "texture" as const, assetId: "texture-beijing", src: "data:image/png;base64,beijing", fit: "contain" as const },
    };
    const { container, root } = renderPanel({
      selectedProvince: "北京市",
      selectedProvinceStyle: beijingTexture,
      provinceStyles: {
        北京市: beijingTexture,
        浙江省: { appearance: { kind: "texture", assetId: "texture-zhejiang", src: "data:image/png;base64,zhejiang", fit: "contain" } },
        上海市: { appearance: { kind: "manual-color", color: "#112233" } },
      },
      provinceAdjacency: { 北京市: ["浙江省"], 浙江省: ["北京市"] },
      onApplyProvinceThemes,
    });

    const button = container.querySelector<HTMLButtonElement>('button[aria-label="一键智能匹配所有省份底色"]');
    expect(button?.textContent).toContain("一键匹配全部 2 省");
    flushSync(() => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    await vi.waitFor(() => expect(onApplyProvinceThemes).toHaveBeenCalledWith({
      北京市: expect.objectContaining({ backgroundColor: "#f4dfdc" }),
      浙江省: expect.objectContaining({ backgroundColor: "#dce8f4" }),
    }));
    expect(onApplyProvinceThemes.mock.calls[0]?.[0]).not.toHaveProperty("上海市");
    expect(container.textContent).toContain("已匹配 2 个省份底色");
    root.unmount();
  });

  it("offers backgrounds without invalid built-in landmarks or decorations", () => {
    const { container, root, props } = renderPanel();
    const background = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("设为背景"))!;
    flushSync(() => background.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(props.onApplyBackground).toHaveBeenCalledWith(expect.objectContaining({ kind: "background" }));
    expect(container.textContent).not.toContain("添加地标");
    expect(container.textContent).not.toContain("添加装饰");
    root.unmount();
  });

  it("adds uploaded image decorations to the canvas from the shared library", () => {
    const legacy = { id: "legacy-decoration", label: "历史装饰", kind: "decoration" as const, src: "data:image/png;base64,AA==", provinceIds: [], source: "user" as const };
    const { container, root, props } = renderPanel({ userAssets: [legacy] });

    expect(container.textContent).toContain("历史装饰");
    const legacyButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("历史装饰"));
    flushSync(() => legacyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(props.onCreateDecoration).toHaveBeenCalledWith(legacy);
    root.unmount();
  });

  it("imports uploaded raster images into the library and creates a canvas element immediately", async () => {
    const onAddUserAsset = vi.fn();
    const originalFileReader = globalThis.FileReader;
    class ImmediateFileReader {
      result = "data:image/png;base64,abc";
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      readAsDataURL() { this.onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>); }
    }
    vi.stubGlobal("FileReader", ImmediateFileReader);
    const onCreateDecoration = vi.fn();
    const { container, root } = renderPanel({ onAddUserAsset, onCreateDecoration });

    const input = container.querySelector("#asset-global-upload") as HTMLInputElement;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["x"], "班级合影.png", { type: "image/png" })] });
    flushSync(() => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await vi.waitFor(() => {
      expect(onAddUserAsset).toHaveBeenCalledWith(expect.objectContaining({
        label: "班级合影",
        kind: "decoration",
        src: "data:image/png;base64,abc",
      }));
      expect(onCreateDecoration).toHaveBeenCalledWith(expect.objectContaining({ label: "班级合影", kind: "decoration" }));
      expect(container.textContent).toContain("已导入画布：班级合影");
    });
    root.unmount();
    vi.stubGlobal("FileReader", originalFileReader);
  });

  it("runs automatic matting once and replaces the source asset", async () => {
    const onReplaceUserAsset = vi.fn();
    const asset = { id: "school-badge", label: "校徽", kind: "decoration" as const, src: "data:image/png;base64,raw", provinceIds: [], source: "user" as const };
    const { container, root } = renderPanel({ userAssets: [asset], onReplaceUserAsset });

    const button = container.querySelector<HTMLButtonElement>('button[aria-label="自动抠图 校徽"]')!;
    flushSync(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await Promise.resolve();
    flushSync(() => {});

    expect(onReplaceUserAsset).toHaveBeenCalledWith("school-badge", expect.objectContaining({
      id: "school-badge",
      mattingApplied: true,
    }));
    root.unmount();
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
    const { container, root } = renderPanel({ onAddUserAsset, onCreateDecoration });

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
    root.unmount();
    vi.stubGlobal("FileReader", originalFileReader);
  });

  it("downscales oversized canvas uploads before they enter the project", async () => {
    const onAddUserAsset = vi.fn();
    const onCreateDecoration = vi.fn();
    class ImmediateFileReader {
      result = `data:image/jpeg;base64,${"A".repeat(1_600_000)}`;
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() { queueMicrotask(() => this.onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>)); }
    }
    vi.stubGlobal("FileReader", ImmediateFileReader);
    const canvas = stubDownscalePipeline({ width: 6000, height: 3000, encoded: "data:image/jpeg;base64,downscaled" });
    const { container, root } = renderPanel({ onAddUserAsset, onCreateDecoration });

    const input = container.querySelector("#asset-global-upload") as HTMLInputElement;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["x"], "毕业合影.jpg", { type: "image/jpeg" })] });
    flushSync(() => input.dispatchEvent(new Event("change", { bubbles: true })));

    await vi.waitFor(() => {
      expect(onAddUserAsset).toHaveBeenCalledWith(expect.objectContaining({ src: "data:image/jpeg;base64,downscaled" }));
      expect(onCreateDecoration).toHaveBeenCalledWith(expect.objectContaining({ src: "data:image/jpeg;base64,downscaled" }));
    });
    expect(canvas).toMatchObject({ width: 2560, height: 1280 });

    root.unmount();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("downscales oversized province textures before saving them to the library", async () => {
    const onAddUserAsset = vi.fn();
    const onApplyProvinceAppearance = vi.fn();
    class ImmediateFileReader {
      result = `data:image/jpeg;base64,${"A".repeat(1_600_000)}`;
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() { queueMicrotask(() => this.onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>)); }
    }
    vi.stubGlobal("FileReader", ImmediateFileReader);
    class ImmediateImage {
      naturalWidth = 2560;
      naturalHeight = 1280;
      width = 2560;
      height = 1280;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("Image", ImmediateImage);
    const canvas = stubDownscalePipeline({ width: 5120, height: 2560, encoded: "data:image/jpeg;base64,texture-small" });
    const { container, root } = renderPanel({ selectedProvince: "浙江省", onAddUserAsset, onApplyProvinceAppearance });

    const matting = container.querySelector("#asset-matting") as HTMLInputElement;
    flushSync(() => {
      matting.checked = false;
      matting.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const input = container.querySelector("#asset-province-upload") as HTMLInputElement;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["x"], "西湖.jpg", { type: "image/jpeg" })] });
    flushSync(() => input.dispatchEvent(new Event("change", { bubbles: true })));

    await vi.waitFor(() => {
      expect(onAddUserAsset).toHaveBeenCalledWith(expect.objectContaining({
        kind: "province-texture",
        src: "data:image/jpeg;base64,texture-small",
      }));
    });
    expect(canvas).toMatchObject({ width: 2560, height: 1280 });

    root.unmount();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("refuses SVG imports that exceed the stored byte ceiling", () => {
    const onAddUserAsset = vi.fn();
    const onCreateDecoration = vi.fn();
    class ImmediateFileReader {
      result = `data:image/svg+xml;base64,${"A".repeat(3_000_000)}`;
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() { this.onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>); }
    }
    vi.stubGlobal("FileReader", ImmediateFileReader);
    const { container, root } = renderPanel({ onAddUserAsset, onCreateDecoration });

    const input = container.querySelector("#asset-svg-canvas-upload") as HTMLInputElement;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["<svg />"], "巨幅.svg", { type: "image/svg+xml" })],
    });
    flushSync(() => input.dispatchEvent(new Event("change", { bubbles: true })));

    expect(onAddUserAsset).not.toHaveBeenCalled();
    expect(onCreateDecoration).not.toHaveBeenCalled();
    expect(container.textContent).toContain("SVG 体积过大");

    root.unmount();
    vi.unstubAllGlobals();
  });

  it("exposes a map-level uniform texture size toggle and fields", () => {
    const onPatchProvinceTextureUniformSize = vi.fn();
    const { container, root } = renderPanel({
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
    root.unmount();
  });

  it("commits uniform width from either control only on blur", () => {
    const onPatchProvinceTextureUniformSize = vi.fn();
    const { container, root } = renderPanel({
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
    root.unmount();
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
    const { container, root } = renderPanel({
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
    root.unmount();
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
    const { container, root } = renderPanel({
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
    root.unmount();
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
    const { container, root } = renderPanel({
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
    root.unmount();
    vi.stubGlobal("Image", originalImage);
  });


  it("shows existing instances by source and reselects them", () => {
    const onSelectInstance = vi.fn();
    const { container, root } = renderPanel({ instances: [{ id: "instance-1", assetId: "legacy-decoration", label: "历史装饰" }], onSelectInstance });
    const instance = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("已应用："))!;
    flushSync(() => instance.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSelectInstance).toHaveBeenCalledWith("instance-1");
    root.unmount();
  });

  it("marks every province represented in the data list with an asterisk", () => {
    const { container, root } = renderPanel({ dataProvinces: ["浙江省"] });
    const options = Array.from((container.querySelector("#asset-province") as HTMLSelectElement).options);
    expect(options.find((option) => option.value === "浙江省")?.textContent).toBe("浙江省*");
    expect(options.find((option) => option.value === "北京市")?.textContent).toBe("北京市");
    root.unmount();
  });

  it("exports the local resource pack through the parent callback", () => {
    const onExportResourcePack = vi.fn();
    const { container, root } = renderPanel({ onExportResourcePack });
    const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes("导出资源包"))!;
    flushSync(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onExportResourcePack).toHaveBeenCalledTimes(1);
    root.unmount();
  });

  it("exposes manual texture scale controls when a province texture is active", () => {
    const onApplyProvinceAppearance = vi.fn();
    const { container, root } = renderPanel({
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
    root.unmount();
  });

  it("deletes user textures from the library with usage badges", () => {
    const onDeleteUserAsset = vi.fn();
    const { container, root } = renderPanel({
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
    // 删除先弹自绘确认框，素材库这一步还没动。
    expect(onDeleteUserAsset).not.toHaveBeenCalled();
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("从素材库删除「浙江·西湖」？");
    expect(dialog.textContent).toContain("使用中 · 浙江");

    flushSync(() => {
      dialog.querySelector<HTMLButtonElement>("button.danger-button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onDeleteUserAsset).toHaveBeenCalledWith("asset-user-1");
    expect(container.textContent).toContain("已从素材库删除：浙江·西湖");
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    root.unmount();
  });

  it("keeps the asset in the library when the delete dialog is dismissed", () => {
    const onDeleteUserAsset = vi.fn();
    const { container, root } = renderPanel({
      userAssets: [{
        id: "asset-user-1",
        label: "浙江·西湖",
        kind: "province-texture",
        src: "data:image/png;base64,abc",
        provinceIds: ["浙江省"],
        source: "user",
      }],
      onDeleteUserAsset,
    });

    flushSync(() => {
      container.querySelector<HTMLButtonElement>('button[aria-label="删除素材 浙江·西湖"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const dialog = container.querySelector('[role="dialog"]')!;
    flushSync(() => {
      dialog.querySelector<HTMLElement>(".workbench-dialog__backdrop")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onDeleteUserAsset).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).toContain("浙江·西湖");

    root.unmount();
  });

  it("hides province-texture instances from the applied elements list", () => {
    const { container, root } = renderPanel({
      instances: [
        { id: "texture-1", assetId: "a1", label: "旧贴图", kind: "province-texture" },
        { id: "landmark-1", assetId: "a2", label: "西湖剪影", kind: "landmark" },
      ],
    });
    expect(container.textContent).toContain("已应用：西湖剪影");
    expect(container.textContent).not.toContain("已应用：旧贴图");
    root.unmount();
  });

});
