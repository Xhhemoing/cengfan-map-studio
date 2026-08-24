import { act, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_PROJECT_PACKAGE_BYTES } from "./import-file-limits";
import { createProjectDocument, type ProjectDocument } from "./project-document";
import { createProjectPackage, serializeProjectPackage, type ProjectPackage } from "./project-package";
import { DEFAULT_RENDER_SETTINGS } from "./render-settings";
import { usePosterExport, type UsePosterExportResult } from "./usePosterExport";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  svgToPngBlob: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
  downloadBlob: vi.fn(),
  ensureUserFontsLoaded: vi.fn(async () => {}),
}));

// 只桩掉栅格化与下载副作用，面积校验仍走真实的 availablePngScales。
vi.mock("./export-poster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./export-poster")>();
  return { ...actual, svgToPngBlob: mocks.svgToPngBlob, downloadBlob: mocks.downloadBlob };
});

vi.mock("./fonts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fonts")>();
  return { ...actual, ensureUserFontsLoaded: mocks.ensureUserFontsLoaded };
});

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];
const statusMessages: string[] = [];

function projectWithCanvas(width: number, height: number): ProjectDocument {
  const base = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  return { ...base, canvas: { ...base.canvas, width, height } };
}

function Harness({
  project,
  applyImportedPackage,
  onRender,
}: {
  project: ProjectDocument;
  applyImportedPackage: (pack: ProjectPackage) => void;
  onRender: (result: UsePosterExportResult) => void;
}) {
  const posterRef = useRef<SVGSVGElement | null>(null);
  const result = usePosterExport({
    posterRef,
    project,
    userAssets: [],
    userFonts: [],
    customTemplates: [],
    renderSettings: DEFAULT_RENDER_SETTINGS,
    applyImportedPackage,
    reportStatus: (message) => statusMessages.push(message),
  });
  useEffect(() => {
    onRender(result);
  });
  return <svg ref={posterRef} />;
}

async function mountExport(
  project: ProjectDocument,
  applyImportedPackage: (pack: ProjectPackage) => void = vi.fn(),
): Promise<() => UsePosterExportResult> {
  let latest: UsePosterExportResult | null = null;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  await act(async () => {
    root.render(<Harness project={project} applyImportedPackage={applyImportedPackage} onRender={(result) => { latest = result; }} />);
  });
  return () => latest!;
}

afterEach(() => {
  while (roots.length) {
    const entry = roots.pop()!;
    act(() => entry.root.unmount());
    entry.container.remove();
  }
  statusMessages.length = 0;
  vi.clearAllMocks();
});

describe("usePosterExport PNG 面积防护", () => {
  it("refuses an over-budget scale before starting any rasterization work", async () => {
    const result = await mountExport(projectWithCanvas(6000, 6000));

    await act(async () => { result().setPngScale(3); });
    await act(async () => { await result().exportPng(); });

    expect(result().exportState).toBe("error");
    expect(result().exportError).toContain("6000 × 6000 画布按 3× 导出");
    expect(result().exportError).toContain("超过浏览器 64.0 百万像素的安全上限");
    expect(result().exportError).toContain("请改用 1× 导出");
    expect(statusMessages.at(-1)).toBe(result().exportError);
    expect(mocks.svgToPngBlob).not.toHaveBeenCalled();
    expect(mocks.ensureUserFontsLoaded).not.toHaveBeenCalled();
    expect(mocks.downloadBlob).not.toHaveBeenCalled();
    expect(result().exportingPng).toBe(false);
  });

  it("still exports the same large canvas at the always-available 1×", async () => {
    const result = await mountExport(projectWithCanvas(6000, 6000));

    await act(async () => { await result().exportPng(); });

    expect(mocks.svgToPngBlob).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ width: 6000, height: 6000 }));
    expect(mocks.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "我的毕业去向图.png");
    expect(result().exportState).toBe("success");
    expect(statusMessages.at(-1)).toBe("PNG 已导出");
  });

  it("keeps 2× working on canvases that stay under the budget", async () => {
    const result = await mountExport(projectWithCanvas(1500, 1000));

    await act(async () => { result().setPngScale(2); });
    await act(async () => { await result().exportPng(); });

    expect(mocks.svgToPngBlob).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ width: 3000, height: 2000 }));
    expect(result().exportState).toBe("success");
  });
});

function packageFile(students: ProjectDocument["students"], name = "工程.json"): File {
  const pack = createProjectPackage({
    project: { ...createProjectDocument({ students: [], templateId: "original", dataView: "province" }), students },
    assets: [],
    fonts: [],
    customTemplates: [],
    renderSettings: DEFAULT_RENDER_SETTINGS,
  });
  return new File([serializeProjectPackage(pack)], name, { type: "application/json" });
}

/** 只伪造 `size`，校验在读盘前就发生，内容多大无所谓。 */
function oversizedFile(bytes: number): File {
  const file = packageFile([]);
  Object.defineProperty(file, "size", { value: bytes });
  return file;
}

/** FileReader 的 onload 是异步派发的，等它一轮再断言。 */
async function flushReader(): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 0)); });
}

describe("usePosterExport 工程包导入防护", () => {
  it("refuses an over-budget package before reading a single byte", async () => {
    const applyImportedPackage = vi.fn();
    const result = await mountExport(projectWithCanvas(1200, 800), applyImportedPackage);
    const file = oversizedFile(MAX_PROJECT_PACKAGE_BYTES + 1);
    const readAsText = vi.spyOn(FileReader.prototype, "readAsText");

    await act(async () => { result().importProjectPackage(file); });
    await flushReader();

    expect(readAsText).not.toHaveBeenCalled();
    expect(result().projectImportConfirmation).toBeNull();
    expect(applyImportedPackage).not.toHaveBeenCalled();
    expect(statusMessages.at(-1)).toContain("工程包过大");
    expect(statusMessages.at(-1)).toContain("上限 24.0 MB");
    readAsText.mockRestore();
  });

  it("parses a package but waits for confirmation before replacing the workspace", async () => {
    const applyImportedPackage = vi.fn();
    const result = await mountExport(projectWithCanvas(1200, 800), applyImportedPackage);

    await act(async () => {
      result().importProjectPackage(packageFile([
        { id: "s1", name: "林舟", university: "北京大学", city: "北京市", visibility: true },
        { id: "s2", name: "苏禾", university: "浙江大学", city: "杭州市", visibility: true },
      ]));
    });
    await flushReader();

    expect(applyImportedPackage).not.toHaveBeenCalled();
    expect(result().projectImportConfirmation).toMatchObject({
      fileName: "工程.json",
      currentStudentCount: 0,
      nextStudentCount: 2,
    });

    await act(async () => { result().confirmProjectImport(); });

    expect(applyImportedPackage).toHaveBeenCalledTimes(1);
    expect(result().projectImportConfirmation).toBeNull();
    expect(statusMessages.at(-1)).toContain("完整工程包已导入：2 条名单");
  });

  it("leaves the workspace untouched when the confirmation is cancelled", async () => {
    const applyImportedPackage = vi.fn();
    const result = await mountExport(projectWithCanvas(1200, 800), applyImportedPackage);

    await act(async () => { result().importProjectPackage(packageFile([{ id: "s1", name: "林舟", university: "北京大学", city: "北京市", visibility: true }])); });
    await flushReader();
    await act(async () => { result().cancelProjectImport(); });

    expect(applyImportedPackage).not.toHaveBeenCalled();
    expect(result().projectImportConfirmation).toBeNull();
    expect(statusMessages.at(-1)).toBe("已取消导入工程包，当前工程未改动");
  });

  it("reports a parse failure without opening the confirmation", async () => {
    const applyImportedPackage = vi.fn();
    const result = await mountExport(projectWithCanvas(1200, 800), applyImportedPackage);

    await act(async () => { result().importProjectPackage(new File(["{ not json"], "坏包.json")); });
    await flushReader();

    expect(result().projectImportConfirmation).toBeNull();
    expect(applyImportedPackage).not.toHaveBeenCalled();
    expect(statusMessages.length).toBeGreaterThan(0);
  });
});
