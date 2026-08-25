// 从 src/App.test.tsx 原样搬出：数据导入与画布呈现：素材、区块样式、展示框定位。
// 共享挂载/交互装置见 src/app-test-harness.tsx。
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { createProjectDocument, serializeProjectDocument } from "./lib/project-document";
import { sampleStudents } from "./lib/project-data";
import { WORKSPACE_SESSION_STORAGE_KEY } from "./lib/workspace-session";
import { installAppTestHarness, renderApp, renderPublicApp, saveWorkspaceMirror, click, openGlobalSettingsSection, openPeopleData, workflowStage, leaveFocusedWorkspace, closeGlobalSettings, changeInput, changeSelect } from "./app-test-harness";

installAppTestHarness();

describe("App student editing", () => {
  it("applies an edited city to the map destination card", () => {
    const container = renderApp();
    openPeopleData(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="编辑 林舟"]')!);
    changeInput(container.querySelector<HTMLInputElement>('input[aria-label="编辑城市"]')!, "杭州市");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="保存 林舟"]')!);
    leaveFocusedWorkspace(container);

    const cards = Array.from(container.querySelectorAll('[data-destination-card]'));
    const card = cards.find((candidate) => candidate.textContent?.includes("林舟"));
    expect(card).not.toBeUndefined();
    expect(card?.getAttribute("data-destination-card")).toBe("浙江省");
  });

  it("links a selected spreadsheet row to its live map marker", () => {
    const container = renderApp();
    openPeopleData(container);

    click(container.querySelector('[data-student-row="student-1"]')!);
    leaveFocusedWorkspace(container);

    expect(container.querySelector('[data-student-pin="student-1"]')).not.toBeNull();
    expect(container.querySelector('[data-student-pin="student-1"]')?.getAttribute("data-selected")).toBe("true");
  });

  it("applies pasted text import to the project and poster", () => {
    const container = renderApp();
    openPeopleData(container);
    changeInput(container.querySelector("textarea")!, "苏禾 浙江大学 杭州\n顾言 复旦大学 上海");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("识别文本"))!);
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("追加导入"))!);

    expect(container.textContent).toContain("苏禾");
    expect(container.textContent).toContain("顾言");
    leaveFocusedWorkspace(container);
    const cards = Array.from(container.querySelectorAll('[data-destination-card]')).map((card) => card.textContent);
    expect(cards.some((text) => text?.includes("苏禾"))).toBe(true);
  });

  it("replaces the project dataset with confirmed import candidates", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const container = renderApp();
    openPeopleData(container);
    changeInput(container.querySelector("textarea")!, "新同学 北京大学 北京");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("识别文本"))!);
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("替换全部"))!);

    expect(container.querySelectorAll('[data-student-row]')).toHaveLength(1);
    expect(container.querySelector('[data-student-row]')?.textContent).toContain("新同学");
    leaveFocusedWorkspace(container);
    expect(container.querySelector('[data-destination-card]')?.textContent).toContain("新同学");
  });


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

  it("writes manual visual controls to the canonical scene", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "cards");
    const compact = container.querySelector<HTMLInputElement>("#cards-compact-layout");
    expect(compact).not.toBeUndefined();

    click(compact!);

    expect(compact?.checked).toBe(true);
  });

  it("exposes the map-overlap switch in the primary block-style workflow", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "cards");

    const toggle = container.querySelector<HTMLInputElement>("#cards-allow-map-overlap");
    expect(toggle).not.toBeNull();
    expect(toggle?.checked).toBe(false);
    click(toggle!);
    expect(toggle?.checked).toBe(true);
  });

  it("reads visual controls from canonical scene state", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, preset: "standard", compactLayout: true };
    project.map = { ...project.map, scale: 1.2 };
    project.canvas = { ...project.canvas, backgroundColor: "#123456" };
    project.style = {
      ...project.style,
      cardPreset: "standard",
      mapScale: 1,
      backgroundColor: "#f7f4ea",
    };
    saveWorkspaceMirror(project);
    const container = renderApp(false);
    openGlobalSettingsSection(container, "cards");

    expect(container.querySelector<HTMLSelectElement>("#cards-template")?.value).toBe("standard");
    expect(container.querySelector<HTMLInputElement>("#cards-compact-layout")?.checked).toBe(true);
    expect(container.querySelector<HTMLInputElement>("#cards-background")?.value).toBe(project.cards.background);
  });

  it("applies connector formatting from the block style panel to the live poster", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "cards");

    changeSelect(container.querySelector<HTMLSelectElement>("#cards-connector-style")!, "straight");
    changeSelect(container.querySelector<HTMLSelectElement>("#cards-connector-dash")!, "solid");
    closeGlobalSettings(container);
    const connector = container.querySelector<SVGPathElement>("[data-destination-connector]")!;
    expect(connector.getAttribute("data-connector-style")).toBe("straight");
    expect(connector.getAttribute("stroke-dasharray")).toBeNull();
  });

  it("preserves every block style patch dispatched in the same interaction batch", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "cards");
    const style = container.querySelector<HTMLSelectElement>("#cards-connector-style")!;
    const dash = container.querySelector<HTMLSelectElement>("#cards-connector-dash")!;

    flushSync(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(style, "straight");
      style.dispatchEvent(new Event("change", { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(dash, "solid");
      dash.dispatchEvent(new Event("change", { bubbles: true }));
    });

    closeGlobalSettings(container);
    const connector = container.querySelector<SVGPathElement>("[data-destination-connector]")!;
    expect(connector.getAttribute("data-connector-style")).toBe("straight");
    expect(connector.getAttribute("stroke-dasharray")).toBeNull();
  });

  it("uses block grouping as the canonical grouping rendered on the poster", () => {
    const project = createProjectDocument({
      students: [
        { id: "same-city-a", name: "甲", university: "北京大学", city: "北京市", visibility: true },
        { id: "same-city-b", name: "乙", university: "清华大学", city: "北京市", visibility: true },
        { id: "hangzhou", name: "丙", university: "浙江大学", city: "杭州市", visibility: true },
      ],
      templateId: "original",
      dataView: "city",
    });
    project.cards = { ...project.cards, grouping: "province" };
    saveWorkspaceMirror(project);
    const container = renderApp(false);
    openGlobalSettingsSection(container, "cards");

    changeSelect(container.querySelector<HTMLSelectElement>("#cards-grouping")!, "city");
    closeGlobalSettings(container);

    expect(container.querySelectorAll("[data-destination-card]")).toHaveLength(2);
  });

  it("keeps display-frame card positions stable after a map update until explicitly refreshed", () => {
    const project = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, positions: { 北京市: { x: 1110, y: 700 } } };
    window.localStorage.setItem("cengfan-map-studio:draft", serializeProjectDocument(project));
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({ stage: "map", savedAt: "2026-08-04T00:00:00.000Z" }));
    const container = renderPublicApp({ clearStorage: false });
    const initialTransform = container.querySelector('[data-destination-card="北京市"]')?.getAttribute("transform");

    changeInput(container.querySelector<HTMLInputElement>("#map-x")!, "900");
    container.querySelector<HTMLInputElement>("#map-x")?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));

    expect(container.querySelector('[data-destination-card="北京市"]')?.getAttribute("transform")).toBe(initialTransform);
    click(workflowStage(container, "版式"));
    expect(container.querySelector('button[aria-label="刷新展示框位置"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="一键智能排版"]')).toBeNull();
  });

  it("freezes automatic display-frame positions during a map edit and keeps them when refresh is cancelled", () => {
    const project = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
    window.localStorage.setItem("cengfan-map-studio:draft", serializeProjectDocument(project));
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({ stage: "map", savedAt: "2026-08-04T00:00:00.000Z" }));
    const container = renderPublicApp({ clearStorage: false });
    const initialTransform = container.querySelector('[data-destination-card="北京市"]')?.getAttribute("transform");

    changeInput(container.querySelector<HTMLInputElement>("#map-x")!, "900");
    container.querySelector<HTMLInputElement>("#map-x")?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(container.querySelector('[data-destination-card="北京市"]')?.getAttribute("transform")).toBe(initialTransform);

    click(workflowStage(container, "版式"));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="刷新展示框位置"]')!);

    expect(confirm).toHaveBeenCalledTimes(1);
    click(workflowStage(container, "内容"));
    expect(container.querySelector('[data-destination-card="北京市"]')?.getAttribute("transform")).toBe(initialTransform);
  });

  it("locates a text layout issue without leaving the content stage", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.textElements = project.textElements.map((element) => element.id === "text-title"
      ? { ...element, color: "#ffffff" }
      : element);
    window.localStorage.setItem("cengfan-map-studio:draft", serializeProjectDocument(project));
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({ stage: "content", savedAt: "2026-08-04T00:00:00.000Z" }));
    const container = renderPublicApp({ clearStorage: false });

    // The assistant rail lives in the topbar drawer for the public content shell.
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开AI助手与高级功能"]')!);
    const drawer = document.querySelector(".studio-assistant-drawer")!;
    click(drawer.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="studio-advanced-panel"]')!);
    click(drawer.querySelector<HTMLButtonElement>('button[aria-label="打开元素查看"]')!);
    const issue = Array.from(drawer.querySelectorAll<HTMLButtonElement>('section[aria-label="排版问题提示"] button'))
      .find((button) => button.textContent?.includes("text-title"));
    expect(issue).not.toBeUndefined();
    click(issue!);

    expect(container.querySelector('main[aria-label="内容"]')).not.toBeNull();
    expect(container.querySelector('[data-text-id="text-title"]')?.classList.contains("is-selected")).toBe(true);
  });
});
