import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { StudioTopbar } from "./StudioTopbar";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderTopbar({
  assistantEntry,
  stageActions = <button type="button">阶段动作</button>,
  projectActions = <button type="button">工程动作</button>,
  workflowNav,
}: {
  assistantEntry?: ReactNode;
  stageActions?: ReactNode;
  projectActions?: ReactNode;
  workflowNav?: ReactNode;
} = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(
    <StudioTopbar
      assistantEntry={assistantEntry}
      stageActions={stageActions}
      projectActions={projectActions}
      workflowNav={workflowNav}
    />,
  ));
  return { container, root };
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

describe("StudioTopbar", () => {
  it("renders a single labelled topbar with brand and action slots only", () => {
    const { container } = renderTopbar();

    const topbars = container.querySelectorAll('[aria-label="编辑器顶栏"]');
    expect(topbars).toHaveLength(1);
    const topbar = topbars[0]!;
    expect(topbar.classList.contains("topbar")).toBe(true);
    expect(topbar.querySelector(".brand")).not.toBeNull();
    // 未提供 workflowNav 时不渲染步进器（旧版公共编辑器场景）。
    expect(topbar.querySelector(".workflow-stage-stepper")).toBeNull();
    expect(topbar.querySelector(".topbar-actions")?.textContent).toContain("阶段动作");
    expect(topbar.querySelector(".topbar-actions")?.textContent).toContain("工程动作");
  });

  it("renders the workflow navigation in the topbar when provided", () => {
    const { container } = renderTopbar({
      workflowNav: <nav className="workflow-stage-stepper" aria-label="制作步骤">步骤</nav>,
    });

    const topbar = container.querySelector('[aria-label="编辑器顶栏"]')!;
    expect(topbar.querySelector(".topbar-workflow .workflow-stage-stepper")).not.toBeNull();
    expect(topbar.querySelector(".topbar-workflow")?.textContent).toContain("步骤");
  });

  it("renders the assistant entry inside the actions area when provided", () => {
    const { container } = renderTopbar({ assistantEntry: <button type="button">AI</button> });
    expect(container.querySelector(".topbar-actions")?.textContent).toContain("AI");
  });

  it("renders the stage action slot exactly once", () => {
    const { container } = renderTopbar({
      stageActions: <button type="button" data-stage-action="refresh-display-frame-positions">刷新位置</button>,
    });

    expect(container.querySelectorAll('[data-stage-action="refresh-display-frame-positions"]')).toHaveLength(1);
  });

  it("renders the assistant entry slot inside the actions area when provided", () => {
    const { container } = renderTopbar({
      assistantEntry: <button type="button" data-assistant-entry="open">AI 助手</button>,
    });

    const topbar = container.querySelector('[aria-label="编辑器顶栏"]')!;
    const entry = topbar.querySelector('[data-assistant-entry="open"]');
    expect(entry).not.toBeNull();
    expect(entry?.textContent).toContain("AI 助手");
    // The entry sits inside the actions cluster, before the stage actions.
    const actions = topbar.querySelector(".topbar-actions")!;
    expect(actions.contains(entry)).toBe(true);
  });

  it("renders no assistant entry when the slot is omitted", () => {
    const { container } = renderTopbar();

    expect(container.querySelector('[data-assistant-entry]')).toBeNull();
  });
});
