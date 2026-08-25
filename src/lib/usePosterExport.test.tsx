import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import {
  mountHook,
  posterExportEnv as env,
  resetPosterExportEnvironment,
  teardownPosterExportEnvironment,
} from "./poster-export-test-harness";
import { createProjectPackage, serializeProjectPackage } from "./project-package";
import { createProjectDocument } from "./project-document";
import { sampleStudents } from "./project-data";

/** 导出被别的导出插队时的代次矩阵在 `usePosterExport.generation.test.tsx`。 */

beforeEach(resetPosterExportEnvironment);
afterEach(teardownPosterExportEnvironment);

describe("usePosterExport", () => {
  it("exports a png blob and reports success", async () => {
    const harness = mountHook();

    await act(async () => { await harness.result().exportPng(); });

    expect(env.downloads).toHaveLength(1);
    expect(env.downloads[0]?.filename).toBe("我的毕业去向图-1x.png");
    expect(env.downloads[0]?.blob.type).toBe("image/png");
    expect(harness.result().exportState).toBe("success");
    expect(harness.result().exportError).toBeUndefined();
    expect(harness.result().exportingPng).toBe(false);
    expect(harness.statuses).toContain("PNG 已导出");
  });

  it("surfaces a decode failure distinctly and keeps the export panel usable", async () => {
    env.imageBehavior = "error";
    const harness = mountHook();

    await act(async () => { await harness.result().exportPng(); });

    expect(env.downloads).toHaveLength(0);
    expect(harness.result().exportState).toBe("error");
    expect(harness.result().exportError).toContain("SVG 转 PNG 失败");
    expect(harness.result().exportError).not.toContain("超时");
    expect(harness.result().exportingPng).toBe(false);
  });

  it("reports a png encoder failure with the underlying message", async () => {
    env.canvasBehavior = "throw";
    const harness = mountHook();

    await act(async () => { await harness.result().exportPng(); });

    expect(harness.result().exportState).toBe("error");
    expect(harness.result().exportError).toContain("PNG 下载不可用");
  });

  it("retries with fresh state after a failure", async () => {
    env.imageBehavior = "error";
    const harness = mountHook();

    await act(async () => { await harness.result().exportPng(); });
    expect(harness.result().exportState).toBe("error");

    // 重试前用户改了倍率与透明底：重试必须用新状态，而不是失败那次的快照。
    act(() => { harness.result().setPngScale(2); });
    act(() => { harness.result().setTransparentExport(true); });
    env.imageBehavior = "load";
    await act(async () => { harness.result().retryLastExport(); });

    expect(harness.result().exportState).toBe("success");
    expect(harness.result().exportError).toBeUndefined();
    expect(env.downloads).toHaveLength(1);
    expect(env.canvasSizes).toEqual([{ width: 1500 * 2, height: 1000 * 2 }]);
    expect(env.fillRectCalls).toBe(0);
  });

  it("routes retry back to the last export kind", async () => {
    const harness = mountHook();

    act(() => { harness.result().exportSvg(); });
    expect(harness.result().exportState).toBe("success");
    expect(env.downloads.map((entry) => entry.filename)).toEqual(["我的毕业去向图.svg"]);

    await act(async () => { harness.result().retryLastExport(); });

    expect(env.downloads.map((entry) => entry.filename)).toEqual(["我的毕业去向图.svg", "我的毕业去向图.svg"]);
    expect(harness.statuses.filter((message) => message === "SVG 已导出")).toHaveLength(2);
  });

  it("keeps the failure visible when the poster is not mounted yet", async () => {
    const harness = mountHook({ withPoster: false });

    await act(async () => { await harness.result().exportPng(); });

    expect(harness.result().exportState).toBe("error");
    expect(harness.result().exportError).toBe("海报预览尚未准备好");
  });

  it("rejects an oversized package by File.size without starting a read", () => {
    const harness = mountHook();
    const readSpy = vi.spyOn(FileReader.prototype, "readAsText");
    const file = new File(["{}"], "huge.json", { type: "application/json" });
    Object.defineProperty(file, "size", { value: 256 * 1024 * 1024, configurable: true });

    act(() => { harness.result().importProjectPackage(file); });

    expect(readSpy).not.toHaveBeenCalled();
    expect(harness.imported).toHaveLength(0);
    expect(harness.statuses.at(-1)).toContain("工程包过大");
    expect(harness.statuses.at(-1)).toContain("128.0 MB");
  });

  it("imports a package whose size is within the cap", async () => {
    const harness = mountHook();
    vi.stubGlobal("confirm", vi.fn(() => true));
    const project = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
    const source = serializeProjectPackage(createProjectPackage({ project, assets: [], fonts: [] }));
    const file = new File([source], "project.json", { type: "application/json" });

    act(() => { harness.result().importProjectPackage(file); });

    await vi.waitFor(() => expect(harness.imported).toHaveLength(1));
    expect(harness.imported[0]?.project.students).toHaveLength(sampleStudents.length);
    expect(harness.statuses.at(-1)).toContain("完整工程包已导入");
  });

  it("exports the project package and reports the roster size", () => {
    const harness = mountHook();

    act(() => { harness.result().exportProjectPackage(); });

    expect(harness.result().exportState).toBe("success");
    expect(env.downloads).toHaveLength(1);
    expect(harness.statuses.at(-1)).toContain("完整工程包已导出");
  });

  it("names exports after the current project and publishes the file name", async () => {
    const harness = mountHook({ getProjectName: () => "高三3班" });

    await act(async () => { await harness.result().exportPng(); });

    expect(env.downloads[0]?.filename).toBe("高三3班-1x.png");
    expect(harness.result().lastExportFileName).toBe("高三3班-1x.png");
  });
});
