import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import {
  downloadedFileNames,
  mountHook,
  posterExportEnv as env,
  resetPosterExportEnvironment,
  startGatedPngExport,
  teardownPosterExportEnvironment,
} from "./poster-export-test-harness";

/**
 * 导出代次守卫的矩阵：PNG 是异步的，SVG / 工程包 / 另一次 PNG 都可能在它落地之前插队。
 * 三个量各回答一个问题——谁能写导出面板（`exportGenerationRef`）、这份 PNG 还欠着吗
 * （`latestPngGenerationRef`）、有没有 PNG 在途（`pngExportsInFlightRef`）——这里逐格钉住。
 */

beforeEach(resetPosterExportEnvironment);
afterEach(teardownPosterExportEnvironment);

describe("usePosterExport export generations", () => {
  it("ignores a stale png export that settles after a newer one", async () => {
    const harness = mountHook();
    const stale = await startGatedPngExport(harness, "error");

    await act(async () => { await harness.result().exportPng(); });
    expect(harness.result().exportState).toBe("success");

    // 先发起的那次这时才失败：它不能把后一次的成功状态改写成错误。
    // blob 通道解不出来会降级到 data URL 通道再试一次，两条都得判失败才是「这次导出失败了」。
    env.imageBehavior = "error";
    await act(async () => {
      stale.release();
      await stale.settled;
    });

    expect(harness.result().exportState).toBe("success");
    expect(harness.result().exportError).toBeUndefined();
    expect(harness.result().exportingPng).toBe(false);
    expect(env.downloads).toHaveLength(1);
  });

  it("writes only the newest png when an earlier one is still encoding", async () => {
    const harness = mountHook();
    const stale = await startGatedPngExport(harness);

    // 上一条用例里先发起的那次是解码失败，走不到落盘；这里两次都能成功编码，
    // 靠倍率区分文件名——「更晚的 PNG 让先发起的那份成为多余文件」这一条才真的被钉住。
    act(() => { harness.result().setPngScale(3); });
    await act(async () => { await harness.result().exportPng(); });
    await act(async () => { stale.release(); await stale.settled; });

    expect(downloadedFileNames()).toEqual(["我的毕业去向图-3x.png"]);
    expect(harness.result().exportState).toBe("success");
    expect(harness.result().lastExportFileName).toBe("我的毕业去向图-3x.png");
  });

  it("still writes the png when another kind of export starts mid-flight", async () => {
    const harness = mountHook();
    const png = await startGatedPngExport(harness);

    // SVG 是另一份文件，不是这次 PNG 的替代品：它可以接管导出状态，但不能吃掉用户已经要过的 PNG。
    act(() => { harness.result().exportSvg(); });
    await act(async () => { png.release(); await png.settled; });

    expect(downloadedFileNames()).toEqual(["我的毕业去向图.svg", "我的毕业去向图-2x.png"]);
    // 代次守卫仍然生效：落地晚的 PNG 不改写 SVG 已经写下的状态与提示。
    expect(harness.result().exportState).toBe("success");
    expect(harness.result().lastExportFileName).toBe("我的毕业去向图.svg");
    expect(harness.statuses.at(-1)).toBe("SVG 已导出");
  });

  it("still reports the png failure when another kind of export starts mid-flight", async () => {
    const harness = mountHook();
    const png = await startGatedPngExport(harness, "error");

    // SVG 接管状态面板之后，这次 PNG 才失败：面板归 SVG，但用户点过的 PNG 没了，
    // 不能只剩一句「SVG 已导出」——那等于告诉他两份文件都好了。
    act(() => { harness.result().exportSvg(); });
    env.imageBehavior = "error";
    await act(async () => { png.release(); await png.settled; });

    expect(downloadedFileNames()).toEqual(["我的毕业去向图.svg"]);
    expect(harness.statuses.at(-1)).toContain("SVG 转 PNG 失败");
    // 状态面板仍归后发起的 SVG，代次守卫的既有契约不变。
    expect(harness.result().exportState).toBe("success");
    expect(harness.result().exportError).toBeUndefined();
    expect(harness.result().lastExportFileName).toBe("我的毕业去向图.svg");
  });

  it("still reports a blocked png download when another kind of export starts mid-flight", async () => {
    const harness = mountHook();
    const png = await startGatedPngExport(harness);

    // 这次 PNG 已经编出字节了，倒在写盘那一步（浏览器/扩展拦下了程序化下载）。
    // 产物真的丢了，而且界面上没有任何痕迹——比解码失败更该报出来。
    act(() => { harness.result().exportSvg(); });
    env.downloadBehavior = "throw";
    await act(async () => { png.release(); await png.settled; });

    expect(downloadedFileNames()).toEqual(["我的毕业去向图.svg"]);
    expect(harness.statuses.at(-1)).toContain("下载被拦截");
    expect(harness.result().exportState).toBe("success");
  });

  it("stays quiet when the failing png was superseded by a newer png", async () => {
    const harness = mountHook();
    const stale = await startGatedPngExport(harness, "error");

    // 这一条钉住上面两条的边界：更晚的一次 PNG 是同一份文件的最终结果，
    // 先发起的那次失败已经无关紧要，报出来只会让用户以为刚成功的导出也坏了。
    await act(async () => { await harness.result().exportPng(); });
    env.imageBehavior = "error";
    await act(async () => { stale.release(); await stale.settled; });

    expect(harness.statuses).toEqual(["PNG 已导出"]);
    expect(harness.result().exportState).toBe("success");
  });

  it("releases the png busy flag even when a later export supersedes it", async () => {
    const harness = mountHook();
    const png = await startGatedPngExport(harness);
    expect(harness.result().exportingPng).toBe(true);

    act(() => { harness.result().exportProjectPackage(); });
    await act(async () => { png.release(); await png.settled; });

    expect(harness.result().exportingPng).toBe(false);
  });

  it("keeps the png busy flag raised until every in-flight png settles", async () => {
    const harness = mountHook();
    const first = await startGatedPngExport(harness);
    const second = await startGatedPngExport(harness);

    // 「有没有 PNG 在途」是个计数问题：被顶掉的第一次交还占用后，第二次还在跑。
    await act(async () => { first.release(); await first.settled; });
    expect(harness.result().exportingPng).toBe(true);

    await act(async () => { second.release(); await second.settled; });
    expect(harness.result().exportingPng).toBe(false);
  });
});
