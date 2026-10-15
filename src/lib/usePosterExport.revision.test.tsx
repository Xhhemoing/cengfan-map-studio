import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mountHook,
  posterExportEnv,
  resetPosterExportEnvironment,
  startGatedPngExport,
  teardownPosterExportEnvironment,
} from "./poster-export-test-harness";
import type { ProjectPackage } from "./project-package";

beforeEach(resetPosterExportEnvironment);
afterEach(teardownPosterExportEnvironment);

describe("exported file and current workspace revisions", () => {
  it("retains the last file after an edit while requiring another export of the current version", () => {
    const harness = mountHook();
    act(() => harness.result().exportSvg());
    const fileName = harness.result().lastExportFileName;
    expect(harness.result().exportIsStale).toBe(false);

    // Equivalent input arrays on a rerender are not a new version.
    harness.render();
    expect(harness.result().exportIsStale).toBe(false);
    harness.setProject({ ...harness.project, students: harness.project.students.slice(1) });

    expect(harness.result().exportState).toBe("success");
    expect(harness.result().lastExportFileName).toBe(fileName);
    expect(harness.result().exportIsStale).toBe(true);
    act(() => harness.result().retryLastExport());
    expect(harness.result().exportIsStale).toBe(false);
  });

  it("does not invalidate an identical poster when only its undo history changes", () => {
    const harness = mountHook();
    act(() => harness.result().exportSvg());
    harness.setProject({
      ...harness.project,
      history: { past: [{ id: "history-only", label: "标题", source: "manual", snapshot: harness.project }], future: [] },
    });
    expect(harness.result().exportIsStale).toBe(false);
  });

  it("marks a PNG as the previous version when editing occurs during its asynchronous export", async () => {
    const harness = mountHook();
    const gated = await startGatedPngExport(harness);
    harness.setProject({ ...harness.project, canvas: { ...harness.project.canvas, width: 1600 } });
    await act(async () => { gated.release(); await gated.settled; });

    expect(harness.result().exportState).toBe("success");
    expect(harness.result().lastExportFileName).toBeDefined();
    expect(harness.result().exportIsStale).toBe(true);
  });

  it("compares only the export options used by the successful format", () => {
    const harness = mountHook();
    act(() => harness.result().exportSvg());
    act(() => harness.result().setPngScale(3));
    expect(harness.result().exportIsStale).toBe(false);
    act(() => harness.result().setTransparentExport(true));
    expect(harness.result().exportIsStale).toBe(true);

    act(() => harness.result().exportProjectPackage());
    expect(harness.result().exportIsStale).toBe(false);
    act(() => harness.result().setTransparentExport(false));
    expect(harness.result().exportIsStale).toBe(false);
    act(() => harness.result().setIncludeResourcesInProjectExport(false));
    expect(harness.result().exportIsStale).toBe(true);
  });

  it("invalidates image export receipts when only the displayed preview changes", () => {
    const harness = mountHook();
    act(() => harness.result().exportSvg());
    harness.setRenderProject({ ...harness.project, map: { ...harness.project.map, x: harness.project.map.x + 10 } });
    expect(harness.result().exportIsStale).toBe(true);
    act(() => harness.result().exportSvg());
    expect(harness.result().exportIsStale).toBe(false);
    harness.setRenderProject(undefined);
    expect(harness.result().exportIsStale).toBe(true);
  });

  it("uses the displayed preview's canvas dimensions for PNG without changing the document", async () => {
    const harness = mountHook();
    harness.setRenderProject({ ...harness.project, canvas: { ...harness.project.canvas, width: 1800, height: 1200 } });
    await act(async () => { await harness.result().exportPng(); });
    expect(posterExportEnv.canvasSizes).toEqual([{ width: 1800, height: 1200 }]);
    expect(harness.project.canvas).toMatchObject({ width: 1500, height: 1000 });
    expect(harness.result().exportIsStale).toBe(false);
  });

  it("keeps unapplied previews out of editable packages and their export receipts", async () => {
    const harness = mountHook();
    const originalTitle = harness.project.textElements.find((text) => text.id === "text-title")!.content;
    harness.setRenderProject({
      ...harness.project,
      students: harness.project.students.slice(1),
      textElements: harness.project.textElements.map((text) => text.id === "text-title" ? { ...text, content: "未应用的预览标题" } : text),
    });
    act(() => harness.result().exportProjectPackage());
    const blob = posterExportEnv.downloads.at(-1)!.blob;
    const source = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("无法读取测试工程包"));
      reader.readAsText(blob);
    });
    const pack = JSON.parse(source) as ProjectPackage;
    expect(pack.project.students).toHaveLength(harness.project.students.length);
    expect(pack.project.textElements.find((text) => text.id === "text-title")!.content).toBe(originalTitle);
    harness.setRenderProject(undefined);
    expect(harness.result().exportIsStale).toBe(false);
  });
});
