// 从 src/App.test.tsx 原样搬出：外壳布局契约：CSS、响应式面板、阶段插槽与顶栏分层。
// 共享挂载/交互装置见 src/app-test-harness.tsx。
import { describe, expect, it } from "vitest";
import { EDITOR_PANEL_LAYOUT_STORAGE_KEY } from "./lib/editor-layout";
import { installAppTestHarness, renderApp, renderPublicApp, renderLegacyApp, click, openGlobalSettingsSection, workflowStage, closeGlobalSettings } from "./app-test-harness";

installAppTestHarness();

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
