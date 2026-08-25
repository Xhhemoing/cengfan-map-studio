// 从 src/App.test.tsx 原样搬出：外壳布局契约：CSS、响应式面板、阶段插槽与顶栏分层。
// 共享挂载/交互装置见 src/app-test-harness.tsx。
import { describe, expect, it } from "vitest";
import { EDITOR_PANEL_LAYOUT_STORAGE_KEY } from "./lib/editor-layout";
import { installAppTestHarness, renderApp, renderPublicApp, renderLegacyApp, click, openGlobalSettingsSection, openRailAdvancedTab, workflowStage } from "./app-test-harness";

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
    ["名单", "数据质量"],
    ["地图", "地图对象属性"],
    ["版式", "版式与展示框样式"],
    ["内容", "内容对象属性"],
    ["交付", "导出与检查"],
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

  it("sends the public advanced entrance to the 版式 stage instead of the settings screen", () => {
    const container = renderPublicApp();
    openRailAdvancedTab(container);

    expect(container.querySelector('button[aria-label="打开全局设置"]')).toBeNull();
    click(container.querySelector<HTMLButtonElement>('button[aria-label="前往版式"]')!);

    expect(container.querySelector('.global-settings-screen[aria-label="全局设置"]')).toBeNull();
    expect(container.querySelector(".studio-editor-shell")).not.toBeNull();
    expect(
      container.querySelector('.workflow-stage-stepper button[aria-current="step"]')?.getAttribute("aria-label"),
    ).toBe("版式");
  });
});

describe("Stage overview (T2)", () => {
  it("shows the stage overview in the left rail with progress badge and cards", () => {
    const container = renderPublicApp();
    click(workflowStage(container, "名单"));
    click(container.querySelector('[role="tab"][aria-controls="studio-stage-panel"]')!);

    const panel = container.querySelector("#studio-stage-panel");
    expect(panel).not.toBeNull();
    expect(panel!.textContent).toContain("名单");
    expect(panel!.querySelector("[data-stage-status]")).not.toBeNull();
    expect(panel!.querySelectorAll(".studio-stage-overview__card").length).toBeGreaterThan(0);
  });

  it("keeps the overview in sync with the active stage", () => {
    const container = renderPublicApp();
    click(container.querySelector('[role="tab"][aria-controls="studio-stage-panel"]')!);

    const dataPanel = container.querySelector("#studio-stage-panel")!;
    expect(dataPanel.textContent).toContain("名单");

    click(workflowStage(container, "交付"));
    const exportPanel = container.querySelector("#studio-stage-panel")!;
    expect(exportPanel.textContent).toMatch(/导出状态|导出检查|数据告警|排版问题|资源缺失/);
  });
});

describe("Extracted render branches (R10-5)", () => {
  // App.tsx 把 legacy 左栏、聚焦阶段整屏与全局设置整屏搬到 src/components/editor/*。
  // 这三条 pin 从 App 这一侧确认接缝没有改变 DOM 结构、class 名与文案。
  it("keeps the legacy sidebar rail and panel wrappers around the roster panel", () => {
    const container = renderLegacyApp();
    const sidebar = container.querySelector("aside.sidebar.studio-sidebar");

    expect(sidebar).not.toBeNull();
    expect(sidebar?.querySelector(":scope > .studio-sidebar__rail .studio-assistant-rail")).not.toBeNull();
    const panel = sidebar?.querySelector<HTMLElement>(":scope > .studio-sidebar__panel > .workflow-panel--roster");
    expect(panel?.className).toBe("panel-content workflow-panel workflow-panel--roster");
    expect(panel?.querySelector(".panel-heading span")?.textContent).toBe("名单检查");
  });

  it("keeps every focused stage inside the studio editor shell with its stage actions", () => {
    const container = renderPublicApp();
    click(workflowStage(container, "版式"));

    expect(container.querySelector(".studio-editor-shell")).not.toBeNull();
    expect(container.querySelector('button[aria-label="刷新展示框位置"]')).not.toBeNull();
    expect(container.querySelector(".reference-card-style-workspace")).not.toBeNull();
  });

  it("keeps the global settings topbar trimmed to brand and workflow navigation", () => {
    // 全局设置整屏只剩 legacy 一条入口：公开路径的「前往版式」改为跳阶段。
    const container = renderLegacyApp();
    openGlobalSettingsSection(container, "canvas");

    const topbar = container.querySelector(".app-shell > .topbar");
    expect(topbar?.querySelector(".brand .brand-label__full")?.textContent).toBe("蹭饭地图工作室");
    expect(topbar?.querySelector(".topbar-workflow .workflow-stage-stepper")).not.toBeNull();
    expect(topbar?.querySelector('[role="group"][aria-label="历史"]')).toBeNull();
  });
});

describe("Extracted render branches (R11-5)", () => {
  // legacy 顶栏与导出工程弹层搬到 src/components/editor/*。这条 pin 从 App 这一侧
  // 确认顶栏接缝没有改变品牌区、阶段导航插槽、工具栏分组顺序与导出按钮文案。
  it("keeps the legacy topbar brand, workflow slot and toolbar groups in order", () => {
    const container = renderLegacyApp();
    const topbar = container.querySelector(".app-shell > .topbar")!;

    expect(topbar.querySelector(".brand .brand-label__full")?.textContent).toBe("蹭饭地图工作室");
    const compact = topbar.querySelector(".brand .brand-label__compact");
    expect(compact?.textContent).toBe("蹭饭图");
    expect(compact?.getAttribute("aria-hidden")).toBe("true");

    const workflow = topbar.querySelector(".topbar-workflow")!;
    expect(workflow.querySelector(".workflow-stage-stepper")).not.toBeNull();
    const legacySlot = workflow.querySelector(".topbar-workflow__legacy");
    expect(legacySlot?.getAttribute("aria-hidden")).toBe("true");

    const groups = Array.from(topbar.querySelectorAll('.topbar-actions [role="group"]')).map((group) =>
      group.getAttribute("aria-label"),
    );
    expect(groups.slice(0, 4)).toEqual(["历史与缩放", "重算展示框", "属性面板", "界面主题"]);
    expect(groups).toContain("导出");

    const exportGroup = topbar.querySelector('[role="group"][aria-label="导出"]');
    expect(exportGroup?.querySelector("button.primary-button")?.textContent).toContain("导出 PNG");
  });
});

describe("Extracted render branches (R12-1)", () => {
  // legacy 画布舞台与右侧属性面板搬到 src/components/editor/*。这条 pin 从 App 这一侧
  // 确认中栏的缩放外壳嵌套、右栏的 id 与项目摘要的同步状态出口都没有随接缝改变。
  it("keeps the canvas stage nesting and the inspector summary wired to the legacy shell", () => {
    const container = renderLegacyApp();
    const workspace = container.querySelector(".workspace")!;

    const inner = workspace.querySelector(
      ":scope > section.editor-area > .canvas-stage > .canvas-zoom-shell > .canvas-zoom-inner",
    );
    expect(inner?.querySelector("svg")).not.toBeNull();

    const inspector = workspace.querySelector<HTMLElement>(":scope > aside.inspector")!;
    expect(inspector.id).toBe("editor-inspector");
    expect(inspector.querySelector(".project-summary > summary")?.textContent).toBe("项目摘要");
    expect(inspector.querySelector<HTMLElement>(".project-summary .status")?.dataset.syncStatus).toBe("idle");
  });
});

describe("Topbar action layering (T4)", () => {
  it("keeps global undo/redo visible in the topbar across every focused stage", () => {
    const container = renderPublicApp();
    for (const stage of ["名单", "地图", "版式", "内容", "交付"]) {
      click(workflowStage(container, stage));
      expect(container.querySelector('.topbar-actions [role="group"][aria-label="历史"]')).not.toBeNull();
    }
  });

  it("marks the low-frequency theme group for narrow-screen hiding", () => {
    const container = renderPublicApp();
    const themeGroup = container.querySelector('.topbar-actions [role="group"][aria-label="界面主题"]');
    expect(themeGroup?.className).toContain("topbar-action-group--theme");
  });
});
