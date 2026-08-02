import { describe, expect, it, vi } from "vitest";
import { removeBackground } from "./background-removal";

describe("removeBackground", () => {
  it("clears corner-matched background pixels while keeping the center subject", async () => {
    const width = 4;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
    // Center subject stays red.
    for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2]] as const) {
      const offset = (y * width + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      data[offset + 3] = 255;
    }

    const putImageData = vi.fn();
    const getImageData = vi.fn(() => ({ data, width, height }));
    const drawImage = vi.fn();
    const toDataURL = vi.fn(() => "data:image/png;base64,processed");
    const getContext = vi.fn(() => ({ drawImage, getImageData, putImageData }));

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext,
          toDataURL,
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName);
    });

    class MockImage {
      naturalWidth = width;
      naturalHeight = height;
      width = width;
      height = height;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", MockImage);

    const result = await removeBackground("data:image/png;base64,source", { tolerance: 20 });
    expect(result).toBe("data:image/png;base64,processed");
    expect(putImageData).toHaveBeenCalled();
    // Corner alpha cleared.
    expect(data[3]).toBe(0);
    // Center subject remains opaque.
    expect(data[(1 * width + 1) * 4 + 3]).toBeGreaterThan(0);

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
