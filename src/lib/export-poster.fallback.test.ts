import { describe, expect, it } from "vitest";
import { PosterExportError, svgToPngBlob, type PosterExportMetrics } from "./export-poster";
import {
  FAKE_PNG_BYTES,
  installBlobHostileImageStub,
  installBrokenImageStub,
  installCanvasStub,
  installImmediateImageStub,
  installObjectUrlStubs,
  installPosterStubCleanup,
} from "./export-poster-test-fixtures";

installPosterStubCleanup();

describe("poster export", () => {
  it("falls back to toDataURL when toBlob is unavailable", async () => {
    installObjectUrlStubs();
    installImmediateImageStub();
    const { canvas } = installCanvasStub({ withoutToBlob: true });

    let metrics: PosterExportMetrics | undefined;
    const blob = await svgToPngBlob("<svg/>", { width: 20, height: 10, onMetrics: (value) => { metrics = value; } });

    expect(canvas.toDataURL).toHaveBeenCalled();
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe(FAKE_PNG_BYTES);
    expect(metrics?.outputStrategy).toBe("data-url");
  });

  it("falls back to toDataURL when toBlob hands back null", async () => {
    installObjectUrlStubs();
    installImmediateImageStub();
    const { canvas } = installCanvasStub({ toBlobReturnsNull: true });

    const blob = await svgToPngBlob("<svg/>", { width: 20, height: 10 });

    expect(canvas.toBlob).toHaveBeenCalled();
    expect(canvas.toDataURL).toHaveBeenCalled();
    expect(blob.size).toBe(FAKE_PNG_BYTES);
  });

  it("reports a tainted canvas separately from an encoding failure", async () => {
    installObjectUrlStubs();
    installImmediateImageStub();
    const taint = new Error("Tainted canvases may not be exported.");
    taint.name = "SecurityError";
    installCanvasStub({ withoutToBlob: true, toDataURL: () => { throw taint; } });

    const error = await svgToPngBlob("<svg/>", { width: 20, height: 10 }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(PosterExportError);
    expect((error as PosterExportError).code).toBe("taint");
    expect((error as Error).message).toContain("跨域素材");
  });

  it("keeps the original encoder message when png encoding fails", async () => {
    installObjectUrlStubs();
    installImmediateImageStub();
    installCanvasStub({ withoutToBlob: true, toDataURL: () => { throw new Error("PNG 下载不可用"); } });

    await expect(svgToPngBlob("<svg/>", { width: 20, height: 10 })).rejects.toThrow("PNG 下载不可用");
  });

  it("reports image decode failures distinctly from timeouts", async () => {
    installObjectUrlStubs();
    installBrokenImageStub();

    const error = await svgToPngBlob("<svg/>", { width: 40, height: 20 }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(PosterExportError);
    expect((error as PosterExportError).code).toBe("decode");
    expect((error as Error).message).toContain("SVG 转 PNG 失败");
    expect((error as Error).message).not.toContain("超时");
  });

  it("retries through the data-url source when the blob url cannot be decoded", async () => {
    const urls = installObjectUrlStubs();
    const { attempted } = installBlobHostileImageStub();
    installCanvasStub();

    let metrics: PosterExportMetrics | undefined;
    const blob = await svgToPngBlob("<svg/>", { width: 20, height: 10, onMetrics: (value) => { metrics = value; } });

    expect(attempted).toEqual(["blob:", "data:"]);
    expect(blob.size).toBe(FAKE_PNG_BYTES);
    expect(metrics?.sourceStrategy).toBe("data-url");
    // 失败的 blob 尝试也只 revoke 一次。
    expect(urls.revoked).toEqual(["blob:mock-1"]);
  });
});
