// Split from src/App.test.tsx: full-screen global settings sections,
// typography/font application, inspector controls, undo/redo history.
// Helpers: src/test-utils/app-harness.tsx.
import { describe, expect, it } from "vitest";
import { createProjectDocument } from "./lib/project-document";
import { sampleStudents } from "./lib/project-data";
import { createProjectPackage } from "./lib/project-package";
import {
  changeSelect,
  click,
  closeGlobalSettings,
  installAppTestHarness,
  openGlobalSettingsSection,
  openRailAdvancedTab,
  renderApp,
  renderLegacyApp,
} from "./test-utils/app-harness";

installAppTestHarness();

describe("App global settings screens", () => {
  it("opens global settings as a standalone fullscreen screen and returns to the editor", () => {
    const container = renderLegacyApp();

    expect(container.querySelector(".topbar")).not.toBeNull();
    expect(container.querySelector(".workspace")).not.toBeNull();

    openRailAdvancedTab(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);

    expect(container.querySelector('main[aria-label="全局设置"]')).not.toBeNull();
    expect(container.querySelector(".topbar")).not.toBeNull();
    expect(container.querySelectorAll(".workflow-stage-stepper button")).toHaveLength(5);
    expect(container.querySelector(".workspace")).toBeNull();
    expect(container.querySelector(".sidebar")).toBeNull();
    expect(container.querySelector(".inspector")).toBeNull();

    closeGlobalSettings(container);

    expect(container.querySelector('main[aria-label="全局设置"]')).toBeNull();
    expect(container.querySelector(".topbar")).not.toBeNull();
    expect(container.querySelector(".workspace")).not.toBeNull();
    expect(container.querySelector("#canvas-width")).toBeNull();
  });

  it("edits every global settings section through the current project history", () => {
    const container = renderApp();
    openRailAdvancedTab(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);

    const settings = container.querySelector<HTMLElement>('main[aria-label="全局设置"]')!;
    expect(Array.from(settings.querySelectorAll('[role="tab"] strong')).map((label) => label.textContent?.trim())).toEqual([
      "画布设置",
      "地图展示框",
      "数据板块",
      "辅助板块",
      "字体排版",
      "高级设置",
    ]);

    expect(settings.querySelector<HTMLInputElement>("#canvas-width")?.value).toBe("1500");
    click(settings.querySelector<HTMLInputElement>("#canvas-background-opacity")!);
    click(settings.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-map"]')!);
    click(settings.querySelector<HTMLInputElement>("#map-collapse-south-sea")!);
    const undo = container.querySelector<HTMLButtonElement>('.global-settings-history button:first-child')!;
    expect(undo.disabled).toBe(false);
    click(undo);
    expect(container.querySelector<HTMLInputElement>("#map-collapse-south-sea")?.checked).toBe(false);

    expect(settings.querySelector("#map-width")).toBeNull();

    click(settings.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-cards"]')!);
    expect(settings.textContent).toContain("学生数据中心");
    expect(settings.querySelector(".student-table")).not.toBeNull();
    expect(settings.querySelector("#cards-layout-mode")).toBeNull();
    click(settings.querySelector<HTMLButtonElement>('button[aria-label="数据展示设置"]')!);
    expect(settings.querySelector("#cards-layout-mode")).not.toBeNull();
    expect(settings.querySelector("#cards-x")).toBeNull();
    expect(settings.querySelector<HTMLButtonElement>('button[aria-label="一键智能排版"]')).toBeNull();
    expect(settings.querySelector<HTMLButtonElement>('button[aria-label="刷新展示框位置"]')).toBeNull();

    click(settings.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-guests"]')!);
    expect(settings.querySelector("#guests-width")).toBeNull();
    expect(settings.querySelector(".guest-people-editor")).toBeNull();

    click(settings.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-typography"]')!);
    expect(settings.querySelector("#typography-province-font")).not.toBeNull();
    expect(settings.querySelector("#typography-roster-font")).not.toBeNull();
  });

  it("groups global settings sections into global design and other settings", () => {
    const container = renderApp();
    openRailAdvancedTab(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);

    const settings = container.querySelector<HTMLElement>('main[aria-label="全局设置"]')!;
    const nav = settings.querySelector(".global-settings-nav")!;
    const groupHeadings = Array.from(nav.querySelectorAll(".global-settings-group-label"))
      .map((el) => el.textContent?.trim());
    expect(groupHeadings).toEqual(["全局设计", "其他设置"]);

    // 6 个 tab 仍是同一 tablist，顺序不变
    const tabs = Array.from(settings.querySelectorAll('[role="tab"]'));
    expect(tabs.map((tab) => tab.getAttribute("aria-controls"))).toEqual([
      "global-settings-canvas",
      "global-settings-map",
      "global-settings-cards",
      "global-settings-guests",
      "global-settings-typography",
      "global-settings-advanced",
    ]);

    // 流程核心分区归入全局设计组，辅助板块/字体排版归入其他设置组
    const groupOf = (controls: string) => tabs
      .find((tab) => tab.getAttribute("aria-controls") === controls)!
      .closest(".global-settings-group")
      ?.querySelector(".global-settings-group-label")?.textContent;
    expect(groupOf("global-settings-canvas")).toContain("全局设计");
    expect(groupOf("global-settings-cards")).toContain("全局设计");
    expect(groupOf("global-settings-guests")).toContain("其他设置");
    expect(groupOf("global-settings-typography")).toContain("其他设置");
    expect(groupOf("global-settings-advanced")).toContain("其他设置");
  });

  it("moves card expressions and name formats into global advanced settings", () => {
    const container = renderApp();
    openRailAdvancedTab(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);

    const settings = container.querySelector<HTMLElement>('main[aria-label="全局设置"]')!;
    const advancedTab = settings.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-advanced"]')!;
    expect(advancedTab).not.toBeNull();
    click(advancedTab);

    expect(settings.querySelector("#cards-expression-row")).not.toBeNull();
    expect(settings.querySelector("#cards-name-format-custom")).not.toBeNull();
    expect(settings.querySelector(".cards-name-format__presets button")?.textContent).toBe("完整姓名");
    expect(Array.from(settings.querySelectorAll(".cards-name-format__presets button")).map((button) => button.textContent)).toContain("Wxm（首字母）");

    closeGlobalSettings(container);
    expect(container.querySelector(".inspector .cards-expressions")).toBeNull();
    expect(container.querySelector(".inspector .cards-name-format")).toBeNull();
  });

  it("keeps full map, data-frame and guest controls in the right inspector", () => {
    const container = renderApp();

    click(container.querySelector<SVGGElement>("[data-map-selection-overlay]")!);
    expect(container.querySelector("#map-x")).not.toBeNull();
    expect(container.querySelector("#map-width")).not.toBeNull();
    expect(container.querySelector("#map-land-color")).not.toBeNull();

    click(container.querySelector<SVGGElement>("[data-cards-layer]")!);
    expect(container.querySelector("#cards-x")).not.toBeNull();
    expect(container.querySelector("#cards-maxWidth")).not.toBeNull();
    expect(container.querySelector("#cards-layout-mode")).not.toBeNull();
    expect(container.querySelector('button[aria-label="一键智能排版"]')).toBeNull();
    expect(container.querySelector('button[aria-label="刷新展示框位置"]')).toBeNull();

    click(container.querySelector<SVGGElement>('[aria-label="特邀嘉宾"]')!);
    expect(container.querySelector("#guests-x")).not.toBeNull();
    expect(container.querySelector("#guests-width")).not.toBeNull();
    expect(container.querySelector("#guests-background")).not.toBeNull();
    expect(container.querySelector(".guest-people-editor")).not.toBeNull();
  });

  it("opens global typography settings and applies one province font to the live map", () => {
    const container = renderApp();
    openRailAdvancedTab(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);
    click(container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-typography"]')!);

    expect(container.textContent).toContain("字体工具");
    changeSelect(container.querySelector<HTMLSelectElement>("#typography-province")!, "陕西省");
    changeSelect(container.querySelector<HTMLSelectElement>("#typography-province-font")!, "font-system-kaiti");
    closeGlobalSettings(container);

    const shaanxi = Array.from(container.querySelectorAll("[data-province-label]"))
      .find((label) => label.textContent?.startsWith("陕西"));
    expect(shaanxi?.getAttribute("font-family")).toContain("KaiTi");
  });

  it("applies a data-card font selection from the inspector to the live card rows", () => {
    const container = renderApp();
    click(container.querySelector<SVGGElement>("[data-cards-layer]")!);

    changeSelect(container.querySelector<HTMLSelectElement>("#cards-font-name")!, "font-system-kaiti");

    const card = container.querySelector("[data-destination-card]")!;
    expect(Array.from(card.querySelectorAll("[data-card-row-line] tspan"))
      .some((fragment) => fragment.textContent?.trim() && (fragment.getAttribute("font-family") ?? "").includes("KaiTi")))
      .toBe(true);
  });

  it("applies an uploaded font selected in global typography settings to the live canvas", () => {
    const project = createProjectDocument({
      students: sampleStudents,
      templateId: "original",
      dataView: "province",
    });
    const font = {
      id: "font-user-canvas-hand",
      label: "画布手写体",
      family: "CanvasHand",
      src: "data:font/ttf;base64,AA==",
      format: "truetype" as const,
      source: "user" as const,
    };
    window.localStorage.setItem("cengfan-map-studio:workspace-mirror", JSON.stringify(createProjectPackage({
      project,
      assets: [],
      fonts: [font],
    })));

    const container = renderApp(false);
    openRailAdvancedTab(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);
    click(container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-typography"]')!);
    changeSelect(container.querySelector<HTMLSelectElement>("#typography-canvas-font")!, font.id);
    closeGlobalSettings(container);

    expect(container.querySelector('[data-text-id="text-eyebrow"] text')?.getAttribute("font-family")).toBe('"CanvasHand"');
  });

  it("supports undo redo canvas size grid and inspector editing", () => {
    const container = renderApp();
    const undo = container.querySelector<HTMLButtonElement>('button[aria-label="暂无可撤销操作"]')
      ?? container.querySelector<HTMLButtonElement>('.topbar-actions button[title^="撤销"]')!;
    const redo = container.querySelector<HTMLButtonElement>('button[aria-label="暂无可重做操作"]')
      ?? container.querySelector<HTMLButtonElement>('.topbar-actions button[title^="重做"]')!;
    expect(undo.disabled).toBe(true);
    expect(redo.disabled).toBe(true);

    openGlobalSettingsSection(container, "cards");
    click(container.querySelector<HTMLInputElement>("#cards-compact-layout")!);
    const settingsUndo = container.querySelector<HTMLButtonElement>(".global-settings-history button:first-child")!;
    const settingsRedo = container.querySelector<HTMLButtonElement>(".global-settings-history button:nth-child(2)")!;
    expect(settingsUndo.disabled).toBe(false);

    click(settingsUndo);
    expect(container.querySelector<HTMLInputElement>("#cards-compact-layout")?.checked).toBe(false);
    expect(settingsRedo.disabled).toBe(false);
    click(settingsRedo);
    expect(container.querySelector<HTMLInputElement>("#cards-compact-layout")?.checked).toBe(true);
    closeGlobalSettings(container);

    openRailAdvancedTab(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);
    changeSelect(container.querySelector<HTMLSelectElement>("#canvas-size-preset")!, "square-1080");
    closeGlobalSettings(container);
    const svg = container.querySelector("svg.poster")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 1080 1080");
  }, 40_000);

  it("applies persisted preview frame modes to canvas drag rendering", () => {
    window.localStorage.setItem("cengfan-map-studio:render-settings", JSON.stringify({ mode: "low", fixedFps: 24 }));
    const container = renderApp(false);
    const poster = container.querySelector<SVGSVGElement>("svg.poster")!;

    expect(poster.getAttribute("data-render-interval-ms")).toBe("100");

    expect(container.querySelector("#editor-render-mode")).toBeNull();
    expect(container.querySelector("#editor-grid-size")).toBeNull();
    expect(poster.getAttribute("data-render-interval-ms")).toBe("100");
  });
});
