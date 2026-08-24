// Split from src/App.test.tsx: final-export stage behavior (export entry,
// failure recovery, project-package confirmation). Helpers: src/test-utils/app-harness.tsx.
import { describe, expect, it, vi } from "vitest";
import {
  changeSelect,
  click,
  installAppTestHarness,
  renderApp,
  renderPublicApp,
} from "./test-utils/app-harness";

installAppTestHarness();

describe("App final export stage", () => {
  it("opens the full-screen final export workspace from the workflow stage", () => {
    const container = renderPublicApp();

    click(container.querySelector<HTMLButtonElement>('.workflow-stage-stepper button[aria-label="最终导出"]')!);

    expect(container.querySelector('main[aria-label="最终导出"]')).not.toBeNull();
    expect(container.querySelector('select[aria-label="PNG 导出倍率"]')).not.toBeNull();
  });

  it("keeps the export stage and current configuration when SVG export fails", () => {
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      throw new Error("下载不可用");
    });
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('.workflow-stage-stepper button[aria-label="最终导出"]')!);
    const scale = container.querySelector<HTMLSelectElement>('select[aria-label="PNG 导出倍率"]')!;
    changeSelect(scale, "3");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="导出 SVG"]')!);

    expect(container.querySelector('main[aria-label="最终导出"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("下载不可用");
    expect(scale.value).toBe("3");
    expect(container.querySelector('button[aria-label="重试导出"]')).not.toBeNull();
  });

  it("keeps the export stage and current configuration when PNG export fails", async () => {
    const originalCreateElement = document.createElement.bind(document);
    class ReadyImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("Image", ReadyImage);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName !== "canvas") return originalCreateElement(tagName);
      return {
        width: 0,
        height: 0,
        getContext: () => ({ fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() }),
        toDataURL: () => { throw new Error("PNG 下载不可用"); },
      } as unknown as HTMLCanvasElement;
    });
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('.workflow-stage-stepper button[aria-label="最终导出"]')!);
    const scale = container.querySelector<HTMLSelectElement>('select[aria-label="PNG 导出倍率"]')!;
    changeSelect(scale, "3");
    click(Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "PNG")!);

    await vi.waitFor(() => {
      expect(container.querySelector('[role="alert"]')?.textContent).toContain("PNG 下载不可用");
    });
    expect(container.querySelector('main[aria-label="最终导出"]')).not.toBeNull();
    expect(scale.value).toBe("3");
    expect(container.querySelector('button[aria-label="重试导出"]')).not.toBeNull();
  });

  it("keeps the export stage and current configuration when project package export fails", () => {
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      throw new Error("工程包下载不可用");
    });
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('.workflow-stage-stepper button[aria-label="最终导出"]')!);
    const scale = container.querySelector<HTMLSelectElement>('select[aria-label="PNG 导出倍率"]')!;
    changeSelect(scale, "3");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="导出工程包"]')!);

    expect(container.querySelector('main[aria-label="最终导出"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("工程包下载不可用");
    expect(scale.value).toBe("3");
    expect(container.querySelector('button[aria-label="重试导出"]')).not.toBeNull();
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
});
