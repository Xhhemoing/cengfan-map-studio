import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlobalSettingsScreen } from "./GlobalSettingsScreen";
import { createProjectDocument } from "../lib/project-document";
import { computeWorkflowProgress } from "../lib/workflow-progress";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderScreen() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  flushSync(() => root.render(
    <GlobalSettingsScreen
      project={project}
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
      provinces={[]}
      onApplyFont={vi.fn()}
      workflowProgress={computeWorkflowProgress(project)}
      workflowActiveStep="layout"
      templates={[]}
      currentTemplateId="original"
      customTemplates={[]}
      onApplyTemplate={vi.fn()}
      onApplyCustomTemplate={vi.fn()}
      onSaveTemplate={vi.fn()}
    />,
  ));
  return { container };
}

function press(target: Element, key: string): void {
  flushSync(() => target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key })));
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  vi.restoreAllMocks();
});

describe("GlobalSettingsScreen tablist keyboard support", () => {
  it("navigates sections with arrows, wraps at the edges, and supports Home/End", () => {
    const { container } = renderScreen();
    const selectedTab = () => container.querySelector('[role="tab"][aria-selected="true"]');
    expect(selectedTab()?.id).toBe("global-settings-tab-canvas");

    const canvasTab = container.querySelector<HTMLButtonElement>("#global-settings-tab-canvas")!;
    canvasTab.focus();
    press(canvasTab, "ArrowRight");
    expect(selectedTab()?.id).toBe("global-settings-tab-map");
    expect(document.activeElement?.id).toBe("global-settings-tab-map");

    // ArrowLeft from the first tab wraps to the last section.
    press(document.activeElement as HTMLElement, "Home");
    expect(selectedTab()?.id).toBe("global-settings-tab-canvas");
    press(document.activeElement as HTMLElement, "ArrowLeft");
    expect(selectedTab()?.id).toBe("global-settings-tab-advanced");

    press(document.activeElement as HTMLElement, "End");
    expect(selectedTab()?.id).toBe("global-settings-tab-advanced");
    press(document.activeElement as HTMLElement, "Home");
    expect(selectedTab()?.id).toBe("global-settings-tab-canvas");
  });

  it("keeps a roving tabindex: only the selected tab is tabbable", () => {
    const { container } = renderScreen();
    const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.length).toBeGreaterThan(1);
    expect(tabs.filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
    expect(tabs.find((tab) => tab.tabIndex === 0)?.id).toBe("global-settings-tab-canvas");
  });
});
