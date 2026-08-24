// Split from src/App.test.tsx: project package import and the material/asset
// panel (backgrounds, province textures, SVG canvas assets, legacy fonts).
// Helpers: src/test-utils/app-harness.tsx.
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "./lib/project-document";
import { sampleStudents } from "./lib/project-data";
import { createProjectPackage } from "./lib/project-package";
import {
  changeSelect,
  click,
  installAppTestHarness,
  renderApp,
} from "./test-utils/app-harness";

installAppTestHarness();

describe("App project import and material assets", () => {
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
    const input = container.querySelector<HTMLInputElement>('input[aria-label="导入工程"]')!;
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
    const input = container.querySelector<HTMLInputElement>('input[aria-label="导入工程"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["package"], "legacy-project.json", { type: "application/json" })] });

    flushSync(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    click(container.querySelector<SVGGElement>("[data-cards-layer]")!);
    changeSelect(container.querySelector<HTMLSelectElement>("#cards-font-name")!, "font-system-kaiti");

    const card = container.querySelector("[data-destination-card]")!;
    expect(Array.from(card.querySelectorAll("[data-card-row-line] tspan"))
      .some((fragment) => fragment.textContent?.trim() && (fragment.getAttribute("font-family") ?? "").includes("KaiTi")))
      .toBe(true);
  }, 30_000);

  it("applies valid material panel actions without offering built-in landmarks or decorations", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('.topbar .workflow-stepper button[aria-label="素材"]')!);

    const background = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("设为背景"))!;
    click(background);
    expect(container.querySelector("[data-background-image]")).not.toBeNull();

    expect(container.textContent).not.toContain("添加地标");
    expect(container.textContent).not.toContain("添加装饰");
  }, 30_000);

  it("imports an SVG as a selected, resizable canvas element", () => {
    const originalFileReader = globalThis.FileReader;
    class ImmediateFileReader {
      result = "data:image/svg+xml;base64,PHN2Zy8+";
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() { this.onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>); }
    }
    vi.stubGlobal("FileReader", ImmediateFileReader);
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('.topbar .workflow-stepper button[aria-label="素材"]')!);

    const input = container.querySelector<HTMLInputElement>("#asset-svg-canvas-upload")!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["<svg />"], "校徽.svg", { type: "image/svg+xml" })],
    });
    flushSync(() => input.dispatchEvent(new Event("change", { bubbles: true })));

    const image = Array.from(container.querySelectorAll<SVGImageElement>("[data-asset-id]"))
      .find((element) => element.getAttribute("href") === "data:image/svg+xml;base64,PHN2Zy8+");
    expect(image).not.toBeUndefined();
    expect(container.querySelector("[data-resize-handles]")).not.toBeNull();
    expect(container.textContent).toContain("已导入画布：校徽");
    vi.stubGlobal("FileReader", originalFileReader);
  });

  it("keeps the province texture library available after removing landmark presets", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('.topbar .workflow-stepper button[aria-label="素材"]')!);
    expect(container.textContent).toContain("省份外观");
    expect(container.querySelector("#asset-province")).not.toBeNull();
    expect(container.textContent).not.toContain("地标和装饰");
  });
});
