import { describe, expect, it } from "vitest";
import { svgToPngBlob, type PosterExportMetrics } from "./export-poster";
import {
  base64Length,
  createSyntheticSvg,
  FAKE_PNG_BYTES,
  installCanvasStub,
  installDeferredImageStub,
  installImmediateImageStub,
  installObjectUrlStubs,
  installPosterStubCleanup,
} from "./export-poster-test-fixtures";

installPosterStubCleanup();

describe("poster export", () => {
  it("rasterizes svg markup into a png blob through the object-url path", async () => {
    const urls = installObjectUrlStubs();
    installImmediateImageStub();
    const { context } = installCanvasStub();

    const markup =
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="#215d75"/></svg>';
    let metrics: PosterExportMetrics | undefined;
    const blob = await svgToPngBlob(markup, { width: 20, height: 10, onMetrics: (value) => { metrics = value; } });

    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe(FAKE_PNG_BYTES);
    expect(context.drawImage).toHaveBeenCalled();
    expect(urls.created[0]?.type).toBe("image/svg+xml;charset=utf-8");
    expect(metrics?.sourceStrategy).toBe("blob");
    expect(metrics?.outputStrategy).toBe("blob");
  });

  it("does not prefill the png canvas when transparent background is enabled", async () => {
    installObjectUrlStubs();
    installImmediateImageStub();
    const { canvas, context } = installCanvasStub();

    await svgToPngBlob("<svg/>", { width: 40, height: 20, transparentBackground: true });

    expect(canvas.width).toBe(40);
    expect(canvas.height).toBe(20);
    expect(context.fillRect).not.toHaveBeenCalled();
    expect(context.drawImage).toHaveBeenCalled();
  });

  it("materializes far fewer bytes than the data-url pipeline for an 8MB poster", async () => {
    installObjectUrlStubs();
    installImmediateImageStub();
    installCanvasStub();

    const svg = createSyntheticSvg();
    // 改造前的管线：encodeURIComponent 的源字符串 + toDataURL 的 base64 结果。
    const baselineBytes = encodeURIComponent(svg).length
      + "data:image/png;base64,".length + base64Length(FAKE_PNG_BYTES);

    let metrics: PosterExportMetrics | undefined;
    await svgToPngBlob(svg, { width: 1800, height: 1200, onMetrics: (value) => { metrics = value; } });

    const currentBytes = metrics?.totalBytes ?? Number.POSITIVE_INFINITY;
    const reduction = (baselineBytes - currentBytes) / baselineBytes;
    // 指标要能在 CI 日志里被人读到，不然只剩一个 pass。
    console.log(`[export bytes] baseline=${baselineBytes} current=${currentBytes} reduction=${(reduction * 100).toFixed(1)}%`);
    // 门槛 5%；实测约 42%（源侧省下 encodeURIComponent 的转义膨胀，结果侧省下 base64 的 1.33×）。
    // 这里的对比对新管线是偏保守的：基线按字符数计，而 blob 按 UTF-8 字节计，中文
    // 内容在 JS 字符串里只占 2 字节/字符、在 blob 里却是 3 字节/字符。
    expect(reduction).toBeGreaterThanOrEqual(0.05);
    expect(reduction).toBeGreaterThan(0.35);
    expect(metrics?.sourceStrategy).toBe("blob");
    expect(metrics?.outputStrategy).toBe("blob");
  });

  it("revokes the svg object url exactly once, after the image settles", async () => {
    const urls = installObjectUrlStubs();
    const { release } = installDeferredImageStub();
    installCanvasStub();

    const pending = svgToPngBlob("<svg/>", { width: 20, height: 10 });
    await Promise.resolve();
    // 加载还没落地时提前 revoke 会让图片直接失败，这里必须一次都没调用。
    expect(urls.revoked).toEqual([]);
    release();
    await pending;
    expect(urls.revoked).toEqual(["blob:mock-1"]);
    expect(urls.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
