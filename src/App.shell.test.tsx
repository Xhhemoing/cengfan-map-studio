// Split from src/App.test.tsx: shell chrome contracts — topbar actions, the
// assistant rail/drawer, docked AI assistant, CSS contract and responsive
// panel layout. Helpers: src/test-utils/app-harness.tsx.
import { describe, expect, it } from "vitest";
import { EDITOR_PANEL_LAYOUT_STORAGE_KEY } from "./lib/editor-layout";
import { WORKSPACE_SESSION_STORAGE_KEY } from "./lib/workspace-session";
import { SKIN_STORAGE_KEY } from "./lib/theme";
import {
  click,
  closeGlobalSettings,
  installAppTestHarness,
  openGlobalSettingsSection,
  openRailAdvancedTab,
  renderApp,
  renderLegacyApp,
  renderPublicApp,
} from "./test-utils/app-harness";

installAppTestHarness();

describe("App topbar actions", () => {
  it("keeps frequent actions visible and groups low-frequency project actions", () => {
    const container = renderApp();
    const topbar = container.querySelector(".topbar-actions")!;

    expect(topbar.querySelector('[aria-label="历史与缩放"]')).not.toBeNull();
    expect(topbar.querySelector('[aria-label="导出与工程"]')).not.toBeNull();
    expect(topbar.textContent).not.toContain("存模板");
    expect(topbar.querySelector('[aria-label="在线协作"]')).toBeNull();

    expect(topbar.querySelector(".primary-button")?.textContent).toContain("导出 PNG");
    const projectMenu = container.querySelector(".topbar .project-menu")!;
    expect(projectMenu).not.toBeNull();
    expect(projectMenu.textContent).toContain("导出 SVG");
    expect(projectMenu.textContent).toContain("导入工程");
    expect(projectMenu.textContent).toContain("在线协作");

    expect(container.querySelectorAll<HTMLButtonElement>(".workflow-stage-stepper button")).toHaveLength(5);
    expect(container.querySelector('[role="tab"][aria-controls="studio-advanced-panel"]')).not.toBeNull();
  });

  it("removes legacy toolbar action clusters while keeping the canvas rendered", () => {
    const container = renderApp();
    expect(container.querySelector(".editor-toolbar-actions")).toBeNull();
    expect(container.querySelectorAll(".control-cluster")).toHaveLength(0);
    expect(container.querySelector(".canvas-stage .poster")).not.toBeNull();
  });
});

describe("Top workflow and left assistant rail", () => {
  it("keeps public five-stage workflow in the Atelier topbar and exposes one rail advanced tab", () => {
    window.localStorage.setItem(SKIN_STORAGE_KEY, "atelier");
    const container = renderPublicApp({ clearStorage: false });

    expect(container.querySelector('.workflow-stage-stepper[aria-label="制作步骤"]')).not.toBeNull();
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开AI助手与高级功能"]')!);
    expect(document.querySelectorAll('.MuiDrawer-root [role="tab"]')).toHaveLength(3);
    expect(Array.from(document.querySelectorAll('.MuiDrawer-root [role="tab"]')).map((tab) => tab.textContent)).toEqual(["AI 助手", "本阶段", "高级功能"]);
    // 左侧常驻 rail 与打开的抽屉共用同一会话上下文,各渲染一个 docked 实例。
    expect(document.querySelectorAll('[data-agent-presentation="docked"]')).toHaveLength(2);
  });

  it("opens advanced project settings from the rail without adding an AI-bottom advanced entry", () => {
    const container = renderLegacyApp();
    click(container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="studio-advanced-panel"]')!);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);

    expect(container.querySelector('.global-settings-screen[aria-label="全局设置"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-agent-presentation="docked"] [aria-label="打开全局设置"]')).toHaveLength(0);
  });

  it("opens real advanced feature detail states from the rail", () => {
    const container = renderLegacyApp();
    openRailAdvancedTab(container);

    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开数据诊断"]')!);
    expect(container.querySelector('[role="tab"][aria-controls="global-settings-cards"]')?.getAttribute("aria-selected")).toBe("true");

    closeGlobalSettings(container);
    openRailAdvancedTab(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开渲染设置"]')!);
    expect(container.querySelector('[role="tab"][aria-controls="global-settings-advanced"]')?.getAttribute("aria-selected")).toBe("true");

    closeGlobalSettings(container);
    openRailAdvancedTab(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="管理协作与邀请"]')!);
    expect(container.querySelector<HTMLDetailsElement>(".topbar .project-menu")?.open).toBe(true);
    expect(container.querySelector('[aria-label="增量协作设置"]')).not.toBeNull();
  });
});

describe("Docked AI assistant integration", () => {
  it("removes the legacy editor toolbar and old AI sidebar tab", () => {
    const container = renderLegacyApp();
    expect(container.querySelector(".editor-toolbar")).toBeNull();
    expect(container.querySelector('[aria-label="打开 AI 助手"]')).toBeNull();
    expect(container.querySelector('[data-agent-presentation="docked"]')).not.toBeNull();
    expect(container.textContent).not.toContain("画布图层AI 助手");
    expect(container.querySelector(".content-tool-tabs")).toBeNull();
  });

  it("reaches the docked assistant in the standard content workspace through the topbar drawer", () => {
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({ stage: "content", savedAt: "2026-08-06T00:00:00.000Z" }));
    const container = renderPublicApp({ clearStorage: false });
    expect(container.querySelector('button[aria-label="打开AI助手与高级功能"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="打开 AI 助手"]')).toBeNull();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开AI助手与高级功能"]')!);
    expect(document.querySelector('[data-agent-presentation="docked"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="描述 AI 修改需求"]')).not.toBeNull();
  });

  it("keeps the assistant reachable across shell stages through the topbar drawer", () => {
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({ stage: "content", savedAt: "2026-08-06T00:00:00.000Z" }));
    const container = renderLegacyApp({ clearStorage: false });
    expect(container.querySelector('[data-agent-presentation="docked"]')).not.toBeNull();

    click(container.querySelector<HTMLButtonElement>('.workflow-stage-stepper button[aria-label="地图样式"]')!);
    expect(container.querySelector('button[aria-label="打开AI助手与高级功能"]')).not.toBeNull();
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开AI助手与高级功能"]')!);
    expect(document.querySelector('[data-agent-presentation="docked"]')).not.toBeNull();
    click(document.querySelector<HTMLButtonElement>('button[aria-label="关闭AI 助手与高级功能"]')!);

    click(container.querySelector<HTMLButtonElement>('.workflow-stage-stepper button[aria-label="内容与排版"]')!);
    expect(container.querySelector('[data-agent-presentation="docked"]')).not.toBeNull();
  });
});

describe("Shell CSS contract", () => {
  it("keeps Atelier workflow visible and defines a narrow inspector access path", () => {
    const container = renderLegacyApp();

    // The topbar workflow the Atelier skin must keep visible: present and never aria-hidden.
    const topbarWorkflow = container.querySelector(".topbar .topbar-workflow");
    expect(topbarWorkflow).not.toBeNull();
    expect(topbarWorkflow?.getAttribute("aria-hidden")).toBeNull();
    expect(container.querySelector('.workflow-stage-stepper[aria-label="制作步骤"]')).not.toBeNull();

    // The assistant rail owns the AI/advanced tab pair the CSS styles.
    expect(container.querySelector(".studio-assistant-rail")).not.toBeNull();

    // The narrow-screen inspector access control remains discoverable in the topbar.
    expect(container.querySelector(".inspector-toggle-group")).not.toBeNull();
  });

  it("wires a keyboard skip link to the studio stage landmark without touching the hash route", () => {
    const container = renderPublicApp();

    const skip = container.querySelector<HTMLAnchorElement>("a.skip-link");
    expect(skip).not.toBeNull();
    expect(skip?.getAttribute("href")).toBe("#studio-stage");
    const target = container.querySelector<HTMLElement>("#studio-stage");
    expect(target).not.toBeNull();
    expect(target?.getAttribute("tabindex")).toBe("-1");

    const hashBefore = window.location.hash;
    click(skip!);

    expect(document.activeElement).toBe(target);
    // Hash 路由（#/project/…）不受片段跳转影响。
    expect(window.location.hash).toBe(hashBefore);
  });

  it("keeps the skip link and stage target available in the legacy workspace shell", () => {
    const container = renderLegacyApp();

    const skip = container.querySelector<HTMLAnchorElement>("a.skip-link");
    expect(skip).not.toBeNull();
    const target = container.querySelector<HTMLElement>("#studio-stage.editor-area");
    expect(target).not.toBeNull();

    click(skip!);
    expect(document.activeElement).toBe(target);
  });
});

describe("Responsive editor shell", () => {
  it("restores adjustable desktop panel widths and exposes two separators", () => {
    const previousInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
    window.localStorage.setItem(EDITOR_PANEL_LAYOUT_STORAGE_KEY, JSON.stringify({ sidebarWidth: 270, inspectorWidth: 330 }));
    try {
      const container = renderApp(false);
      const workspace = container.querySelector<HTMLElement>(".workspace");

      expect(workspace?.style.getPropertyValue("--sidebar-width")).toBe("270px");
      expect(workspace?.style.getPropertyValue("--inspector-width")).toBe("330px");
      expect(container.querySelectorAll('[role="separator"]')).toHaveLength(2);
      expect(container.querySelector<HTMLElement>('[role="separator"][aria-label="调整左侧栏宽度"]')?.getAttribute("aria-valuenow")).toBe("270");
      expect(container.querySelector<HTMLElement>('[role="separator"][aria-label="调整右侧栏宽度"]')?.getAttribute("aria-valuenow")).toBe("330");
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: previousInnerWidth });
    }
  });

  it("opens and closes the inspector through an explicit toolbar control", () => {
    const container = renderApp();
    const openButton = container.querySelector<HTMLButtonElement>('button[aria-label="打开属性面板"]');

    expect(openButton).not.toBeNull();
    expect(openButton?.getAttribute("aria-expanded")).toBe("false");
    click(openButton!);

    expect(container.querySelector(".inspector")?.className).toContain("is-open");
    expect(openButton?.getAttribute("aria-expanded")).toBe("true");

    click(container.querySelector<HTMLButtonElement>('button[aria-label="关闭属性面板"]')!);
    expect(container.querySelector(".inspector")?.className).not.toContain("is-open");
  });

  it("keeps the top stepper as the only workflow navigation entry", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "canvas");

    expect(container.querySelector(".global-settings-screen .workflow-guide")).toBeNull();
    expect(container.querySelector(".global-settings-guide__note")).not.toBeNull();
  });

  it("keeps global settings completion explicit without a return-editor control", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "canvas");

    expect(container.querySelector('button[aria-label="返回编辑器"]')).toBeNull();
    expect(container.querySelector<HTMLButtonElement>("button.global-settings-done")?.textContent).toContain("完成");
  });
});
