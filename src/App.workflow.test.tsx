// Split from src/App.test.tsx: workflow guidance across stages plus the stage
// slot/overview/topbar layering contracts (T0/T2/T4).
// Helpers: src/test-utils/app-harness.tsx.
import { describe, expect, it } from "vitest";
import {
  click,
  closeGlobalSettings,
  installAppTestHarness,
  openGlobalSettingsSection,
  openRailAdvancedTab,
  renderApp,
  renderLegacyApp,
  renderPublicApp,
  workflowStage,
} from "./test-utils/app-harness";

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

    click(workflowStage(container, "数据与素材"));
    expect(container.querySelectorAll(".topbar-workflow .workflow-stage-stepper button")).toHaveLength(5);
    expect(container.querySelector(".studio-sidebar .studio-assistant-rail")).not.toBeNull();

    click(workflowStage(container, "最终导出"));
    expect(container.querySelectorAll(".topbar-workflow .workflow-stage-stepper button")).toHaveLength(5);
    expect(container.querySelector(".studio-sidebar .studio-assistant-rail")).not.toBeNull();
  });

  it("keeps the left sidebar when Classic opens a focused workspace", () => {
    const container = renderLegacyApp();

    click(container.querySelector<HTMLButtonElement>('button[aria-label="切换到经典界面"]')!);
    click(workflowStage(container, "地图样式"));

    expect(container.querySelector<HTMLElement>(".app-shell")?.dataset.editorSkin).toBe("classic");
    expect(container.querySelector('.studio-editor-shell[data-has-left-rail="true"]')).not.toBeNull();
    expect(container.querySelectorAll(".topbar-workflow .workflow-stage-stepper button")).toHaveLength(5);
    expect(container.querySelector(".map-style-workspace")).not.toBeNull();
  });

  it("switches the editor theme without changing poster data or viewBox", () => {
    const container = renderApp();
    const shell = container.querySelector<HTMLElement>(".app-shell")!;
    const poster = container.querySelector<SVGSVGElement>("svg.poster")!;
    const toggle = container.querySelector<HTMLButtonElement>('button[aria-label="暗色模式"][aria-pressed="false"]')!;

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
    expect(steps[3]?.getAttribute("aria-label")).toBe("内容与排版");
    expect(container.querySelector(".workflow-guide")).toBeNull();
  });

  it("opens the dedicated map stage from the left workflow rail", () => {
    const container = renderApp();
    click(workflowStage(container, "地图样式"));

    expect(container.querySelector('main[aria-label="地图样式"]')).not.toBeNull();
    expect(workflowStage(container, "地图样式").getAttribute("aria-current")).toBe("step");
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
    click(workflowStage(container, "展示框样式"));
    const option = Array.from(container.querySelectorAll<HTMLButtonElement>(".reference-card-style-option"))
      .find((button) => button.textContent?.includes("半透明统计卡"));
    click(option!);
    click(workflowStage(container, "内容与排版"));

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

describe("Stage slot contract (T0)", () => {
  // 单一事实源快照：T1 把 rightRailLabel 抽成 STAGE_METADATA 时，此表是回归锚点。
  const STAGE_SLOTS = [
    ["数据与素材", "数据质量与素材"],
    ["地图样式", "地图对象属性"],
    ["展示框样式", "展示框公共样式"],
    ["内容与排版", "内容对象属性"],
    ["最终导出", "导出与检查"],
  ] as const;

  it("maps every workflow stage to its right inspector slot and active step", () => {
    const container = renderPublicApp();
    for (const [stageLabel, rightRailLabel] of STAGE_SLOTS) {
      click(workflowStage(container, stageLabel));
      expect(
        container.querySelector('.workflow-stage-stepper button[aria-current="step"]')?.getAttribute("aria-label"),
      ).toBe(stageLabel);
      expect(container.querySelector(`aside.studio-editor-shell__right[aria-label="${rightRailLabel}"]`)).not.toBeNull();
    }
  });

  it("keeps the assistant overview rail mounted in every focused stage", () => {
    const container = renderPublicApp();
    for (const [stageLabel] of STAGE_SLOTS) {
      click(workflowStage(container, stageLabel));
      expect(container.querySelector(".studio-sidebar__rail")).not.toBeNull();
    }
  });

  it("exposes the five-stage stepper as the single ordered workflow navigation", () => {
    const container = renderPublicApp();
    const labels = Array.from(container.querySelectorAll(".workflow-stage-stepper button")).map(
      (button) => button.getAttribute("aria-label"),
    );
    expect(labels).toEqual(STAGE_SLOTS.map(([label]) => label));
  });

  it("opens the global settings screen over any focused stage in public mode", () => {
    const container = renderPublicApp();
    openGlobalSettingsSection(container, "canvas");
    expect(container.querySelector('.global-settings-screen[aria-label="全局设置"]')).not.toBeNull();
    expect(container.querySelector(".studio-editor-shell")).toBeNull();

    closeGlobalSettings(container);
    expect(container.querySelector('.global-settings-screen[aria-label="全局设置"]')).toBeNull();
    expect(container.querySelector(".studio-editor-shell")).not.toBeNull();
  });
});

describe("Stage overview (T2)", () => {
  it("shows the stage overview in the left rail with progress badge and cards", () => {
    const container = renderPublicApp();
    click(workflowStage(container, "数据与素材"));
    click(container.querySelector('[role="tab"][aria-controls="studio-stage-panel"]')!);

    const panel = container.querySelector("#studio-stage-panel");
    expect(panel).not.toBeNull();
    expect(panel!.textContent).toContain("数据与素材");
    expect(panel!.querySelector("[data-stage-status]")).not.toBeNull();
    expect(panel!.querySelectorAll(".studio-stage-overview__card").length).toBeGreaterThan(0);
  });

  it("keeps the overview in sync with the active stage", () => {
    const container = renderPublicApp();
    click(container.querySelector('[role="tab"][aria-controls="studio-stage-panel"]')!);

    const dataPanel = container.querySelector("#studio-stage-panel")!;
    expect(dataPanel.textContent).toContain("数据与素材");

    click(workflowStage(container, "最终导出"));
    const exportPanel = container.querySelector("#studio-stage-panel")!;
    expect(exportPanel.textContent).toMatch(/导出状态|导出检查|数据告警|排版问题|资源缺失/);
  });
});

describe("Topbar action layering (T4)", () => {
  it("keeps global undo/redo visible in the topbar across every focused stage", () => {
    const container = renderPublicApp();
    for (const stage of ["数据与素材", "地图样式", "展示框样式", "内容与排版", "最终导出"]) {
      click(workflowStage(container, stage));
      expect(container.querySelector('.topbar-actions [role="group"][aria-label="历史与缩放"]')).not.toBeNull();
    }
  });

  it("marks the low-frequency theme group for narrow-screen hiding", () => {
    const container = renderPublicApp();
    const themeGroup = container.querySelector('.topbar-actions [role="group"][aria-label="界面主题"]');
    expect(themeGroup?.className).toContain("topbar-action-group--theme");
  });
});
