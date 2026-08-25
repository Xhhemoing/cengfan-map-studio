// 从 src/App.test.tsx 原样搬出：各阶段工作台：上传台、会话恢复、展示框与地图阶段。
// 共享挂载/交互装置见 src/app-test-harness.tsx。
import { describe, expect, it } from "vitest";
import { WORKSPACE_SESSION_STORAGE_KEY } from "./lib/workspace-session";
import { installAppTestHarness, renderApp, renderPublicApp, renderLegacyApp, click, openRailAdvancedTab, workflowStage, openGlobalData, leaveFocusedWorkspace, closeGlobalSettings } from "./app-test-harness";

installAppTestHarness();

describe("App student editing", () => {
  it("opens the upload workbench for the data stage without template or map presentation controls", async () => {
    const container = renderApp();
    const { act } = await import("react");
    click(workflowStage(container, "名单"));
    // DataUploadWorkspace is lazy: flush the module-resolution microtask.
    await act(async () => {});

    expect(container.querySelector('main[aria-label="名单工作台"]')).not.toBeNull();
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

    expect(container.querySelector('main[aria-label="名单工作台"]')).not.toBeNull();
    expect(container.querySelector(".student-table")).not.toBeNull();
    leaveFocusedWorkspace(container);

    expect(container.querySelector('main[aria-label="名单工作台"]')).toBeNull();
    expect(container.querySelector('main[aria-label="内容"]')).not.toBeNull();
  });

  it("leaves the upload stage through top-level workflow navigation", () => {
    const container = renderApp();
    openGlobalData(container);
    leaveFocusedWorkspace(container);

    expect(container.querySelector('main[aria-label="名单工作台"]')).toBeNull();
    expect(container.querySelector(".workspace")).not.toBeNull();
    expect(container.querySelector('.workflow-stage-stepper button[aria-current="step"]')?.getAttribute("aria-label")).toBe("内容");
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

    expect(container.querySelector('main[aria-label="名单工作台"]')).not.toBeNull();
    expect(container.querySelector(".student-table")).not.toBeNull();
    expect(container.querySelector(".workflow-stepper")).toBeNull();
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开AI助手与高级功能"]')!);
    expect(document.querySelector('.MuiDrawer-root .studio-assistant-rail')).not.toBeNull();
    expect(document.querySelectorAll('.MuiDrawer-root [role="tab"]')).toHaveLength(3);
    expect(Array.from(document.querySelectorAll('.MuiDrawer-root [role="tab"]')).map((tab) => tab.textContent)).toEqual(["AI 助手", "本阶段", "高级功能"]);
  });

  it("restores the latest workspace stage from a valid browser session", () => {
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({
      stage: "content",
      selectedProvince: "北京市",
      selectedObject: "cards",
      savedAt: "2026-08-05T10:00:00.000Z",
    }));

    const container = renderApp(false);

    expect(container.querySelector('.workflow-stage-stepper button[aria-current="step"]')?.getAttribute("aria-label")).toBe("内容");
    expect(container.querySelector(".workflow-panel--content")).not.toBeNull();
  });

  it("does not restore a stale province after the canvas selection is cleared", () => {
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({
      stage: "content",
      selectedProvince: "北京市",
      savedAt: "2026-08-05T10:00:00.000Z",
    }));

    const container = renderApp(false);
    click(container.querySelector<SVGSVGElement>("svg.poster")!);

    expect(JSON.parse(window.localStorage.getItem(WORKSPACE_SESSION_STORAGE_KEY) ?? "{}")).not.toHaveProperty("selectedProvince");
  });

  it("applies a reference card style through the real poster renderer", () => {
    const container = renderApp();
    click(workflowStage(container, "版式"));
    const option = Array.from(container.querySelectorAll<HTMLButtonElement>(".reference-card-style-option"))
      .find((button) => button.textContent?.includes("校徽开放名单"));

    expect(option).not.toBeUndefined();
    click(option!);
    click(workflowStage(container, "内容"));
    expect(container.querySelector('[data-card-presentation="emblem-list"]')).not.toBeNull();
    expect(container.textContent).toContain("林舟");
  });

  it("opens the display frame stage as a dedicated workbench with topbar undo/redo", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('[aria-label="版式"]')!);

    expect(container.querySelector('main[aria-label="版式"]')).not.toBeNull();
    expect(container.querySelectorAll(".reference-card-style-option")).toHaveLength(4);
    expect(container.querySelector(".workspace")).toBeNull();
    expect(container.querySelector('main[aria-label="版式"] .display-frame-workspace__header')).toBeNull();
    expect(container.querySelector('.topbar button[aria-label="刷新展示框位置"]')).not.toBeNull();
    expect(container.querySelector('aside[aria-label="版式与展示框样式"]')).not.toBeNull();

    const topbar = container.querySelector(".topbar-actions")!;
    expect(topbar.querySelector('[aria-label="历史"]')).not.toBeNull();
    expect(topbar.querySelector('[aria-label="界面主题"]')).not.toBeNull();

    click(workflowStage(container, "内容"));
    expect(container.querySelector('main[aria-label="版式"]')).toBeNull();
    expect(container.querySelector(".workspace")).not.toBeNull();
  });

  it("keeps the unified topbar with five-stage navigation while editing data", () => {
    const container = renderApp();
    openGlobalData(container);

    expect(container.querySelector('main[aria-label="名单工作台"]')).not.toBeNull();
    expect(container.querySelector('.workflow-stage-stepper')).not.toBeNull();
    expect(container.querySelector('.topbar .brand')).not.toBeNull();
    expect(container.querySelector('.workflow-stage-stepper button[aria-current="step"]')?.getAttribute("aria-label")).toBe("名单");
    // 工作台内部不再重复渲染步骤条
    expect(container.querySelector('main[aria-label="名单工作台"] .workflow-stage-stepper')).toBeNull();

    click(workflowStage(container, "地图"));
    expect(container.querySelector('main[aria-label="地图"]')).not.toBeNull();
    expect(container.querySelector('main[aria-label="名单工作台"]')).toBeNull();
  });

  it("opens the map style stage as a dedicated workbench", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('[aria-label="地图"]')!);

    expect(container.querySelector('main[aria-label="地图"]')).not.toBeNull();
    expect(container.querySelectorAll('[role="group"][aria-label="地图表达"] button')).toHaveLength(5);
    expect(container.querySelector(".workflow-panel--map")).toBeNull();
    expect(container.querySelector("main[aria-label=\"全局设置\"]")).toBeNull();
  });

  it("keeps province selection and styling inside the map stage", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('[aria-label="地图"]')!);
    click(container.querySelector<SVGPathElement>("[data-province-hit]")!);

    expect(container.querySelector('.workflow-stage-stepper button[aria-current="step"]')?.getAttribute("aria-label")).toBe("地图");
    expect(container.querySelector('main[aria-label="地图"]')).not.toBeNull();
    expect(container.querySelector(".province-inspector")?.textContent).toContain("北京市");
    expect(container.querySelector('.topbar .workflow-stepper button[aria-label="素材"]')).toBeNull();
  });

  it("keeps map style patches undoable in the map stage", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('[aria-label="地图"]')!);
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
      "1名单",
      "2地图",
      "3版式",
      "4内容",
      "5交付",
    ]);
    expect(container.querySelector(".workspace-nav")).toBeNull();

    click(tabs.querySelector<HTMLButtonElement>('[aria-label="名单"]')!);
    expect(container.querySelector('main[aria-label="名单工作台"]')).not.toBeNull();
    expect(container.textContent).not.toContain("地图呈现方式");
    leaveFocusedWorkspace(container);

    const editorTabs = container.querySelector(".workflow-stage-stepper")!;
    click(editorTabs.querySelector<HTMLButtonElement>('[aria-label="地图"]')!);
    expect(container.textContent).toContain("地图表达");

    click(container.querySelector<HTMLButtonElement>('.workflow-stage-stepper button[aria-label="交付"]')!);
    expect(container.textContent).toContain("交付检查");
  });

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
});
