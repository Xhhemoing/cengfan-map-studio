// 从 src/App.test.tsx 原样搬出：工作流引导与助手栏：主题、模板选择、顶栏与左侧栏。
// 共享挂载/交互装置见 src/app-test-harness.tsx。
import { describe, expect, it } from "vitest";
import { WORKSPACE_SESSION_STORAGE_KEY } from "./lib/workspace-session";
import { SKIN_STORAGE_KEY } from "./lib/theme";
import { installAppTestHarness, renderApp, renderPublicApp, renderLegacyApp, click, openRailAdvancedTab, openGlobalSettingsSection, workflowStage, closeGlobalSettings } from "./app-test-harness";

installAppTestHarness();

describe("App workflow guidance", () => {
  it("keeps the five-stage workflow in the visible topbar with the assistant rail in the sidebar", () => {
    const container = renderApp();

    expect(container.querySelectorAll(".workflow-stage-stepper button")).toHaveLength(5);
    expect(container.querySelector(".topbar-workflow")?.getAttribute("aria-hidden")).toBeNull();
    expect(container.querySelector(".topbar .project-menu")).not.toBeNull();
    expect(container.querySelector(".studio-sidebar .studio-assistant-rail")).not.toBeNull();
    expect(container.querySelectorAll('.studio-assistant-rail [role="tab"]')).toHaveLength(3);
  });

  it("keeps the assistant rail in the default full-screen public editor", () => {
    const container = renderPublicApp();

    expect(container.querySelector('.studio-editor-shell[data-has-left-rail="true"]')).not.toBeNull();
    expect(container.querySelector(".studio-sidebar .studio-assistant-rail")).not.toBeNull();
    expect(container.querySelectorAll(".topbar-workflow .workflow-stage-stepper button")).toHaveLength(5);
    expect(container.querySelector(".workflow-stage-stepper button")).not.toBeNull();
    expect(container.querySelector('button[aria-label="打开AI助手与高级功能"]')).not.toBeNull();
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开AI助手与高级功能"]')!);
    expect(document.querySelector('.MuiDrawer-root .studio-assistant-rail')).not.toBeNull();
    expect(container.querySelector(".topbar .project-menu")).not.toBeNull();
  });

  it("keeps the assistant rail available across focused Atelier workspaces", () => {
    const container = renderApp();

    click(workflowStage(container, "名单"));
    expect(container.querySelectorAll(".topbar-workflow .workflow-stage-stepper button")).toHaveLength(5);
    expect(container.querySelector(".studio-sidebar .studio-assistant-rail")).not.toBeNull();

    click(workflowStage(container, "交付"));
    expect(container.querySelectorAll(".topbar-workflow .workflow-stage-stepper button")).toHaveLength(5);
    expect(container.querySelector(".studio-sidebar .studio-assistant-rail")).not.toBeNull();
  });

  it("keeps the left sidebar when Classic opens a focused workspace", () => {
    const container = renderLegacyApp();

    click(container.querySelector<HTMLButtonElement>('button[aria-label="切换到经典界面"]')!);
    click(workflowStage(container, "地图"));

    expect(container.querySelector<HTMLElement>(".app-shell")?.dataset.editorSkin).toBe("classic");
    expect(container.querySelector('.studio-editor-shell[data-has-left-rail="true"]')).not.toBeNull();
    expect(container.querySelectorAll(".topbar-workflow .workflow-stage-stepper button")).toHaveLength(5);
    expect(container.querySelector(".map-style-workspace")).not.toBeNull();
  });

  it("switches the editor theme without changing poster data or viewBox", () => {
    const container = renderApp();
    const shell = container.querySelector<HTMLElement>(".app-shell")!;
    const poster = container.querySelector<SVGSVGElement>("svg.poster")!;
    const toggle = container.querySelector<HTMLButtonElement>('[aria-label="切换到暗色模式"]')!;

    expect(shell.dataset.editorTheme).toBe("light");
    const viewBox = poster.getAttribute("viewBox");
    click(toggle);

    expect(shell.dataset.editorTheme).toBe("dark");
    expect(document.documentElement.dataset.editorTheme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(poster.getAttribute("viewBox")).toBe(viewBox);
    expect(window.localStorage.getItem("cengfan-map-studio:theme-mode")).toBe("dark");
  });

  it("syncs the html root skin attribute with the editor skin", () => {
    const container = renderApp();
    expect(document.documentElement.dataset.editorSkin).toBe("atelier");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="切换到经典界面"]')!);
    expect(document.documentElement.dataset.editorSkin).toBe("classic");
  });

  it("defaults the editor shell to Atelier and persists Classic without changing the poster", () => {
    const container = renderLegacyApp();
    const shell = container.querySelector<HTMLElement>(".app-shell")!;
    const poster = container.querySelector<SVGSVGElement>("svg.poster")!;
    const viewBox = poster.getAttribute("viewBox");

    expect(shell.dataset.editorSkin).toBe("atelier");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="切换到经典界面"]')!);

    expect(shell.dataset.editorSkin).toBe("classic");
    expect(window.localStorage.getItem("cengfan-map-studio:ui-skin")).toBe("classic");
    expect(poster.getAttribute("viewBox")).toBe(viewBox);
  });

  it("renders the active stage in the visible topbar workflow", () => {
    const container = renderLegacyApp();
    const steps = Array.from(container.querySelectorAll(".workflow-stage-stepper button"));

    expect(steps).toHaveLength(5);
    expect(steps[3]?.getAttribute("aria-current")).toBe("step");
    expect(steps[3]?.getAttribute("aria-label")).toBe("内容");
    expect(container.querySelector(".workflow-guide")).toBeNull();
  });

  it("opens the dedicated map stage from the left workflow rail", () => {
    const container = renderApp();
    click(workflowStage(container, "地图"));

    expect(container.querySelector('main[aria-label="地图"]')).not.toBeNull();
    expect(workflowStage(container, "地图").getAttribute("aria-current")).toBe("step");
  });

  it("opens global canvas settings from the stable rail", () => {
    const container = renderApp();
    openRailAdvancedTab(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);

    expect(container.querySelector(".global-settings-screen")).not.toBeNull();
    expect(container.querySelector('[role="tab"][aria-controls="global-settings-canvas"]')?.getAttribute("aria-selected")).toBe("true");
  });

  it("keeps a province selection when entering the material workspace", () => {
    const container = renderApp();
    click(container.querySelector("[data-province-hit]")!);
    click(container.querySelector<HTMLButtonElement>('.topbar .workflow-stepper button[aria-label="素材"]')!);

    expect(container.querySelector(".inspector h2")?.textContent).toContain("北京市");
  });

  it("applies a glass statistics style from the dedicated display-frame stage", () => {
    const container = renderApp();
    click(workflowStage(container, "版式"));
    const option = Array.from(container.querySelectorAll<HTMLButtonElement>(".reference-card-style-option"))
      .find((button) => button.textContent?.includes("半透明统计卡"));
    click(option!);
    click(workflowStage(container, "内容"));

    expect(container.querySelector('[data-card-presentation="glass-stat"]')).not.toBeNull();
    expect(container.querySelector(".project-summary")?.textContent).toContain("已记录 1 步");
  });

  it("shows the current workflow context without duplicating workflow controls", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "canvas");

    expect(container.querySelector(".global-settings-screen .workflow-guide")).toBeNull();
    expect(container.querySelector(".global-settings-guide__step")?.textContent).toContain("全局布局");
    expect(container.querySelector(".global-settings-guide__note")?.textContent).toContain("集中设置画布");
    click(container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-map"]')!);
    expect(container.querySelector('[role="tab"][aria-controls="global-settings-map"]')?.getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector('[role="tab"][aria-controls="global-settings-canvas"]')?.getAttribute("aria-selected")).toBe("false");
  });

  it("applies a template from the template picker inside global settings", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "canvas");

    // 数据板块分区（数据展示视图）包含整体模板区块
    click(container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-cards"]')!);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="数据展示设置"]')!);
    const picker = container.querySelector(".global-settings-screen .template-picker");
    expect(picker).not.toBeNull();
    expect(picker?.textContent).toContain("整体模板");
    expect(Array.from(picker!.querySelectorAll(".workflow-template-grid button")).map((b) => b.textContent?.trim()))
      .toContain("原始地图");
    expect(picker!.querySelector(".workflow-template-grid button.selected")?.textContent).toContain("原始地图");

    // 应用卡通画风 → 模板高亮切换
    click(Array.from(picker!.querySelectorAll(".workflow-template-grid button"))
      .find((button) => button.textContent?.trim() === "卡通画风")!);
    expect(picker!.querySelector(".workflow-template-grid button.selected")?.textContent).toContain("卡通画风");
    // 完成设置后项目历史已记录模板应用
    closeGlobalSettings(container);
    expect(container.querySelector(".project-summary")?.textContent).toContain("已记录 1 步");
  });

  it("shows the roster step badge on the data section nav entry", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "canvas");

    // 默认样例名单全部就绪 → 数据板块导航条目显示就绪徽标
    const cardsTab = container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-cards"]')!;
    const badge = cardsTab.querySelector(".global-settings-nav__badge");
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute("data-status")).toBe("ready");
    expect(badge?.textContent).toBe("✓");
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

    click(container.querySelector<HTMLButtonElement>('.workflow-stage-stepper button[aria-label="地图"]')!);
    expect(container.querySelector('button[aria-label="打开AI助手与高级功能"]')).not.toBeNull();
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开AI助手与高级功能"]')!);
    expect(document.querySelector('[data-agent-presentation="docked"]')).not.toBeNull();
    click(document.querySelector<HTMLButtonElement>('button[aria-label="关闭AI 助手与高级功能"]')!);

    click(container.querySelector<HTMLButtonElement>('.workflow-stage-stepper button[aria-label="内容"]')!);
    expect(container.querySelector('[data-agent-presentation="docked"]')).not.toBeNull();
  });
});
