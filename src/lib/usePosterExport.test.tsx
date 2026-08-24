import { act, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_PROJECT_PACKAGE_BYTES } from "./import-file-limits";
import type { UserAsset } from "./assets";
import { exportSizeBytes } from "./export-size-estimate";
import { createProjectDocument, type ProjectDocument, type ProjectHistoryEntry } from "./project-document";
import { createProjectPackage, serializeProjectPackage, type ProjectPackage } from "./project-package";
import { DEFAULT_RENDER_SETTINGS } from "./render-settings";
import { usePosterExport, type UsePosterExportResult } from "./usePosterExport";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  svgToPngBlob: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
  downloadBlob: vi.fn(),
  downloadText: vi.fn(),
  ensureUserFontsLoaded: vi.fn(async () => {}),
  inlineSvgImages: vi.fn(async (markup: string) => `<!--inlined-->${markup}`),
  hasExternalSvgImages: vi.fn(() => true),
}));

// 只桩掉栅格化与下载副作用，面积校验仍走真实的 availablePngScales。
vi.mock("./export-poster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./export-poster")>();
  return { ...actual, svgToPngBlob: mocks.svgToPngBlob, downloadBlob: mocks.downloadBlob, downloadText: mocks.downloadText };
});

vi.mock("./svg-image-inline", () => ({
  inlineSvgImages: mocks.inlineSvgImages,
  hasExternalSvgImages: mocks.hasExternalSvgImages,
}));

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
  userAssets = [],
}: {
  project: ProjectDocument;
  applyImportedPackage: (pack: ProjectPackage) => void;
  onRender: (result: UsePosterExportResult) => void;
  userAssets?: UserAsset[];
}) {
  const posterRef = useRef<SVGSVGElement | null>(null);
  const result = usePosterExport({
    posterRef,
    project,
    userAssets,
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
  userAssets: UserAsset[] = [],
): Promise<() => UsePosterExportResult> {
  let latest: UsePosterExportResult | null = null;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  await act(async () => {
    root.render(
      <Harness
        project={project}
        applyImportedPackage={applyImportedPackage}
        userAssets={userAssets}
        onRender={(result) => { latest = result; }}
      />,
    );
  });
  return () => latest!;
}

/** 单张就撑爆 24MB 的素材，用来验证导出侧的体积预警。 */
function oversizedAsset(): UserAsset {
  return {
    id: "asset-huge",
    label: "全班合影原图",
    src: `data:image/png;base64,${"A".repeat(MAX_PROJECT_PACKAGE_BYTES)}`,
    kind: "decoration",
    provinceIds: [],
    source: "user",
  };
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
    expect(mocks.inlineSvgImages).not.toHaveBeenCalled();
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

describe("usePosterExport 校徽内联", () => {
  it("rasterizes the inlined markup, not the raw serialization", async () => {
    const result = await mountExport(projectWithCanvas(1200, 800));

    await act(async () => { await result().exportPng(); });

    expect(mocks.inlineSvgImages).toHaveBeenCalledTimes(1);
    expect(mocks.inlineSvgImages).toHaveBeenCalledWith(expect.stringContaining("<svg"));
    const [rasterized] = mocks.svgToPngBlob.mock.calls[0]!;
    expect(rasterized).toBe(await mocks.inlineSvgImages.mock.results[0]!.value);
    expect(mocks.inlineSvgImages.mock.invocationCallOrder[0]!)
      .toBeLessThan(mocks.svgToPngBlob.mock.invocationCallOrder[0]!);
    expect(result().exportState).toBe("success");
  });

  it("downloads the inlined markup as SVG", async () => {
    const result = await mountExport(projectWithCanvas(1200, 800));

    await act(async () => { await result().exportSvg(); });

    expect(mocks.inlineSvgImages).toHaveBeenCalledTimes(1);
    expect(mocks.downloadText).toHaveBeenCalledWith(
      await mocks.inlineSvgImages.mock.results[0]!.value,
      "我的毕业去向图.svg",
      "image/svg+xml;charset=utf-8",
    );
    expect(mocks.inlineSvgImages.mock.invocationCallOrder[0]!)
      .toBeLessThan(mocks.downloadText.mock.invocationCallOrder[0]!);
    expect(result().exportState).toBe("success");
    expect(statusMessages.at(-1)).toBe("SVG 已导出");
  });

  it("keeps SVG export synchronous when the poster has no external image to fetch", async () => {
    mocks.hasExternalSvgImages.mockReturnValueOnce(false);
    const result = await mountExport(projectWithCanvas(1200, 800));

    await act(async () => {
      const pending = result().exportSvg();
      // 没有校徽的海报不该因为内联能力而多等一个事件循环：错误/成功状态仍在点击这一拍就绪。
      expect(mocks.downloadText).toHaveBeenCalledTimes(1);
      await pending;
    });

    expect(mocks.inlineSvgImages).not.toHaveBeenCalled();
    expect(mocks.downloadText).toHaveBeenCalledWith(expect.stringContaining("<svg"), "我的毕业去向图.svg", "image/svg+xml;charset=utf-8");
    expect(result().exportState).toBe("success");
  });
});

describe("usePosterExport 导出体积", () => {
  it("measures the workspace when the export dialog opens", async () => {
    const result = await mountExport(projectWithCanvas(1200, 800), vi.fn(), [{
      id: "asset-1",
      label: "贴图",
      src: `data:image/png;base64,${"A".repeat(2 * 1024 * 1024)}`,
      kind: "decoration",
      provinceIds: [],
      source: "user",
    }]);

    expect(result().projectExportSizeEstimate).toBeNull();

    await act(async () => { result().openProjectExportDialog(); });

    const estimate = result().projectExportSizeEstimate!;
    expect(estimate.limitBytes).toBe(MAX_PROJECT_PACKAGE_BYTES);
    expect(estimate.resourceBytes).toBeGreaterThan(2 * 1024 * 1024);
    expect(exportSizeBytes(estimate, false)).toBeLessThan(1024 * 1024);
  });

  it("leaves the undo stack out of the estimate the way the exporter does", async () => {
    const base = projectWithCanvas(1200, 800);
    const entry = (id: string): ProjectHistoryEntry => ({ id, label: "编辑", source: "manual", snapshot: base });
    const bulky: ProjectDocument = {
      ...base,
      history: { past: [entry("past-1"), entry("past-2")], future: [entry("future-1")] },
    };

    const clean = await mountExport(base);
    const stacked = await mountExport(bulky);
    await act(async () => {
      clean().openProjectExportDialog();
      stacked().openProjectExportDialog();
    });

    // 撤销栈在 createProjectPackage 里被剥掉，算进来会让没超限的工程被误警。
    expect(stacked().projectExportSizeEstimate!.baseBytes).toBe(clean().projectExportSizeEstimate!.baseBytes);
  });

  it("tells the user an over-budget export can never be imported back", async () => {
    const result = await mountExport(projectWithCanvas(1200, 800), vi.fn(), [oversizedAsset()]);

    await act(async () => { result().openProjectExportDialog(); });
    await act(async () => { result().exportProjectPackage(); });

    expect(result().exportState).toBe("success");
    expect(statusMessages.at(-1)).toContain("完整工程包已导出");
    expect(statusMessages.at(-1)).toContain("超过导入上限 24.0 MB");
    expect(statusMessages.at(-1)).toContain("取消勾选「包含资源包」");
  });

  it("says nothing about size once the resources are left out", async () => {
    const result = await mountExport(projectWithCanvas(1200, 800), vi.fn(), [oversizedAsset()]);

    await act(async () => { result().openProjectExportDialog(); });
    await act(async () => { result().setIncludeResourcesInProjectExport(false); });
    await act(async () => { result().exportProjectPackage(); });

    expect(statusMessages.at(-1)).toBe("工程已导出（未包含资源包）：0 条名单、0 个模板");
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

/** 同一份字体字节挂在两个 id 上：解析时会被合并成一份，从而带出 `pack.warnings`。 */
function packageFileWithStrippedFonts(name = "带剥离的工程.json"): File {
  const font = {
    id: "font-1",
    label: "手写体",
    family: "font-1",
    src: "data:font/ttf;base64,AA==",
    format: "truetype" as const,
    source: "user" as const,
  };
  const pack = createProjectPackage({
    project: createProjectDocument({ students: [], templateId: "original", dataView: "province" }),
    assets: [],
    fonts: [font, { ...font, id: "font-2", label: "手写体副本", family: "font-2" }],
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
    // 没有剥离时不该凭空多出一句说明。
    expect(statusMessages.at(-1)).not.toContain("已剥离");
  });

  it("在确认之前就报出解析期被剥离的内容", async () => {
    const applyImportedPackage = vi.fn();
    const result = await mountExport(projectWithCanvas(1200, 800), applyImportedPackage);

    await act(async () => { result().importProjectPackage(packageFileWithStrippedFonts()); });
    await flushReader();

    expect(applyImportedPackage).not.toHaveBeenCalled();
    expect(result().projectImportConfirmation?.warnings).toEqual([expect.stringContaining("字体与包内其他字体内容相同")]);
    expect(statusMessages.at(-1)).toContain("工程包「带剥离的工程.json」解析完成");
    expect(statusMessages.at(-1)).toContain("已剥离超限内容：");
    expect(statusMessages.at(-1)).toContain("字体与包内其他字体内容相同");
  });

  it("确认后落地的工程包不带 warnings，成功文案带上剥离说明", async () => {
    const applyImportedPackage = vi.fn();
    const result = await mountExport(projectWithCanvas(1200, 800), applyImportedPackage);

    await act(async () => { result().importProjectPackage(packageFileWithStrippedFonts()); });
    await flushReader();
    await act(async () => { result().confirmProjectImport(); });

    const applied = applyImportedPackage.mock.calls[0]![0] as ProjectPackage;
    // warnings 只描述这一次解析，进了工作区就会被后续导出/镜像原样带走。
    expect("warnings" in applied).toBe(false);
    expect(applied.fonts).toHaveLength(1);
    expect(statusMessages.at(-1)).toContain("完整工程包已导入：0 条名单、0 个素材、1 个字体、0 个模板");
    expect(statusMessages.at(-1)).toContain("已剥离超限内容：");
    expect(statusMessages.at(-1)).toContain("字体与包内其他字体内容相同");
  });

  it("确认框里没有剥离说明时 warnings 是空数组", async () => {
    const result = await mountExport(projectWithCanvas(1200, 800));

    await act(async () => { result().importProjectPackage(packageFile([])); });
    await flushReader();

    expect(result().projectImportConfirmation?.warnings).toEqual([]);
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
