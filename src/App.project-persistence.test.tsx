// 从 src/App.test.tsx 原样搬出：工程持久化与导入导出：草稿权威、镜像覆盖、工程包往返。
// 共享挂载/交互装置见 src/app-test-harness.tsx。
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { createProjectDocument, serializeProjectDocument } from "./lib/project-document";
import { sampleStudents } from "./lib/project-data";
import { createProjectPackage } from "./lib/project-package";
import { installAppTestHarness, renderApp, saveWorkspaceMirror, click, openPeopleData, changeInput, changeSelect } from "./app-test-harness";

installAppTestHarness();

describe("App student editing", () => {
  it("keeps a browser draft authoritative when a server workspace also exists", async () => {
    const localProject = createProjectDocument({
      students: [{ ...sampleStudents[0], name: "浏览器草稿" }],
      templateId: "original",
      dataView: "province",
    });
    saveWorkspaceMirror(localProject);
    const request = vi.spyOn(globalThis, "fetch");

    const container = renderApp(false);
    await Promise.resolve();

    expect(container.textContent).toContain("浏览器草稿");
    expect(request).not.toHaveBeenCalledWith("/api/workspace", expect.anything());
    request.mockRestore();
  });

  it("never lets a server workspace overwrite the local browser workspace on startup", async () => {
    const legacyProject = createProjectDocument({
      students: [{ ...sampleStudents[0], name: "旧版原始草稿" }],
      templateId: "original",
      dataView: "province",
    });
    const serverProject = createProjectDocument({
      students: [{ ...sampleStudents[0], name: "服务器持久数据" }],
      templateId: "original",
      dataView: "province",
    });
    const serverPackage = createProjectPackage({
      project: serverProject,
      assets: [],
      fonts: [],
      customTemplates: [],
      renderSettings: { mode: "normal", fixedFps: 20 },
      now: new Date("2026-07-27T15:00:00.000Z"),
    });
    window.localStorage.setItem("cengfan-map-studio:draft", serializeProjectDocument(legacyProject));
    window.localStorage.setItem("cengfan-map-studio:workspace-mirror", JSON.stringify(createProjectPackage({
      project: legacyProject,
      assets: [],
      fonts: [],
      customTemplates: [],
      renderSettings: { mode: "normal", fixedFps: 20 },
      now: new Date("2026-07-27T16:00:00.000Z"),
    })));
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      kind: "cengfan-workspace",
      version: 1,
      projectPackage: serverPackage,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const container = renderApp(false);
    await Promise.resolve();

    expect(container.textContent).toContain("旧版原始草稿");
    expect(container.textContent).not.toContain("服务器持久数据");
    expect(request).not.toHaveBeenCalledWith("/api/workspace", expect.anything());
    request.mockRestore();
  });

  it("immediately overwrites the compatibility draft and complete local mirror", () => {
    const container = renderApp();
    window.localStorage.setItem("cengfan-map-studio:draft", "stale-local-data");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="强制保存到浏览器本地"]')!);

    const saved = window.localStorage.getItem("cengfan-map-studio:draft");
    expect(saved).toContain("林舟");
    expect(saved).not.toContain("stale-local-data");
    const mirror = window.localStorage.getItem("cengfan-map-studio:workspace-mirror");
    expect(mirror).toContain("林舟");
    expect(mirror).toContain("renderSettings");
  });

  it("asks whether to include the resource pack before exporting a project", () => {
    const container = renderApp();

    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("导出工程"))!);

    const dialog = container.querySelector<HTMLElement>('[role="dialog"][aria-label="导出工程确认"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("包含资源包");
    expect(dialog?.textContent).toContain("地图背景、地图贴图、素材和字体");
    expect(dialog?.querySelector<HTMLInputElement>('input[aria-label="导出时包含资源包"]')?.checked).toBe(true);
    expect(dialog?.querySelector<HTMLButtonElement>('button[aria-label="确认导出工程"]')).not.toBeNull();
  });

  it("immediately applies imported backgrounds, province textures and resource catalog", () => {
    const importedProject = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
    importedProject.canvas = {
      ...importedProject.canvas,
      backgroundImageSrc: "data:image/png;base64,QkFDS0dST1VORA==",
    };
    importedProject.map = {
      ...importedProject.map,
      provinceStyles: {
        ...importedProject.map.provinceStyles,
        北京市: {
          appearance: {
            kind: "texture",
            assetId: "imported-texture",
            src: "data:image/png;base64,VEVYVFVSRS==",
            fit: "contain",
          },
        },
      },
    };
    const pack = createProjectPackage({
      project: importedProject,
      assets: [{
        id: "imported-texture",
        label: "导入的北京贴图",
        kind: "province-texture",
        src: "data:image/png;base64,VEVYVFVSRS==",
        provinceIds: ["北京市"],
        source: "user",
      }],
      fonts: [],
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    class ImmediateFileReader {
      result: string | ArrayBuffer | null = null;
      onload: null | (() => void) = null;
      readAsText() {
        this.result = JSON.stringify(pack);
        this.onload?.();
      }
    }
    vi.stubGlobal("FileReader", ImmediateFileReader);
    const container = renderApp();
    const input = container.querySelector<HTMLInputElement>('input[aria-label="导入完整工程包"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["package"], "project.json", { type: "application/json" })] });

    flushSync(() => input.dispatchEvent(new Event("change", { bubbles: true })));

    expect(container.querySelector('[data-background-image]')?.getAttribute("href")).toBe("data:image/png;base64,QkFDS0dST1VORA==");
    expect(container.querySelector('[data-province-texture]')?.getAttribute("href")).toBe("data:image/png;base64,VEVYVFVSRS==");
    click(container.querySelector<HTMLButtonElement>('.topbar .workflow-stepper button[aria-label="素材"]')!);
    expect(container.textContent).toContain("导入的北京贴图");
  }, 30_000);

  it("allows changing a legacy imported card font after its family reference is repaired", () => {
    const importedProject = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
    importedProject.cards.fieldFonts = { name: "LegacyImportHand" };
    const pack = createProjectPackage({
      project: importedProject,
      assets: [],
      fonts: [{
        id: "font-user-imported",
        label: "旧工程手写体",
        family: "LegacyImportHand",
        src: "data:font/ttf;base64,TEVHQUNZ",
        format: "truetype",
        source: "user",
      }],
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    class ImmediateFileReader {
      result: string | ArrayBuffer | null = null;
      onload: null | (() => void) = null;
      readAsText() {
        this.result = JSON.stringify(pack);
        this.onload?.();
      }
    }
    vi.stubGlobal("FileReader", ImmediateFileReader);
    const container = renderApp();
    const input = container.querySelector<HTMLInputElement>('input[aria-label="导入完整工程包"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["package"], "legacy-project.json", { type: "application/json" })] });

    flushSync(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    click(container.querySelector<SVGGElement>("[data-cards-layer]")!);
    changeSelect(container.querySelector<HTMLSelectElement>("#cards-font-name")!, "font-system-kaiti");

    const card = container.querySelector("[data-destination-card]")!;
    expect(Array.from(card.querySelectorAll("[data-card-row-line] tspan"))
      .some((fragment) => fragment.textContent?.trim() && (fragment.getAttribute("font-family") ?? "").includes("KaiTi")))
      .toBe(true);
  }, 30_000);

  it("does not overwrite browser storage when the page is hidden", () => {
    const container = renderApp();
    openPeopleData(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="编辑 林舟"]')!);
    changeInput(container.querySelector<HTMLInputElement>('input[aria-label="编辑学生名称"]')!, "刷新前林舟");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="保存 林舟"]')!);

    window.dispatchEvent(new Event("pagehide"));

    expect(window.localStorage.getItem("cengfan-map-studio:draft")).toBeNull();
  });
});
