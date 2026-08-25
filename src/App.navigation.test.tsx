// Split from src/App.test.tsx: focused workspace/stage navigation (upload
// workbench, map style stage, display frame stage, five-stage stepper).
// Helpers: src/test-utils/app-harness.tsx.
import { describe, expect, it } from "vitest";
import { createProjectDocument, serializeProjectDocument } from "./lib/project-document";
import { WORKSPACE_SESSION_STORAGE_KEY } from "./lib/workspace-session";
import {
  click,
  installAppTestHarness,
  leaveFocusedWorkspace,
  openGlobalData,
  openRailAdvancedTab,
  renderApp,
  renderLegacyApp,
  renderPublicApp,
  workflowStage,
} from "./test-utils/app-harness";

installAppTestHarness();

describe("App workspace stage navigation", () => {
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

    expect(container.querySelector('main[aria-label="内容与排版"]')).not.toBeNull();
    expect(container.querySelector('[data-text-id="text-title"]')?.classList.contains("is-selected")).toBe(true);
  });

  it("opens the upload workbench for the data stage without template or map presentation controls", async () => {
    const container = renderApp();
    const { act } = await import("react");
    click(workflowStage(container, "数据与素材"));
    // DataUploadWorkspace is lazy: flush the module-resolution microtask.
    await act(async () => {});

    expect(container.querySelector('main[aria-label="数据与素材工作台"]')).not.toBeNull();
    expect(container.querySelector(".student-table")).not.toBeNull();
    expect(container.textContent).not.toContain("地图呈现方式");
    expect(container.textContent).not.toContain("模板应用");
    expect(container.textContent).not.toContain("模板列表");
  });

  it("restores the upload workbench when the saved stage is data", () => {
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({
      stage: "data",
      savedAt: "2026-08-05T10:00:00.000Z",
    }));
    const container = renderPublicApp({ clearStorage: false });

    expect(container.querySelector('main[aria-label="数据与素材工作台"]')).not.toBeNull();
    expect(container.querySelector(".student-table")).not.toBeNull();
    leaveFocusedWorkspace(container);

    expect(container.querySelector('main[aria-label="数据与素材工作台"]')).toBeNull();
    expect(container.querySelector('main[aria-label="内容与排版"]')).not.toBeNull();
  });

  it("leaves the upload stage through top-level workflow navigation", () => {
    const container = renderApp();
    openGlobalData(container);
    leaveFocusedWorkspace(container);

    expect(container.querySelector('main[aria-label="数据与素材工作台"]')).toBeNull();
    expect(container.querySelector(".workspace")).not.toBeNull();
    expect(container.querySelector('.workflow-stage-stepper button[aria-current="step"]')?.getAttribute("aria-label")).toBe("内容与排版");
  });

  it("connects upload row selection to the active poster marker", () => {
    const container = renderApp();
    openGlobalData(container);
    click(container.querySelector('[data-student-row="student-1"]')!);
    leaveFocusedWorkspace(container);

    expect(container.querySelector('[data-student-pin="student-1"]')?.getAttribute("data-selected")).toBe("true");
  });

  it("opens the upload workbench from the legacy global settings entry without exposing old navigation", () => {
    const container = renderLegacyApp();
    openRailAdvancedTab(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);
    click(container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-cards"]')!);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局数据"]')!);

    expect(container.querySelector('main[aria-label="数据与素材工作台"]')).not.toBeNull();
    expect(container.querySelector(".student-table")).not.toBeNull();
    expect(container.querySelector(".workflow-stepper")).toBeNull();
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开AI助手与高级功能"]')!);
    expect(document.querySelector('.MuiDrawer-root .studio-assistant-rail')).not.toBeNull();
    expect(document.querySelectorAll('.MuiDrawer-root [role="tab"]')).toHaveLength(3);
    expect(Array.from(document.querySelectorAll('.MuiDrawer-root [role="tab"]')).map((tab) => tab.textContent)).toEqual(["AI 助手", "本阶段", "高级功能"]);
  });

  it("opens the display frame stage as a dedicated workbench with topbar undo/redo", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('[aria-label="展示框样式"]')!);

    expect(container.querySelector('main[aria-label="展示框样式"]')).not.toBeNull();
    expect(container.querySelectorAll(".reference-card-style-option")).toHaveLength(4);
    expect(container.querySelector(".workspace")).toBeNull();
    expect(container.querySelector('main[aria-label="展示框样式"] .display-frame-workspace__header')).toBeNull();
    expect(container.querySelector('.topbar button[aria-label="刷新展示框位置"]')).not.toBeNull();
    expect(container.querySelector('aside[aria-label="展示框公共样式"]')).not.toBeNull();

    const topbar = container.querySelector(".topbar-actions")!;
    expect(topbar.querySelector('[aria-label="历史与缩放"]')).not.toBeNull();
    expect(topbar.querySelector('[aria-label="界面主题"]')).not.toBeNull();

    click(workflowStage(container, "内容与排版"));
    expect(container.querySelector('main[aria-label="展示框样式"]')).toBeNull();
    expect(container.querySelector(".workspace")).not.toBeNull();
  });

  it("keeps the unified topbar with five-stage navigation while editing data", () => {
    const container = renderApp();
    openGlobalData(container);

    expect(container.querySelector('main[aria-label="数据与素材工作台"]')).not.toBeNull();
    expect(container.querySelector('.workflow-stage-stepper')).not.toBeNull();
    expect(container.querySelector('.topbar .brand')).not.toBeNull();
    expect(container.querySelector('.workflow-stage-stepper button[aria-current="step"]')?.getAttribute("aria-label")).toBe("数据与素材");
    // 工作台内部不再重复渲染步骤条
    expect(container.querySelector('main[aria-label="数据与素材工作台"] .workflow-stage-stepper')).toBeNull();

    click(workflowStage(container, "地图样式"));
    expect(container.querySelector('main[aria-label="地图样式"]')).not.toBeNull();
    expect(container.querySelector('main[aria-label="数据与素材工作台"]')).toBeNull();
  });

  it("opens the map style stage as a dedicated workbench", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('[aria-label="地图样式"]')!);

    expect(container.querySelector('main[aria-label="地图样式"]')).not.toBeNull();
    expect(container.querySelectorAll('[role="group"][aria-label="地图表达"] button')).toHaveLength(5);
    expect(container.querySelector(".workflow-panel--map")).toBeNull();
    expect(container.querySelector("main[aria-label=\"全局设置\"]")).toBeNull();
  });

  it("keeps province selection and styling inside the map stage", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('[aria-label="地图样式"]')!);
    click(container.querySelector<SVGPathElement>("[data-province-hit]")!);

    expect(container.querySelector('.workflow-stage-stepper button[aria-current="step"]')?.getAttribute("aria-label")).toBe("地图样式");
    expect(container.querySelector('main[aria-label="地图样式"]')).not.toBeNull();
    expect(container.querySelector(".province-inspector")?.textContent).toContain("北京市");
    expect(container.querySelector('.topbar .workflow-stepper button[aria-label="素材"]')).toBeNull();
  });

  it("keeps map style patches undoable in the map stage", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('[aria-label="地图样式"]')!);
    const collapse = container.querySelector<HTMLInputElement>("#map-collapse-south-sea")!;
    click(collapse);

    expect(collapse.checked).toBe(true);
    const undo = container.querySelector<HTMLButtonElement>('button[aria-label^="撤销：更新地图"]')!;
    expect(undo).not.toBeNull();
    click(undo);

    expect(container.querySelector<HTMLInputElement>("#map-collapse-south-sea")?.checked).toBe(false);
  });

  it("organizes the actual editor into five user workflow workspaces", () => {
    const container = renderApp();
    const tabs = container.querySelector(".workflow-stage-stepper")!;
    expect(tabs.querySelectorAll("button")).toHaveLength(5);
    expect(Array.from(tabs.querySelectorAll("button")).map((button) => button.textContent?.trim())).toEqual([
      "1数据与素材",
      "2地图样式",
      "3展示框样式",
      "4内容与排版",
      "5最终导出",
    ]);
    expect(container.querySelector(".workspace-nav")).toBeNull();

    click(tabs.querySelector<HTMLButtonElement>('[aria-label="数据与素材"]')!);
    expect(container.querySelector('main[aria-label="数据与素材工作台"]')).not.toBeNull();
    expect(container.textContent).not.toContain("地图呈现方式");
    leaveFocusedWorkspace(container);

    const editorTabs = container.querySelector(".workflow-stage-stepper")!;
    click(editorTabs.querySelector<HTMLButtonElement>('[aria-label="地图样式"]')!);
    expect(container.textContent).toContain("地图表达");

    click(container.querySelector<HTMLButtonElement>('.workflow-stage-stepper button[aria-label="最终导出"]')!);
    expect(container.textContent).toContain("交付检查");
  });
});
