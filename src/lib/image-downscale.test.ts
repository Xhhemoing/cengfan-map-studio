import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyImageWithinBudget,
  checkImageBudget,
  downscaleImageDataUrl,
  estimateDataUrlBytes,
  OversizedImageError,
} from "./image-downscale";

function base64DataUrl(mime: string, chars: number): string {
  return `data:${mime};base64,${"A".repeat(chars)}`;
}

interface CanvasStub {
  createImageBitmap: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  toDataURL: ReturnType<typeof vi.fn>;
  canvas: { width: number; height: number };
}

function stubImagePipeline({ width, height, transparent, encode }: {
  width: number;
  height: number;
  transparent: boolean;
  encode: (mime: string) => string | null;
}): CanvasStub {
  const close = vi.fn();
  const createImageBitmap = vi.fn(async () => ({ width, height, close }));
  vi.stubGlobal("createImageBitmap", createImageBitmap);

  const drawImage = vi.fn();
  const getImageData = vi.fn(() => ({ data: new Uint8ClampedArray([12, 34, 56, transparent ? 0 : 255]) }));
  const toDataURL = vi.fn((mime: string) => {
    const encoded = encode(mime);
    if (!encoded) throw new Error("unsupported type");
    return encoded;
  });
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage, getImageData }), toDataURL };

  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tagName: string) => (
    tagName === "canvas" ? canvas as unknown as HTMLCanvasElement : originalCreateElement(tagName)
  ));

  return { createImageBitmap, drawImage, toDataURL, canvas };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("checkImageBudget", () => {
  it("keeps small bitmaps and non data URLs, and resamples large ones", () => {
    expect(checkImageBudget("data:image/png;base64,abc").verdict).toBe("keep");
    expect(checkImageBudget("https://example.com/a.png").verdict).toBe("keep");
    expect(checkImageBudget(base64DataUrl("image/jpeg", 600_000)).verdict).toBe("resample");
  });

  it("measures payload bytes rather than data URL characters", () => {
    expect(estimateDataUrlBytes(base64DataUrl("image/png", 400_000))).toBe(300_000);
    expect(estimateDataUrlBytes("data:image/svg+xml,%3Csvg/%3E")).toBe("<svg/>".length);
  });
});

describe("downscaleImageDataUrl", () => {
  it("passes small bitmaps through without decoding them", async () => {
    const pipeline = stubImagePipeline({ width: 4000, height: 3000, transparent: false, encode: () => "data:image/jpeg;base64,small" });
    const source = base64DataUrl("image/png", 4_000);

    await expect(downscaleImageDataUrl(source, { kind: "decoration" })).resolves.toBe(source);
    expect(pipeline.createImageBitmap).not.toHaveBeenCalled();
  });

  it("re-encodes an opaque photo as JPEG capped at the kind's longest edge", async () => {
    const pipeline = stubImagePipeline({
      width: 4000,
      height: 3000,
      transparent: false,
      encode: (mime) => (mime === "image/jpeg" ? "data:image/jpeg;base64,compressed" : null),
    });

    const result = await downscaleImageDataUrl(base64DataUrl("image/jpeg", 4_000_000), { kind: "background" });

    expect(result).toBe("data:image/jpeg;base64,compressed");
    expect(pipeline.canvas).toMatchObject({ width: 2560, height: 1920 });
    expect(pipeline.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2560, 1920);
    expect(pipeline.createImageBitmap).toHaveBeenCalledWith(expect.anything(), { imageOrientation: "from-image" });
  });

  it("caps avatars at 512 pixels", async () => {
    const pipeline = stubImagePipeline({
      width: 2048,
      height: 2048,
      transparent: false,
      encode: () => "data:image/jpeg;base64,avatar",
    });

    await downscaleImageDataUrl(base64DataUrl("image/jpeg", 1_000_000), { kind: "avatar" });

    expect(pipeline.canvas).toMatchObject({ width: 512, height: 512 });
  });

  it("keeps transparency by encoding to WebP, falling back to PNG", async () => {
    const webp = stubImagePipeline({
      width: 3000,
      height: 3000,
      transparent: true,
      encode: (mime) => (mime === "image/webp" ? "data:image/webp;base64,cut" : null),
    });
    await expect(downscaleImageDataUrl(base64DataUrl("image/png", 2_000_000), { kind: "texture" }))
      .resolves.toBe("data:image/webp;base64,cut");
    expect(webp.toDataURL).not.toHaveBeenCalledWith("image/jpeg", expect.anything());

    vi.unstubAllGlobals();
    vi.restoreAllMocks();

    stubImagePipeline({
      width: 3000,
      height: 3000,
      transparent: true,
      encode: (mime) => (mime === "image/png" ? "data:image/png;base64,cut" : null),
    });
    await expect(downscaleImageDataUrl(base64DataUrl("image/png", 2_000_000), { kind: "texture" }))
      .resolves.toBe("data:image/png;base64,cut");
  });

  it("never re-encodes SVG markup, only enforces a byte ceiling", async () => {
    const pipeline = stubImagePipeline({ width: 4000, height: 4000, transparent: true, encode: () => "data:image/png;base64,x" });
    const svg = base64DataUrl("image/svg+xml", 800_000);

    await expect(downscaleImageDataUrl(svg, { kind: "decoration" })).resolves.toBe(svg);
    expect(pipeline.createImageBitmap).not.toHaveBeenCalled();

    const oversized = base64DataUrl("image/svg+xml", 3_000_000);
    expect(checkImageBudget(oversized).verdict).toBe("reject");
    await expect(downscaleImageDataUrl(oversized)).rejects.toBeInstanceOf(OversizedImageError);
  });

  it("returns the source when the environment cannot decode it", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onerror?.()); }
    }
    vi.stubGlobal("Image", FailingImage);
    const source = base64DataUrl("image/jpeg", 1_000_000);

    await expect(downscaleImageDataUrl(source, { kind: "map" })).resolves.toBe(source);
  });

  it("keeps the source when re-encoding would make it larger", async () => {
    stubImagePipeline({
      width: 800,
      height: 600,
      transparent: false,
      encode: () => base64DataUrl("image/jpeg", 900_000),
    });
    const source = base64DataUrl("image/jpeg", 500_000);

    await expect(downscaleImageDataUrl(source, { kind: "decoration" })).resolves.toBe(source);
  });
});

describe("applyImageWithinBudget", () => {
  it("applies a fitting source synchronously", () => {
    const apply = vi.fn();
    applyImageWithinBudget("data:image/png;base64,abc", { kind: "avatar" }, apply);
    expect(apply).toHaveBeenCalledWith("data:image/png;base64,abc");
  });

  it("reports oversized SVG instead of applying it", () => {
    const apply = vi.fn();
    const onError = vi.fn();
    applyImageWithinBudget(base64DataUrl("image/svg+xml", 3_000_000), { kind: "background" }, apply, onError);
    expect(apply).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("SVG 体积过大"));
  });

  it("applies the compressed source once resampling resolves", async () => {
    stubImagePipeline({
      width: 4000,
      height: 2000,
      transparent: false,
      encode: () => "data:image/jpeg;base64,compressed",
    });
    const apply = vi.fn();
    applyImageWithinBudget(base64DataUrl("image/jpeg", 2_000_000), { kind: "map" }, apply);

    expect(apply).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(apply).toHaveBeenCalledWith("data:image/jpeg;base64,compressed"));
  });
});
