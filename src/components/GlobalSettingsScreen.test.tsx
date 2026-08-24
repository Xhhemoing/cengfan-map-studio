import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import {
  GlobalSettingsScreen,
  describeSettingsFocusAnchor,
  findSettingsFocusAnchor,
  type GlobalSettingsSection,
} from "./GlobalSettingsScreen";
import { createProjectDocument } from "../lib/project-document";
import { sampleStudents } from "../lib/project-data";
import { computeWorkflowProgress } from "../lib/workflow-progress";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

const SECTION_ORDER: GlobalSettingsSection[] = ["canvas", "map", "cards", "guests", "typography", "advanced"];

function press(element: Element | null, key: string): void {
  if (!element) throw new Error("tab missing");
  flushSync(() => element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
}

function selectedSection(container: HTMLElement): string | undefined {
  return container.querySelector('[role="tab"][aria-selected="true"]')?.id.replace("global-settings-tab-", "");
}

function renderSettings(initialSection: GlobalSettingsSection = "canvas") {
  const container = document.createElement("div");
  // 焦点断言依赖 document.activeElement，游离节点拿不到焦点。
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  const project = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
  flushSync(() => root.render(
    <GlobalSettingsScreen
      project={project}
      initialSection={initialSection}
      canUndo={false}
      canRedo={false}
      undoLabel="撤销"
      redoLabel="重做"
      onClose={vi.fn()}
      onUndo={vi.fn()}
      onRedo={vi.fn()}
      onPatch={vi.fn()}
      onReset={vi.fn()}
      selectedStudentId={null}
      onSelectStudent={vi.fn()}
      onChangeDataView={vi.fn()}
      onAppendStudents={vi.fn()}
      onReplaceStudents={vi.fn()}
      onUpdateStudent={vi.fn()}
      onToggleStudentVisibility={vi.fn()}
      onDeleteStudent={vi.fn()}
      onSetStudentsVisibility={vi.fn()}
      provinces={["北京", "上海"]}
      onApplyFont={vi.fn()}
      workflowProgress={computeWorkflowProgress(project)}
      workflowActiveStep="layout"
      templates={[{ id: "original", name: "原始" }]}
      currentTemplateId="original"
      customTemplates={[]}
      onApplyTemplate={vi.fn()}
      onApplyCustomTemplate={vi.fn()}
      onSaveTemplate={vi.fn()}
    />,
  ));
  const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  return { container, tabs };
}

const strays: HTMLElement[] = [];

/** 模拟编辑器里的触发按钮：进入设置时它会随整棵树一起卸载。 */
function mountTrigger(attributes: Record<string, string>): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  Object.entries(attributes).forEach(([name, value]) => button.setAttribute(name, value));
  document.body.append(button);
  strays.push(button);
  return button;
}

afterEach(() => {
  mounted.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  strays.splice(0).forEach((node) => node.remove());
  vi.restoreAllMocks();
});

describe("GlobalSettingsScreen tablist keyboard navigation", () => {
  it("exposes every section as a tab in a single flat order", () => {
    const { tabs } = renderSettings();
    expect(tabs.map((tab) => tab.id.replace("global-settings-tab-", ""))).toEqual(SECTION_ORDER);
  });

  it("walks the vertical tablist with ArrowDown and ArrowUp across groups", () => {
    const { container, tabs } = renderSettings();

    press(tabs[0]!, "ArrowDown");
    expect(selectedSection(container)).toBe("map");
    expect(document.activeElement).toBe(tabs[1]);

    // 画布/地图/数据板块属于“全局设计”，辅助板块起属于“其他设置”：方向键要跨组。
    press(tabs[1]!, "ArrowDown");
    press(tabs[2]!, "ArrowDown");
    expect(selectedSection(container)).toBe("guests");
    expect(document.activeElement).toBe(tabs[3]);

    press(tabs[3]!, "ArrowUp");
    expect(selectedSection(container)).toBe("cards");
    expect(document.activeElement).toBe(tabs[2]);
  });

  it("wraps at both ends on the vertical axis", () => {
    const { container, tabs } = renderSettings();
    const last = tabs.length - 1;

    press(tabs[0]!, "ArrowUp");
    expect(selectedSection(container)).toBe("advanced");
    expect(document.activeElement).toBe(tabs[last]);

    press(tabs[last]!, "ArrowDown");
    expect(selectedSection(container)).toBe("canvas");
    expect(document.activeElement).toBe(tabs[0]);
  });

  it("keeps the existing horizontal arrow keys working for the narrow layout", () => {
    const { container, tabs } = renderSettings();

    press(tabs[0]!, "ArrowRight");
    expect(selectedSection(container)).toBe("map");
    expect(document.activeElement).toBe(tabs[1]);

    press(tabs[1]!, "ArrowLeft");
    expect(selectedSection(container)).toBe("canvas");
    expect(document.activeElement).toBe(tabs[0]);
  });

  it("jumps to the first and last section with Home and End", () => {
    const { container, tabs } = renderSettings("cards");
    const last = tabs.length - 1;

    press(tabs[2]!, "End");
    expect(selectedSection(container)).toBe("advanced");
    expect(document.activeElement).toBe(tabs[last]);

    press(tabs[last]!, "Home");
    expect(selectedSection(container)).toBe("canvas");
    expect(document.activeElement).toBe(tabs[0]);
  });

  it("keeps a single tab stop anchored on the selected section", () => {
    const { tabs } = renderSettings();
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1, -1, -1, -1]);

    press(tabs[0]!, "End");
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, -1, -1, -1, -1, 0]);
  });

  it("ignores unrelated keys", () => {
    const { container, tabs } = renderSettings();

    press(tabs[0]!, "b");
    press(tabs[0]!, "PageDown");
    expect(selectedSection(container)).toBe("canvas");
  });

  it("takes the stranded focus onto the current section tab when the screen mounts", () => {
    // 触发按钮跟着编辑器一起卸载，焦点落在 body 上；设置屏得自己接住。
    document.body.focus();
    const { tabs } = renderSettings("guests");

    expect(document.activeElement).toBe(tabs[3]);
    expect(tabs[3]?.getAttribute("aria-selected")).toBe("true");
  });

  it("leaves an already focused control alone", () => {
    const survivor = mountTrigger({ "aria-label": "打开全局设置" });
    survivor.focus();

    renderSettings();

    expect(document.activeElement).toBe(survivor);
  });

  it("keeps the selected tab wired to a rendered panel", () => {
    const { container, tabs } = renderSettings();

    press(tabs[0]!, "ArrowDown");
    const active = container.querySelector('[role="tab"][aria-selected="true"]')!;
    const panel = document.getElementById(active.getAttribute("aria-controls")!);
    expect(panel?.getAttribute("role")).toBe("tabpanel");
    expect(panel?.getAttribute("aria-labelledby")).toBe(active.id);
  });
});

describe("global settings focus anchor", () => {
  it("records id and aria-label instead of the node itself", () => {
    const trigger = mountTrigger({ id: "rail-settings", "aria-label": "打开全局设置" });

    expect(describeSettingsFocusAnchor(trigger)).toEqual({ id: "rail-settings", label: "打开全局设置" });
    expect(describeSettingsFocusAnchor(document.body)).toBeNull();
    expect(describeSettingsFocusAnchor(null)).toBeNull();
    expect(describeSettingsFocusAnchor(mountTrigger({}))).toBeNull();
  });

  it("finds the remounted control by id even though the recorded node is gone", () => {
    const before = mountTrigger({ id: "rail-settings", "aria-label": "打开全局设置" });
    const anchor = describeSettingsFocusAnchor(before);
    before.remove();
    const after = mountTrigger({ id: "rail-settings", "aria-label": "打开全局设置" });

    expect(findSettingsFocusAnchor(anchor)).toBe(after);
  });

  it("falls back to aria-label when the remounted control has no id", () => {
    const anchor = describeSettingsFocusAnchor(mountTrigger({ "aria-label": "打开数据诊断" }));
    strays.splice(0).forEach((node) => node.remove());
    const after = mountTrigger({ "aria-label": "打开数据诊断" });

    expect(findSettingsFocusAnchor(anchor)).toBe(after);
  });

  it("falls back to a settings entry when the recorded control did not come back", () => {
    const anchor = describeSettingsFocusAnchor(mountTrigger({ id: "rail-settings", "aria-label": "打开渲染设置" }));
    strays.splice(0).forEach((node) => node.remove());
    const entry = mountTrigger({ "aria-label": "打开全局视觉设置" });

    expect(findSettingsFocusAnchor(anchor)).toBe(entry);
  });

  it("skips disabled or detached candidates rather than focusing nothing", () => {
    const anchor = describeSettingsFocusAnchor(mountTrigger({ id: "rail-settings", "aria-label": "打开全局设置" }));
    strays.splice(0).forEach((node) => node.remove());
    mountTrigger({ id: "rail-settings", "aria-label": "打开全局设置", disabled: "" });
    const usable = mountTrigger({ "aria-label": "打开全局设置" });

    expect(findSettingsFocusAnchor(anchor)).toBe(usable);
    expect(findSettingsFocusAnchor(null)).toBe(usable);
  });
});
