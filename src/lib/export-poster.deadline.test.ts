import { describe, expect, it, vi } from "vitest";
import { computeImageLoadTimeout, PosterExportError, svgToPngBlob } from "./export-poster";
import {
  createSyntheticSvg,
  FAKE_PNG_BYTES,
  installCanvasStub,
  installHungImageStub,
  installObjectUrlStubs,
  installPosterStubCleanup,
  installSlowImageStub,
} from "./export-poster-test-fixtures";

installPosterStubCleanup();

describe("poster export", () => {
  describe("load deadline", () => {
    it("scales the deadline with source bytes and output pixels, and caps it", () => {
      expect(computeImageLoadTimeout({ byteLength: 0, pixels: 0 })).toBe(4000);
      expect(computeImageLoadTimeout({ byteLength: 8_000_000 })).toBe(20_000);
      expect(computeImageLoadTimeout({ byteLength: 1_000_000, pixels: 2_160_000 })).toBe(8160);
      expect(computeImageLoadTimeout({ byteLength: 500_000_000 })).toBe(60_000);
      // 非法输入不能变成 NaN 期限：setTimeout(NaN) 会立刻触发，等于零超时。
      expect(computeImageLoadTimeout({ byteLength: Number.NaN, pixels: Number.NaN })).toBe(4000);
      expect(computeImageLoadTimeout({ byteLength: -10, pixels: -10 })).toBe(4000);
      expect(computeImageLoadTimeout({ byteLength: Number.POSITIVE_INFINITY })).toBe(4000);
    });

    it("lets a large poster finish loading at 4.5s (the old fixed 4s timeout failed it)", async () => {
      vi.useFakeTimers();
      try {
        installObjectUrlStubs();
        installSlowImageStub(4500);
        installCanvasStub();

        const svg = createSyntheticSvg(2_000_000);
        const pending = svgToPngBlob(svg, { width: 1800, height: 1200 });
        const settled = pending.then((blob) => blob.size, (error: Error) => error.message);
        await vi.advanceTimersByTimeAsync(4600);
        await expect(settled).resolves.toBe(FAKE_PNG_BYTES);
      } finally {
        vi.useRealTimers();
      }
    });

    it("still rejects a hung load once the scaled deadline elapses", async () => {
      vi.useFakeTimers();
      try {
        const urls = installObjectUrlStubs();
        installHungImageStub();

        const svg = createSyntheticSvg(2_000_000);
        const pending = svgToPngBlob(svg, { width: 1800, height: 1200 });
        const settled = pending.then(() => "resolved", (error: PosterExportError) => error);
        await vi.advanceTimersByTimeAsync(200_000);
        const error = await settled;
        expect(error).toBeInstanceOf(PosterExportError);
        expect((error as PosterExportError).code).toBe("timeout");
        expect((error as Error).message).toContain("SVG 转 PNG 超时");
        // 超时不再走一遍 data URL 通道，也要把 object URL 收回来。
        expect(urls.revoked).toEqual(["blob:mock-1"]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("keeps the old 4s floor for small posters", async () => {
      vi.useFakeTimers();
      try {
        installObjectUrlStubs();
        installSlowImageStub(4500);
        installCanvasStub();

        const pending = svgToPngBlob("<svg/>", { width: 100, height: 100 });
        const settled = pending.then(() => "resolved", (error: PosterExportError) => error.code);
        await vi.advanceTimersByTimeAsync(5000);
        await expect(settled).resolves.toBe("timeout");
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
